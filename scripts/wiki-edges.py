"""
WIKIPEDIA CLICKSTREAM — what people read next, as a third opinion on taste.

    python3 scripts/wiki-edges.py

Behaviour beats description; that is settled here three times over. But the one
behavioural source we have covers films only — MovieLens has no television, so
1,466 of our 5,555 titles gained nothing from the graph that moved every other
number. Buying descriptions for them was tested and failed (`tag-probe.py`).

This is behaviour that covers television. Wikipedia publishes, monthly and
under CC0, every (from, to, count) pair of article-to-article clicks above ten
occurrences. "People reading about The Hangover then clicked through to Rush
Hour" is a statement about the same audience, made by twenty-five million
readers, and it exists for Brooklyn Nine-Nine exactly as it does for a film.

WHAT IT IS NOT

Reading is not watching. A click can be curiosity, a cast member, a
controversy, a franchise. It is a weaker signal than a rating and it will be
noisier — the point is that it is the only behavioural signal we can get for
television without a licence conversation, and it costs a day.

HOW TITLES ARE MATCHED

Wikidata holds a TMDB id for most films and series (P4947, P4983) and a link to
the English article. One query gives the whole mapping, so no titles are
guessed at by name — "The Office" alone would match four different series.

    python3 scripts/wiki-edges.py
    ENRICH=.cache/enrich-wiki.json MODE=discover USERS_FILE=.cache/test-users.json npm run human
"""

import csv
import gzip
import json
import os
import subprocess
import sys
from collections import defaultdict

CACHE = ".cache"
MONTH = os.environ.get("MONTH", "2026-07")
DUMP = f"{CACHE}/clickstream-enwiki-{MONTH}.tsv.gz"
URL = f"https://dumps.wikimedia.org/other/clickstream/{MONTH}/clickstream-enwiki-{MONTH}.tsv.gz"
MAP = f"{CACHE}/wiki-titles.json"
OUT = os.environ.get("OUT", f"{CACHE}/enrich-wiki.json")

NEIGHBOURS = int(os.environ.get("NEIGHBOURS", 40))
# a pair has to be walked by enough readers to be a habit rather than an accident
MIN_CLICKS = int(os.environ.get("MIN_CLICKS", 15))

SPARQL = "https://query.wikidata.org/sparql"
QUERY = """
SELECT ?tmdb ?article WHERE {
  ?item wdt:%s ?tmdb .
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> .
}
"""


def fetch_map():
    """tmdb id -> english article title, for films and series"""
    if os.path.exists(MAP):
        with open(MAP) as f:
            return json.load(f)

    out = {"movie": {}, "tv": {}}
    for kind, prop in (("movie", "P4947"), ("tv", "P4983")):
        print(f"asking Wikidata for {kind} ids …", flush=True)
        res = subprocess.run(
            [
                "curl", "-sfG", SPARQL,
                "--data-urlencode", f"query={QUERY % prop}",
                "-H", "Accept: text/csv",
                "-H", "User-Agent: dhawq-catalog-build/1.0",
            ],
            capture_output=True,
            text=True,
        )
        if res.returncode != 0 or not res.stdout:
            print(f"  Wikidata refused the {kind} query", flush=True)
            continue
        rows = csv.reader(res.stdout.splitlines())
        next(rows, None)
        for row in rows:
            if len(row) < 2:
                continue
            tmdb, url = row[0].strip(), row[1].strip()
            if not tmdb or "/wiki/" not in url:
                continue
            # the clickstream uses article titles with underscores, unescaped
            article = url.rsplit("/wiki/", 1)[1]
            out[kind][tmdb] = article
        print(f"  {len(out[kind])} {kind} ids mapped", flush=True)

    with open(MAP, "w") as f:
        json.dump(out, f)
    return out


def ensure_dump():
    if os.path.exists(DUMP):
        return
    print(f"fetching the {MONTH} clickstream (~470 MB, once) …", flush=True)
    subprocess.run(["curl", "-sSL", "-o", DUMP, URL], check=True)


def main():
    from urllib.parse import unquote

    with open("public/catalog.json") as f:
        data = json.load(f)
    titles = [
        {"id": f"{'tv' if r[1] == 1 else 'movie'}-{r[0]}", "tmdb": str(r[0]),
         "tv": r[1] == 1, "name": r[2]}
        for r in data["t"]
    ]

    wiki = fetch_map()
    ensure_dump()

    # article title -> our id. Both directions of escaping are tried because
    # Wikidata gives percent-encoded URLs and the dump gives raw underscores.
    article_to_id = {}
    for t in titles:
        a = wiki["tv" if t["tv"] else "movie"].get(t["tmdb"])
        if not a:
            continue
        article_to_id[a] = t["id"]
        article_to_id[unquote(a)] = t["id"]
    films = sum(1 for t in titles if not t["tv"] and article_to_id.get(
        wiki["movie"].get(t["tmdb"], "")))
    print(f"\n{len(set(article_to_id.values()))} of {len(titles)} titles have an "
          f"English article ({films} films)", flush=True)

    print("reading the clickstream …", flush=True)
    weights = defaultdict(float)
    kept = 0
    with gzip.open(DUMP, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4:
                continue
            a = article_to_id.get(parts[0])
            if a is None:
                continue
            b = article_to_id.get(parts[1])
            if b is None or b == a:
                continue
            try:
                n = int(parts[3])
            except ValueError:
                continue
            if n < MIN_CLICKS:
                continue
            # symmetric: "read A then B" and "read B then A" are the same habit
            weights[(a, b) if a < b else (b, a)] += n
            kept += 1

    print(f"{kept:,} click pairs inside the catalog, "
          f"{len(weights):,} distinct connections", flush=True)

    near = defaultdict(list)
    for (a, b), n in weights.items():
        near[a].append((n, b))
        near[b].append((n, a))

    edges = {}
    for k, v in near.items():
        v.sort(reverse=True)
        edges[k] = [b for _, b in v[:NEIGHBOURS]]

    with open(OUT, "w") as f:
        json.dump({"edges": edges}, f)

    tv = sum(1 for k in edges if k.startswith("tv-"))
    avg = sum(len(v) for v in edges.values()) / max(len(edges), 1)
    print(f"\n{len(edges)} titles have neighbours ({tv} of them television), "
          f"{avg:.1f} each → {OUT}")

    name = {t["id"]: t["name"] for t in titles}
    for probe in ("The Hangover", "Brooklyn Nine-Nine", "Parasite"):
        hit = next((t["id"] for t in titles if t["name"] == probe), None)
        if hit and hit in edges:
            print(f"\n  {probe} → " + ", ".join(name.get(e, e) for e in edges[hit][:8]))
        elif hit:
            print(f"\n  {probe} → nothing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
