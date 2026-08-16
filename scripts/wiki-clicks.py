"""
A THIRD OPINION ON "HAVE YOU HEARD OF THIS?", FROM PEOPLE WHO ARE NOT US.

    python3 scripts/wiki-clicks.py

Everything this project knows about how widely a film was seen comes from one
number: the TMDB vote count. That number is not readership — it is the count of
people who cared enough to open an account on a film database and rate. The
calibration sample says it is a good predictor (AUC 0.799), which is much
better than we believed for weeks, but it is still one instrument with one bias,
and the second reviewer named its shape precisely: sci-fi 3.0x, comedy 0.70x,
romance 0.57x. Voters are not viewers.

Wikipedia's clickstream is a different measurement of the same latent thing.
It publishes, per language, per month, every (source article -> target article)
pair with 10 or more clicks. Summed over sources, the incoming clicks to a
film's article are how many people went and read about that film last month, in
that language. Nobody has to sign up. The genre bias is different — probably not
absent, but different — and, unlike vote count, it is measured separately in
each language, which is the only signal we have ever had that could answer the
non-English question with something other than a global scalar.

WHAT THIS PRODUCES. `.cache/wiki-clicks.json`, a map from our title id to a
per-language click count, in three variants so the shape can be tested rather
than assumed:

    all       every incoming click
    internal  clicks arriving from another article (a reader already reading)
    external  clicks arriving from search engines and elsewhere (a reader
              who came looking for this film specifically)

`external` is the one worth a hypothesis: someone typing a film's name into a
search engine is closer to "I watched this and want to know more" than someone
who clicked through from the director's page.

It does not ship anything. `scripts/calibrate.ts` scores it against the only
unbiased sample this project owns, and if it does not beat 0.799 there, it is
recorded as rejected and nothing changes.
"""

import gzip
import json
import os
import sys
import time
from collections import defaultdict
from urllib.parse import unquote

CACHE = ".cache"
LANGS = sorted(
    f[len("clickstream-") : -len("wiki-2026-07.tsv.gz")]
    for f in os.listdir(CACHE)
    if f.startswith("clickstream-") and f.endswith(".tsv.gz")
)
ONLY = [x for x in (os.environ.get("LANGS") or "").split(",") if x]
if ONLY:
    LANGS = [l for l in LANGS if l in ONLY]

t0 = time.time()


def log(m):
    print(f"  [{time.time() - t0:6.1f}s] {m}", flush=True)


def load_map(lang):
    """title id -> wikipedia article name, decoded, underscored."""
    path = f"{CACHE}/wiki-titles.json" if lang == "en" else f"{CACHE}/wiki-map-{lang}.json"
    if not os.path.exists(path):
        return {}
    raw = json.load(open(path))
    out = {}
    for kind in ("movie", "tv"):
        for tmdb_id, article in (raw.get(kind) or {}).items():
            name = unquote(article).replace(" ", "_")
            out[f"{kind}-{tmdb_id}"] = name
    return out


totals = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))  # id -> lang -> [all, int, ext]
coverage = {}

for lang in LANGS:
    id_of_article = {}
    for tid, name in load_map(lang).items():
        # two titles can share an article after normalisation; first wins, and
        # a collision here would double-count one film's readership onto both
        id_of_article.setdefault(name, tid)
    if not id_of_article:
        log(f"{lang}: no map, skipped")
        continue

    hits, lines = 0, 0
    with gzip.open(f"{CACHE}/clickstream-{lang}wiki-2026-07.tsv.gz", "rt", encoding="utf8") as f:
        for line in f:
            lines += 1
            parts = line.rstrip("\n").split("\t")
            if len(parts) != 4:
                continue
            src, tgt, kind, count = parts
            tid = id_of_article.get(tgt)
            if tid is None:
                continue
            try:
                n = int(count)
            except ValueError:
                continue
            e = totals[tid][lang]
            e[0] += n
            # "external" in the dump means the referrer was outside Wikipedia;
            # the source column is then one of the other-* pseudo-articles
            if kind == "external" or src.startswith("other-"):
                e[2] += n
            else:
                e[1] += n
            hits += 1
    found = sum(1 for tid in totals if lang in totals[tid])
    coverage[lang] = found
    log(f"{lang}: {lines:>10,} rows · {hits:>8,} matched · {found:>6,} of our titles")

out = {tid: {lang: v for lang, v in langs.items()} for tid, langs in totals.items()}
json.dump(
    {"month": "2026-07", "langs": LANGS, "coverage": coverage, "clicks": out},
    open(f"{CACHE}/wiki-clicks.json", "w"),
)
log(f"wrote .cache/wiki-clicks.json — {len(out)} titles with any readership")
