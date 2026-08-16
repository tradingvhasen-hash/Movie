"""
WHO IS THIS PERSON LIKE, AND WHAT DO PEOPLE LIKE THAT WATCH?

    python3 scripts/communities.py            # ~6 min, 32M ratings

Everything in this project that answers "have you heard of this?" is a single
number attached to a title: a TMDB vote count, a reach estimate, a percentile.
Four different scalars have been tried and each one moved nothing, and the
reason is now measurable rather than arguable. There is no population-
independent answer to that question. Measured in our own catalog, the top 684
films by vote count are 2.66x over-weight in adventure and 0.70x under-weight
in comedy; the median science-fiction film carries four times the votes of the
median comedy. A comedy has to be four times as watched to reach the same rank.

So a viewer who watches comedy is served a list built by people who watch
science fiction, and no reordering of one list fixes that, because the fault is
that there is one list.

What replaces it is not a better scalar. It is the same quantity conditioned on
who is asking: for each of K taste communities, how widely is this title
watched *inside that community*. A comedy-heavy community ranks American Pie
above Inception, and it does so because 200,000 strangers behaved that way, not
because we corrected for anything.

MovieLens 32M has the population and the commercial licence is granted. We have
been using roughly five percent of what is in it — the co-watch edges — and
throwing away the part that answers this.

METHOD, and why each step is the cheap one

  1. Ratings for titles in our catalog only, via links.csv -> tmdbId.
  2. Each title gets a fixed random +/-1 signature in d dimensions. A user's
     vector is the mean of the signatures of what they rated. This is a
     Johnson-Lindenstrauss projection: it preserves the geometry of the
     user-item matrix well enough to cluster, costs one pass, and needs no
     matrix library.
  3. Spherical k-means, K communities, on those vectors.
  4. Per community, per title: the fraction of that community who rated it.
     That fraction is the number the gate has always wanted.

WHAT THIS CANNOT DO. MovieLens is films only — `links.csv` has no series at
all — and its users are overwhelmingly Western. So this fixes the genre scale
and the depth scale and does nothing for television or for non-English cinema.
Those need a different source and are not pretended at here.
"""

import csv
import json
import os
import sys
import time
from collections import defaultdict

import numpy as np

ML = ".cache/ml-32m"
OUT = ".cache/communities.json"
DIM = int(os.environ.get("DIM", 96))
K = int(os.environ.get("K", 100))
ITERS = int(os.environ.get("ITERS", 12))
# a user with three ratings tells us nothing about which community they are in
MIN_RATINGS = int(os.environ.get("MIN_RATINGS", 20))
# how many titles each community publishes; the gate never looks deeper
TOP_PER_COMMUNITY = int(os.environ.get("TOP", 3000))

t0 = time.time()


def log(msg):
    print(f"  [{time.time() - t0:6.1f}s] {msg}", flush=True)


# ── our catalog, and the MovieLens id map ────────────────────────────────
catalog = json.load(open("public/catalog.json"))
# the encoded catalog is column-free: `t` is a list of rows, [tmdbId, kind, ...]
rows = catalog["t"]
ids, names = [], {}
for r in rows:
    tid = f"{'movie' if r[1] == 0 else 'tv'}-{r[0]}"
    ids.append(tid)
    names[tid] = r[2]
ours = set(ids)
log(f"catalog: {len(ours)} titles")

tmdb_to_ours = {}
for tid in ours:
    if tid.startswith("movie-"):
        tmdb_to_ours[tid[6:]] = tid

ml_to_ours = {}
with open(f"{ML}/links.csv") as f:
    for row in csv.DictReader(f):
        t = (row.get("tmdbId") or "").strip()
        if t and t in tmdb_to_ours:
            ml_to_ours[int(row["movieId"])] = tmdb_to_ours[t]
log(f"MovieLens films that are in our catalog: {len(ml_to_ours)}")

# ── one pass over 32M ratings ────────────────────────────────────────────
title_index = {}
for mid, ours_id in ml_to_ours.items():
    if ours_id not in title_index:
        title_index[ours_id] = len(title_index)
n_titles = len(title_index)
ml_to_col = {mid: title_index[ml_to_ours[mid]] for mid in ml_to_ours}

rng = np.random.default_rng(20260816)
sig = rng.choice(np.array([-1.0, 1.0], dtype=np.float32), size=(n_titles, DIM))

user_vec = {}
user_items = defaultdict(list)
seen_rows = 0
with open(f"{ML}/ratings.csv") as f:
    next(f)
    cur_user = None
    cols = []
    for line in f:
        seen_rows += 1
        if seen_rows % 8_000_000 == 0:
            log(f"{seen_rows // 1_000_000}M ratings read")
        u, m, _rest = line.split(",", 2)
        col = ml_to_col.get(int(m))
        if col is None:
            continue
        if u != cur_user:
            if cur_user is not None and len(cols) >= MIN_RATINGS:
                user_items[cur_user] = cols
            cur_user = u
            cols = []
        cols.append(col)
    if cur_user is not None and len(cols) >= MIN_RATINGS:
        user_items[cur_user] = cols
log(f"{seen_rows} ratings · {len(user_items)} users with {MIN_RATINGS}+ of our films")

users = list(user_items.keys())
V = np.zeros((len(users), DIM), dtype=np.float32)
for i, u in enumerate(users):
    cols = user_items[u]
    V[i] = sig[cols].mean(axis=0)
norms = np.linalg.norm(V, axis=1, keepdims=True)
norms[norms == 0] = 1
V /= norms
log(f"projected {len(users)} users into {DIM} dimensions")

# ── spherical k-means ────────────────────────────────────────────────────
start = rng.choice(len(users), size=K, replace=False)
C = V[start].copy()
for it in range(ITERS):
    assign = np.empty(len(users), dtype=np.int32)
    step = 200_000
    for s in range(0, len(users), step):
        assign[s : s + step] = np.argmax(V[s : s + step] @ C.T, axis=1)
    moved = 0
    for k in range(K):
        members = V[assign == k]
        if len(members) == 0:
            C[k] = V[rng.integers(len(users))]
            moved += 1
            continue
        c = members.mean(axis=0)
        n = np.linalg.norm(c)
        C[k] = c / n if n else c
    sizes = np.bincount(assign, minlength=K)
    log(f"iter {it + 1}: smallest {sizes.min()}  median {int(np.median(sizes))}  largest {sizes.max()}")

# ── per-community reach ──────────────────────────────────────────────────
counts = np.zeros((K, n_titles), dtype=np.int32)
for i, u in enumerate(users):
    counts[assign[i], user_items[u]] += 1
members = np.bincount(assign, minlength=K).astype(np.float32)
reach = counts / np.maximum(members[:, None], 1)

col_to_id = {v: k for k, v in title_index.items()}
cat_index = {tid: i for i, tid in enumerate(ids)}

"""
Packed, because this ships to the browser beside a 3.3 MB catalog.

Per community: the ids as 16-bit indices into the catalog, and the reach as a
single byte. 100 communities x 3,000 titles is 900 KB raw and about 400 KB
gzipped — the same order as the co-watch edges already shipped, and it replaces
a scalar that was doing this job badly.
"""
import base64

out = {"k": K, "top": TOP_PER_COMMUNITY, "sizes": [], "idx": [], "reach": []}
for k in range(K):
    order = [int(c) for c in np.argsort(-reach[k])[:TOP_PER_COMMUNITY]]
    keep = [(cat_index[col_to_id[c]], reach[k][c]) for c in order if col_to_id[c] in cat_index]
    idx = np.array([a for a, _ in keep], dtype=np.uint16)
    rch = np.clip(np.array([b for _, b in keep]) * 255, 0, 255).astype(np.uint8)
    out["sizes"].append(int(members[k]))
    out["idx"].append(base64.b64encode(idx.tobytes()).decode())
    out["reach"].append(base64.b64encode(rch.tobytes()).decode())

json.dump(out, open(OUT, "w"))
json.dump(out, open("public/communities.json", "w"))
log(f"wrote {OUT} and public/communities.json  ({os.path.getsize(OUT) / 1048576:.1f} MB)")

# ── what did it actually find? ───────────────────────────────────────────
print("\n  divergence is the point: where each community ranks a title\n")
import base64 as _b64
dec = [np.frombuffer(_b64.b64decode(out["idx"][k]), dtype=np.uint16) for k in range(K)]
for probe in ["American Pie", "The Big Lebowski", "Star Wars", "Casablanca"]:
    tid = next((t for t in ids if names.get(t) == probe), None)
    if tid is None:
        continue
    ci = cat_index[tid]
    ranks = []
    for k in range(K):
        w = np.where(dec[k] == ci)[0]
        ranks.append(int(w[0]) if len(w) else TOP_PER_COMMUNITY)
    ranks.sort()
    print(f"    {probe:20} best {ranks[0]:5}   median {ranks[K // 2]:5}   worst {ranks[-1]:5}")
