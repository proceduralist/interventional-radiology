# IR Casebook

A fast, offline-ready **interventional radiology procedural reference and study tool** for residents — and the data platform powering the Academic IR RPG (see `docs/MASTER_SPEC.md`). Buildless single-page app — pure HTML/CSS/vanilla JS, no build step. Content lives in **Supabase** (Postgres + Auth + REST) and is edited via the **`/admin` dashboard**; the site keeps working with zero signal in the angio suite thanks to localStorage snapshots + a static fallback.

**51 procedures** across 10 anatomy categories, each covering the full clinical lifecycle: Pre-Op (indications, contraindications, labs/thresholds, equipment) → Procedure (numbered technique) → Post-Op → Complications → Pearls, with NEJM-style citations.

---

## Features

- **Omni-search** — fuzzy matching across procedure names, aliases, anatomy, devices, and indications. Press `/` to focus.
- **Scrub Sink sidebar** — anatomy hierarchy + modality filters (US, Fluoro, CT, MRI, CBCT).
- **Procedure module** — continuous scroll with a sticky table of contents and scroll-spy.
- **Study / "Pimping" mode** — toggle (`S`) blurs high-yield answers (labs, technique, complications, captions) for active recall; tap any blurred line to reveal. "Reveal all / Hide all" controls included.
- **Scrub Sheet export** — one-click print-to-PDF of a stripped, one-page technique summary (uses the browser's native print engine — no external library, fully offline).
- **Clinical calculators** (`C`) — max contrast dose, CKD-EPI 2021 eGFR, MELD 3.0, Child-Pugh, max lidocaine, Y-90 (MIRD) activity.
- **Dark / light themes** — dark default for reading rooms; toggle persists.
- **Full offline** — a service worker precaches the app shell and `procedures.json` on first visit.
- **Installable PWA** — "Add to Home Screen" on mobile.

### Keyboard shortcuts
`/` search · `S` study mode · `C` calculators · `Esc` close

---

## Run locally

The app fetches data over http(s) (opening `index.html` from disk will not work — browsers block `fetch` on `file://`, and the same restriction applies to the service worker).

```bash
cd "Interventional Radiology"
python3 -m http.server 8000
# site:      http://localhost:8000
# dashboard: http://localhost:8000/admin/
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

---

## Deploy to GitHub Pages

1. Create a repo and push these files to the root (or a `/docs` folder).
2. Repo **Settings → Pages** → Source: `main` branch, `/root`.
3. Your site publishes at `https://<username>.github.io/<repo>/`.

All asset paths are relative, so it works from a project subpath without changes. After each content update, **bump the cache version** (see below) so returning users get the new data.

---

## Update the content

**The Supabase database is the master.** Sign in at **`/admin`** and edit procedures, citations, complications, papers, devices, vessel maps, patient generators, and game config through forms. Every save bumps `data_version`; the site and the game pick up changes automatically on next load — no deploy needed.

Data-class rule (the accuracy contract): **CITED** values come from literature/IFUs and carry a citation; **MODELED** values are labeled simulation parameters; **DESIGN** values are game balance. Never present invented numbers as clinical fact.

`procedures.json` is now a **generated offline fallback**, not the source of truth. After significant content changes, regenerate and commit it, then bump `CACHE` in `sw.js`:

```bash
cd db && python3 export_snapshot.py
```

Admin accounts: sign up in `/admin`, then grant the flag once via SQL editor:
`update public.profiles set is_admin = true where user_id = '<uuid>';`

### Procedure schema

```jsonc
{
  "id": "unique-kebab-id",
  "title": "Procedure Name",
  "aliases": ["synonym", "abbreviation"],
  "category": "arterial",          // must match a categories[].id
  "modalities": ["Fluoro", "US"],
  "time": "60–90 min",
  "highYield": true,
  "tags": ["searchable", "keywords"],
  "overview": "One-paragraph summary with citation markers like [1].",
  "preop": {
    "bleedingRisk": "high",        // "high" | "low"  (SIR classification)
    "indications": ["..."],
    "contraindications": { "absolute": ["..."], "relative": ["..."] },
    "labs": ["thresholds, INR/platelet targets [1]"],
    "meds": "peri-procedural meds (optional)",
    "equipment": ["..."]
  },
  "steps": [
    { "title": "Step title", "text": "Description [2].",
      "media": [ { "type": "image", "src": "https://bucket/clip.jpg", "caption": "..." } ] }
  ],
  "postop": ["..."],
  "complications": [
    { "name": "...", "rate": "1–2%", "severity": "major", "management": "..." }  // severity: minor|moderate|major
  ],
  "pearls": ["optional teaching pearls [1]"],
  "citations": [
    { "id": 1, "text": "Author A, Author B. Title. Journal. Year;Vol(Issue):pages." }
  ]
}
```

**Citations:** put `[1]` or `[1,2]` inline in any text field; the app renders them as superscript links to the numbered reference list. Every marker must have a matching `citations[].id` (a validator script is included — see below).

---

## Media & assets (HIPAA)

Per the spec, heavy media is **decoupled** from this repo. Host anonymized `.png`/`.jpg`/`.mp4` clips on an external bucket (Cloudflare R2, AWS S3) and reference them by URL in each step's `media` array. **No PHI touches this platform** — scrub all DICOM metadata and burn-in identifiers before upload. The service worker will runtime-cache same-origin media; cross-origin bucket media caches per the bucket's CORS/cache headers.

---

## Validate before you ship

A quick integrity check (valid JSON, categories resolve, citation markers all map, no duplicate ids):

```bash
python3 validate.py
```

---

## Tech notes

- No bundler. Site: `index.html` + `styles.css` + `app.js` + `js/` (config + Supabase data loader) + `sw.js`, with `procedures.json` as offline fallback. Dashboard: `admin/` (vanilla JS + pinned supabase-js CDN). Database: `db/schema.sql` (tables, RLS, grants, sync triggers) applied to the Supabase project.
- The publishable Supabase key in `js/config.js` is safe to commit — all authorization is enforced by Postgres Row-Level Security.
- Hash-based router (`#/p/<id>`, `#/cat/<id>`, `#/search/<q>`) — deep links and back-button work.
- Scrub Sheet PDF uses the browser's print pipeline via a print-only stylesheet — nothing to install, works offline (choose "Save as PDF" in the print dialog).
- Theme and study-mode preferences persist in `localStorage`.

---

## Scope / disclaimers

Educational reference only — **verify every dose, threshold, and technique against current institutional protocols and society guidelines before clinical use.** Guideline content reflects sources current as of the data version shown in the sidebar. Not for patient-care documentation. Out of scope: ACGME case logging, DICOM, automated extraction of study statistics (paper data is entered manually by the editor — that human gate is deliberate).
