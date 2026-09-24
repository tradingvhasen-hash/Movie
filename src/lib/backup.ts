"use client";

import { DEFAULT_SETTINGS, useDhawq } from "@/lib/store";
import { getLocalTitle, loadCatalog } from "@/lib/catalog";
import type { Swipe, UserList } from "@/lib/types";

/**
 * TAKING YOUR LIBRARY WITH YOU.
 *
 * This existed already, on `/lab` — a page with no link to it anywhere, which
 * a person reached by knowing to type six letters, and which sat next to a
 * button that erases everything. So the honest position was: your data is
 * yours, and the way to get a copy is to guess a URL.
 *
 * It is a trust feature, not a developer tool. Every library in this product
 * lives in one browser's local storage and nowhere else unless the person
 * signs in; clearing browsing data destroys it with no warning and no copy.
 * A visible export is the difference between "your data is yours" being true
 * and being said.
 *
 * TWO FORMATS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS.
 *
 * CSV is for leaving. It opens in any spreadsheet, it reads like the exports
 * Letterboxd and Trakt produce, and it can be carried into a competitor. A
 * backup you can only restore into the product that wrote it is a hostage
 * arrangement, not a backup.
 *
 * JSON is for coming back. It carries the swipe order, the timestamps, the
 * lists and the settings — everything needed to reconstitute the account
 * exactly, including the order answers were given in, which is what the engine
 * replays when the model changes.
 *
 * The taste profile is deliberately NOT exported. It is derived: every swipe
 * carries a snapshot of the title it was made on, so importing the answers
 * rebuilds the profile through whatever engine is current — which is better
 * than restoring a profile computed by an engine that may no longer exist.
 */

export const BACKUP_VERSION = 1;

export interface Backup {
  format: "dhawq-backup";
  version: number;
  exportedAt: string;
  counts: { swipes: number; lists: number };
  swipes: Swipe[];
  swipeOrder: string[];
  lists: UserList[];
  settings: unknown;
  publicProfile: unknown;
}

export function buildBackup(): Backup {
  const s = useDhawq.getState();
  return {
    format: "dhawq-backup",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: { swipes: s.swipeOrder.length, lists: s.lists.length },
    /* in answer order rather than object order, because the order is data:
       the engine replays a history and a shuffled history is a different one */
    swipes: s.swipeOrder
      .map((id) => {
        const sw = s.swipes[id];
        if (!sw) return null;
        const title = sw.title ?? getLocalTitle(id);
        return title
          ? { ...sw, title: { ...title, overview: { en: "", ar: "" }, related: undefined } }
          : sw;
      })
      .filter((x): x is Swipe => Boolean(x)),
    swipeOrder: s.swipeOrder,
    lists: s.lists,
    settings: s.settings,
    publicProfile: s.publicProfile,
  };
}

const ACTION_LABEL: Record<string, string> = {
  liked: "liked",
  disliked: "disliked",
  seen: "watched",
  not_seen: "not seen",
};

/** RFC 4180: quote everything, double any internal quote. Titles contain commas. */
const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function buildCsv(): string {
  const s = useDhawq.getState();
  const rows = [["Title", "Year", "Verdict", "Date", "TitleID"].map(cell).join(",")];
  for (const id of s.swipeOrder) {
    const sw = s.swipes[id];
    if (!sw) continue;
    rows.push(
      [
        cell((getLocalTitle(id) ?? sw.title)?.title.en ?? id),
        cell((getLocalTitle(id) ?? sw.title)?.year ?? ""),
        cell(ACTION_LABEL[sw.action] ?? sw.action),
        cell(new Date(sw.at).toISOString().slice(0, 10)),
        cell(id),
      ].join(",")
    );
  }
  return rows.join("\n");
}

export function download(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  /* revoked on the next tick rather than immediately: Safari has not finished
     reading the blob when click() returns, and an immediately-revoked URL
     downloads a zero-byte file */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportJson(): number {
  const backup = buildBackup();
  download(
    `dhawq-backup-${stamp()}.json`,
    JSON.stringify(backup),
    "application/json"
  );
  return backup.counts.swipes;
}

export function exportCsv(): number {
  const csv = buildCsv();
  /* the BOM is why a spreadsheet opens Arabic titles as Arabic rather than as
     mojibake: Excel assumes the system codepage for a .csv without one */
  download(`dhawq-library-${stamp()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
  return useDhawq.getState().swipeOrder.length;
}

export interface RestoreResult {
  ok: boolean;
  swipes: number;
  lists: number;
  error?: string;
}

/**
 * Restore replaces rather than merges.
 *
 * A merge sounds kinder and is worse: the common reason to restore is that
 * something went wrong on this device, and merging a damaged local state into
 * a good backup preserves the damage. The caller confirms first.
 */
export async function restoreBackup(raw: string): Promise<RestoreResult> {
  let data: Partial<Backup>;
  try {
    data = JSON.parse(raw) as Partial<Backup>;
  } catch {
    return { ok: false, swipes: 0, lists: 0, error: "That file is not a backup." };
  }
  if (data.format !== "dhawq-backup" || !Array.isArray(data.swipes)) {
    return {
      ok: false,
      swipes: 0,
      lists: 0,
      error: "That is not a ذَوق backup file.",
    };
  }

  await loadCatalog().catch(() => undefined);

  const validAction = (a: unknown): a is Swipe["action"] =>
    a === "liked" || a === "disliked" || a === "seen" || a === "not_seen";

  const swipes: Record<string, Swipe> = {};
  for (const candidate of data.swipes) {
    if (
      !candidate ||
      typeof candidate.titleId !== "string" ||
      !validAction(candidate.action) ||
      !Number.isFinite(candidate.at)
    ) continue;
    swipes[candidate.titleId] = candidate;
  }
  const order =
    Array.isArray(data.swipeOrder) && data.swipeOrder.length
      ? data.swipeOrder.filter((id): id is string => typeof id === "string" && id in swipes)
      : Object.keys(swipes);

  const lists = Array.isArray(data.lists)
    ? data.lists.filter(
        (l): l is UserList =>
          Boolean(l) &&
          typeof l.id === "string" &&
          typeof l.name === "string" &&
          Array.isArray(l.titleIds) &&
          l.titleIds.every((id) => typeof id === "string")
      )
    : [];

  const settings =
    data.settings && typeof data.settings === "object"
      ? { ...DEFAULT_SETTINGS, ...(data.settings as Partial<typeof DEFAULT_SETTINGS>) }
      : DEFAULT_SETTINGS;
  const pp =
    data.publicProfile && typeof data.publicProfile === "object"
      ? (data.publicProfile as { name?: unknown; bio?: unknown; avatarUrl?: unknown })
      : {};
  const publicProfile = {
    name: typeof pp.name === "string" ? pp.name : "",
    bio: typeof pp.bio === "string" ? pp.bio : "",
    avatarUrl: typeof pp.avatarUrl === "string" ? pp.avatarUrl : "",
  };

  useDhawq.setState({
    swipes,
    swipeOrder: order,
    lists,
    settings,
    publicProfile,
    accountOwner: null,
  });

  /* Rebuild only after catalog load; slim old backups may carry ids without snapshots. */
  useDhawq.getState().rebuildProfile();

  return { ok: true, swipes: order.length, lists: lists.length };
}
