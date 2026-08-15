"""
WATCH HISTORIES, WRITTEN BY STRANGERS

    python3 scripts/build-histories.py            everyone
    python3 scripts/build-histories.py deep       only the deep-taste people

Feeds `scripts/harvest.ts`, which needs the one thing this project never had:
real people's *complete* viewing records, authored by someone who has never
seen our engine.

A MovieLens user with hundreds of ratings is exactly that. They rated it, so
they watched it. Nothing about our gate, our facets or our idea of "famous"
touched the list, which is what makes it able to contradict us — and it did,
within an hour of existing.

TWO POPULATIONS, and the difference between them is the whole point.

The default is everybody with 250+ of our films. Those people turn out to be
mainstream: the median film in their history sits around rank 500 of 4,368,
comfortably inside the gate. Widening the gate does nothing for them, because
almost none of their history was ever outside it.

`deep` keeps the twenty whose history sits deepest — median rank 1,185 to
2,093, straddling and passing the gate's absolute ceiling of 1,769. Those are
the people who resemble the user this is built for, whose own named films sit
at ranks 1,890 to 3,131 and had never once been reachable.

Measuring only the first population would have said the gate is harmless.
Measuring only the second would have overstated it. Both exist so neither
claim can be made without the other.

Needs `.cache/ml-32m/` (ratings.csv, links.csv) from the MovieLens 32M set.
"""

import csv
import json
import random
import statistics
import sys
from collections import defaultdict

MIN_HISTORY = 250
SAMPLE = 60
DEEP_KEEP = 20

cat = json.load(open("public/catalog.json"))
films = [r for r in cat["t"] if r[1] == 0]
# links.csv is keyed by film, so this ruler is films-only. TV is a gap in it.
tmdb = {r[0]: f"movie-{r[0]}" for r in films}
by_fame = sorted(films, key=lambda r: -r[12])
rank = {f"movie-{r[0]}": i + 1 for i, r in enumerate(by_fame)}

ml2ours = {}
with open(".cache/ml-32m/links.csv") as f:
    for row in csv.DictReader(f):
        try:
            t = int(row["tmdbId"])
        except (ValueError, KeyError, TypeError):
            continue
        if t in tmdb:
            ml2ours[int(row["movieId"])] = tmdb[t]
print(f"{len(ml2ours)} of our {len(films)} films are in MovieLens")

users = defaultdict(list)
with open(".cache/ml-32m/ratings.csv") as f:
    r = csv.reader(f)
    next(r)
    for uid, mid, rating, _ts in r:
        ours = ml2ours.get(int(mid))
        if ours:
            users[int(uid)].append((ours, float(rating)))

big = {u: h for u, h in users.items() if len(h) >= MIN_HISTORY}
print(f"{len(big)} people have {MIN_HISTORY}+ of our films in their history")

random.seed(7)
picked = random.sample(sorted(big), min(SAMPLE, len(big)))
out = {str(u): [[m, rt] for m, rt in big[u]] for u in picked}

if len(sys.argv) > 1 and sys.argv[1] == "deep":
    depth = {
        u: statistics.median([rank[m] for m, _ in h if m in rank])
        for u, h in out.items()
    }
    keep = sorted(depth, key=lambda u: -depth[u])[:DEEP_KEEP]
    out = {u: out[u] for u in keep}
    print(
        f"keeping the {len(out)} deepest — median film rank "
        f"{int(depth[keep[0]])} down to {int(depth[keep[-1]])} "
        f"(the gate's ceiling is 1,769)"
    )

sizes = sorted(len(v) for v in out.values())
print(
    f"wrote {len(out)} histories · "
    f"min {sizes[0]} median {sizes[len(sizes) // 2]} max {sizes[-1]} films"
)
json.dump(out, open(".cache/histories.json", "w"))
