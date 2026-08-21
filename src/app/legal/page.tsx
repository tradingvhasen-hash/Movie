import Link from "next/link";

export const metadata = {
  title: "Privacy & Terms · Seenit",
};

/**
 * ONE PAGE, NOT TWO.
 *
 * Privacy policies and terms of service are conventionally split, and for a
 * product this size that split does nothing except halve the chance either is
 * read. What actually has to exist is a truthful, findable statement of what
 * is collected, who it is shared with, and what the rules are — and it is
 * shorter and more honest as one page than as two padded ones.
 *
 * This is the one screen in the app where text is the product, so the "delete
 * anything that a design could say instead" rule does not apply to it. A
 * diagram cannot tell someone their swipes are stored on Supabase.
 *
 * NOT LEGAL ADVICE, and it says so: it is an accurate description of what this
 * software does, written by the people who wrote the software. A real launch
 * in a regulated market wants a lawyer to read it.
 */
export default function LegalPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-10">
      <Link
        href="/profile"
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-faint transition-colors hover:text-ink"
      >
        <span aria-hidden>&lsaquo;</span> Seenit
      </Link>

      <h1 className="mt-8 text-3xl font-bold tracking-tight">Privacy &amp; Terms</h1>
      <p className="mt-2 text-sm text-ink-faint">Last updated 20 August 2026</p>

      <Section title="What is stored, and where">
        <p>
          Everything you swipe is kept in your own browser first. If you sign in,
          a copy is stored on Supabase so the same library reaches your other
          devices. That copy holds title identifiers, the answer you gave, and
          the time you gave it — not your viewing history from anywhere else,
          because Seenit has no access to any streaming account.
        </p>
        <p>
          If you never sign in, nothing leaves the device. Clearing your browser
          data clears the library with it, which is why the export button in the
          test bench exists.
        </p>
      </Section>

      <Section title="Signing in">
        <p>
          Sign-in is Google only. Seenit receives your name, email address and
          profile picture from Google and stores them to label your account and
          your shared lists. Seenit never sees your Google password.
        </p>
        <p>
          Google only is a deliberate choice, not a limitation: email sign-up
          invites throwaway accounts, and storing data for accounts that were
          never real serves nobody.
        </p>
      </Section>

      <Section title="What other people can see">
        <p>
          Nothing, until you share a list. Your library, your swipes and your
          taste model are private and are never shown to another account.
        </p>
        <p>
          A shared list is public to anyone holding its link. It carries the
          list name, the titles in it, and your display name and picture —
          unless you mark that list anonymous, in which case the link works and
          your name does not appear. Turning sharing off makes the link stop
          working.
        </p>
      </Section>

      <Section title="Film data">
        <p>
          Posters, titles, cast and summaries come from{" "}
          <a
            href="https://www.themoviedb.org/"
            className="text-accent underline underline-offset-2"
            rel="noreferrer noopener"
            target="_blank"
          >
            TMDB
          </a>
          . This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          Deleting your account removes your profile, your swipes and your lists
          from the server, and any link you had shared stops resolving. The copy
          in your own browser is yours to clear.
        </p>
      </Section>

      <Section title="The rules">
        <p>
          Use Seenit for your own viewing history. Do not attempt to scrape it,
          break it, or use a shared list to distribute anything unlawful. The
          service is offered as it is, without warranty; it may change, and it
          may be unavailable.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about anything on this page go to the address in the profile
          screen. If a request concerns your own data, say so and it will be
          treated as one.
        </p>
      </Section>

      <p className="mt-12 text-xs leading-relaxed text-ink-faint">
        This page describes what the software actually does. It is not legal
        advice.
      </p>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-dim">
        {children}
      </div>
    </section>
  );
}
