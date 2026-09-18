"use client";

import { getLocalCatalog } from "@/lib/catalog";
import type { Title } from "@/lib/types";

/**
 * ONE CARD IN FORTY THAT THE ENGINE DID NOT CHOOSE.
 *
 * Every label this project owns was selected by the thing it is used to grade.
 * The deck draws from a fame-ordered pool, so every "have you seen this?"
 * answer we hold was asked about a title the model already believed was likely,
 * and every exposure model since has been fitted on the output of the model it
 * was meant to correct. A system can prove itself right that way indefinitely.
 *
 * `/calibrate` broke the loop once, by drawing a stratified random sample and
 * asking about it. It worked — it is the only honest data here — and then the
 * catalog grew from 15,083 titles to 48,553 and every number derived from that
 * sample stopped describing anything that exists. A one-off measurement expires
 * the moment the thing it measured changes.
 *
 * Sentinels make it continuous. One card in forty is drawn by stratified random
 * sampling across type, language, fame band and era — not by the ranker, not
 * filtered by the gate, not touched by the taste model. The person answers it
 * exactly as they answer any other card and never needs to know which it was.
 *
 * THE SELECTION PROBABILITY IS RECORDED WITH THE ANSWER. Without it the
 * sentinels are just more cards: a stratified draw over-samples small strata on
 * purpose, and reading the answers back without reweighting would report the
 * catalog's rare corners as though they were typical. The probability is what
 * makes the sample usable.
 *
 * WHAT MUST NEVER HAPPEN: using a sentinel answer to grade the ranker that did
 * not select it. It is evidence about the *catalog* and about this person's
 * exposure. Feeding it back as though the engine earned it rebuilds the exact
 * loop this exists to break.
 */

/** one card in this many is a measurement card */
export const SENTINEL_EVERY = 40;

const STRATA = 5;

export interface SentinelDraw {
  title: Title;
  /** P(this title was drawn), for reweighting when the answers are read back */
  probability: number;
  stratum: number;
}

/** fame quintile — the axis the gate orders by, so the axis the bias lies on */
function stratumOf(index: number, total: number): number {
  return Math.min(STRATA - 1, Math.floor((index / Math.max(total, 1)) * STRATA));
}

let cache: { titles: Title[]; strata: Title[][] } | null = null;

function strata(): Title[][] {
  const titles = getLocalCatalog().map((c) => c.title);
  if (cache && cache.titles.length === titles.length) return cache.strata;
  const ordered = [...titles].sort((a, b) => b.voteCount - a.voteCount);
  const out: Title[][] = Array.from({ length: STRATA }, () => []);
  ordered.forEach((t, i) => out[stratumOf(i, ordered.length)].push(t));
  cache = { titles, strata: out };
  return out;
}

/**
 * Draw one measurement card, or null when the catalog is not loaded yet.
 *
 * `exclude` is respected — asking somebody about a title they have already
 * answered is not a measurement, it is a bug — but nothing else is. In
 * particular the taste model is not consulted, which is the entire point.
 */
export function drawSentinel(exclude: Set<string>, rng: () => number): SentinelDraw | null {
  const groups = strata();
  const total = groups.reduce((n, g) => n + g.length, 0);
  if (total === 0) return null;

  /* equal weight per stratum, so the obscure four-fifths of the catalog are
     not crowded out by the famous fifth the deck already covers */
  const order = [...Array(STRATA).keys()].sort(() => rng() - 0.5);
  for (const s of order) {
    const group = groups[s];
    if (group.length === 0) continue;
    for (let attempt = 0; attempt < 24; attempt++) {
      const pick = group[Math.floor(rng() * group.length)];
      if (!pick || exclude.has(pick.id)) continue;
      return {
        title: pick,
        probability: (1 / STRATA) * (1 / group.length),
        stratum: s,
      };
    }
  }
  return null;
}

export interface SentinelRecord {
  titleId: string;
  probability: number;
  stratum: number;
  at: number;
  /** stamped so an answer can never be read against the wrong catalog */
  catalogSize: number;
}

const KEY = "dhawq-sentinels";

/**
 * Stored separately from the swipe history, in its own key.
 *
 * Not for tidiness. A sentinel record is a research artefact with a different
 * lifetime and different rules from a swipe: it must survive a library reset,
 * it must never be synced as taste, and it must never be mistaken for evidence
 * the engine produced. Keeping it in the same object as the swipes is how it
 * would eventually get read as one.
 */
export function recordSentinel(titleId: string, draw: SentinelDraw): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const list = (raw ? (JSON.parse(raw) as SentinelRecord[]) : []).slice(-500);
    list.push({
      titleId,
      probability: draw.probability,
      stratum: draw.stratum,
      at: Date.now(),
      catalogSize: getLocalCatalog().length,
    });
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* a full or blocked storage must never cost the person a card */
  }
}

export function readSentinels(): SentinelRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SentinelRecord[];
  } catch {
    return [];
  }
}
