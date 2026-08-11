/** Monochrome stroke icons — the only iconography in the app (no emoji). */

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function base(props: IconProps) {
  return {
    width: props.size ?? 20,
    height: props.size ?? 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: props.strokeWidth ?? 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: props.className,
    "aria-hidden": true,
  };
}

export const CardsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="6.5" y="3.5" width="12" height="17" rx="2.5" transform="rotate(6 12.5 12)" />
    <rect x="4" y="4.5" width="12" height="17" rx="2.5" transform="rotate(-6 10 13)" />
  </svg>
);

export const SparklesIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7L12 4z" />
    <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
  </svg>
);

export const BooksIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20V4H6.5A2.5 2.5 0 004 6.5v13z" />
    <path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5" />
  </svg>
);

export const FilmIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
  </svg>
);

export const HeartIcon = (p: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={p.filled ? "currentColor" : "none"}>
    <path d="M12 20.5s-7-4.6-9-8.6C1.5 8.7 3.3 5.5 6.4 5.5c2 0 3.1 1 3.9 2.2L12 9.5l1.7-1.8c.8-1.2 1.9-2.2 3.9-2.2 3.1 0 4.9 3.2 3.4 6.4-2 4-9 8.6-9 8.6z" />
  </svg>
);

export const XIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const ArrowUpIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export const UndoIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 016 6v1" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

export const StarIcon = (p: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={p.filled ? "currentColor" : "none"}>
    <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9L6.6 19.7l1.1-6L3.2 9.4l6.1-.8L12 3z" />
  </svg>
);

export const ClapperIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M3 8l1.5-4L21 6l-1 2.5" />
    <path d="M8.5 4.8L7 8.5M13.5 5.4L12 9M18.5 6L17 9" />
  </svg>
);

export const TvIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M8 2.5L12 6l4-3.5" />
  </svg>
);

export const InfoIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.5" fill="currentColor" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const ShareIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="17" cy="5.5" r="2.5" />
    <circle cx="17" cy="18.5" r="2.5" />
    <path d="M8.3 10.8l6.4-4M8.3 13.2l6.4 4" />
  </svg>
);

export const GlobeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
  </svg>
);

export const PopcornIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 10l1.5 10.5h9L18 10" />
    <path d="M5 10h14" />
    <path d="M7.5 6.5a2.4 2.4 0 013-2.2 2.6 2.6 0 015 0 2.4 2.4 0 013 2.2 1.9 1.9 0 01-.5 3.5H8a1.9 1.9 0 01-.5-3.5z" />
    <path d="M10 10l.7 10.5M14 10l-.7 10.5" />
  </svg>
);

export const ThumbsDownIcon = (p: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={p.filled ? "currentColor" : "none"}>
    <path d="M17 14V4M7.1 20.3l3.4-6.3H4.8a1.8 1.8 0 01-1.7-2.4l1.9-6A1.8 1.8 0 016.7 4.4H17a2 2 0 012 2V12a2 2 0 01-2 2h-2.6l-3.6 6.8a1.6 1.6 0 01-2.9-.9l.2-.6z" />
  </svg>
);

export const LoginIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
    <path d="M10 17l5-5-5-5M15 12H3" />
  </svg>
);
