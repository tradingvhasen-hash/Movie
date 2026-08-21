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
  ThumbsDownIcon,
  TrashIcon,
} from "@/components/ui/Icons";
import { matches, searchCatalog } from "@/lib/search";
import { getLocalTitle, loadCatalog } from "@/lib/catalog";
import { EASE_OUT, FADE_UP, QUICK, SECTION, SPRING_SNAPPY, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useDhawq } from "@/lib/store";
import { t } from "@/lib/i18n";
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
      <motion.h1 variants={FADE_UP} className="text-[26px] font-bold tracking-[-0.03em]">
        {t("library.title")}
      </motion.h1>

      <motion.div
        variants={FADE_UP}
        className="mt-4 flex rounded-full border border-line bg-surface-2 p-1"
        dir="ltr"
      >
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
            className={`relative flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
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
            {/* one field, two corpora */}
            <SearchField onSettled={setSettled} />

            {/* filters — the active pill slides between options */}
            <LayoutGroup id="library-filters">
              <motion.div variants={FADE_UP} className="mt-4 flex items-center gap-2.5">
                {FILTERS.map((f) => {
                  const active = filter === f;
                  return (
                    <motion.button
                      key={f}
                      onClick={() => setFilter(f)}
                      whileTap={{ scale: 0.93 }}
                      transition={SPRING_SNAPPY}
                      className={`relative rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                        active
                          ? "border-transparent text-[color:var(--color-on-accent)]"
                          : "border-line bg-surface text-ink-dim hover:text-ink"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="filter-pill"
                          className="absolute inset-0 rounded-full bg-accent"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                      <span className="relative">{t(`library.${f}`)}</span>
                    </motion.button>
                  );
                })}
              </motion.div>
            </LayoutGroup>

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
                  className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
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
                        selected={selectedId === sw.titleId}
                        onSelect={() =>
                          setSelectedId(selectedId === sw.titleId ? null : sw.titleId)
                        }
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

function LibraryTile({
  swipe,
  selected,
  onSelect,
  onRemove,
}: {
  swipe: Swipe;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const title = getLocalTitle(swipe.titleId) ?? swipe.title;
  if (!title) return null;

  return (
    <TitleTile
      title={title}
      onClick={onSelect}
      badge={
        /* three states, not two. A title added without a verdict is watched
           with no opinion — showing it a thumbs-down would put words in the
           viewer's mouth, and it is the deck's job to ask which it is. */
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm ${
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
      }
      /**
       * DELETE, WITH THE FEELING OF HAVING PRESSED SOMETHING.
       *
       * The user's words: "it just appears — I want to feel like the card is
       * getting pushed". That is the difference between a state being
       * *revealed* and a surface *responding*: the tile itself takes the press
       * and sinks, and the scrim and the action arrive on top of that movement
       * rather than instead of it.
       */
      overlay={
        <AnimatePresence>
          {selected && (
            <motion.div
              key="actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: QUICK, ease: EASE_OUT }}
              className="absolute inset-0 z-20 flex items-center justify-center rounded-[20px] bg-[rgb(var(--rgb-scrim)/0.45)] backdrop-blur-[6px]"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              <motion.button
                type="button"
                aria-label={t("common.delete")}
                initial={{ scale: 0.88, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: QUICK, ease: EASE_OUT }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="grid h-12 w-12 place-items-center rounded-full bg-danger text-white shadow-[0_6px_20px_rgb(var(--rgb-shadow)/0.35)]"
              >
                <TrashIcon size={20} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      }
    />
  );
}
