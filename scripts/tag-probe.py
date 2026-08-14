"""
DO HUMAN TAGS CARRY THE THING OUR METADATA CANNOT?

    python3 scripts/tag-probe.py

The distillation predicts where behaviour puts a title from what we own about
it — genres, keywords, cast, director — and reaches cosine 0.737. That number
is the ceiling of the *inputs*, and the plan was to buy better inputs: pay a
model to write mood and craft tags for all 5,555 titles.

MovieLens ships two million tags written by real people, and among the most
used are exactly the words we were going to pay for: atmospheric, surreal,
visually appealing, dark comedy, thought-provoking, cinematography, quirky,
stylized, dark. Free, human-authored, and already on disk.

The catch is the same one behaviour has: they cover films, not television. So
they cannot be used directly as features for the half of the catalog that needs
help most. The idea would be a bridge — learn "text → human tags" on the films
that have them, apply it to everything, feed the predictions in as features.

That bridge is a week of work, so this asks the one question that decides
whether to build it:

    do the tags predict behaviour better than our metadata does?

If they barely beat it, the vocabulary is not carrying anything our columns
miss, and neither would model-written tags. If they beat it clearly, the
bridge is worth building and the tag vocabulary is the thing to bridge to.

MEASURED HONESTLY: fitted on one set of films and scored on a disjoint set.
distill.py reports its 0.737 in-sample, so the number here is not comparable
to it — the metadata baseline is refitted the same held-out way for a fair
side-by-side.
"""

import csv
import json
import os
import sys
from collections import Counter, defaultdict

import numpy as np
import pandas as pd

CACHE = ".cache"
ML = f"{CACHE}/ml-32m"
LIKE = 4.0
FACTORS = 256
TRAIN_USERS = int(os.environ.get("TRAIN_USERS", 60000))
RIDGE = float(os.environ.get("RIDGE", 30.0))
# a tag has to be used by enough different people to be a description rather
# than one person's private note
MIN_TAG_USERS = int(os.environ.get("MIN_TAG_USERS", 40))
TOP_TAGS = int(os.environ.get("TOP_TAGS", 2000))


def catalog():
    with open("public/catalog.json") as f:
        d = json.load(f)
    g, l = d["g"], d["l"]
    out = []
    for row in d["t"]:
        out.append(
            {
                "id": f"{'tv' if row[1] == 1 else 'movie'}-{row[0]}",
                "tmdb": str(row[0]),
                "name": row[2],
                "year": row[5],
                "genres": [g[i] for i in row[6]],
                "keywords": row[7],
                "director": row[8],
                "cast": row[9],
                "lang": l[row[10]],
                "rating": row[11],
                "votes": row[12],
                "is_tv": row[1] == 1,
            }
        )
    return out


def behaviour_vectors(titles):
    """identical to distill.py — the target has to be the same target"""
    by_tmdb = {t["tmdb"]: t["id"] for t in titles if not t["is_tv"]}
    links = pd.read_csv(f"{ML}/links.csv", dtype={"tmdbId": "string"}).dropna(
        subset=["tmdbId"]
    )
    links["ourId"] = links["tmdbId"].map(by_tmdb)
    links = links.dropna(subset=["ourId"])
    ml_to_our = dict(zip(links["movieId"], links["ourId"]))

    r = pd.read_csv(
        f"{ML}/ratings.csv",
        usecols=["userId", "movieId", "rating"],
        dtype={"userId": "int32", "movieId": "int32", "rating": "float32"},
    )
    r = r[(r["rating"] >= LIKE) & (r["movieId"].isin(ml_to_our.keys()))]
    counts = r.groupby("userId").size()
    usable = np.array(counts[counts >= 20].index, dtype=np.int64)
    rng = np.random.default_rng(20260813)
    rng.shuffle(usable)
    train_ids = set(usable[2000 : 2000 + TRAIN_USERS].tolist())
    r = r[r["userId"].isin(train_ids)]

    items = np.sort(r["movieId"].unique())
    ix = {m: i for i, m in enumerate(items)}
    uix = {u: i for i, u in enumerate(sorted(train_ids))}
    X = np.zeros((len(uix), len(items)), dtype=np.float32)
    X[r["userId"].map(uix).to_numpy(), r["movieId"].map(ix).to_numpy()] = 1.0

    C = (X.T @ X).astype(np.float64)
    d = np.sqrt(np.diag(C))
    d[d == 0] = 1.0
    C /= np.outer(d, d)
    np.fill_diagonal(C, 0.0)
    vals, vecs = np.linalg.eigh(C)
    keep = np.argsort(vals)[::-1][:FACTORS]
    V = vecs[:, keep] * np.sqrt(np.abs(vals[keep]))
    V /= np.linalg.norm(V, axis=1, keepdims=True) + 1e-9
    return {ml_to_our[int(m)]: V[ix[m]] for m in items}, ml_to_our


def metadata_matrix(titles):
    kw = Counter(k for t in titles for k in t["keywords"][:14])
    cast = Counter(c for t in titles for c in t["cast"][:4])
    dirs = Counter(t["director"] for t in titles if t["director"])
    cols = (
        [("g", g) for g in sorted({g for t in titles for g in t["genres"]})]
        + [("k", k) for k, _ in kw.most_common(6000)]
        + [("c", c) for c, _ in cast.most_common(4000)]
        + [("d", d) for d, _ in dirs.most_common(2000)]
        + [("l", l) for l in sorted({t["lang"] for t in titles})]
        + [("decade", d) for d in range(1920, 2031, 10)]
        + [("num", n) for n in ("votes", "rating", "tv", "bias")]
    )
    pos = {c: i for i, c in enumerate(cols)}
    F = np.zeros((len(titles), len(cols)), dtype=np.float32)
    for i, t in enumerate(titles):
        for g in t["genres"]:
            if ("g", g) in pos:
                F[i, pos[("g", g)]] = 1
        for k in t["keywords"][:14]:
            if ("k", k) in pos:
                F[i, pos[("k", k)]] = 1
        for c in t["cast"][:4]:
            if ("c", c) in pos:
                F[i, pos[("c", c)]] = 1
        if ("d", t["director"]) in pos:
            F[i, pos[("d", t["director"])]] = 1
        if ("l", t["lang"]) in pos:
            F[i, pos[("l", t["lang"])]] = 1
        dec = min(2030, max(1920, (t["year"] // 10) * 10))
        F[i, pos[("decade", dec)]] = 1
        F[i, pos[("num", "votes")]] = np.log1p(t["votes"]) / 12.0
        F[i, pos[("num", "rating")]] = t["rating"] / 10.0
        F[i, pos[("num", "tv")]] = 1.0 if t["is_tv"] else 0.0
        F[i, pos[("num", "bias")]] = 1.0
    return F


def tag_matrix(titles, ml_to_our):
    """what real people wrote about these films, one column per tag"""
    per_title = defaultdict(Counter)
    users = defaultdict(set)
    with open(f"{ML}/tags.csv", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) < 3:
                continue
            mid = int(row[1])
            ours = ml_to_our.get(mid)
            if ours is None:
                continue
            tag = row[2].strip().lower()
            if not tag or len(tag) > 40:
                continue
            per_title[ours][tag] += 1
            users[tag].add(row[0])

    total = Counter()
    for c in per_title.values():
        total.update(c.keys())
    vocab = [
        t
        for t, _ in total.most_common()
        if len(users[t]) >= MIN_TAG_USERS
    ][:TOP_TAGS]
    pos = {t: i for i, t in enumerate(vocab)}

    F = np.zeros((len(titles), len(vocab)), dtype=np.float32)
    for i, t in enumerate(titles):
        c = per_title.get(t["id"])
        if not c:
            continue
        # how much of this film's description each tag is, not how famous it is
        n = sum(c.values())
        for tag, k in c.items():
            j = pos.get(tag)
            if j is not None:
                F[i, j] = k / n
    covered = int((F.sum(axis=1) > 0).sum())
    return F, vocab, covered


def held_out_fit(F, Y, rows, rng):
    """fit on 80% of the covered titles, score the other 20%"""
    idx = rng.permutation(len(rows))
    cut = int(len(rows) * 0.8)
    tr = [rows[i] for i in idx[:cut]]
    te = [rows[i] for i in idx[cut:]]

    A = F[tr].astype(np.float64)
    B = np.stack([Y[i] for i in tr])
    G = A.T @ A
    G[np.diag_indices(G.shape[0])] += RIDGE
    W = np.linalg.solve(G, A.T @ B)

    P = F[te].astype(np.float64) @ W
    P /= np.linalg.norm(P, axis=1, keepdims=True) + 1e-9
    T = np.stack([Y[i] for i in te])
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-9
    return float(np.mean(np.sum(P * T, axis=1)))


def main():
    if not os.path.exists(f"{ML}/tags.csv"):
        print("run scripts/ceiling-test.py first — it downloads MovieLens")
        return 1

    titles = catalog()
    index = {t["id"]: i for i, t in enumerate(titles)}
    print(f"catalog: {len(titles)} titles", flush=True)

    print("building behavioural targets …", flush=True)
    target, ml_to_our = behaviour_vectors(titles)
    print(f"behaviour covers {len(target)}", flush=True)

    print("building feature matrices …", flush=True)
    Fm = metadata_matrix(titles)
    Ft, vocab, covered = tag_matrix(titles, ml_to_our)
    print(f"  metadata: {Fm.shape[1]} columns")
    print(f"  tags:     {Ft.shape[1]} columns, on {covered} titles")

    Y = {index[i]: v for i, v in target.items() if i in index}
    # only titles that have BOTH a target and at least one tag, so the two
    # feature sets are compared on identical films
    rows = [r for r in Y if Ft[r].sum() > 0]
    print(f"  compared on {len(rows)} films that have a target and tags\n")

    rng = np.random.default_rng(7)
    both = np.hstack([Fm, Ft])
    for name, F in (("metadata (what we ship today)", Fm), ("human tags", Ft), ("both", both)):
        seeds = [held_out_fit(F, Y, rows, np.random.default_rng(s)) for s in (1, 2, 3)]
        print(f"  {name:<32} cosine {np.mean(seeds):.3f}  (±{np.std(seeds):.3f})")

    # which tags the fit leans on hardest, as a sanity read
    A = Ft[rows].astype(np.float64)
    B = np.stack([Y[i] for i in rows])
    G = A.T @ A
    G[np.diag_indices(G.shape[0])] += RIDGE
    W = np.linalg.solve(G, A.T @ B)
    strength = np.linalg.norm(W, axis=1)
    top = np.argsort(-strength)[:25]
    print("\n  tags the fit leans on hardest:")
    print("   ", ", ".join(vocab[i] for i in top))
    return 0


if __name__ == "__main__":
    sys.exit(main())
