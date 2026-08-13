"""
THE CEILING TEST — how much is real behavioural data actually worth to us?

    python3 scripts/ceiling-test.py

MEASUREMENT ONLY. Nothing here ships, nothing here touches the app, and no
MovieLens data ever reaches the browser. This script exists to answer one
strategic question before any more money or weeks are spent:

    If we had a proper collaborative model instead of a content model,
    how much better would the recommendations be?

Right now we are investing without knowing whether we live in a world where
content is nearly as good as behaviour, or one where behaviour is worth double
everything we have built. Those two worlds call for completely different plans.

WHAT IT DOES

  1. MovieLens 32M — 200,948 real people, 32 million ratings (ml-latest-small,
     which every earlier measurement used, has 610 people; at that size most
     pairs of films are never co-rated even once, so a counting method has
     almost nothing to count).
  2. Splits BY USER, not by rating. The model is trained on one set of people
     and graded on a completely disjoint set. Training and testing on the same
     people is the standard way a project like this fools itself, and it would
     produce a number two or three times too high.
  3. Trains EASE (Steck 2019, Netflix) — an item-item matrix with a closed-form
     solution and one hyperparameter. No epochs, no learning rate. Its only
     real trick is forcing self-similarity to zero, which stops the model
     explaining a viewer's likes with those same likes.
  4. Grades it with the EXACT protocol of `npm run human`: half of a person's
     favourites in, twelve recommendations out, count how many of the hidden
     half were found. Same page size, same split, same popularity baseline, so
     the numbers sit on the same scale as everything else in the repo.
  5. Exports the same test people to .cache/test-users.json so our own engine
     can be graded on them too — USERS_FILE=.cache/test-users.json npm run human

LICENCE: MovieLens is free for research and forbids commercial use without
written permission from GroupLens. This is offline evaluation, the data is
never shipped or bundled, and nothing derived from it is in the product.
"""

import json
import os
import subprocess
import sys
import zipfile

import numpy as np
import pandas as pd

CACHE = ".cache"
ML = f"{CACHE}/ml-32m"
URL = "https://files.grouplens.org/datasets/movielens/ml-32m.zip"

# how many people the matrix learns from, and how many it is graded on
TRAIN_USERS = int(os.environ.get("TRAIN_USERS", 60000))
TEST_USERS = int(os.environ.get("TEST_USERS", 2000))
# EASE's single knob: how hard to push weights toward zero
LAMBDA = float(os.environ.get("LAMBDA", 250.0))
# same page as every other ruler here
PAGE = 12
LIKE = 4.0


def ensure_data():
    if os.path.exists(f"{ML}/ratings.csv"):
        return
    os.makedirs(CACHE, exist_ok=True)
    print("fetching MovieLens 32M (~239 MB, once) …", flush=True)
    subprocess.run(["curl", "-sSL", "-o", f"{CACHE}/ml32.zip", URL], check=True)
    with zipfile.ZipFile(f"{CACHE}/ml32.zip") as z:
        z.extractall(CACHE)
    os.remove(f"{CACHE}/ml32.zip")


def our_catalog():
    """tmdb id -> our title id, movies only (MovieLens has no TV)"""
    with open("public/catalog.json") as f:
        data = json.load(f)
    return {str(row[0]): f"movie-{row[0]}" for row in data["t"] if row[1] == 0}


def main():
    ensure_data()
    cat = our_catalog()
    print(f"our catalog: {len(cat)} films", flush=True)

    links = pd.read_csv(f"{ML}/links.csv", dtype={"tmdbId": "string"})
    links = links.dropna(subset=["tmdbId"])
    links["ourId"] = links["tmdbId"].map(cat)
    links = links.dropna(subset=["ourId"])
    keep = dict(zip(links["movieId"], links["ourId"]))
    print(f"of which MovieLens 32M covers: {len(keep)}", flush=True)

    print("reading 32M ratings …", flush=True)
    ratings = pd.read_csv(
        f"{ML}/ratings.csv",
        usecols=["userId", "movieId", "rating"],
        dtype={"userId": "int32", "movieId": "int32", "rating": "float32"},
    )
    ratings = ratings[ratings["rating"] >= LIKE]
    ratings = ratings[ratings["movieId"].isin(keep.keys())]
    print(f"positive ratings inside our catalog: {len(ratings):,}", flush=True)

    # people with enough of their taste inside our catalog to be gradeable
    counts = ratings.groupby("userId").size()
    usable = np.array(counts[counts >= 20].index, dtype=np.int64)
    rng = np.random.default_rng(20260813)
    rng.shuffle(usable)
    test_ids = usable[:TEST_USERS]
    train_ids = usable[TEST_USERS : TEST_USERS + TRAIN_USERS]
    print(
        f"{len(usable):,} people with 20+ · training on {len(train_ids):,}"
        f" · grading {len(test_ids):,} (disjoint)",
        flush=True,
    )

    items = np.sort(ratings["movieId"].unique())
    item_ix = {m: i for i, m in enumerate(items)}
    n_items = len(items)

    def matrix(user_ids):
        sub = ratings[ratings["userId"].isin(set(user_ids))]
        uix = {u: i for i, u in enumerate(user_ids)}
        rows = sub["userId"].map(uix).to_numpy()
        cols = sub["movieId"].map(item_ix).to_numpy()
        X = np.zeros((len(user_ids), n_items), dtype=np.float32)
        X[rows, cols] = 1.0
        return X

    print(f"building {len(train_ids):,} x {n_items} matrix …", flush=True)
    X = matrix(train_ids)

    # ── EASE ────────────────────────────────────────────────────────────
    # B = (X'X + lambda*I)^-1, then B = -B/diag(B) with a zeroed diagonal.
    # That zeroed diagonal is the whole method: without it every item simply
    # predicts itself and the model learns nothing that transfers.
    print("solving EASE …", flush=True)
    G = (X.T @ X).astype(np.float64)
    G[np.diag_indices(n_items)] += LAMBDA
    P = np.linalg.inv(G)
    B = P / (-np.diag(P))
    B[np.diag_indices(n_items)] = 0.0
    B = B.astype(np.float32)
    del G, P, X

    # popularity, for the baseline everything is measured against
    pop = ratings["movieId"].value_counts()
    pop_order = [item_ix[m] for m in pop.index if m in item_ix]
    head = set(pop_order[:500])

    # ── grade on people the model has never seen ────────────────────────
    print("grading …", flush=True)
    by_user = {u: g["movieId"].to_numpy() for u, g in ratings[ratings["userId"].isin(set(test_ids))].groupby("userId")}

    ease_hits, pop_hits, tail_hits, per_user = [], [], [], []
    export = []

    for u in test_ids:
        seen = by_user.get(u)
        if seen is None or len(seen) < 20:
            continue
        idx = rng.permutation(len(seen))
        seen = seen[idx][:120]
        half = len(seen) // 2
        lib, held = seen[:half], set(seen[half:])
        if not held:
            continue

        lib_ix = [item_ix[m] for m in lib]
        scores = B[lib_ix].sum(axis=0)
        scores[lib_ix] = -np.inf
        top = np.argpartition(-scores, PAGE)[:PAGE]
        top = top[np.argsort(-scores[top])]
        held_ix = {item_ix[m] for m in held}

        hits = [i for i in top if i in held_ix]
        ease_hits.append(len(hits) / PAGE)
        tail_hits.append(len([i for i in hits if i not in head]) / PAGE)
        per_user.append(len(hits) / PAGE)

        pop_top = [i for i in pop_order if i not in set(lib_ix)][:PAGE]
        pop_hits.append(len([i for i in pop_top if i in held_ix]) / PAGE)

        export.append({"id": int(u), "lib": [keep[int(m)] for m in seen]})

    with open(f"{CACHE}/test-users.json", "w") as f:
        json.dump(export, f)

    def band(xs):
        xs = np.array(xs)
        boot = np.array([np.mean(rng.choice(xs, len(xs))) for _ in range(1000)])
        return f"{xs.mean()*100:.1f}%  [{np.percentile(boot,2.5)*100:.1f}% – {np.percentile(boot,97.5)*100:.1f}%]"

    print()
    print("─" * 70)
    print(f"  EASE on {len(ease_hits)} unseen people, trained on {len(train_ids):,} others")
    print(f"    EASE                     {band(ease_hits)}")
    print(f"    EASE, long tail only     {band(tail_hits)}")
    print(f"    popularity baseline      {np.mean(pop_hits)*100:.1f}%")
    print("─" * 70)
    print(f"\n  {len(export)} test people written to {CACHE}/test-users.json")
    print("  Grade our own engine on exactly these people with:")
    print("    USERS_FILE=.cache/test-users.json npx tsx scripts/human-test.ts\n")


if __name__ == "__main__":
    sys.exit(main())
