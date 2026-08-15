export type TitleType = "movie" | "tv";

export interface Title {
  /** Stable id: "movie-603" (tmdb) or "s-matrix" for bundled samples */
  id: string;
  type: TitleType;
  tmdbId?: number;
  title: { en: string; ar: string };
  overview: { en: string; ar: string };
  year: number;
  genres: string[];
  keywords: string[];
  people: { director?: string; cast: string[] };
  originalLanguage: string;
  /** TMDB vote average 0-10 */
  rating: number;
  voteCount: number;
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
