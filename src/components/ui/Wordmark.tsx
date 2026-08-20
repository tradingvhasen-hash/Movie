/**
 * THE ONE PLACE THIS PRODUCT SAYS ITS OWN NAME.
 *
 * The user said the site has no identity — no name, no mark, nothing that says
 * what this is — and floated a top bar carrying a logo. I decided against the
 * bar and for the mark, and the reasoning is worth keeping because it is the
 * same reasoning that will come up again:
 *
 * A fixed top bar costs about 56px of height on **every** screen, and the most
 * important screen in this product is a single card that wants every pixel of
 * vertical space it can get. Identity that taxes the core interaction is not
 * identity, it is decoration with a rent. So the mark appears only where there
 * is space it is not stealing: the welcome card, the share page a stranger
 * lands on, the profile, and the sign-in screen. Those are also, not by
 * coincidence, the only four moments a person actually wonders what this site
 * is called.
 *
 * THE MARK ITSELF. A card with one corner lifted and an arc sweeping through
 * it: the shape of a swipe, drawn as a single stroke. It is geometric rather
 * than illustrative so it survives being 20px in a browser tab, monochrome so
 * it inherits the accent in light and dark without a second asset, and built
 * from the same stroke weight and corner radius as every icon in `Icons.tsx`,
 * because a logo drawn in a different vocabulary from the interface around it
 * is the fastest way to look assembled from parts.
 *
 * THE NAME is `dhawq`, lower-case Latin, with `ذوق` available as a companion.
 * The Latin form leads because it is what the address bar says and what a
 * person types to come back — the URL is the identity anchor whether we like
 * it or not — and because the interface language is English. The Arabic form
 * appears alongside it where there is room, since the word only means anything
 * in Arabic: it is "taste".
 */

type Props = {
  size?: number;
  /** show the Arabic companion under the Latin wordmark */
  arabic?: boolean;
  className?: string;
};

export function Logomark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* the card */}
      <rect x="4.5" y="3" width="15" height="18" rx="4.2" />
      {/* the swipe: one arc leaving through the right edge */}
      <path d="M9 15.4c1.9-4.6 4.6-6.9 8.1-6.9" />
      <path d="M14.6 6.2 17.9 8.5l-2.2 3.2" />
    </svg>
  );
}

export default function Wordmark({ size = 28, arabic = false, className }: Props) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Logomark size={size} className="text-accent" />
      <span className="inline-flex flex-col items-start leading-none">
        <span
          className="font-semibold tracking-tight text-ink"
          style={{ fontSize: size * 0.78, letterSpacing: "-0.02em" }}
        >
          dhawq
        </span>
        {arabic && (
          <span
            className="mt-1 text-ink-faint"
            style={{ fontSize: size * 0.42, letterSpacing: "0.04em" }}
            dir="rtl"
          >
            ذوق
          </span>
        )}
      </span>
    </span>
  );
}
