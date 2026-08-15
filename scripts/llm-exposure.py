"""
CAN A MODEL GUESS WHAT SOMEONE HAS *WATCHED*?

    ANTHROPIC_API_KEY=... python3 scripts/llm-exposure.py

Three paid experiments have already asked a model about **taste** — describe a
title's feel, tag its mood, name what a fan should watch next. The best of them
moved the benchmark from 23.9 to 26.8, and the failure of the first was
specific and instructive: plot text does not encode craft, so no amount of
model quality rescues it.

This asks a different question, and it is the one the engine is now worst at.
Not "would they like it" — **"has a person like this already seen it?"** That is
not a claim about art. It is a claim about what was on television in Cairo in
2009, what a Tamil family rents, what everybody in a country saw because it was
the film that year. It is demographics and world knowledge, which is what a
language model actually has and what our catalog metadata does not contain at
any price.

WHY IT MATTERS NOW. The catalog just gained 7,271 titles — 331 Arabic, 500
Hindi, 387 Tamil, 293 Malayalam — and **none of them has a single behavioural
edge**. MovieLens has never heard of them; the multi-language Wikipedia
clickstreams turned out to be empty at the volumes needed (61 titles rescued in
total). Those films are reachable and ranked on metadata alone, which is the
weakest signal this engine has.

THE TEST. One real viewer's 526 labelled titles, split by time. The model sees
the first half — what he watched and what he did not — and rates the second
half. Scored by AUC against two numbers that already exist:

    global vote count, what shipped for months     0.453   (worse than a coin)
    his own genres and decade                      0.707

Beating 0.707 would mean the model knows something about exposure that his own
answers do not contain. Failing to beat 0.453 would mean it knows nothing at
all. Both are worth knowing and the second is the likelier surprise.

HONEST LIMIT, stated before the result: this viewer is an Arabic speaker whose
labelled history is almost entirely English-language film. So a win here is
evidence the *method* works, not evidence it will work for the Egyptian and
Tamil cinema it was built for — that needs labels we do not have yet.
"""

import json
import os
import random
import sys
import urllib.request

MODEL = os.environ.get("MODEL", "claude-opus-4-5")
KEY_PATH = os.environ.get(
    "KEY_FILE",
    "/tmp/claude-0/-home-user-Movie/5137f9da-99a8-5ef8-a069-5cdb3e77a823/"
    "scratchpad/secrets/anthropic.key",
)
BATCH = int(os.environ.get("BATCH", "40"))


def api_key():
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key.strip()
    try:
        with open(KEY_PATH) as f:
            return f.read().strip()
    except OSError:
        print("no API key: set ANTHROPIC_API_KEY or KEY_FILE", file=sys.stderr)
        sys.exit(1)


def ask(prompt, max_tokens=4000):
    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": api_key(),
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read())
    return "".join(b.get("text", "") for b in data.get("content", []))


def auc(scored):
    """probability a watched title outranks an unwatched one"""
    pos = [s for s, y in scored if y == 1]
    neg = [s for s, y in scored if y == 0]
    if not pos or not neg:
        return float("nan")
    wins = sum(1 for p in pos for n in neg if p > n)
    ties = sum(1 for p in pos for n in neg if p == n)
    return (wins + 0.5 * ties) / (len(pos) * len(neg))


def main():
    cat = json.load(open("public/catalog.json"))
    langs, genres_of = cat["l"], cat["g"]
    by = {}
    for r in cat["t"]:
        tid = f"{'tv' if r[1] == 1 else 'movie'}-{r[0]}"
        by[tid] = {
            "name": r[2],
            "year": r[5],
            "lang": langs[r[10]],
            "genres": [genres_of[i] for i in r[6]],
            "votes": r[12],
        }

    rows = []
    seen_ids = set()
    for path in (".cache/user-swipes.json", ".cache/user-swipes-v2.json"):
        try:
            swipes = json.load(open(path))["swipes"]
        except OSError:
            continue
        for s in swipes:
            if s["id"] in by and s["id"] not in seen_ids:
                seen_ids.add(s["id"])
                rows.append((by[s["id"]], 0 if s["a"] == "not_seen" else 1))

    cut = len(rows) // 2
    train, test = rows[:cut], rows[cut:]
    watched = [t for t, y in train if y == 1]
    skipped = [t for t, y in train if y == 0]
    print(
        f"\n{len(rows)} labelled titles · train {len(train)} "
        f"({len(watched)} watched) · predict {len(test)}\n"
    )

    def line(t):
        return f"{t['name']} ({t['year']})"

    # MODE=blind asks about the title alone, with no idea who is asking.
    # If that scores well it is a *per-title* property -- "how widely was this
    # actually watched" -- which can be computed once offline and shipped in
    # the catalog for nothing, instead of an API call per person per screen.
    BLIND = os.environ.get("BLIND") == "1"

    random.seed(7)
    profile = "" if BLIND else (
        "This person HAS watched:\n"
        + "\n".join(f"- {line(t)}" for t in random.sample(watched, min(60, len(watched))))
        + "\n\nThis person has NOT watched:\n"
        + "\n".join(f"- {line(t)}" for t in random.sample(skipped, min(60, len(skipped))))
    )

    # cached so the blend below can be re-measured without paying again
    cache_path = f".cache/llm-exposure-{'blind' if BLIND else 'personal'}.json"
    guesses = {}
    if os.path.exists(cache_path) and not os.environ.get("REFRESH"):
        guesses = {int(k): v for k, v in json.load(open(cache_path)).items()}
        print(f"  reusing {len(guesses)} cached guesses (REFRESH=1 to re-ask)")
    for i in range(0, len(test) if not guesses else 0, BATCH):
        chunk = test[i : i + BATCH]
        listing = "\n".join(f"{n + 1}. {line(t)}" for n, (t, _y) in enumerate(chunk))
        prompt = (
            (
                "For each title below, estimate the probability that a randomly "
                "chosen adult who watches films in that title's own language and "
                "era has ALREADY SEEN it. Not whether it is acclaimed, and not "
                "whether they would enjoy it — how widely it was actually "
                "watched by its own audience.\n\n"
                if BLIND
                else f"{profile}\n\n"
                "Based on who this person appears to be — their age, country, "
                "language, and viewing habits — estimate for each title below the "
                "probability that they have ALREADY WATCHED it. Not whether they "
                "would enjoy it: whether they have seen it.\n\n"
            )
            + f"{listing}\n\n"
            "Reply with one line per title, exactly `number: probability` "
            "where probability is between 0 and 1. No other text."
        )
        out = ask(prompt)
        for ln in out.splitlines():
            if ":" not in ln:
                continue
            a, _, b = ln.partition(":")
            try:
                idx = int(a.strip().lstrip("- ")) - 1
                val = float(b.strip())
            except ValueError:
                continue
            if 0 <= idx < len(chunk):
                guesses[i + idx] = val
        print(f"  scored {min(i + BATCH, len(test))}/{len(test)}", flush=True)
    if guesses:
        json.dump({str(k): v for k, v in guesses.items()}, open(cache_path, "w"))

    missing = len(test) - len(guesses)
    if missing:
        print(f"  note: {missing} titles came back unparseable and are dropped")

    import math

    pairs_llm = [(guesses[i], y) for i, (t, y) in enumerate(test) if i in guesses]
    pairs_fame = [
        (math.log1p(t["votes"]), y) for i, (t, y) in enumerate(test) if i in guesses
    ]

    # the personal model, rebuilt here so the blend is measured on one sample
    from collections import defaultdict

    base = sum(y for _, y in train) / max(len(train), 1)

    def rates(key, strength=5.0):
        d = defaultdict(lambda: [0, 0])
        for t, y in train:
            for k in key(t):
                d[k][0] += 1
                d[k][1] += y
        return {k: (s + strength * base) / (n + strength) for k, (n, s) in d.items()}

    # exactly the model seen-model.py measured at 0.707: his genres + decade
    gen = rates(lambda t: t["genres"])
    dec = rates(lambda t: [f"{t['year'] // 10 * 10}s"])

    def personal(t):
        parts = [gen.get(g, base) for g in t["genres"]]
        parts.append(dec.get(f"{t['year'] // 10 * 10}s", base))
        return sum(parts) / len(parts)

    pairs_own = [(personal(t), y) for i, (t, y) in enumerate(test) if i in guesses]

    def blend(w):
        return [
            (personal(t) * (1 - w) + guesses[i] * w, y)
            for i, (t, y) in enumerate(test)
            if i in guesses
        ]

    print(f"\n  {'the model, asked about exposure':<38} AUC {auc(pairs_llm):.3f}")
    print(f"  {'global vote count (what shipped)':<38} AUC {auc(pairs_fame):.3f}")
    print(f"  {'his own answers, same sample':<38} AUC {auc(pairs_own):.3f}")
    print("\n  blended, to see whether the model adds anything on top:")
    for w in (0.2, 0.35, 0.5, 0.65, 0.8):
        print(f"    {int(w * 100):>3}% model  {int((1 - w) * 100):>3}% his own    AUC {auc(blend(w)):.3f}")
    print("\n  0.5 is a coin flip.\n")


if __name__ == "__main__":
    main()
