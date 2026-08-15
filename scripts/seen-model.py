"""
DOES FAME PREDICT WHAT A PERSON HAS ACTUALLY WATCHED?

    python3 scripts/seen-model.py .cache/user-swipes.json

The deck's job is to show titles a viewer has seen, because a card they have
not seen cannot be rated. The engine answers "have you seen this?" with
`recognizability(voteCount)` — a global vote count, one answer for all of
humanity — and gives it a weight of 0.9 falling to 0.55, larger than the taste
term's whole range.

That was never tested. It could not be: every ruler in this repo *defines* its
simulated viewer as someone who knows the most-voted titles, so fame predicts
recognition by construction. The instruments encode the assumption they were
meant to check.

A real session settles it. Exported from /lab, ids and actions only:
`liked` and `disliked` mean watched, `not_seen` means not.

The split is by time, not at random. The first half is what the engine could
have learned from; the second half is what it would have had to predict. AUC
because the base rate drifts across a session and accuracy would reward
guessing the majority.

WHAT IT FOUND, on 449 swipes from one viewer (167 watched, 37%):

    fame — what ships today          AUC 0.453
    his own genres + decade          AUC 0.707
    both together                    AUC 0.704

0.5 is a coin. Fame carries nothing, adds nothing on top of the personal
model, and costs a large share of the score. Broken down, the inversion is
visible without any model at all:

    over 50k votes    13% watched
    8-20k             37%
    3-8k              41%

The most famous titles in the catalog are the ones this viewer was *least*
likely to have seen — they are global blockbusters and he watches comedies.

ONE VIEWER. That is enough to retire the claim that fame predicts recognition,
and enough to justify learning the answer per person; it is not enough to fix
a constant globally for everyone, and this file exists so the next person's
export can be run through the same test in one command.
"""

import json
import math
import sys
from collections import defaultdict


def load(path):
    swipes = json.load(open(path))["swipes"]
    cat = json.load(open("public/catalog.json"))
    genres, langs = cat["g"], cat["l"]
    by = {}
    for r in cat["t"]:
        tid = f"{'tv' if r[1] == 1 else 'movie'}-{r[0]}"
        by[tid] = {
            "name": r[2],
            "year": r[5],
            "genres": [genres[i] for i in r[6]],
            "keywords": r[7],
            "lang": langs[r[10]],
            "votes": r[12],
        }
    rows = [(by[s["id"]], 0 if s["a"] == "not_seen" else 1) for s in swipes if s["id"] in by]
    missing = len(swipes) - len(rows)
    if missing:
        print(f"note: {missing} swipes were not in the catalog and are ignored")
    return rows


def auc(scored):
    """probability a watched title outranks an unwatched one"""
    pos = [s for s, y in scored if y == 1]
    neg = [s for s, y in scored if y == 0]
    if not pos or not neg:
        return float("nan")
    wins = sum(1 for p in pos for n in neg if p > n)
    ties = sum(1 for p in pos for n in neg if p == n)
    return (wins + 0.5 * ties) / (len(pos) * len(neg))


def rates(rows, key, prior, strength=5.0):
    """seen-rate per value, shrunk toward the base rate so one sighting is quiet"""
    d = defaultdict(lambda: [0, 0])
    for t, y in rows:
        for k in key(t):
            d[k][0] += 1
            d[k][1] += y
    return {k: (s + strength * prior) / (n + strength) for k, (n, s) in d.items()}


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else ".cache/user-swipes.json"
    rows = load(path)
    watched = sum(y for _, y in rows)
    print(f"\n{len(rows)} swipes · {watched} watched ({watched / len(rows) * 100:.0f}%)\n")

    # ── the breakdown, before any model ──
    def table(name, key, order=None, floor=8):
        d = defaultdict(lambda: [0, 0])
        for t, y in rows:
            for k in key(t):
                d[k][0] += 1
                d[k][1] += y
        keys = [k for k in (order or sorted(d, key=lambda k: -d[k][1] / max(d[k][0], 1))) if k in d]
        print(name)
        for k in keys:
            n, s = d[k]
            if n < floor:
                continue
            print(f"   {str(k):<14} {s:>3}/{n:<4} {s / n * 100:>3.0f}%  {'#' * int(s / n * 20)}")
        print()

    table(
        "BY FAME",
        lambda t: [
            ">50k" if t["votes"] > 50000
            else "20-50k" if t["votes"] > 20000
            else "8-20k" if t["votes"] > 8000
            else "3-8k" if t["votes"] > 3000
            else "<3k"
        ],
        [">50k", "20-50k", "8-20k", "3-8k", "<3k"],
    )
    table("BY GENRE", lambda t: t["genres"], floor=15)
    table(
        "BY DECADE",
        lambda t: [f"{t['year'] // 10 * 10}s"],
        [f"{y}s" for y in range(1950, 2030, 10)],
    )

    # ── train on the first half, predict the second ──
    cut = len(rows) // 2
    train, test = rows[:cut], rows[cut:]
    base = sum(y for _, y in train) / max(len(train), 1)
    print(
        f"train {len(train)} (watched {sum(y for _, y in train)})   "
        f"test {len(test)} (watched {sum(y for _, y in test)})\n"
    )

    gen = rates(train, lambda t: t["genres"], base)
    dec = rates(train, lambda t: [f"{t['year'] // 10 * 10}s"], base)
    kw = rates(train, lambda t: t["keywords"][:14], base)

    def personal(t, use_keywords=False):
        parts = [gen.get(g, base) for g in t["genres"]]
        parts.append(dec.get(f"{t['year'] // 10 * 10}s", base))
        if use_keywords:
            parts += [kw[k] for k in t["keywords"][:14] if k in kw]
        return sum(parts) / len(parts)

    print("predicting the second half:")
    for label, f in (
        ("fame — what ships today", lambda t: math.log1p(t["votes"])),
        ("his genres + decade", personal),
        ("+ his keywords", lambda t: personal(t, True)),
        ("fame + his genres", lambda t: personal(t) - 0.02 * math.log1p(t["votes"])),
    ):
        print(f"   {label:<28} AUC {auc([(f(t), y) for t, y in test]):.3f}")
    print("\n   0.5 is a coin flip.\n")


if __name__ == "__main__":
    main()
