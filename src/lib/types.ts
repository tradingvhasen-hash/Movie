export type TitleType = "movie" | "tv";

export interface Title {
  /** Stable id: "movie-603" (tmdb) or "s-matrix" for bundled samples */
  id: string;
  type: TitleType;
  tmdbId?: number;
  title: {
    en: string;
    ar: string;
    /**
     * The name in its own script — "الفيل الأزرق", "ワンピース". Empty when the
     * work is English or when TMDB's original matches the English title.
     * Searched, never displayed: the user's own example settles it — Three
     * Idiots is better known by its English name than by 3 इडियट्स, so
     * recognition keeps English and only recall needs the native name.
     */
    original?: string;
  };
  overview: { en: string; ar: string };
  year: number;
  genres: string[];
  keywords: string[];
  people: { director?: string; cast: string[] };
  originalLanguage: string;
  /** TMDB vote average 0-10 */
  rating: number;
  voteCount: number;
  /**
   * How widely this was actually watched by its own audience, 0..1, estimated
   * once offline by a language model (`scripts/llm-reach.py`).
   *
   * The prior the engine reaches for when a person has told it nothing. It
   * replaces `recognizability(voteCount)`, which measured AUC 0.500 against a
   * real viewer's answers — a coin flip — because a TMDB vote count is a
   * survey of Western film enthusiasts and cannot see that fifty million
   * people watched an Egyptian film. Absent for titles the run did not reach,
   * where the vote count is still used.
   */
  reach?: number;
  popularity: number;
  posterPath?: string | null;
  backdropPath?: string | null;
  /** Part of the cold-start calibration deck */
  onboarding?: boolean;
  /**
   * Ids of titles TMDB's audience data links to this one ("people who watched
   * this also watched…"), strongest first. This is the only signal in the
   * catalog not derived from the title's own metadata, so it can connect two
   * films that share no keyword, genre or crew.
   */
  related?: string[];
}

/**
 * The answers a person can give about a title.
 *
 * `seen` is the fourth and it exists for the grid. A card asks one question
 * and gets a full verdict; a grid of thirty posters asks "which of these have
 * you watched?" and gets thirty answers, and a tap on one of them means
 * exactly *watched* — no opinion, because nobody is going to rate thirty
 * films by tapping.
 *
 * That distinction has to reach the model, not be flattened on the way in.
 * `seen` writes to the exposure tables at full strength and writes **nothing**
 * to the taste tables, because inventing a preference the person never
 * expressed is how a model learns something false. Which is the whole reason
 * this is a separate value and not `liked` with a smaller weight.
 */
export type SwipeAction = "liked" | "disliked" | "not_seen" | "seen";

export interface Swipe {
  titleId: string;
  action: SwipeAction;
  at: number; // epoch ms
  /** snapshot of the title at swipe time, so the library renders even after
   * the catalog changes (e.g. switching from bundled demo data to TMDB) */
  title?: Title;
}

export interface UserList {
  id: string;
  name: string;
  isPublic: boolean;
  titleIds: string[];
  createdAt: number;
}

export interface Recommendation {
  title: Title;
  /** raw blended score — ordering only, not meaningful on its own */
  score: number;
  /**
   * Stable 0..100 match. Derived from the absolute facet score, so the same
   * title reports the same number in every batch (the old percentage divided
   * by the batch maximum, which made the top card always 100%).
   */
  match: number;
  /** the concrete values behind the match: "same director", "thriller", … */
  reasons: { kind: string; label: string }[];
  /** id of the liked title that most explains this rec, if any */
  becauseOf?: string;
}
