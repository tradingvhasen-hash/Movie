"use client";

import { useRef, useState } from "react";
import { exportCsv, exportJson, restoreBackup } from "@/lib/backup";
import { useDhawq } from "@/lib/store";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * YOUR LIBRARY IS YOURS — the screen that makes that sentence true.
 *
 * Two things lived nowhere before this. Backup lived on `/lab`, an unlinked
 * page reached by guessing a URL, next to a button that erases everything.
 * Account deletion did not exist in any form: a person who signed in had no
 * way out at all.
 *
 * Both are here, on Settings, where somebody looking for them would look.
 *
 * The count is stated rather than implied. "247 films and series" is what
 * makes the export button feel worth pressing, and it is also the honest
 * warning: that number lives in this browser and nowhere else until they sign
 * in, and clearing browsing data takes it with no confirmation from anyone.
 */
export default function DataPanel() {
  const count = useDhawq((s) => s.swipeOrder.length);
  const lists = useDhawq((s) => s.lists.length);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onRestore = async (file: File) => {
    const text = await file.text();
    const result = restoreBackup(text);
    setNote(
      result.ok
        ? `Restored ${result.swipes} titles and ${result.lists} lists.`
        : (result.error ?? "That file could not be read.")
    );
  };

  const deleteAccount = async () => {
    setBusy(true);
    setNote(null);
    try {
      const supabase = getSupabase();
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setNote("You are not signed in, so there is no account to delete.");
        return;
      }
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as {
        ok?: boolean;
        authDeleted?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setNote(body.error ?? "Could not delete the account. Nothing was changed.");
        return;
      }
      await supabase?.auth.signOut();
      /* the local copy goes too — deleting the cloud and leaving the device
         full of the same data is not what anybody means by "delete my data" */
      useDhawq.getState().resetAll();
      setNote(
        body.authDeleted
          ? "Your account and all of its data are gone."
          : "Your data is deleted. The login itself could not be removed — tell the site owner the service key is not set."
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Something went wrong. Nothing was changed.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section className="mt-7">
      <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
        Your data
      </h2>
      <div className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-3.5">
          <p className="text-sm font-semibold">
            {count.toLocaleString()} titles
            {lists > 0 ? ` · ${lists} list${lists === 1 ? "" : "s"}` : ""}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">
            Stored in this browser. Clearing your browsing data erases it, and
            there is no other copy unless you sign in.
          </p>
        </div>

        <Row
          label="Back up my library"
          hint="A file that restores everything, exactly"
          onClick={() => setNote(`Saved a backup of ${exportJson()} titles.`)}
        />
        <Row
          label="Export as a spreadsheet"
          hint="CSV — opens in Excel, moves to another app"
          onClick={() => setNote(`Exported ${exportCsv()} titles.`)}
        />
        <Row
          label="Restore from a backup"
          hint="Replaces what is on this device"
          onClick={() => fileRef.current?.click()}
          last={!isSupabaseConfigured()}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onRestore(f);
            e.target.value = "";
          }}
        />

        {isSupabaseConfigured() && (
          <div className="px-4 py-3.5">
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-sm font-semibold text-danger transition-transform active:scale-95"
              >
                Delete my account and all my data
              </button>
            ) : (
              <div>
                <p className="text-[13px] leading-snug text-ink-dim">
                  This deletes your swipes, lists and profile from the cloud and
                  signs you out. It cannot be undone.{" "}
                  <strong className="text-ink">Take a backup first.</strong>
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteAccount()}
                    className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? "Deleting…" : "Delete permanently"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold"
                  >
                    Keep my account
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {note && (
        <p className="mt-2 px-1 text-[12.5px] leading-snug text-ink-dim" role="status">
          {note}
        </p>
      )}
    </section>
  );
}

function Row({
  label,
  hint,
  onClick,
  last,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors active:bg-black/5 ${
        last ? "" : "border-b border-line"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-[11.5px] text-ink-faint">{hint}</span>
      </span>
    </button>
  );
}
