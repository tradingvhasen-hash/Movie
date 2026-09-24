"use client";

import { useRef, useState } from "react";
import { exportCsv, exportJson, restoreBackup } from "@/lib/backup";
import { useDhawq } from "@/lib/store";
import { getSupabase } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const count = useDhawq((s) => s.swipeOrder.length);
  const lists = useDhawq((s) => s.lists.length);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onRestore = async (file: File) => {
    const text = await file.text();
    const result = await restoreBackup(text);
    setNote(
      result.ok
        ? t("data.restored", { swipes: result.swipes, lists: result.lists })
        : (result.error ?? t("data.badBackup"))
    );
  };

  const deleteData = async () => {
    setBusy(true);
    setNote(null);
    try {
      const supabase = getSupabase();
      const session = (await supabase?.auth.getSession())?.data.session;

      // Guest reset is a first-class path. A tester (or any signed-out user)
      // should be able to return this browser to a truly fresh Dhawq state
      // without creating an account just to delete it.
      if (!supabase || !session) {
        useDhawq.getState().eraseAllUserData();
        setNote(t("data.localDeleted"));
        return;
      }

      const { data, error } = await supabase.functions.invoke("delete-account", {
        method: "POST",
      });
      const body = (data ?? {}) as { ok?: boolean; error?: string };
      if (error || !body.ok) {
        setNote(body.error ?? error?.message ?? t("data.deleteFailed"));
        return;
      }

      // The cloud identity is already gone at this point. Local cleanup must
      // not depend on a network sign-out call succeeding against that deleted
      // identity.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // eraseAllUserData below remains authoritative for this device
      }
      useDhawq.getState().eraseAllUserData();
      setNote(t("data.deleted"));
    } catch (e) {
      setNote(e instanceof Error ? e.message : t("data.deleteUnexpected"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section className="mt-7">
      <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
        {t("data.title")}
      </h2>
      <div className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-3.5">
          <p className="text-sm font-semibold">
            {lists > 0
              ? t("data.summaryLists", { count: count.toLocaleString(), lists })
              : t("data.summary", { count: count.toLocaleString() })}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">
            {t("data.localNote")}
          </p>
        </div>

        <Row
          label={t("data.backup")}
          hint={t("data.backupHint")}
          onClick={() => setNote(t("data.savedBackup", { count: exportJson() }))}
        />
        <Row
          label={t("data.csv")}
          hint={t("data.csvHint")}
          onClick={() => setNote(t("data.exported", { count: exportCsv() }))}
        />
        <Row
          label={t("data.restore")}
          hint={t("data.restoreHint")}
          onClick={() => fileRef.current?.click()}
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

        <div className="px-4 py-3.5">
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-sm font-semibold text-danger transition-transform active:scale-95"
              >
                {t("data.delete")}
              </button>
            ) : (
              <div>
                <p className="text-[13px] leading-snug text-ink-dim">
                  {t("data.deleteWarning")}{" "}
                  <strong className="text-ink">{t("data.backupFirst")}</strong>
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteData()}
                    className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? t("data.deleting") : t("data.deletePermanent")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold"
                  >
                    {t("data.keep")}
                  </button>
                </div>
              </div>
            )}
          </div>
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
