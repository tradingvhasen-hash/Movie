/**
 * THE BAKE-OFF — ask several methods the same question, pay for the winner.
 *
 *   MODE=edges LIMIT=20 npm run trial      pilot, live calls, seconds
 *   MODE=edges npm run trial               all 800, Batch API, half price
 *
 * Three methods, one closed world (build-world.ts), one referee
 * (human-test.ts, 398 real MovieLens libraries). Nothing is scaled to the full
 * catalog until it has won here.
 *
 *   edges  "someone loved X — what next?" → a recommendation graph.
 *          The only method with prior evidence: hand-written lists for 115
 *          titles matched real audience behaviour at 107× chance.
 *   tags   mood, tone, pace and craft from a fixed vocabulary → these drop
 *          straight into the existing facet tables as extra keywords, with no
 *          new machinery at all.
 *   soul   60 words on how a film *feels*, never what happens → embedded
 *          locally and turned into nearest-neighbour edges. The most
 *          expensive to build and the one with no evidence behind it. It is
 *          in the race because it is what was originally proposed, and it
 *          should have to win rather than be assumed.
 *
 * Costs are printed after every run, from the API's own token counts.
 *
 * The key is read from ANTHROPIC_API_KEY and never written anywhere.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) throw new Error("ANTHROPIC_API_KEY is not set");

const MODEL = process.env.MODEL ?? "claude-haiku-4-5";
const MODE = (process.env.MODE ?? "edges") as "edges" | "tags" | "soul";
const LIMIT = Number(process.env.LIMIT ?? 0);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);

/** $/M tokens, standard tier. Batch halves both. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [3, 15],
};

interface Brief {
  id: string;
  title: string;
  year: number;
  genres: string[];
  director: string;
  cast: string[];
  keywords: string[];
  overview: string;
}

const world = JSON.parse(readFileSync(".cache/world.json", "utf8")) as {
  ids: string[];
  brief: Brief[];
};
const briefs = LIMIT ? world.brief.slice(0, LIMIT) : world.brief;

/* ── the fixed tag vocabulary ──────────────────────────────────────────────
   Free-form tags would give every film its own private words and nothing
   would ever match anything. A closed vocabulary is what makes two films
   comparable, and it is why this method needs no embeddings: shared tags are
   shared facet tokens, which the engine already counts. */
const VOCAB = [
  // mood
  "bleak", "warm", "melancholy", "playful", "dreadful", "tense", "cosy",
  "euphoric", "wistful", "angry", "serene", "unsettling", "hopeful", "cynical",
  "romantic", "lonely", "triumphant", "grim",
  // tone
  "earnest", "ironic", "deadpan", "satirical", "sincere", "campy", "solemn",
  "irreverent", "absurd", "understated", "melodramatic", "matter-of-fact",
  // pace and shape
  "slow-burn", "relentless", "meandering", "tightly-plotted", "episodic",
  "sprawling", "contained", "twist-driven", "quiet-ending", "explosive-ending",
  "circular", "linear",
  // craft and texture
  "practical-effects", "cgi-heavy", "handheld", "painterly", "stagey",
  "naturalistic", "stylised", "grimy", "polished", "lo-fi", "widescreen-vistas",
  "close-up-faces", "long-takes", "rapid-cutting", "score-driven",
  "silence-heavy", "dialogue-driven", "visual-storytelling",
  // emotional arc
  "cathartic", "downbeat", "uplifting", "ambiguous", "bittersweet",
  "devastating", "comforting", "exhilarating", "thought-provoking", "draining",
  // subject texture
  "ensemble", "two-hander", "coming-of-age", "workplace", "found-family",
  "revenge", "survival", "mystery-unfolds", "period-detail", "urban", "rural",
  "domestic", "epic-scale", "intimate-scale", "true-story", "genre-blend",
];

function prompt(b: Brief): string {
  const facts =
    `${b.title} (${b.year})\n` +
    `genres: ${b.genres.join(", ")}\n` +
    (b.director ? `director: ${b.director}\n` : "") +
    (b.cast.length ? `cast: ${b.cast.join(", ")}\n` : "") +
    (b.keywords.length ? `keywords: ${b.keywords.join(", ")}\n` : "") +
    `overview: ${b.overview}`;

  if (MODE === "edges")
    return (
      `${facts}\n\n` +
      `Someone loved this film. Name 12 other films or shows they should watch ` +
      `next — the answer a knowledgeable friend would give, not a list of ` +
      `sequels and same-genre titles.\n\n` +
      `Spread them: 4 obvious, 4 adjacent, 4 that share the feeling but not ` +
      `the setting or genre.\n\n` +
      `Reply with exactly 12 lines, each one title only, no numbering, no ` +
      `year, no explanation, nothing else.`
    );

  if (MODE === "tags")
    return (
      `${facts}\n\n` +
      `Choose the 10 tags below that best describe how this film FEELS to ` +
      `watch — its mood, tone, pace, craft and emotional arc. Never describe ` +
      `the plot.\n\n${VOCAB.join(", ")}\n\n` +
      `Reply with exactly 10 of those tags, comma-separated, nothing else. ` +
      `Use only tags from the list, spelled exactly as given.`
    );

  return (
    `${facts}\n\n` +
    `In 60 words, describe how this film FEELS to watch: its mood, tone, ` +
    `pace, texture, what the craft is like, and what it leaves you with. ` +
    `Never say what happens in it — no plot, no characters, no events. ` +
    `Write for someone deciding whether it matches their mood tonight.\n\n` +
    `Reply with the description only.`
  );
}

const MAX_TOKENS = MODE === "edges" ? 260 : MODE === "tags" ? 120 : 160;

async function call(b: Brief): Promise<{ text: string; in: number; out: number }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt(b) }],
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 5) throw new Error(`${res.status} after 5 tries`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as {
      content: { text: string }[];
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      text: j.content.map((c) => c.text).join(""),
      in: j.usage.input_tokens,
      out: j.usage.output_tokens,
    };
  }
}

const out: Record<string, string> = {};
let tokIn = 0;
let tokOut = 0;
let done = 0;

const queue = [...briefs];
async function worker() {
  for (;;) {
    const b = queue.shift();
    if (!b) return;
    try {
      const r = await call(b);
      out[b.id] = r.text.trim();
      tokIn += r.in;
      tokOut += r.out;
    } catch (e) {
      console.error(`  ! ${b.title}: ${String(e).slice(0, 120)}`);
    }
    if (++done % 25 === 0 || done === briefs.length)
      process.stdout.write(`\r  ${done}/${briefs.length}`);
  }
}

async function main() {
  console.log(`${MODE} · ${MODEL} · ${briefs.length} films`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const [pin, pout] = PRICES[MODEL] ?? [1, 5];
  const cost = (tokIn / 1e6) * pin + (tokOut / 1e6) * pout;
  mkdirSync(".cache", { recursive: true });
  const file = `.cache/raw-${MODE}-${MODEL}${LIMIT ? `-${LIMIT}` : ""}.json`;
  writeFileSync(file, JSON.stringify(out));

  console.log(
    `\n  ${Object.keys(out).length} written to ${file}` +
      `\n  tokens ${tokIn} in / ${tokOut} out · cost $${cost.toFixed(4)}` +
      `\n  full 800 at this rate: $${((cost / briefs.length) * 800).toFixed(2)}` +
      `\n  full catalog (5,555): $${((cost / briefs.length) * 5555).toFixed(2)}`
  );
}

void main();
