/// <reference lib="webworker" />

/**
 * Full-catalog browser fallback ranker.
 *
 * Production normally ranks on the Next server so phones do not download and
 * decode the ~48.5k-title catalog. If that path fails or the app is running as
 * the manual static/offline demo, `rank-client.ts` loads the same encoded
 * catalog and hands it to this worker. The worker then executes the identical
 * recommendation engine off the UI thread, preserving correctness without
 * reintroducing the main-thread freezes that originally motivated it.
 */

import {
  getLocalItem,
  installEncodedCatalog,
  loadCatalog,
  setLeanMode,
  vectorOf,
} from "@/lib/catalog";
import type { EncodedCatalog } from "@/lib/data/catalog-codec";
import { recommend } from "./recommend";
import type { TasteProfile } from "./taste";
import type { Title } from "@/lib/types";

export interface RankRequest {
  id: number;
  mode: "swipe" | "discover";
  profile: TasteProfile;
  excludeIds: string[];
  count: number;
  seed: number;
  likedIds: string[];
  dislikedIds: string[];
  /** titles answered 👁 — they join the likes as co-watch seeds */
  seenIds?: string[];
  homeLanguages?: string[];
  /** how deep into the catalog this viewer has asked the deck to reach */
  reach?: "narrow" | "medium" | "wide";
  /** discover wants the numbers it displays; the deck only needs an order */
  withReasons?: boolean;
}

export interface RankReply {
  id: number;
  ids: string[];
  /** parallel to `ids`, only when asked for */
  match?: number[];
  reasons?: string[][];
  becauseOf?: (string | null)[];
  error?: string;
}

/** the worker never renders prose or search text; it only ranks */
setLeanMode();

let ready: Promise<unknown> | null = null;

function titlesFor(ids: string[]): Title[] {
  const out: Title[] = [];
  for (const id of ids) {
    const item = getLocalItem(id);
    if (item) out.push(item.title);
  }
  return out;
}

/** the fallback main-thread catalog copy, so this worker need not fetch a second one */
export interface CatalogMessage {
  kind: "catalog";
  data: EncodedCatalog;
}

self.onmessage = async (event: MessageEvent<RankRequest | CatalogMessage>) => {
  /**
   * On the fallback path the main thread sends its encoded catalog first,
   * avoiding a second browser fetch. `loadCatalog()` below remains the last
   * safety net if the handoff never arrives.
   */
  if ((event.data as CatalogMessage).kind === "catalog") {
    installEncodedCatalog((event.data as CatalogMessage).data);
    return;
  }
  const req = event.data as RankRequest;
  try {
    ready ??= loadCatalog();
    const pool = await ready;

    const recs = recommend(pool as Parameters<typeof recommend>[0], req.profile, {
      excludeIds: new Set(req.excludeIds),
      count: req.count,
      seed: req.seed,
      vectorFor: vectorOf,
      likedTitles: titlesFor(req.likedIds),
      dislikedTitles: titlesFor(req.dislikedIds),
      seenTitles: titlesFor(req.seenIds ?? []),
      homeLanguages: req.homeLanguages,
      mode: req.mode,
      reach: req.reach,
    });

    const reply: RankReply = { id: req.id, ids: recs.map((r) => r.title.id) };
    if (req.withReasons) {
      reply.match = recs.map((r) => r.match);
      reply.reasons = recs.map((r) => r.reasons.map((x) => x.label));
      reply.becauseOf = recs.map((r) => r.becauseOf ?? null);
    }
    (self as unknown as Worker).postMessage(reply);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id: req.id,
      ids: [],
      error: String(err),
    } satisfies RankReply);
  }
};
