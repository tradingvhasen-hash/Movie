/**
 * WHICH OF THESE TWO FEELS MORE LIKE THAT ONE?
 *
 *   ANTHROPIC_API_KEY=… LIMIT=40 npx tsx scripts/vibe-judge.ts     pilot
 *   ANTHROPIC_API_KEY=… npx tsx scripts/vibe-judge.ts              full run
 *   DRY=1 npx tsx scripts/vibe-judge.ts                            no key, no calls
 *
 * The taste half of this product is unsolved: it can tell that two films share
 * a keyword, an actor or a genre, and it cannot tell that two comedies with
 * nothing in common are the same thing to watch.
 *
 * EMBEDDING PLOT SUMMARIES WAS TRIED TWICE AND FAILED TWICE, and the failure is
 * precise rather than vague. All titles were embedded locally from their own
 * text; the benchmark's feel-defined line went to 0% at every weight. A direct
 * probe said why:
 *
 *     Mad Max <-> Rebel Moon   0.359      their PLOTS really are alike
 *     Mad Max <-> John Wick    0.307      what separates them is craft and tone
 *
 * No plot summary mentions pace, craft or tone, so no amount of maths over plot
 * summaries can recover them. The bottleneck is the text, not the comparison.
 *
 * SO THIS ASKS A DIFFERENT SHAPE OF QUESTION. Not "score this film" — an
 * absolute score is exactly what an embedding already gives and what already
 * failed. A COMPARISON: given an anchor and two candidates, which is closer in
 * the experience of watching it? A comparison cannot dodge the question. It has
 * to choose, and choosing forces the difference between Rebel Moon and John
 * Wick to be named rather than averaged away.
 *
 * The output is a graph — per title, the works closest in experience —
 * precomputed offline. The running app makes no API calls and needs no key;
 * this is a build step, like the catalog.
 *
 * WHAT MUST HAPPEN BEFORE ANY OF IT SHIPS. The same external validation the
 * model-written edges had to pass: overlap with TMDB co-watch data that nobody
 * here authored. Those scored 16.4% against 0.15% for random — 107x chance —
 * with a pre-registered abort at >60%, because an idea that merely reproduces
 * the free data is not worth paying for. This inherits that bar exactly.
 * `scripts/apply-edges.ts` is what writes a winner into the catalog; nothing
 * here touches it.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadFullCatalog } from "./lib/catalog";
import type { Title } from "../src/lib/types";

const DRY = process.env.DRY === "1";
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY && !DRY) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n\n" +
      "This is a build step, not part of the running site — the app never calls\n" +
      "an API. Get a key at console.anthropic.com, or run with DRY=1 to see the\n" +
      "questions it would ask and what the run would cost.\n"
  );
  process.exit(2);
}

const MODEL = process.env.MODEL ?? "claude-haiku-4-5";
const LIMIT = Number(process.env.LIMIT ?? 0);
/** how many rivals each anchor is asked about */
const RIVALS = Number(process.env.RIVALS ?? 8);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

/** $/M tokens, standard tier */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [3, 15],
  "claude-opus-5": [5, 25],
};

const catalog = loadFullCatalog();
const byId = new Map(catalog.map((t) => [t.id, t]));

/**
 * Anchors are the best-known titles, because a graph is only useful where
 * people actually are — and rivals are drawn from the anchor's own co-watch
 * neighbourhood rather than from the whole catalog.
 *
 * That last choice is the important one. Asking "is Mad Max closer to John Wick
 * or to a Turkish romance nobody in this audience has seen" is a question with
 * an obvious answer and no information in it. The hard, useful comparisons are
 * between titles that ALREADY look similar by the data we have, because those
 * are exactly the pairs the current engine cannot separate.
 */
function anchors(): Title[] {
  const ranked = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
  return LIMIT > 0 ? ranked.slice(0, LIMIT) : ranked;
}

function rivalsFor(anchor: Title): Title[] {
  const near = (anchor.related ?? [])
    .map((id) => byId.get(id))
    .filter((t): t is Title => Boolean(t));
  return near.slice(0, RIVALS);
}

const brief = (t: Title) =>
  `${t.title.en} (${t.year}, ${t.genres.slice(0, 3).join("/")})` +
  (t.people.director ? `, dir. ${t.people.director}` : "");

function prompt(anchor: Title, rivals: Title[]): string {
  return [
    `Someone has just watched ${brief(anchor)} and wants another thing that FEELS the same.`,
    ``,
    `Not the same plot. Not the same genre. The same experience of watching it:`,
    `pace, tone, how heavy or light it sits, how much it asks of you, what it`,
    `leaves you with.`,
    ``,
    `Candidates:`,
    ...rivals.map((r, i) => `${i + 1}. ${brief(r)}`),
    ``,
    `Rank them from closest in feel to furthest. Reply with ONLY the numbers,`,
    `comma separated, best first. No explanation.`,
  ].join("\n");
}

async function ask(text: string): Promise<{ out: string; inTok: number; outTok: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 120,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    content: { text: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };
  return {
    out: body.content.map((c) => c.text).join(""),
    inTok: body.usage.input_tokens,
    outTok: body.usage.output_tokens,
  };
}

async function main() {
  const list = anchors();
  const jobs = list
    .map((a) => ({ anchor: a, rivals: rivalsFor(a) }))
    .filter((j) => j.rivals.length >= 3);

  console.log(
    `vibe graph · ${MODEL}\n` +
      `  ${jobs.length} anchors, up to ${RIVALS} rivals each\n` +
      `  rivals drawn from each anchor's own co-watch neighbourhood — the pairs\n` +
      `  that already look alike are the ones the engine cannot separate\n`
  );

  if (DRY) {
    const sample = jobs[0];
    console.log("── the question, as asked ──\n");
    console.log(prompt(sample.anchor, sample.rivals));
    const approxIn = 220 + RIVALS * 22;
    const [pin, pout] = PRICES[MODEL] ?? PRICES["claude-haiku-4-5"];
    const cost = (jobs.length * (approxIn * pin + 40 * pout)) / 1e6;
    console.log(
      `\n── estimate ──\n` +
        `  ${jobs.length} calls · ~${approxIn} in / ~40 out tokens each\n` +
        `  ~$${cost.toFixed(2)} at standard tier, ~$${(cost / 2).toFixed(2)} via the Batch API\n\n` +
        `  DRY=1: nothing was sent and no key was read.\n`
    );
    return;
  }

  mkdirSync(".cache", { recursive: true });
  const out: Record<string, string[]> = {};
  let inTok = 0;
  let outTok = 0;
  let done = 0;

  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const job = queue.shift();
        if (!job) return;
        try {
          const r = await ask(prompt(job.anchor, job.rivals));
          inTok += r.inTok;
          outTok += r.outTok;
          const order = r.out
            .match(/\d+/g)
            ?.map((n) => job.rivals[Number(n) - 1])
            .filter((t): t is Title => Boolean(t))
            .map((t) => t.id);
          if (order?.length) out[job.anchor.id] = order;
        } catch (e) {
          console.error(`  ${job.anchor.title.en}: ${e instanceof Error ? e.message : e}`);
        }
        if (++done % 50 === 0) console.log(`  ${done}/${jobs.length}`);
      }
    })
  );

  const [pin, pout] = PRICES[MODEL] ?? PRICES["claude-haiku-4-5"];
  writeFileSync(".cache/vibe-edges.json", JSON.stringify(out));
  console.log(
    `\n✅ ${Object.keys(out).length} anchors ranked → .cache/vibe-edges.json\n` +
      `   $${((inTok * pin + outTok * pout) / 1e6).toFixed(2)}\n\n` +
      `   NOT SHIPPED. Validate first, against TMDB co-watch data nobody here\n` +
      `   wrote — the bar the model-written edges cleared was 16.4% overlap\n` +
      `   against 0.15% for random, with a pre-registered abort above 60%.\n` +
      `   Then: npm run benchmark, and scripts/apply-edges.ts if it wins.\n`
  );
}

void main();
