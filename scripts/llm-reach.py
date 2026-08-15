"""
HOW WIDELY WAS THIS ACTUALLY WATCHED — asked once, per title, offline.

    python3 scripts/llm-reach.py               the whole catalog
    LIMIT=200 python3 scripts/llm-reach.py     a sample, to check the shape

Replaces the prior the engine has used since its first commit.

`recognizability(voteCount)` answers "have you heard of this?" with a TMDB vote
count, and that number is a survey of Western film enthusiasts. It was measured
against one real viewer's 526 labelled titles at **AUC 0.500** — a coin flip.
And it is structurally blind in a way no weighting fixes: an Egyptian film fifty
million people watched carries eighty votes, so the 331 Arabic and 387 Tamil
titles the catalog just gained are all indistinguishable from obscurity.

A language model has the thing the vote count lacks — it knows what was on
television in Cairo in 2009 and what every Tamil family owns on DVD. Measured
on the same 526 labels (`llm-exposure.py`):

    global vote count                    AUC 0.500
    the model, per title                 AUC 0.639
    the viewer's own genres + decade     AUC 0.737
    20% model blended into his own       AUC 0.750

THE FINDING THAT MADE THIS SHIPPABLE. The model scores **0.639 whether or not
it is told whose history it is looking at.** Told his tastes, told nothing —
identical. So its contribution is not personalisation at all; it is a fact
about the title, "how many people actually saw this", which can be computed
once here and shipped as a static field for nothing at runtime. Asking per
person would have meant an API call per screen forever, for no measured gain.

Model choice was measured, not assumed, on the same sample:

    Opus            0.639
    Sonnet 4.6      0.624
    Haiku 4.5       0.593

Opus, because the gap is real and the whole run costs a few dollars once.

WHAT THIS IS NOT. It is a language model's belief about viewership, not a
measurement of viewership. It will be confidently wrong about small films, and
it inherits whatever is over-represented in its training. It is kept as a
*prior* — the thing consulted when the person has told us nothing — and every
swipe they make moves the answer away from it. That is the same footing the
vote count had, and it beats the vote count by 14 points.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

MODEL = os.environ.get("MODEL", "claude-opus-4-5")
BATCH = int(os.environ.get("BATCH", "60"))
OUT = os.environ.get("OUT", ".cache/reach.json")
LIMIT = int(os.environ.get("LIMIT", "0"))
KEY_PATH = os.environ.get(
    "KEY_FILE",
    "/tmp/claude-0/-home-user-Movie/5137f9da-99a8-5ef8-a069-5cdb3e77a823/"
    "scratchpad/secrets/anthropic.key",
)

PROMPT = """For each title below, estimate the probability that a randomly chosen adult who watches films or television in that title's own language and era has ALREADY SEEN it.

This is about reach, not quality. A mediocre film that everyone in a country watched scores high. An acclaimed film almost nobody saw scores low. Judge each title against its own audience — a Tamil film against Tamil viewers, an Egyptian film against Egyptian viewers — not against a global one.

{listing}

Reply with one line per title, exactly `number: probability` where probability is between 0 and 1. No other text."""


def api_key():
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key.strip()
    try:
        with open(KEY_PATH) as f:
            return f.read().strip()
    except OSError:
        print("no API key", file=sys.stderr)
        sys.exit(1)


def ask(prompt, tries=4):
    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": 4000,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode()
    for attempt in range(tries):
        try:
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
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            if attempt == tries - 1:
                print(f"    giving up on a batch: {e}", flush=True)
                return ""
            time.sleep(2 ** (attempt + 1))
    return ""


def main():
    cat = json.load(open("public/catalog.json"))
    langs = cat["l"]
    rows = []
    for r in cat["t"]:
        tid = f"{'tv' if r[1] == 1 else 'movie'}-{r[0]}"
        kind = "TV series" if r[1] == 1 else "film"
        rows.append((tid, f"{r[2]} ({r[5]}, {langs[r[10]]} {kind})"))
    if LIMIT:
        rows = rows[:LIMIT]

    reach = {}
    if os.path.exists(OUT):
        reach = json.load(open(OUT))
        print(f"resuming: {len(reach)} titles already scored")

    todo = [r for r in rows if r[0] not in reach]
    print(
        f"{len(rows)} titles · {len(todo)} to score · {MODEL} · "
        f"{(len(todo) + BATCH - 1) // BATCH} calls\n",
        flush=True,
    )

    started = time.time()
    for i in range(0, len(todo), BATCH):
        chunk = todo[i : i + BATCH]
        listing = "\n".join(f"{n + 1}. {label}" for n, (_id, label) in enumerate(chunk))
        out = ask(PROMPT.format(listing=listing))
        got = 0
        for ln in out.splitlines():
            if ":" not in ln:
                continue
            a, _, b = ln.partition(":")
            try:
                idx = int(a.strip().lstrip("- ")) - 1
                val = float(b.strip())
            except ValueError:
                continue
            if 0 <= idx < len(chunk) and 0 <= val <= 1:
                reach[chunk[idx][0]] = round(val, 3)
                got += 1
        done = min(i + BATCH, len(todo))
        rate = done / max(time.time() - started, 1)
        print(
            f"  {done}/{len(todo)} · {got}/{len(chunk)} parsed · "
            f"~{int((len(todo) - done) / max(rate, 0.01) / 60)} min left",
            flush=True,
        )
        # written every batch: a two-hour run must survive being interrupted
        json.dump(reach, open(OUT, "w"))

    json.dump(reach, open(OUT, "w"))
    vals = sorted(reach.values())
    print(
        f"\n{len(reach)} titles scored → {OUT}\n"
        f"  median {vals[len(vals) // 2]:.2f} · "
        f"top decile above {vals[int(len(vals) * 0.9)]:.2f} · "
        f"bottom decile below {vals[int(len(vals) * 0.1)]:.2f}"
    )


if __name__ == "__main__":
    main()
