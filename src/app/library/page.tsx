"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import TitleTile from "@/components/TitleTile";
import ListsView from "@/components/ListsView";
import PosterArt from "@/components/PosterArt";
import {
  EyeIcon,
  FilmIcon,
  HeartIcon,
  SearchIcon,
  StarIcon,
  ThumbsDownIcon,
  TrashIcon,
  CheckIcon,
} from "@/components/ui/Icons";
import { matches, searchCatalog } from "@/lib/search";
import { getLocalTitle, loadCatalog } from "@/lib/catalog";
import { EASE_OUT, FADE_UP, QUICK, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useDhawq } from "@/lib/store";
import { locale, t } from "@/lib/i18n";
import { genreLabel } from "@/lib/genres";
import type { Swipe, SwipeAction, Title } from "@/lib/types";

type Filter = "all" | "liked" | "disliked";
const FILTERS: Filter[] = ["all", "liked", "disliked"];
type Tab = "watched" | "lists";

/**
 * THE LIBRARY, WITH SEARCH FOLDED BACK INTO IT.
 *
 * `/search` was its own tab, and the user's note on it was blunt: the page
 * felt blank, he did not like the example titles sitting in the field, and he
 * could not see the point of it — "remove it and put it in the library".
 *
 * He is right, and the reason is worth stating because it is not obvious. The
 * search page was never a destination; it was one of the two ways a title gets
 * into your library, and the other one — the deck — is a tab. A person opening
 * this app to record *Snatch* is not going somewhere, they are adding
 * something, and the place a thing gets added is the place it will live.
 *
 * So there is one field, and it answers in the order a person means the
 * question:
 *
 *   FIRST   what you have already watched, matching those words
 *   THEN    everything else in the catalog, matching those words, with the
 *           three verdicts attached so it can be logged on the spot
 *
 * That ordering also removes the one genuine confusion of the old split: the
 * same query produced different answers on two different screens, and nothing
 * on either of them said which corpus it was looking at.
 *
 * RECOGNITION, NOT RECALL. The user made this point about himself and it is
 * the load-bearing fact of this whole product: "when you ask me to name thirty
 * films it is impossible — but show me a thousand and I will recognise all of
 * them." Typing is the fast path for the handful he *can* name; the deck is
 * for the hundreds he cannot. Neither replaces the other, and putting the fast
 * path inside the library is what stops it pretending to be a third thing.
 *
 * LISTS ALSO LIVE HERE, on a tab. A list is made out of the library and looked
 * at right after it; a fifth entry in the nav bar for something that is a view
 * of this page would make every other tab a smaller target for no gain.
 */
export default function LibraryPage() {
  const swipes = useDhawq((s) => s.swipes);
  const removeSwipe = useDhawq((s) => s.removeSwipe);
  const doSwipe = useDhawq((s) => s.swipe);
  const haptics = useDhawq((s) => s.settings.haptics);

  const [tab, setTab] = useState<Tab>("watched");
  const [filter, setFilter] = useState<Filter>("all");
  /**
   * THE FIELD KEEPS ITS OWN TEXT. THE PAGE ONLY HEARS THE PAUSES.
   *
   * This was one `query` state on the page, and it is the clearest measurement
   * in the whole performance pass. With a 900-title library, typing six
   * characters cost 19 blocked frames totalling 2.6 seconds — **and it cost
   * exactly the same when the query matched nothing at all**, with posters
   * disabled. So it was neither the search nor the results nor the images: it
   * was that every keystroke re-rendered this component, and this component
   * renders forty-eight tiles, each of which is three motion components.
   * A hundred and fifty animated elements reconciled per letter typed.
   *
   * The text now lives inside the field, where the only thing that re-renders
   * when you type is the field. The page is told 140ms after you stop, which
   * is when it has something new to show anyway.
   */
  const [settled, setSettled] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** bulk-delete mode, and what is ticked in it — see the Select control */
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [catalogReady, setCatalogReady] = useState(false);

  useEffect(() => {
    void loadCatalog().then(() => setCatalogReady(true));
  }, []);

  const watched = useMemo(
    () =>
      Object.values(swipes)
        .filter((sw) => sw.action !== "not_seen")
        .sort((a, b) => b.at - a.at),
    [swipes]
  );

  const filtered = useMemo(() => {
    let rows = watched;
    if (filter !== "all") rows = rows.filter((sw) => sw.action === filter);
    if (settled.trim()) {
      rows = rows.filter((sw) => {
        const title = getLocalTitle(sw.titleId) ?? sw.title;
        return Boolean(title && matches(title, settled));
      });
    }
    return rows;
  }, [watched, filter, settled]);

  /**
   * The rest of the catalog, for a title that is not in the library yet.
   *
   * Through the prepared index rather than a filter over 15,027 titles calling
   * `matches()` — which normalised three strings per title per keystroke and
   * cost 457ms of frozen main thread for every character. See lib/search.ts.
   */
  const elsewhere = useMemo(() => {
    void catalogReady;
    if (settled.trim().length < 2) return [] as Title[];
    return searchCatalog(settled, { limit: 24, skip: (id) => Boolean(swipes[id]) });
  }, [settled, swipes, catalogReady]);

  const searching = settled.trim().length >= 2;

  /**
   * A page at a time, because the stated goal for this product is every film a
   * person has ever watched.
   *
   * A library of two thousand titles is the *success* case, and rendering two
   * thousand animated tiles is several seconds of frozen page followed by a
   * grid that scrolls at a few frames a second. Two dozen at a time — about
   * two screens — with more added as the bottom comes into view, costs the
   * same whether the library holds fifty or five thousand.
   */
  const PAGE = 24;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [filter, settled, tab]);
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
      },
      { rootMargin: "600px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [filtered.length, tab]);

  return (
    <motion.div
      variants={staggerContainer(0.06)}
      initial="hidden"
      animate="show"
      className="px-5 pb-28 pt-6"
    >
      {/*
        FOUR STACKED ROWS BECAME TWO.

        The user counted them: "first the title at the top, then the two
        options Watched and Lists, then the bar, then the three options All,
        Loved and Disliked. Then only then the movie appears. There is a lot of
        chaos at the top that we could just minimize."

        He is counting correctly, and the fix is not to delete controls — every
        one of them is wanted, he said so — it is to stop giving each of them a
        full-width row of its own. The heading and the Watched/Lists switch sit
        on one line, because a switch between two views of a page belongs beside
        that page's name. The search field and the three verdict filters sit on
        the next, because filtering and searching are the same act: narrowing.

        Same five controls, half the vertical space, and the first poster is
        now above the fold instead of below it.
      */}
      <motion.div variants={FADE_UP} className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-[26px] font-bold tracking-[-0.03em]">
          {t("library.title")}
        </h1>
        <div className="flex shrink-0 rounded-full border border-line bg-surface-2 p-1" dir="ltr">
        {(
          [
            ["watched", "Watched"],
            ["lists", "Lists"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setTab(m)}
            className={`relative rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === m ? "text-[color:var(--color-on-accent)]" : "text-ink-dim"
            }`}
          >
            {tab === m && (
              <motion.span
                layoutId="library-tab"
                transition={SPRING_SNAPPY}
                className="absolute inset-0 rounded-full bg-accent"
              />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
        </div>
      </motion.div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === "lists" ? (
          <motion.div
            key="lists"
            variants={SECTION}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mt-5"
          >
            <ListsView />
          </motion.div>
        ) : (
          <motion.div key="watched" variants={SECTION} initial="hidden" animate="show" exit="exit">
            {/*
              THE ARRANGEMENT, SECOND ATTEMPT.

              "I liked how you made them smaller and how you arranged them — I
              liked that you changed the words to icons and tried to shrink the
              space. The idea is great, only the arrangement I don't like."

              So the icons stay and the two-row shape stays; what changes is
              what shares a line with what. Cramming the three filters onto the
              search field's row left the field about 60% of the width and put
              a segmented control immediately beside a text input — two
              different kinds of thing fighting for one line, and the field, the
              most-used control on the screen, lost the fight.

              The filters move up beside the Watched/Lists switch, where they
              belong: both are "which of these am I looking at", both are
              segmented, and they read as one group of view controls. The search
              field then gets the full width of its own row, which is what a
              field wants. The count and Select keep the third line, which is
              type rather than controls and costs almost no height.
            */}
            <motion.div variants={FADE_UP} className="mt-3">
              <SearchField onSettled={setSettled} />
            </motion.div>

            {/*
              SELECTING MANY, BECAUSE DELETING MANY ONE AT A TIME IS NOT A PLAN.

              The user, thinking it through out loud while asking for the flip
              card: "this is gonna make it harder — people are gonna want to
              delete a lot of things, maybe 20 or 30. It's gonna be hard to
              flip every card then delete it. You should add a way where you
              could select as much as you want from your library and deal with
              it." He guessed it might live in the settings and said he did not
              know where it belonged.

              It belongs here, on the screen holding the things being selected.
              Off by default so the common case — look at what I have watched —
              costs nothing; one tap turns every tile into a checkbox and puts
              a single Delete at the bottom with the count on it.
            */}
            {filtered.length > 0 && (
              <motion.div variants={FADE_UP} className="mt-3 flex items-center gap-3">
                <LayoutGroup id="library-filters">
                  <div className="flex shrink-0 items-center gap-1 rounded-2xl border border-line bg-surface p-1">
                    {FILTERS.map((f) => {
                      const active = filter === f;
                      return (
                        <motion.button
                          key={f}
                          onClick={() => setFilter(f)}
                          whileTap={{ scale: 0.9 }}
                          transition={SPRING_SNAPPY}
                          aria-label={t(`library.${f}`)}
                          title={t(`library.${f}`)}
                          aria-pressed={active}
                          className={`relative grid h-9 w-9 place-items-center rounded-xl transition-colors ${
                            active ? "text-[color:var(--color-on-accent)]" : "text-ink-faint"
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="filter-pill"
                              className="absolute inset-0 rounded-xl bg-accent"
                              transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            />
                          )}
                          <span className="relative">
                            {f === "all" ? (
                              <FilmIcon size={17} strokeWidth={2} />
                            ) : f === "liked" ? (
                              <HeartIcon size={16} filled />
                            ) : (
                              <ThumbsDownIcon size={16} filled />
                            )}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </LayoutGroup>
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  {filtered.length} {filtered.length === 1 ? "title" : "titles"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPicking((v) => !v);
                    setChosen(new Set());
                    setSelectedId(null);
                  }}
                  className="rounded-full px-2 py-1 text-[13px] font-semibold text-accent"
                >
                  {picking ? t("common.cancel") : "Select"}
                </button>
              </motion.div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {filtered.length === 0 && !searching ? (
                <motion.div
                  key={`empty-${filter}`}
                  variants={SECTION}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="mt-14 flex flex-col items-center text-center"
                >
                  <FilmIcon size={50} strokeWidth={1.3} className="text-ink-faint" />
                  <Link href="/" className="mt-5">
                    <motion.span
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      transition={SPRING_SNAPPY}
                      className="glow-btn inline-block"
                    >
                      <span>{t("library.startSwiping")}</span>
                    </motion.span>
                  </Link>
                </motion.div>
              ) : filtered.length === 0 ? (
                /* searching, and nothing of yours matched: the catalog results
                   below are the answer, so this leaves them the space */
                <motion.div key="none" className="h-0" />
              ) : (
                <motion.div
                  key="grid"
                  variants={staggerContainer(0.045)}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  /* Three across, not two. "Maybe instead of two films side by side on one
                     page, make it three." He is right beyond the count: at two
                     columns a poster is 165px wide on a 390px screen, which is
                     larger than the artwork needs to be recognised and means a
                     library of any size is mostly scrolling. Three fits a
                     screenful of a real collection. */
                  className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6"
                >
                  {/*
                    Plain AnimatePresence, not `mode="popLayout"`.

                    popLayout wraps every child in a component that reads
                    `offsetParent`, `offsetWidth` and `offsetHeight` in
                    `getSnapshotBeforeUpdate` — three forced synchronous
                    layouts per tile per render. Profiled at 990ms across ten
                    swipes with a large library. It exists so that a removed
                    tile can be taken out of flow while it animates out; the
                    tiles here shrink and fade in place, which needs none of
                    that.
                  */}
                  <AnimatePresence>
                    {filtered.slice(0, shown).map((sw) => (
                      <LibraryTile
                        key={sw.titleId}
                        swipe={sw}
                        picking={picking}
                        ticked={chosen.has(sw.titleId)}
                        selected={selectedId === sw.titleId}
                        onSelect={() => {
                          if (picking) {
                            setChosen((prev) => {
                              const next = new Set(prev);
                              if (next.has(sw.titleId)) next.delete(sw.titleId);
                              else next.add(sw.titleId);
                              return next;
                            });
                            return;
                          }
                          setSelectedId(selectedId === sw.titleId ? null : sw.titleId);
                        }}
                        onRemove={() => {
                          setSelectedId(null);
                          removeSwipe(sw.titleId);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/*
              One Delete, with the count on it, above the tab bar.

              Deliberately not a per-tile action while picking: the whole point
              of the mode is that thirty decisions become one, so the button
              says how many it is about to take and there is exactly one of it.
            */}
            <AnimatePresence>
              {picking && chosen.size > 0 && (
                <motion.div
                  key="bulk"
                  initial={{ y: 90, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 90, opacity: 0 }}
                  transition={SPRING_SNAPPY}
                  className="fixed inset-x-0 bottom-[calc(74px+env(safe-area-inset-bottom))] z-40 px-5"
                >
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      haptic("commit", haptics);
                      for (const id of chosen) removeSwipe(id);
                      setChosen(new Set());
                      setPicking(false);
                    }}
                    className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-danger py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgb(var(--rgb-shadow)/0.28)]"
                  >
                    <TrashIcon size={17} />
                    {t("common.delete")} {chosen.size}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* more tiles arrive as this comes into view */}
            {filtered.length > shown && <div ref={sentinel} className="h-4" />}

            {/* ── the rest of the catalog, once there is a query ── */}
            <AnimatePresence initial={false}>
              {searching && elsewhere.length > 0 && (
                <motion.div
                  key="elsewhere"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.24, ease: EASE_OUT }}
                  className="mt-9"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      Not in your library
                    </span>
                    <span className="h-px flex-1 bg-line" />
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    {elsewhere.map((title) => (
                      <LogRow
                        key={title.id}
                        title={title}
                        onLog={(action) => {
                          haptic("tick", haptics);
                          doSwipe(title, action);
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {searching && filtered.length === 0 && elsewhere.length === 0 && (
              <p className="mt-14 text-center text-sm text-ink-faint">
                Nothing by that name in the catalog.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * The search box, isolated so that typing costs one component's render.
 *
 * It is a `motion.label` for the same entrance as its neighbours and nothing
 * more; the value never leaves it until the typing stops.
 */
function SearchField({ onSettled }: { onSettled: (v: string) => void }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const id = setTimeout(() => onSettled(value), 140);
    return () => clearTimeout(id);
  }, [value, onSettled]);

  return (
    <motion.label
      variants={FADE_UP}
      className="mt-4 flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors focus-within:border-accent"
    >
      <SearchIcon size={18} className="shrink-0 text-ink-faint" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("library.search")}
        className="w-full bg-transparent text-base outline-none placeholder:text-ink-faint"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="shrink-0 text-ink-faint transition-transform active:scale-90"
          aria-label={t("common.close")}
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-xs">
            ×
          </span>
        </button>
      )}
    </motion.label>
  );
}

/**
 * A title you have not logged, with the three answers attached.
 *
 * The verdicts are the same three the deck offers and they are drawn in the
 * same colours — dislike is red, loved is the accent, watched-no-opinion is
 * neutral. The user's note that "Loved and Not-for-you are both blue, and the
 * dislike doesn't turn red" was true everywhere in the app, and it is the kind
 * of mistake that makes a person distrust every other control on the screen.
 */
function LogRow({
  title,
  onLog,
}: {
  title: Title;
  onLog: (action: SwipeAction) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={SPRING_SNAPPY}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2"
    >
      <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg">
        <PosterArt title={title} sizes="60px" className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title.title.en}</div>
        <div className="text-[11px] text-ink-faint">
          {title.year} · {title.type === "movie" ? t("card.movie") : t("card.tv")}
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5" dir="ltr">
        <LogButton label={t("swipe.disliked")} tint="var(--color-danger)" onPress={() => onLog("disliked")}>
          <ThumbsDownIcon size={17} />
        </LogButton>
        <LogButton label={t("swipe.seen")} tint="var(--color-ink-strong)" onPress={() => onLog("seen")}>
          <EyeIcon size={17} />
        </LogButton>
        <LogButton label={t("swipe.liked")} tint="var(--color-accent)" onPress={() => onLog("liked")}>
          <HeartIcon size={17} filled />
        </LogButton>
      </div>
    </motion.div>
  );
}

function LogButton({
  label,
  tint,
  onPress,
  children,
}: {
  label: string;
  tint: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onPress}
      whileTap={{ scale: 0.88 }}
      transition={SPRING_SNAPPY}
      style={{ width: 40, height: 40, ["--tint" as string]: tint }}
      className="deck-action"
    >
      {children}
    </motion.button>
  );
}

/**
 * A LIBRARY TILE THAT TURNS OVER, LIKE THE CARD IT CAME FROM.
 *
 * The user: "when you press at any work in the library, instead of the delete
 * button showing — no. The card gets flipped, the same effect you have at the
 * swiping page, and it shows you the information of this work. Remove the title
 * written at the bottom of the card. And only then the trash icon appears."
 *
 * Three separate things in that, and they cohere:
 *
 *   THE FRONT IS THE POSTER. Nothing else. The title and year printed under
 *   every tile were a caption for something that does not need captioning —
 *   forty posters with forty labels is a spreadsheet, not a shelf. The verdict
 *   badge stays, because that is the one thing the poster genuinely cannot say.
 *
 *   THE BACK IS THE FACTS. Title, year, genres, the summary — the same content
 *   the deck's card shows on its back, so turning a tile over here means the
 *   same thing it means there.
 *
 *   DELETE LIVES ON THE BACK. It used to be a scrim with a red button dropped
 *   over the poster, which is a destructive action one tap away from a browsing
 *   gesture. Behind the card it is deliberate: you have already turned the
 *   thing over and read it.
 *
 * And while `picking` is on the flip is suspended entirely — a tap is a tick,
 * because in that mode the person is not reading, they are clearing out.
 */
function LibraryTile({
  swipe,
  picking,
  ticked,
  selected,
  onSelect,
  onRemove,
}: {
  swipe: Swipe;
  picking: boolean;
  ticked: boolean;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const title = getLocalTitle(swipe.titleId) ?? swipe.title;
  if (!title) return null;

  const flipped = selected && !picking;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={SPRING_SNAPPY}
      className="relative"
      style={{ perspective: 1100 }}
    >
      <motion.button
        type="button"
        onClick={onSelect}
        whileTap={{ scale: 0.96 }}
        aria-label={title.title[locale]}
        aria-pressed={picking ? ticked : flipped}
        className="relative block aspect-[2/3] w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }}
      >
        {/* ── front: the poster, and the verdict ── */}
        <span
          className="absolute inset-0 overflow-hidden rounded-[20px] bg-surface-2"
          style={{ backfaceVisibility: "hidden" }}
        >
          <PosterArt title={title} sizes="200px" className="h-full w-full" />
          {/* three states, not two. A title added without a verdict is watched
              with no opinion — showing it a thumbs-down would put words in the
              viewer's mouth, and it is the deck's job to ask which it is. */}
          <span
            className={`absolute end-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm ${
              swipe.action === "liked"
                ? "bg-accent"
                : swipe.action === "disliked"
                  ? "bg-danger"
                  : "bg-ink-strong"
            }`}
          >
            {swipe.action === "liked" ? (
              <HeartIcon size={13} filled />
            ) : swipe.action === "disliked" ? (
              <ThumbsDownIcon size={12} filled />
            ) : (
              <EyeIcon size={12} strokeWidth={2.2} />
            )}
          </span>

          {/* the tick, only while clearing out */}
          {/*
            The tick, only while clearing out.

            Screenshotted first as a translucent scrim disc with a transparent
            glyph, which over a light poster read as a smudge rather than a
            control — you could not tell an empty checkbox from a mark on the
            artwork. It is a solid white disc with a hairline ring now, which
            is legible on any poster, and the whole tile dims when it is ticked
            so the state is readable from across the grid rather than from one
            24px corner.
          */}
          {picking && (
            <>
              <span
                className={`absolute inset-0 bg-accent transition-opacity ${
                  ticked ? "opacity-25" : "opacity-0"
                }`}
              />
              <span className="absolute inset-0 flex items-start justify-start p-2">
                <span
                  className={`grid h-[26px] w-[26px] place-items-center rounded-full border shadow-sm transition-colors ${
                    ticked
                      ? "border-accent bg-accent text-[color:var(--color-on-accent)]"
                      : "border-black/10 bg-white text-transparent"
                  }`}
                >
                  <CheckIcon size={14} strokeWidth={3} />
                </span>
              </span>
            </>
          )}
        </span>

        {/*
          ── back: built exactly like the deck card's back ──

          The user: "do you see the design of the back? Why isn't it exactly
          like the design of the back of the cards in the swipe? I see it is
          more beautiful — how the original card becomes blurred and everything
          else. I like it more."

          He is right and the first version here was lazier than it needed to
          be: a plain surface panel with dark text, which is a *different* idea
          of what the back of a card is. The deck's back is the poster itself,
          blurred and scrimmed, with white type over it — so every card's back
          is coloured by its own artwork instead of being the same grey box
          forty times over.

          It is the same construction, at tile scale: `background-image` +
          `filter: blur()` on a static subtree, which the browser rasterises
          once and reuses, rather than `backdrop-filter`, which would re-sample
          the page on every frame the tile moves. That distinction is why the
          deck stopped stuttering, and it is not going to be re-broken here.
        */}
        <span
          className="absolute inset-0 overflow-hidden rounded-[20px] bg-ink-strong"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <span
            className="absolute inset-0 scale-125"
            style={{
              backgroundImage: title.posterPath
                ? `url(https://image.tmdb.org/t/p/w500${title.posterPath})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(14px)",
            }}
            aria-hidden
          />
          <span
            className="absolute inset-0"
            style={{ background: "rgb(var(--rgb-scrim) / 0.76)" }}
            aria-hidden
          />

          <span className="relative flex h-full flex-col p-2.5 text-start text-white">
            <span className="block text-[12.5px] font-bold leading-tight">
              {title.title[locale]}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[9.5px] font-semibold text-white/60">
              {title.year} · {title.type === "movie" ? t("card.movie") : t("card.tv")}
              <StarIcon size={9} filled className="text-accent-soft" />
              {title.rating.toFixed(1)}
            </span>
            <span className="mt-1.5 flex flex-wrap gap-1">
              {title.genres.slice(0, 2).map((g) => (
                <span
                  key={g}
                  className="rounded-full bg-white/20 px-1.5 py-0.5 text-[8.5px] font-semibold capitalize"
                >
                  {genreLabel(g, locale)}
                </span>
              ))}
            </span>
            {title.overview[locale] && (
              <span className="mt-1.5 block min-h-0 flex-1 overflow-hidden text-[9.5px] leading-relaxed text-white/80">
                {title.overview[locale]}
              </span>
            )}
            <motion.span
              role="button"
              tabIndex={0}
              aria-label={t("common.delete")}
              whileTap={{ scale: 0.92 }}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="mt-1.5 flex shrink-0 items-center justify-center gap-1 rounded-full bg-danger py-1.5 text-[10px] font-bold text-white"
            >
              <TrashIcon size={12} />
              {t("common.delete")}
            </motion.span>
          </span>
        </span>
      </motion.button>
    </motion.div>
  );
}
