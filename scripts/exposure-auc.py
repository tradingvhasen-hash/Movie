"""
DOES CONDITIONING ON THE AUDIENCE BEAT A GLOBAL VOTE COUNT?

    python3 scripts/exposure-auc.py

The honest test of an exposure prior, and the one this project has never run.

For each held-out person: take half their viewing history, work out which taste
communities they belong to, and use that to predict the *other* half against
films they never watched. Score it as AUC — the probability that a film they
did watch is ranked above one they did not.

Three predictors compete on identical data:

    votes      TMDB vote count, what ships today
    global     how widely MovieLens watched it, ignoring who is asking
    community  posterior-weighted reach across taste communities

`global` is in here deliberately. Without it a win for `community` could just be
"MovieLens knows more about watching than TMDB does", which would be true and
would not justify a single line of the clustering.

HOLDOUT. The evaluated users are excluded from the clustering entirely — they
contribute to no centroid and to no community's reach figure. Five separate
times in this project an instrument has been fitted on the thing it was
measuring, so the disjointness here is enforced in code rather than assumed.
"""

import base64
import csv
import json
import os
import time
from collections import defaultdict

import numpy as np

ML = ".cache/ml-32m"
DIM = int(os.environ.get("DIM", 96))
K = int(os.environ.get("K", 100))
ITERS = int(os.environ.get("ITERS", 12))
MIN_RATINGS = int(os.environ.get("MIN_RATINGS", 40))
HELD_OUT = int(os.environ.get("HELD_OUT", 4000))
NEGATIVES = int(os.environ.get("NEGATIVES", 200))

t0 = time.time()


def log(m):
    print(f"  [{time.time() - t0:6.1f}s] {m}", flush=True)


cat = json.load(open("public/catalog.json"))
rows = cat["t"]
ids = [f"{'movie' if r[1] == 0 else 'tv'}-{r[0]}" for r in rows]
# the encoded catalog keeps vote count at a fixed offset; find it by shape
votes = {}
for r, tid in zip(rows, ids):
    nums = [x for x in r if isinstance(x, (int, float))]
    votes[tid] = r
cat_index = {t: i for i, t in enumerate(ids)}

tmdb_to_ours = {t[6:]: t for t in ids if t.startswith("movie-")}
ml_to_ours = {}
with open(f"{ML}/links.csv") as f:
    for row in csv.DictReader(f):
        t = (row.get("tmdbId") or "").strip()
        if t and t in tmdb_to_ours:
            ml_to_ours[int(row["movieId"])] = tmdb_to_ours[t]

title_index, col_to_id = {}, {}
for mid, oid in ml_to_ours.items():
    if oid not in title_index:
        col_to_id[len(title_index)] = oid
        title_index[oid] = len(title_index)
n_titles = len(title_index)
ml_to_col = {m: title_index[ml_to_ours[m]] for m in ml_to_ours}
log(f"{n_titles} of our films are in MovieLens")

user_items = {}
with open(f"{ML}/ratings.csv") as f:
    next(f)
    cur, cols = None, []
    for line in f:
        u, m, _ = line.split(",", 2)
        c = ml_to_col.get(int(m))
        if c is None:
            continue
        if u != cur:
            if cur is not None and len(cols) >= MIN_RATINGS:
                user_items[cur] = cols
            cur, cols = u, []
        cols.append(c)
    if cur is not None and len(cols) >= MIN_RATINGS:
        user_items[cur] = cols
users = list(user_items)
log(f"{len(users)} users with {MIN_RATINGS}+ of our films")

rng = np.random.default_rng(7)
order = rng.permutation(len(users))
test_users = [users[i] for i in order[:HELD_OUT]]
train_users = [users[i] for i in order[HELD_OUT:]]
log(f"held out {len(test_users)} users; {len(train_users)} build the communities")

# ── communities, from training users only ────────────────────────────────
sig = rng.choice(np.array([-1.0, 1.0], dtype=np.float32), size=(n_titles, DIM))
V = np.zeros((len(train_users), DIM), dtype=np.float32)
for i, u in enumerate(train_users):
    V[i] = sig[user_items[u]].mean(axis=0)
V /= np.maximum(np.linalg.norm(V, axis=1, keepdims=True), 1e-9)

C = V[rng.choice(len(train_users), size=K, replace=False)].copy()
for _ in range(ITERS):
    assign = np.empty(len(train_users), dtype=np.int32)
    for s in range(0, len(train_users), 200_000):
        assign[s : s + 200_000] = np.argmax(V[s : s + 200_000] @ C.T, axis=1)
    for k in range(K):
        mem = V[assign == k]
        if len(mem) == 0:
            C[k] = V[rng.integers(len(train_users))]
            continue
        c = mem.mean(axis=0)
        C[k] = c / max(np.linalg.norm(c), 1e-9)

counts = np.zeros((K, n_titles), dtype=np.int32)
for i, u in enumerate(train_users):
    counts[assign[i], user_items[u]] += 1
members = np.maximum(np.bincount(assign, minlength=K), 1).astype(np.float32)
reach = counts / members[:, None]
glob = counts.sum(axis=0) / float(len(train_users))
log("communities built")

# ── the three predictors ─────────────────────────────────────────────────
vote_of = np.zeros(n_titles, dtype=np.float32)
for c in range(n_titles):
    tid = col_to_id[c]
    r = rows[cat_index[tid]]
    # vote count is the last large integer on the row; take the max integer
    ints = [x for x in r if isinstance(x, int)]
    vote_of[c] = max(ints[2:]) if len(ints) > 2 else 0

LOG_R = np.log(np.clip(reach, 1e-4, 1 - 1e-4))
LOG_NR = np.log(np.clip(1 - reach, 1e-4, 1 - 1e-4))

aucs = {"votes": [], "global": [], "community": []}
for u in test_users:
    items = user_items[u]
    if len(items) < MIN_RATINGS:
        continue
    half = len(items) // 2
    fit, hidden = items[:half], items[half:]
    seen_all = set(items)
    negs = []
    while len(negs) < NEGATIVES:
        c = int(rng.integers(n_titles))
        if c not in seen_all:
            negs.append(c)

    # posterior over communities from the fitting half only
    lp = LOG_R[:, fit].sum(axis=1)
    lp -= lp.max()
    post = np.exp(lp)
    post /= post.sum()
    comm_score = post @ reach

    for name, score in (
        ("votes", vote_of),
        ("global", glob),
        ("community", comm_score),
    ):
        pos = score[hidden]
        neg = score[negs]
        wins = (pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()
        aucs[name].append(wins / (len(pos) * len(neg)))

log(f"scored {len(aucs['votes'])} held-out people")
print("\n  AUC — probability a film they watched outranks one they did not\n")
for name in ("votes", "global", "community"):
    a = np.array(aucs[name])
    print(f"    {name:12} {a.mean():.4f}   +/- {1.96 * a.std() / np.sqrt(len(a)):.4f}")
print("\n  0.5 is a coin flip. `votes` is what ships today.\n")
