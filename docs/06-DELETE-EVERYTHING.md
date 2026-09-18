# FILE 6 — THE MASTER PLAN TO DELETE EVERY FOOTPRINT

Step by step, in order. The order matters: things are removed in dependency
order, so nothing is left running with no way to reach it.

**Read Step 0 before anything else. Every step after it is irreversible.**

---

# STEP 0 — SAVE WHAT YOU WANT TO KEEP FIRST

Once this plan starts, none of it comes back. Fifteen minutes here.

**0.1 — Take a copy of the code and the catalog.**
<https://github.com/tradingvhasen-hash/Movie> → green **Code** button →
**Download ZIP**. About 40 MB. That one file contains the entire project: the
code, all 48,553 titles, and these documentation files.

**0.2 — Take the history as well**, if you might ever rebuild. The ZIP does
**not** include the 154 commit messages, and those hold most of the reasoning.

```bash
git clone --mirror https://github.com/tradingvhasen-hash/Movie.git movie-backup.git
```

Keep that folder. It is the complete history, recoverable with
`git clone movie-backup.git`.

**0.3 — Export your own swiping data**, if you want to keep your library.
Open <https://dhawq.onrender.com/lab> and press the copy button. Save the JSON.
It is on your phone/browser only; nothing else has a copy.

**0.4 — Fill in `KEYS.template.txt`** — see `01-SERVICES.md`. Once the accounts
are gone you cannot look any of them up again.

**0.5 — Decide about `NOTES.md`.** 151 KB of working log — every experiment, its
numbers, and every failed idea. It is inside the ZIP. Losing it means any future
attempt repeats the failures listed in `04-THE-ALGORITHM.md` §E.

✅ Only continue once the ZIP is somewhere you trust.

---

# STEP 1 — RENDER (take the live site down first)

**Why first:** while Render is alive the site is public. Removing it first means
nobody can reach the project while you work through the rest.

1. Go to <https://dashboard.render.com> and sign in.
2. Click the service named **`dhawq`**.
3. **Settings** (left menu) → scroll to the bottom → **Delete Service**.
4. Type the service name to confirm.
5. ✅ Check: open <https://dhawq.onrender.com> — you should get "Not Found".

**Then delete the Render account itself:**

6. Click your avatar (top right) → **Account Settings**.
7. Confirm no other services or databases are listed that you still want. This
   is account-wide.
8. Scroll to the bottom → **Delete Account**.

> If you signed into Render **with your GitHub account**, do this step *before*
> deleting GitHub — otherwise you may not be able to log back in to finish it.

---

# STEP 2 — SUPABASE (the only place other people's data could be)

**Why second:** this is the only service that may hold data belonging to anyone
other than you — email addresses of anyone who signed in, and their swipes.

1. Go to <https://supabase.com/dashboard/project/otgniwtpnxnyiqtrctqg>.
2. **Optional but decent:** before deleting, look at
   **Authentication → Users** to see whether anyone other than you ever signed
   in. If real people are listed, deleting the project deletes their data, which
   is the right outcome — but you may want to know.
3. **Project Settings** → **General** → scroll to the bottom →
   **Delete project**.
4. Type the project name to confirm.

This destroys, permanently: the `titles`, `swipes`, `user_taste`, `lists`,
`list_items`, `profiles`, `co_occurrence` and `item_similarity` tables, every
user account, and every share link.

5. ✅ Check: <https://otgniwtpnxnyiqtrctqg.supabase.co> should stop answering.
6. Check the dashboard for **any other projects** you still want. Then:
   your avatar → **Account Settings** (or <https://supabase.com/dashboard/account>)
   → **Delete account**.

---

# STEP 3 — GITHUB (the code, the history, and the backup site)

**Why third:** Render and Pages both deploy from here. With Render already gone,
deleting this also removes the GitHub Pages copy at
<https://tradingvhasen-hash.github.io/Movie/>.

**3.1 — Turn off GitHub Pages** (do this first, it takes effect immediately):
1. <https://github.com/tradingvhasen-hash/Movie/settings/pages>
2. Under **Build and deployment** → **Source** → set to **None**.
3. ✅ Check: <https://tradingvhasen-hash.github.io/Movie/> should 404 within a
   few minutes.

**3.2 — Delete the repository:**
1. <https://github.com/tradingvhasen-hash/Movie/settings>
2. Scroll to the bottom → **Danger Zone** → **Delete this repository**.
3. Type `tradingvhasen-hash/Movie` to confirm.

This removes: all 154 commits, all the code, `catalog.json`, `NOTES.md`, these
documentation files, the Actions history, and every issue and pull request.

> ⚠️ **If anyone ever forked the repository, their fork survives and stays
> public.** Check before deleting:
> <https://github.com/tradingvhasen-hash/Movie/forks>. You cannot delete someone
> else's fork; you can only ask them to. The repository has been public since
> 11 August 2026.

**3.3 — Delete the GitHub account** (only if you want nothing left at all —
this affects everything you have ever done on GitHub, not just this project):
1. <https://github.com/settings/admin>
2. **Delete your account**. It lists what will be removed. Read it.

---

# STEP 4 — TMDB (rotate the key, then close the account)

**Rotating the key first matters**, because the key may have been typed into
terminals, CI logs and scripts over the life of the project. Killing it is the
part that actually protects you; deleting the account is tidiness.

1. <https://www.themoviedb.org> → sign in.
2. Avatar (top right) → **Settings** → **API**.
3. **Regenerate** the API key — or delete the API registration outright. The old
   key stops working instantly.
4. To close the account: **Settings** → **Account** → **Delete account**. TMDB
   may require an email confirmation, and it can take a few days.

Your contributions to TMDB's shared database (if you ever edited anything) stay —
that is community data, not yours to withdraw.

---

# STEP 5 — ANTHROPIC API CONSOLE (if you created one)

Only relevant if you ran `scripts/trial-enrich.ts` or the `llm-*.py` experiments.

1. <https://console.anthropic.com> → **API Keys**.
2. Delete every key listed. **Do this even if you plan to keep the account** —
   an unused key is the one most likely to leak.
3. Check **Usage / Billing** for anything unexpected.
4. To close: **Settings** → **Organization** → delete. If billing is attached,
   remove the payment method too.

---

# STEP 6 — CLAUDE (claude.ai) — the conversations

**This is the one people forget.** The chats where the project was built hold
reasoning that never made it into any commit message, and deleting GitHub does
nothing to them.

1. <https://claude.ai> → sign in.
2. Delete the project conversations one at a time from the sidebar (⋯ → Delete),
   or use **Settings → Privacy** for a bulk delete if your account offers one.
3. Check <https://claude.ai/code> as well — sessions started from the coding
   surface are listed there.
4. **Settings → Privacy → Delete account** to close it entirely.

> Anthropic retains some data for a limited period after deletion for legal and
> safety reasons. Their privacy policy at <https://www.anthropic.com/legal/privacy>
> states the actual retention periods; do not take a number from this file.

---

# STEP 7 — YOUR OWN DEVICES

The app stores your library **in your browser**, and nowhere else. Deleting the
services does not touch it.

**On every browser and every device you ever opened the site with:**

- **Phone (Safari):** Settings → Safari → Advanced → Website Data → search
  `onrender` → swipe to delete.
- **Phone (Chrome):** ⋮ → Settings → Privacy → Clear browsing data → Cookies and
  site data.
- **Desktop (any browser):** open <https://dhawq.onrender.com>, press F12 →
  **Application** → **Local Storage** → delete the key **`dhawq-store`**.
  (Once Render is deleted the page will not load, so **do this before Step 1** if
  you want the clean version — otherwise clear the whole site's data from browser
  settings instead.)

**On any computer you developed on:**

```bash
rm -rf ~/Movie                 # or wherever you cloned it
rm -f  ~/Movie/.env.local      # the file that held your keys
```

Also check: `.cache/` inside the project (MovieLens histories, your session
exports, your calibration answers), shell history (`~/.bash_history`,
`~/.zsh_history`) for any line where you typed `TMDB_API_KEY=…`, and any note app
or screenshot where you pasted a key.

---

# STEP 8 — WHAT WILL STILL EXIST AFTERWARDS

An honest list. None of it is under your control, and no plan can promise
otherwise.

| Still out there | Why | What you can do |
|---|---|---|
| **Search-engine caches** (Google, Bing) | Cached copies of pages | Usually clear in days/weeks once the pages 404. Google has a removal tool. |
| **archive.org / Wayback Machine** | May have snapshotted a public GitHub repo or the live site | Request removal at info@archive.org. Not guaranteed. |
| **Forks and clones of the repo** | The repo was public from 11 Aug 2026. Anyone could have copied it. | Nothing. Check the forks page before deleting. |
| **GitHub Pages CDN edges** | Cached for a short time | Waits itself out. |
| **Render / Supabase internal logs** | Standard operational retention | Their retention policies decide. Deleting the account starts the clock. |
| **TMDB's server logs** | They saw your API calls | Their retention policy decides. |
| **Package registries** | `npm install` fetched public packages | Nothing project-specific; not a footprint of yours. |
| **Anyone who was sent a link** | The links in this file were shared | Nothing. |

**And the one that matters most:** if any secret was ever committed to the public
repo, **deleting the repo does not undo it.** Public repositories are scanned by
bots within minutes and copied automatically. **Always rotate the key itself
(Step 4, Step 5) — never rely on the file or the repo being deleted.**

As far as this project's own history shows, no secret was ever committed: every
commit ran a secret scan, `.gitignore` excludes `.env*`, and `.env.example`
carries only empty placeholders. Rotate anyway. It costs a minute.

---

# THE WHOLE PLAN ON ONE SCREEN

```
 0. BACK UP           Download ZIP + git clone --mirror + export /lab
                      + fill in KEYS.template.txt         ← LAST CHANCE

 1. RENDER            delete service "dhawq"  →  delete account
                      dashboard.render.com

 2. SUPABASE          delete project otgniwtpnxnyiqtrctqg  →  delete account
                      supabase.com/dashboard

 3. GITHUB            Pages source = None
                      → check /forks
                      → delete repo tradingvhasen-hash/Movie
                      → delete account (github.com/settings/admin)

 4. TMDB              REGENERATE the API key (this is the important part)
                      → delete account
                      themoviedb.org/settings/api

 5. ANTHROPIC API     delete all keys  →  close org
                      console.anthropic.com

 6. CLAUDE            delete the conversations  →  delete account
                      claude.ai  and  claude.ai/code

 7. YOUR DEVICES      clear localStorage key "dhawq-store" on every browser
                      rm -rf the clone, .env.local, .cache/
                      check shell history for TMDB_API_KEY=

 8. ACCEPT            caches, archives and any forks are outside your control
```

**If you only do one thing:** Step 4 — regenerate the TMDB key. A live key is the
only part of this footprint that can still cost you something.
