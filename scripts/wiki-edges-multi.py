"""
THE OTHER THIRTY-NINE WIKIPEDIAS

    python3 scripts/wiki-edges-multi.py
    LANGS=ar,hi,ta python3 scripts/wiki-edges-multi.py

`wiki-edges.py` reads the English clickstream and gave 3,133 titles a
behavioural neighbourhood — the one source that covers television, since
MovieLens has no series at all. It reads English and only English, and that
went unremarked for as long as the catalog was 87% English.

It is not any more. The catalog now carries 331 Arabic titles, 500 Hindi, 387
Tamil, 293 Malayalam, 578 Turkish — 7,271 new titles in total, and **not one
of them has a single behavioural edge**, because the distilled MovieLens graph
covers the original 5,555 and the English clickstream does not know they exist.
They are in the catalog and invisible to every signal that made this engine
work.

Wikipedia publishes the same monthly clickstream, under the same CC0 licence,
for **forty languages** — `arwiki`, `hiwiki`, `tawiki`, `mlwiki`, `trwiki`,
`fawiki` among them. Exactly the cinema just added. And they are small: Arabic
is 12.5 MB, Hindi 1.6, Tamil 0.9, Malayalam 0.4 — all ten of the languages
below together weigh less than the English dump alone.

WHY EACH LANGUAGE STAYS IN ITS OWN WIKI

No cross-language edges are built, and that is deliberate rather than a
limitation. An Arabic reader moving between two Egyptian films is a statement
about what Egyptian audiences watch together, made by that audience. Routing
it through English articles would replace it with what English readers think
of Egyptian cinema, which is a different and much thinner claim — and it is
the same error, one more time, as measuring "have you heard of this?" with a
vote count collected mostly in America.

Wikidata gives the article title per language from the same TMDB id (P4947 for
films, P4983 for series), so nothing is matched by name.
"""

import csv
import gzip
import json
import os
import subprocess
import sys
from collections import defaultdict
from urllib.parse import unquote

CACHE = ".cache"
MONTH = os.environ.get("MONTH", "2026-07")
OUT = os.environ.get("OUT", f"{CACHE}/edges-wiki-multi.json")
MIN_CLICKS = int(os.environ.get("MIN_CLICKS", "10"))
NEIGHBOURS = int(os.environ.get("NEIGHBOURS", "40"))

# the languages the catalog gained, plus the large ones whose coverage was
# thin. Telugu, Kannada and Urdu are in the catalog but publish no clickstream.
LANGS = os.environ.get(
    "LANGS", "ar,hi,ta,ml,tr,fa,ko,ja,es,fr,it,pt,ru,th,id,bn,mr,he,vi,zh"
).split(",")

SPARQL = "https://query.wikidata.org/sparql"
QUERY = """
SELECT ?tmdb ?article WHERE {
  ?item wdt:%s ?tmdb .
  ?article schema:about ?item ;
           schema:isPartOf <https://%s.wikipedia.org/> .
}
"""


def fetch_map(lang):
    """tmdb id -> article title in this language's wikipedia"""
    path = f"{CACHE}/wiki-map-{lang}.json"
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)

    out = {"movie": {}, "tv": {}}
    for kind, prop in (("movie", "P4947"), ("tv", "P4983")):
        res = subprocess.run(
            [
                "curl", "-sfG", SPARQL,
                "--data-urlencode", f"query={QUERY % (prop, lang)}",
                "-H", "Accept: text/csv",
                "-H", "User-Agent: dhawq-catalog-build/1.0",
            ],
            capture_output=True,
            text=True,
            timeout=600,
        )
        if res.returncode != 0 or not res.stdout:
            print(f"    Wikidata refused {lang}/{kind}", flush=True)
            continue
        rows = csv.reader(res.stdout.splitlines())
        next(rows, None)
        for row in rows:
            if len(row) < 2:
                continue
            tmdb, url = row[0].strip(), row[1].strip()
            if not tmdb or "/wiki/" not in url:
                continue
            out[kind][tmdb] = url.rsplit("/wiki/", 1)[1]

    with open(path, "w") as f:
        json.dump(out, f)
    return out


def ensure_dump(lang):
    path = f"{CACHE}/clickstream-{lang}wiki-{MONTH}.tsv.gz"
    if os.path.exists(path):
        return path
    url = (
        f"https://dumps.wikimedia.org/other/clickstream/{MONTH}/"
        f"clickstream-{lang}wiki-{MONTH}.tsv.gz"
    )
    r = subprocess.run(["curl", "-sSLf", "-o", path, url])
    if r.returncode != 0:
        if os.path.exists(path):
            os.remove(path)
        return None
    return path


def main():
    with open("public/catalog.json") as f:
        data = json.load(f)
    langs_of = data["l"]
    titles = [
        {
            "id": f"{'tv' if r[1] == 1 else 'movie'}-{r[0]}",
            "tmdb": str(r[0]),
            "tv": r[1] == 1,
            "name": r[2],
            "lang": langs_of[r[10]],
        }
        for r in data["t"]
    ]
    print(f"{len(titles)} titles in the catalog\n", flush=True)

    weights = defaultdict(float)
    covered = set()

    for lang in LANGS:
        dump = ensure_dump(lang)
        if not dump:
            print(f"  {lang}: no clickstream published", flush=True)
            continue
        wiki = fetch_map(lang)

        article_to_id = {}
        for t in titles:
            a = wiki["tv" if t["tv"] else "movie"].get(t["tmdb"])
            if not a:
                continue
            article_to_id[a] = t["id"]
            article_to_id[unquote(a)] = t["id"]
        mapped = len(set(article_to_id.values()))
        if mapped == 0:
            print(f"  {lang}: nothing in the catalog has an article", flush=True)
            continue

        pairs = 0
        with gzip.open(dump, "rt", encoding="utf-8", errors="replace") as f:
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
                weights[(a, b) if a < b else (b, a)] += n
                covered.add(a)
                covered.add(b)
                pairs += 1

        own = sum(1 for t in titles if t["lang"] == lang)
        print(
            f"  {lang}: {mapped:>5} titles have an article · "
            f"{pairs:>7,} click pairs · catalog holds {own} in this language",
            flush=True,
        )

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
    print(
        f"\n{len(edges)} titles have neighbours ({tv} television), "
        f"{avg:.1f} each → {OUT}"
    )

    name = {t["id"]: t["name"] for t in titles}
    by_lang = defaultdict(int)
    for k in edges:
        t = next((x for x in titles if x["id"] == k), None)
        if t:
            by_lang[t["lang"]] += 1
    print(
        "  by language: "
        + "  ".join(f"{k} {v}" for k, v in sorted(by_lang.items(), key=lambda x: -x[1])[:12])
    )

    for probe in ("The Blue Elephant", "3 Idiots", "Parasite", "Dangal"):
        hit = next((t["id"] for t in titles if t["name"] == probe), None)
        if hit and edges.get(hit):
            print(f"\n  {probe} → " + ", ".join(name.get(e, e) for e in edges[hit][:6]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
