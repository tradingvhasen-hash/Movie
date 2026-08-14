"""
BEHAVIOURAL NEIGHBOURS — ship the co-watching itself, not a prediction of it.

    python3 scripts/behaviour-edges.py

WHY THIS EXISTS, AND WHY IT DID NOT BEFORE

`distill.py` learns a function from our own metadata to the positions that
200,000 people's behaviour implies, and then applies that function to the whole
catalog. It was built that way for one reason, written at the top of that file:
we believed we could not ship the behavioural model itself.

That belief rested on the MovieLens licence, which forbids commercial use
*without permission*. The site is a personal, non-revenue project, and the
permission request has been sent besides. So the detour is no longer forced,
and it costs something real: the fitted function reproduces a title's true
position at cosine 0.737. For the 4,109 films behaviour actually covers, the
true position is simply available.

WHAT THIS DOES NOT SOLVE

MovieLens has no television. Our catalog has 1,187 TV titles and it covers
none of them, and it covers no film released after its snapshot. Those keep the
distilled edges — which is now the clearest statement of what the distillation
is *for*: everywhere behaviour cannot reach.

WHAT SHIPS

A neighbour list per title — "these two go together" — in the same shape
`apply-edges.ts` already consumes. No ratings, no user rows, no matrix, nothing
that could identify a person.

    python3 scripts/behaviour-edges.py                 # .cache/enrich-behaviour.json
    npx tsx scripts/apply-edges.ts .cache/enrich-behaviour.json

The output is merged with the distilled graph by `merge-edges.ts`, which is
where the per-title source choice is made.
"""

import json
import os
import sys

import numpy as np
import pandas as pd

CACHE = ".cache"
ML = f"{CACHE}/ml-32m"
OUT = os.environ.get("OUT", f"{CACHE}/enrich-behaviour.json")

# how many people the matrix learns from. The ceiling test used 60,000 and the
# score was still climbing with more; this is the same knob.
TRAIN_USERS = int(os.environ.get("TRAIN_USERS", 60000))
LAMBDA = float(os.environ.get("LAMBDA", 250.0))
NEIGHBOURS = int(os.environ.get("NEIGHBOURS", 40))
LIKE = 4.0


def our_films():
    """tmdb id -> our title id, films only — MovieLens has no television"""
    with open("public/catalog.json") as f:
        data = json.load(f)
    return {str(row[0]): f"movie-{row[0]}" for row in data["t"] if row[1] == 0}


def main():
    if not os.path.exists(f"{ML}/ratings.csv"):
        print("run scripts/ceiling-test.py first — it downloads MovieLens")
        return 1

    cat = our_films()
    links = pd.read_csv(f"{ML}/links.csv", dtype={"tmdbId": "string"})
    links = links.dropna(subset=["tmdbId"])
    links["ourId"] = links["tmdbId"].map(cat)
    links = links.dropna(subset=["ourId"])
    keep = dict(zip(links["movieId"], links["ourId"]))
    print(f"our films: {len(cat)} · covered by MovieLens: {len(keep)}", flush=True)

    print("reading 32M ratings …", flush=True)
    ratings = pd.read_csv(
        f"{ML}/ratings.csv",
        usecols=["userId", "movieId", "rating"],
        dtype={"userId": "int32", "movieId": "int32", "rating": "float32"},
    )
    ratings = ratings[ratings["rating"] >= LIKE]
    ratings = ratings[ratings["movieId"].isin(keep.keys())]
    print(f"positive ratings inside our catalog: {len(ratings):,}", flush=True)

    counts = ratings.groupby("userId").size()
    usable = np.array(counts[counts >= 20].index, dtype=np.int64)
    rng = np.random.default_rng(20260813)
    rng.shuffle(usable)

    # The 2,000 people the ceiling test grades on are held out here too, so a
    # later measurement on them is still a measurement on strangers. Same seed,
    # same shuffle, so "the first 2,000" is the same 2,000 in both scripts.
    TEST_USERS = 2000
    train_ids = usable[TEST_USERS : TEST_USERS + TRAIN_USERS]
    print(f"training on {len(train_ids):,} people (the graded 2,000 held out)", flush=True)

    items = np.sort(ratings["movieId"].unique())
    item_ix = {m: i for i, m in enumerate(items)}
    n_items = len(items)

    sub = ratings[ratings["userId"].isin(set(train_ids))]
    uix = {u: i for i, u in enumerate(train_ids)}
    X = np.zeros((len(train_ids), n_items), dtype=np.float32)
    X[sub["userId"].map(uix).to_numpy(), sub["movieId"].map(item_ix).to_numpy()] = 1.0
    print(f"matrix {X.shape[0]:,} x {n_items} …", flush=True)

    # ── EASE (Steck 2019) ───────────────────────────────────────────────
    # Identical to ceiling-test.py, deliberately: the number that justified
    # this work was measured with exactly this matrix, and a second
    # implementation would be a second thing to be wrong.
    print("solving EASE …", flush=True)
    G = (X.T @ X).astype(np.float64)
    G[np.diag_indices(n_items)] += LAMBDA
    P = np.linalg.inv(G)
    B = P / (-np.diag(P))
    B[np.diag_indices(n_items)] = 0.0
    del G, P, X

    # ── neighbours ──────────────────────────────────────────────────────
    # B is asymmetric: B[i, j] is how much owning i argues for j, and the
    # reverse is a different number. Our graph is walked in both directions,
    # and symmetric edges measured +2.4 points when this was last tested
    # (NOTES, "model-written recommendation edges"), so it is symmetrised.
    S = B + B.T
    del B

    print("taking neighbours …", flush=True)
    ids = [keep[int(m)] for m in items]
    edges = {}
    for i in range(n_items):
        row = S[i]
        top = np.argpartition(-row, NEIGHBOURS)[:NEIGHBOURS]
        top = top[np.argsort(-row[top])]
        # a neighbour with no positive evidence is not a neighbour
        edges[ids[i]] = [ids[j] for j in top if row[j] > 0 and j != i]

    with open(OUT, "w") as f:
        json.dump({"edges": edges}, f)
    avg = sum(len(v) for v in edges.values()) / max(len(edges), 1)
    print(f"\n{len(edges)} films → {OUT}  ({avg:.1f} neighbours each)")

    # the hand check this project exists for
    with open("public/catalog.json") as f:
        data = json.load(f)
    name = {f"movie-{r[0]}": r[2] for r in data["t"] if r[1] == 0}
    for probe in ("The Hangover", "Parasite", "Superbad"):
        hit = next((k for k, v in name.items() if v == probe), None)
        if hit and hit in edges:
            print(f"\n  {probe} → " + ", ".join(name.get(e, e) for e in edges[hit][:8]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
