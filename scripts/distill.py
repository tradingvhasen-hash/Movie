"""
DISTILLATION — learn what our own metadata predicts about audience behaviour.

    python3 scripts/distill.py

The ceiling test settled the strategy: a behavioural model scores 41.2% where
ours scores 18.8% on the same 500 people. But we cannot ship that model. Its
training data is MovieLens, which forbids commercial use without written
permission, and it only knows the 4,109 films it was trained on — nothing about
our 1,187 television titles, nothing about the 45,000 works still to be added.

So we do not ship it. We learn from it.

    behaviour of 20,000 people  →  a position for every film in "taste space"
    our own TMDB metadata       →  a function that predicts that position
    the function                →  run over the WHOLE catalog, forever

The important part is what we never do: we never define "feel", never write a
mood vocabulary, never describe a film. Two hundred thousand people define it
by what they watch together, and the only thing we learn is which patterns in
data we already own predict where they put a title. Every earlier attempt
failed because the target was hand-written; here the target is measured.

WHAT COMES OUT
    .cache/enrich-distilled.json   40 neighbours per title, for every title in
                                   the catalog including ones no rating data
                                   has ever covered.

Graded on the same 500 people as the ceiling test:
    USERS_FILE=.cache/test-users.json ENRICH=.cache/enrich-distilled.json \
      npx tsx scripts/human-test.ts

LICENCE: MovieLens is research-use only. It is read here at build time and
never shipped. What ships is a neighbour table computed from our own TMDB
metadata by a function fitted offline — no ratings, no user data, no matrix.
"""

import json
import os
import sys

import numpy as np
import pandas as pd

CACHE = ".cache"
ML = f"{CACHE}/ml-32m"
OUT = f"{CACHE}/enrich-distilled.json"

TRAIN_USERS = int(os.environ.get("TRAIN_USERS", 20000))
# dimensions of the taste space the behaviour is compressed into
FACTORS = int(os.environ.get("FACTORS", 128))
# ridge strength for the content → taste-space regression
RIDGE = float(os.environ.get("RIDGE", 30.0))
# neighbours written per title
NEIGHBOURS = int(os.environ.get("NEIGHBOURS", 40))
# vocabulary caps, so the feature matrix stays invertible in reasonable time
TOP_KEYWORDS = 1500
TOP_CAST = 1500
TOP_DIRECTORS = 800
LIKE = 4.0


def load_catalog():
    with open("public/catalog.json") as f:
        data = json.load(f)
    genres, langs = data["g"], data["l"]
    titles = []
    for row in data["t"]:
        titles.append(
            {
                "id": ("tv-" if row[1] == 1 else "movie-") + str(row[0]),
                "tmdb": str(row[0]),
                "is_tv": row[1] == 1,
                "name": row[2],
                "year": row[5],
                "genres": [genres[i] for i in row[6]],
                "keywords": row[7],
                "director": row[8],
                "cast": row[9],
                "lang": langs[row[10]],
                "votes": row[12],
                "rating": row[11],
            }
        )
    return titles


def item_vectors(titles):
    """Where 20,000 people's behaviour puts each film."""
    by_tmdb = {t["tmdb"]: t["id"] for t in titles if not t["is_tv"]}

    links = pd.read_csv(f"{ML}/links.csv", dtype={"tmdbId": "string"}).dropna(
        subset=["tmdbId"]
    )
    links["ourId"] = links["tmdbId"].map(by_tmdb)
    links = links.dropna(subset=["ourId"])
    ml_to_our = dict(zip(links["movieId"], links["ourId"]))

    print("reading ratings …", flush=True)
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
    # the first 2,000 are the ceiling test's graded people — they must never
    # be trained on, or the comparison is meaningless
    train_ids = set(usable[2000 : 2000 + TRAIN_USERS].tolist())
    r = r[r["userId"].isin(train_ids)]
    print(f"training on {len(train_ids):,} people, {len(r):,} ratings", flush=True)

    items = np.sort(r["movieId"].unique())
    ix = {m: i for i, m in enumerate(items)}
    uix = {u: i for i, u in enumerate(sorted(train_ids))}

    X = np.zeros((len(uix), len(items)), dtype=np.float32)
    X[r["userId"].map(uix).to_numpy(), r["movieId"].map(ix).to_numpy()] = 1.0

    # co-occurrence, normalised so a blockbuster is not "similar to everything"
    print("factorising co-occurrence …", flush=True)
    C = (X.T @ X).astype(np.float64)
    d = np.sqrt(np.diag(C))
    d[d == 0] = 1.0
    C /= np.outer(d, d)
    np.fill_diagonal(C, 0.0)

    vals, vecs = np.linalg.eigh(C)
    keep = np.argsort(vals)[::-1][:FACTORS]
    V = vecs[:, keep] * np.sqrt(np.abs(vals[keep]))
    V /= np.linalg.norm(V, axis=1, keepdims=True) + 1e-9

    return {ml_to_our[int(m)]: V[ix[m]] for m in items}, V.shape[1]


def content_matrix(titles):
    """Everything we own about a title, as numbers. No opinions, no prose."""
    from collections import Counter

    kw = Counter(k for t in titles for k in t["keywords"][:14])
    cast = Counter(c for t in titles for c in t["cast"][:4])
    dirs = Counter(t["director"] for t in titles if t["director"])
    gen = sorted({g for t in titles for g in t["genres"]})
    lang = sorted({t["lang"] for t in titles})

    cols = (
        [("g", g) for g in gen]
        + [("k", k) for k, _ in kw.most_common(TOP_KEYWORDS)]
        + [("c", c) for c, _ in cast.most_common(TOP_CAST)]
        + [("d", d) for d, _ in dirs.most_common(TOP_DIRECTORS)]
        + [("l", l) for l in lang]
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

    print(f"content features: {F.shape[1]} columns", flush=True)
    return F


def main():
    if not os.path.exists(f"{ML}/ratings.csv"):
        print("run scripts/ceiling-test.py first — it downloads MovieLens")
        return 1

    titles = load_catalog()
    print(f"catalog: {len(titles)} titles", flush=True)

    target, k = item_vectors(titles)
    print(f"behaviour covers {len(target)} of them, in {k} dimensions", flush=True)

    F = content_matrix(titles)
    index = {t["id"]: i for i, t in enumerate(titles)}

    # ── the regression: content → taste space ───────────────────────────
    # Fitted only on titles behaviour actually covers, then applied to every
    # title in the catalog. That second step is the whole point: it is what
    # reaches the television, the foreign film, and the 45,000 not yet added.
    rows = [index[i] for i in target]
    A = F[rows]
    Y = np.stack([target[i] for i in target]).astype(np.float64)

    print(f"fitting {A.shape[1]} → {Y.shape[1]} on {A.shape[0]} titles …", flush=True)
    G = A.T @ A
    G[np.diag_indices(G.shape[0])] += RIDGE
    W = np.linalg.solve(G, A.T @ Y)

    P = (F.astype(np.float64) @ W).astype(np.float32)
    P /= np.linalg.norm(P, axis=1, keepdims=True) + 1e-9

    # how faithful is the prediction where we can check it?
    fit = np.mean(np.sum(P[rows] * Y / (np.linalg.norm(Y, axis=1, keepdims=True) + 1e-9), axis=1))
    print(f"predicted vs real position, mean cosine: {fit:.3f}", flush=True)

    # ── neighbours for every title in the catalog ───────────────────────
    print("computing neighbours …", flush=True)
    ids = [t["id"] for t in titles]
    edges = {}
    STEP = 512
    for start in range(0, len(ids), STEP):
        block = P[start : start + STEP]
        sim = block @ P.T
        for r in range(block.shape[0]):
            sim[r, start + r] = -np.inf
        top = np.argpartition(-sim, NEIGHBOURS, axis=1)[:, :NEIGHBOURS]
        for r in range(block.shape[0]):
            order = top[r][np.argsort(-sim[r, top[r]])]
            edges[ids[start + r]] = [ids[j] for j in order]

    with open(OUT, "w") as f:
        json.dump({"edges": edges}, f)
    print(f"\n{len(edges)} titles → {OUT}")

    # a hand check on the pair this project exists for
    name = {t["id"]: t["name"] for t in titles}
    for probe in ("The Hangover", "Parasite", "Brooklyn Nine-Nine"):
        hit = next((t["id"] for t in titles if t["name"] == probe), None)
        if hit:
            print(f"\n  {probe} → " + ", ".join(name[e] for e in edges[hit][:8]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
