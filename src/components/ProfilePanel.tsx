"use client";

/**
 * THE PAGE ABOUT THE PERSON, WHICH DID NOT EXIST.
 *
 * The sign-in form used to live at the top of the library, where it was both
 * the wrong content — nobody opens their library to look at a login — and the
 * cause of the flicker reported there, since it appeared late and pushed
 * everything below it down the page.
 *
 * A profile is also a prerequisite for sharing. A shared list carries a name
 * and a face, or it carries "shared by somebody"; there is no third option,
 * and the person doing the sharing should be the one who decides which.
 *
 * WHAT IS EDITABLE AND WHAT IS NOT. The display name and the bio are the
 * person's own; the avatar comes from Google and is not editable here. That is
 * deliberate rather than lazy: an avatar upload needs a storage bucket, a size
 * limit, an image pipeline and a moderation answer for public share pages, and
 * every one of those is a real decision. Google already hands us a picture the
 * person has chosen, so the expensive version can wait until somebody actually
 * wants a different face.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import AccountPanel from "./AccountPanel";
import Wordmark from "./ui/Wordmark";
import { useAccount } from "@/lib/supabase/useAccount";
import { useDhawq } from "@/lib/store";
import { FADE_UP, staggerContainer } from "@/lib/motion";

export default function ProfilePanel() {
  const { session } = useAccount();
  const profile = useDhawq((s) => s.publicProfile);
  const setProfile = useDhawq((s) => s.setPublicProfile);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  /* seed the fields from the account the first time it arrives, so somebody
     who has just signed in does not face two empty boxes when Google already
     told us their name */
  useEffect(() => {
    setName(profile.name || (session?.user.user_metadata?.full_name as string) || "");
    setBio(profile.bio || "");
  }, [profile.name, profile.bio, session]);

  const avatar =
    profile.avatarUrl || (session?.user.user_metadata?.avatar_url as string | undefined);

  const dirty = name !== profile.name || bio !== profile.bio;

  return (
    <motion.div
      variants={staggerContainer(0.06)}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-md px-5 pb-28 pt-8"
    >
      <motion.div variants={FADE_UP} className="flex justify-center">
        <Wordmark size={30} arabic />
      </motion.div>

      <motion.div variants={FADE_UP} className="mt-9 flex flex-col items-center">
        <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border border-line bg-surface-2 text-3xl font-semibold text-ink-faint">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            (name || "?").trim().charAt(0).toUpperCase()
          )}
        </div>
      </motion.div>

      <motion.div variants={FADE_UP} className="mt-8">
        <AccountPanel />
      </motion.div>

      {session && (
        <motion.div variants={FADE_UP} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Display name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none transition-colors focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Bio
            </span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={160}
              className="resize-none rounded-2xl border border-line bg-surface px-4 py-3 outline-none transition-colors focus:border-accent"
            />
          </label>

          <motion.button
            type="button"
            disabled={!dirty}
            onClick={() => setProfile({ name: name.trim(), bio: bio.trim(), avatarUrl: avatar ?? "" })}
            animate={{ opacity: dirty ? 1 : 0.4 }}
            whileTap={dirty ? { scale: 0.97 } : undefined}
            className="rounded-2xl bg-accent px-5 py-3 font-semibold text-[color:var(--color-on-accent)]"
          >
            Save
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}
