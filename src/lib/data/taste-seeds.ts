import type { Title } from "../types";

/**
 * The onboarding grid, chosen by hand.
 *
 * Two mechanical attempts at this failed for the same reason. Walking down the
 * catalog's popularity list gave Interstellar, Inception, The Avengers, Fight
 * Club, Joker — one narrow band of modern blockbuster. Crossing genre with era
 * and taking the best-known title in each bucket barely moved: drama filled 15
 * of 36 tiles, western and romance got one each, and the titles on screen were
 * still Interstellar, Inception, The Dark Knight.
 *
 * The flaw is in the sorting key, not the buckets. Vote count measures how many
 * people *saw* something, and the most-seen titles in any genre are the ones
 * with the broadest crossover appeal — which is exactly the set that tells us
 * nothing about a specific taste. The comedy audience's own canon (Monty
 * Python, Airplane!, Groundhog Day) sits far down that list, below every
 * superhero film that happens to carry a comedy tag.
 *
 * So the grid is named rather than derived: for each audience, the works that
 * audience actually reveres, oldest classics included. A horror fan should spot
 * The Exorcist, a western fan The Good, the Bad and the Ugly, an anime fan
 * Spirited Away — on the first screen, without scrolling. Recognition is the
 * whole mechanism: a tapped tile is worth more than forty swipes, and a tile
 * nobody recognises is worth nothing.
 *
 * Entries are matched against the catalog by name (with the year as a
 * tiebreaker for remakes), so a title missing from the current 5,555 simply
 * drops out and its lane falls through to the next pick. Nothing breaks when
 * the catalog is rebuilt or grows.
 */
export interface SeedEntry {
  /** English title as TMDB spells it */
  name: string;
  /** release year — only needed where remakes share the name */
  year?: number;
}

export interface SeedAudience {
  /** who this lane is for, in one word — used only for diagnostics */
  audience: string;
  /** most revered first; the grid takes them in order */
  titles: SeedEntry[];
}

export const TASTE_SEEDS: SeedAudience[] = [
  {
    audience: "comedy",
    titles: [
      { name: "The Hangover" },
      { name: "Groundhog Day" },
      { name: "Monty Python and the Holy Grail" },
      { name: "Airplane!" },
      { name: "Superbad" },
      { name: "Dumb and Dumber" },
      { name: "Ferris Bueller's Day Off" },
      { name: "Mrs. Doubtfire" },
      { name: "Coming to America", year: 1988 },
      { name: "Bridesmaids" },
      { name: "The Grand Budapest Hotel" },
      { name: "Ace Ventura: Pet Detective" },
      { name: "Anchorman: The Legend of Ron Burgundy" },
      { name: "21 Jump Street" },
      { name: "Home Alone" },
    ],
  },
  {
    audience: "horror",
    titles: [
      { name: "The Shining" },
      { name: "The Exorcist", year: 1973 },
      { name: "Halloween", year: 1978 },
      { name: "Alien" },
      { name: "Psycho", year: 1960 },
      { name: "The Thing", year: 1982 },
      { name: "A Nightmare on Elm Street", year: 1984 },
      { name: "Scream", year: 1996 },
      { name: "The Conjuring" },
      { name: "Get Out" },
      { name: "Hereditary" },
      { name: "The Texas Chain Saw Massacre" },
      { name: "It", year: 2017 },
      { name: "Train to Busan" },
    ],
  },
  {
    audience: "action",
    titles: [
      { name: "Die Hard" },
      { name: "Mad Max: Fury Road" },
      { name: "Terminator 2: Judgment Day" },
      { name: "Enter the Dragon" },
      { name: "John Wick" },
      { name: "Rambo: First Blood" },
      { name: "Lethal Weapon" },
      { name: "Rush Hour" },
      { name: "Top Gun" },
      { name: "Speed" },
      { name: "The Raid" },
      { name: "Kill Bill: Vol. 1" },
      { name: "Mission: Impossible - Fallout" },
      { name: "Gladiator", year: 2000 },
    ],
  },
  {
    audience: "scifi",
    titles: [
      { name: "Blade Runner" },
      { name: "2001: A Space Odyssey" },
      { name: "Back to the Future" },
      { name: "The Matrix" },
      { name: "Alien" },
      { name: "E.T. the Extra-Terrestrial" },
      { name: "Star Wars" },
      { name: "Jurassic Park" },
      { name: "Arrival" },
      { name: "Aliens" },
      { name: "Interstellar" },
      { name: "The Terminator" },
    ],
  },
  {
    audience: "romance",
    titles: [
      { name: "Casablanca" },
      { name: "Titanic" },
      { name: "When Harry Met Sally..." },
      { name: "Before Sunrise" },
      { name: "Eternal Sunshine of the Spotless Mind" },
      { name: "Pride & Prejudice", year: 2005 },
      { name: "Notting Hill" },
      { name: "The Notebook" },
      { name: "La La Land" },
      { name: "Roman Holiday" },
      { name: "Dirty Dancing" },
    ],
  },
  {
    audience: "crime",
    titles: [
      { name: "The Godfather" },
      { name: "Pulp Fiction" },
      { name: "Goodfellas" },
      { name: "The Silence of the Lambs" },
      { name: "Se7en" },
      { name: "Heat", year: 1995 },
      { name: "The Departed" },
      { name: "No Country for Old Men" },
      { name: "The Usual Suspects" },
      { name: "Oldboy", year: 2003 },
      { name: "Zodiac" },
      { name: "Scarface", year: 1983 },
    ],
  },
  {
    audience: "drama",
    titles: [
      { name: "The Shawshank Redemption" },
      { name: "12 Angry Men" },
      { name: "One Flew Over the Cuckoo's Nest" },
      { name: "Schindler's List" },
      { name: "Forrest Gump" },
      { name: "Good Will Hunting" },
      { name: "Parasite" },
      { name: "Cinema Paradiso" },
      { name: "Dead Poets Society" },
      { name: "The Pursuit of Happyness" },
      { name: "Rain Man" },
    ],
  },
  {
    audience: "animation",
    titles: [
      { name: "The Lion King", year: 1994 },
      { name: "Spirited Away" },
      { name: "Toy Story" },
      { name: "My Neighbor Totoro" },
      { name: "Shrek" },
      { name: "WALL·E" },
      { name: "Spider-Man: Into the Spider-Verse" },
      { name: "Finding Nemo" },
      { name: "Coco" },
      { name: "Up" },
      { name: "The Incredibles" },
      { name: "Grave of the Fireflies" },
      { name: "How to Train Your Dragon" },
    ],
  },
  {
    audience: "fantasy",
    titles: [
      { name: "The Lord of the Rings: The Fellowship of the Ring" },
      { name: "Harry Potter and the Philosopher's Stone" },
      { name: "Raiders of the Lost Ark" },
      { name: "Pirates of the Caribbean: The Curse of the Black Pearl" },
      { name: "The Princess Bride" },
      { name: "Avatar", year: 2009 },
      { name: "The Wizard of Oz" },
      { name: "Pan's Labyrinth" },
    ],
  },
  {
    audience: "western",
    titles: [
      { name: "The Good, the Bad and the Ugly" },
      { name: "Once Upon a Time in the West" },
      { name: "Django Unchained" },
      { name: "Unforgiven" },
      { name: "High Noon" },
      { name: "True Grit", year: 2010 },
      { name: "Butch Cassidy and the Sundance Kid" },
    ],
  },
  {
    audience: "war",
    titles: [
      { name: "Saving Private Ryan" },
      { name: "Apocalypse Now" },
      { name: "Full Metal Jacket" },
      { name: "Braveheart" },
      { name: "The Pianist" },
      { name: "1917" },
      { name: "Platoon" },
    ],
  },
  {
    audience: "music",
    titles: [
      { name: "Whiplash", year: 2014 },
      { name: "The Sound of Music" },
      { name: "Grease" },
      { name: "Singin' in the Rain" },
      { name: "Bohemian Rhapsody" },
      { name: "The Greatest Showman" },
    ],
  },
  {
    audience: "world",
    titles: [
      { name: "Seven Samurai" },
      { name: "Amélie" },
      { name: "City of God" },
      { name: "Life Is Beautiful" },
      { name: "The Intouchables" },
      { name: "Crouching Tiger, Hidden Dragon" },
      { name: "3 Idiots" },
      { name: "Central Station" },
    ],
  },
  {
    audience: "tv",
    titles: [
      { name: "Breaking Bad" },
      { name: "Friends" },
      { name: "The Office" },
      { name: "Game of Thrones" },
      { name: "Brooklyn Nine-Nine" },
      { name: "The Sopranos" },
      { name: "Stranger Things" },
      { name: "Sherlock" },
      { name: "Chernobyl" },
      { name: "Death Note" },
    ],
  },
];

/** loose enough to survive punctuation and spelling drift between sources */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ERAS: ((y: number) => boolean)[] = [
  (y) => y < 1980,
  (y) => y >= 1980 && y < 2000,
  (y) => y >= 2000 && y < 2012,
  (y) => y >= 2012,
];

/**
 * Reorder one audience's picks so consecutive tiles come from different eras.
 *
 * Reverence correlates with age — every lane's first few names are its oldest
 * classics — so draining the lanes in written order filled the grid with 16
 * pre-1980 titles and three from the last decade. That is the first grid's
 * failure with the sign flipped.
 *
 * The lane is split by era and drained round-robin, starting from a different
 * era per lane so the first screen is mixed rather than four classics in a row.
 */
function spreadEras(lane: Title[], offset: number): Title[] {
  const buckets = ERAS.map((test) => lane.filter((t) => test(t.year)));
  const out: Title[] = [];
  for (let round = 0; out.length < lane.length; round++) {
    for (let i = 0; i < buckets.length; i++) {
      const pick = buckets[(i + offset) % buckets.length][round];
      if (pick) out.push(pick);
    }
  }
  return out;
}

/**
 * Resolve the named grid against whatever the catalog actually holds.
 *
 * Lanes are drained round-robin, one pick per audience per pass, so the first
 * row already spans comedy, horror, action, sci-fi… rather than opening with
 * four dramas. Names that match nothing are skipped silently.
 */
export function resolveSeeds(pool: Title[], limit: number): Title[] {
  const byName = new Map<string, Title[]>();
  for (const t of pool) {
    const key = norm(t.title.en);
    const bucket = byName.get(key);
    if (bucket) bucket.push(t);
    else byName.set(key, [t]);
  }

  const find = ({ name, year }: SeedEntry): Title | undefined => {
    const matches = byName.get(norm(name));
    if (!matches?.length) return undefined;
    if (matches.length === 1) return matches[0];
    // remakes: nearest year wins, then the better-known one
    const scored = [...matches].sort((a, b) => {
      if (year) {
        const d = Math.abs(a.year - year) - Math.abs(b.year - year);
        if (d !== 0) return d;
      }
      return b.voteCount - a.voteCount;
    });
    return scored[0];
  };

  const lanes = TASTE_SEEDS.map((a, i) =>
    spreadEras(a.titles.map(find).filter((t): t is Title => Boolean(t)), i)
  );

  const out: Title[] = [];
  const used = new Set<string>();
  const depth = Math.max(...lanes.map((l) => l.length));
  for (let round = 0; round < depth && out.length < limit; round++) {
    for (const lane of lanes) {
      if (out.length >= limit) break;
      const pick = lane[round];
      if (pick && !used.has(pick.id)) {
        used.add(pick.id);
        out.push(pick);
      }
    }
  }
  return out;
}
