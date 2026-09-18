/**
 * DOES A LIBRARY SURVIVE THE TRIP TO A SECOND DEVICE?
 *
 *   npx tsx scripts/sync-guard.ts
 *
 * Cross-device sync did not work for weeks and no test noticed, because
 * testing it looked like it needed two real browsers, two real devices and a
 * real account — enough friction that it never happened once. The bug was
 * found by reading the code.
 *
 * It never needed any of that. The fault was a pure function of rows: upload
 * wrote `swipes`, `user_taste`, `lists` and `list_items`; download read
 * `user_taste` and stopped. So a second device adopted a taste built on 1,100
 * swipes with an empty library — and `useDeck` reads the answered set as
 * `Object.keys(swipes)`, so the deck re-asked every title already answered.
 *
 * The question this asks is deliberately not "did a taste vector arrive?".
 * That question passed the entire time the feature was broken. It asks the one
 * the user cares about:
 *
 *     is device B's library identical to device A's — title by title,
 *     action by action, in the same order?
 *
 * Nine cases, no network, no credentials, milliseconds.
 */
import {
  reconstructLibrary,
  type CloudListRow,
  type CloudSwipeRow,
} from "../src/lib/supabase/sync";
import type { SwipeAction, Title } from "../src/lib/types";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

/* a minimal catalog stand-in: the reconstruction only reads titles to attach a
   render snapshot, so the shape matters and the content does not */
const title = (id: string): Title =>
  ({
    id,
    type: "movie",
    title: { en: id, ar: id },
    overview: { en: "long text that must be stripped", ar: "" },
    year: 2000,
    genres: [],
    keywords: [],
    cast: [],
    director: "",
    language: "en",
    rating: 7,
    voteCount: 1000,
    popularity: 1,
    posterPath: "",
    related: ["movie-999"],
  }) as unknown as Title;

const known = new Set(["m1", "m2", "m3", "m4"]);
const lookup = (id: string) => (known.has(id) ? title(id) : undefined);

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const row = (id: string, action: SwipeAction, n: number): CloudSwipeRow => ({
  title_id: id,
  action,
  created_at: at(n),
});

/* ── device A: what the person actually did ── */
const deviceA: CloudSwipeRow[] = [
  row("m1", "liked", 1),
  row("m2", "not_seen", 2),
  row("m3", "disliked", 3),
  row("m4", "seen", 4),
];
const listsA: CloudListRow[] = [
  {
    id: "L1",
    name: "Favourites",
    is_public: true,
    created_at: at(5),
    list_items: [{ title_id: "m1" }, { title_id: "m3" }],
  },
];

/* ── 1 · the whole library arrives ── */
const b = reconstructLibrary(deviceA, listsA, lookup);
check(
  "a library crosses to a second device at all",
  b !== null && Object.keys(b.swipes).length === 4,
  b ? `${Object.keys(b.swipes).length} of 4 swipes restored` : "nothing came back (this was the bug)"
);

/* ── 2 · every action survives, not just the count ── */
const actions = deviceA.map((r) => `${r.title_id}:${r.action}`).join(" ");
const got = b ? b.swipeOrder.map((id) => `${id}:${b.swipes[id].action}`).join(" ") : "";
check(
  "every verdict matches, title by title",
  got === actions,
  `expected  ${actions}\n      got       ${got || "(empty)"}`
);

/* ── 3 · the order is preserved ── */
check(
  "the order the person answered in is preserved",
  b !== null && b.swipeOrder.join(",") === "m1,m2,m3,m4",
  b ? b.swipeOrder.join(",") : "(empty)"
);

/* ── 4 · THE ONE THAT MATTERS FOR THE DECK ──
   answeredIds() is Object.keys(swipes). If that set is short, the deck re-asks
   about titles the person already answered, which is what they actually saw. */
const answered = b ? new Set(Object.keys(b.swipes)) : new Set<string>();
const wouldRepeat = deviceA.filter((r) => !answered.has(r.title_id));
check(
  "the deck will not re-ask anything already answered",
  wouldRepeat.length === 0,
  wouldRepeat.length === 0
    ? "0 of 4 titles would be dealt again"
    : `${wouldRepeat.length} of 4 would be dealt again: ${wouldRepeat.map((r) => r.title_id).join(", ")}`
);

/* ── 5 · a title answered twice resolves to the later answer, once ── */
const changedMind = reconstructLibrary(
  [...deviceA, row("m2", "liked", 90)],
  [],
  lookup
);
check(
  "changing an answer replaces it rather than duplicating it",
  changedMind !== null &&
    changedMind.swipes.m2.action === "liked" &&
    changedMind.swipeOrder.filter((id) => id === "m2").length === 1,
  changedMind
    ? `m2 = ${changedMind.swipes.m2.action}, appears ${changedMind.swipeOrder.filter((id) => id === "m2").length}×`
    : "null"
);

/* ── 6 · rows arriving out of order still resolve by time, not by position ── */
const shuffled = reconstructLibrary(
  [row("m2", "liked", 90), ...deviceA],
  [],
  lookup
);
check(
  "unordered rows still resolve to the latest answer",
  shuffled !== null && shuffled.swipes.m2.action === "liked",
  shuffled ? `m2 = ${shuffled.swipes.m2.action} (expected liked, from t+90)` : "null"
);

/* ── 7 · lists cross too, with their contents ── */
check(
  "lists arrive with their titles and their visibility",
  b !== null &&
    b.lists.length === 1 &&
    b.lists[0].titleIds.join(",") === "m1,m3" &&
    b.lists[0].isPublic === true,
  b && b.lists[0] ? `"${b.lists[0].name}" [${b.lists[0].titleIds.join(",")}] public=${b.lists[0].isPublic}` : "no lists"
);

/* ── 8 · a title the local catalog has never heard of keeps its ANSWER ──
   the answer is the thing worth keeping; a missing poster is not a reason to
   discard what a person told us */
const unknownTitle = reconstructLibrary([row("m9-unknown", "liked", 1)], [], lookup);
check(
  "an answer about a title this catalog lacks is still kept",
  unknownTitle !== null &&
    unknownTitle.swipes["m9-unknown"]?.action === "liked" &&
    unknownTitle.swipes["m9-unknown"].title === undefined,
  unknownTitle ? "kept, with no snapshot attached" : "dropped — a person's answer was lost"
);

/* ── 9 · the snapshot is slimmed, or a library of 4,000 will not fit ── */
const snap = b?.swipes.m1.title;
check(
  "the stored snapshot is slimmed the way the local store slims it",
  snap !== undefined && snap.overview.en === "" && snap.related === undefined,
  snap ? `overview="${snap.overview.en}" related=${snap.related}` : "no snapshot"
);

console.log(
  `\n${9 - failures}/9 checks passed` +
    (failures ? "\n\nA failure here means a person signing in on a second device\nloses their library, or is asked about films they already answered.\n" : "\n")
);
process.exit(failures ? 1 : 0);
