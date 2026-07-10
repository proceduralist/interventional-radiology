# Ward NPCs + Preop + Progression — accuracy review sheet

Built 2026-07-10 (migrations `ward_preop_progression` + `taxonomy_only_actions_rekey`,
data_version 82). This sheet lists every value by data class so you can review it the way
you review procedure data.

## Second pass (same day, per your feedback)

- **No more give-away buttons.** The battle Actions menu is ONLY the nested taxonomy
  (12 categories / ~80 moves) — the "◆ This step" answer list is gone. The Imaging root
  command is gone too; imaging maneuvers live under Actions → Imaging like everything else,
  so the root menu is exactly your spec: Actions / Bag / Ask For Help / Leave Procedure.
- **Chest-port re-keyed to 14 granular taxonomy steps** (each step = one findable maneuver):
  time-out → sterile prep → US survey → US-guided access → wire to IVC → anesthetize
  pocket/tract → pocket (± transfuse) → tunnel → measure/trim → peel-away (air precautions)
  → advance to CAJ → attach to port → access & test → confirm & close. Your example works
  exactly: Actions → Procedure control → Time-out, then Actions → Imaging → Ultrasound.
  New teaching hooks: skipping sterile prep = "not performed under sterile prep" −3;
  skipping measure/trim sets a malposition flag (reposition needed at closure); sloppy
  peel-away handling (step-10 default) arms a 60% MODELED air-embolism roll on delivery.
  The old forceful-advance CAJ-perforation branch was dropped in the re-key (stress
  mechanics still live in the Sim Lab + UFE) — say the word if you want it back as a
  taxonomy-reachable variant.
- **New taxonomy content (DESIGN, curate freely):** "Surgical / implant" category
  (sterile-prep, local-anesthesia, incise, blunt-pocket, tunnel, measure-trim,
  connect-device, close-pocket) and medications/transfuse. Fixture:
  `game/tests/action_taxonomy.js`.
- **UFE:** the unreachable "single-side" outcome is now taxonomy-keyed — closing after one
  side (Procedure control → Close & dress) = the unilateral-UFE penalty.
- **Cutscene:** a nurse now pushes the bed foot-first (rotates 90° for the westbound leg,
  180° for the northbound leg into the elevator).
- **Floor 3 is real rooms now:** IR, CT and Ultrasound are walled rooms with door gaps
  (grid-aligned collision), 3/4 interior wall faces with accent stripes, equipment
  (C-arm + OR table + monitor bank + sterile back table; CT gantry + couch + console;
  US cart + exam bed), and staff NPC sprites (teal-scrub nurses, navy-scrub techs with
  lead aprons, Y-sorted + solid). The sent patient lies on that room's table, the IR door
  gets a red "in use" lamp, and room portal labels update live.

## What the update does (player-facing)

Ward beds on floor 2 each hold a generated NPC patient whose procedure is gated by your level
(`v_game_ready.min_level` vs `save.xp`). Interacting opens the bedside consult with the four
spec options: Perform Procedure, Order Lab Work, Recommend Against Procedure, Come Back Later.
Ordered labs result on the next visit (deranged values correct; missing values appear, 30%
still abnormal and need a re-order). Performing without optimization logs the CITED penalty and
multiplies the matching complication's roll. Perform → pick IR Suite / CT Suite / US Room /
Bedside; wrong room = −5 and the case still runs there; non-bedside sends the patient by
cutscene to a 3rd-floor room that holds ONE patient (the "You have a patient waiting…" lock).
The battle screen gained the equipped-item hub (top-left), Ask For Help (attending hints, >5 →
kicked out, 0 points), Leave Procedure (fail + clout loss), and hard-blocked steps: physically
impossible maneuvers (e.g. wire before needle access) summon the attending with escalating
lines; 5 strikes → "I am taking over this case", 0 points. A resolved complication never
re-rolls in the same case. Completed cases pay XP (score ÷ 2); leveling unlocks higher
`min_level` procedures on the ward. Beds respawn 2–5 min after emptying (your compressed pick).

## Third pass (same day): discovery rule, floors, NPC cast, real lobbies

- **Nothing highlights what's wrong (your rule).** The bedside consult has NO banners, no
  "not yet optimized," no red contraindication box, no proceed-anyway confirm, and no
  "proceeding despite X" console line at case start. The chart shows raw data only: H/L lab
  flags (authentic EMR behavior), "— not on file" gaps, and an always-present overnight
  nursing note that carries the contraindication findings in plain clinical language
  (fever + GNR cultures; site erythema; β-hCG…) without naming the diagnosis. All scoring,
  risk multipliers, and post-op consequences still apply — they surface at the debrief.
- **Hospital re-floored:** B sim lab/procurement · 1 lobby · 2 wards · 3 IR · 4 CT · 5 US ·
  6 staff lounge + call rooms. Each procedure floor is one big walled suite. Floor 6: west
  half is the attendings' lounge (couch, coffee, table, two attendings wandering, one at
  the pot — pearls kiosk lives here now); east half is three call rooms — two post-call
  residents asleep, and YOUR empty room opens the progress/achievements screen.
- **Basement built out:** Sim Lab (flow bench, SimMan torso, monitors, sim tech) and
  Procurement (stock shelving, order desk, supply clerk) are real walled rooms.
- **Fixed:** ward patients no longer appear on other floors (stale per-floor refresh
  callbacks survived scene.restart — now cleared on every floor change).
- **Animated NPC cast:** your sprite sheet (8 characters, 3-frame walk × 4 directions) now
  drives every staff NPC — walking, talking/working idle animations, role-mapped
  (attendings, doctors, surgical residents in scrubs, nurses, seniors, visitors). Sheet is
  at `game/assets/npcs.png` (**license row in CREDITS.md needs your verification**). The
  old procedural sprites remain as an automatic fallback if the sheet fails to load.
  Babies/students aren't in this 8-character sheet — say the word and I'll generate a
  matching second sheet (animated-sprite-gen) for parents-with-babies, students, etc.
- **Lobby sign-posts are now real rooms**, themed from the existing POI data: Sherman's
  cafe is a coffee shop (counter, espresso machine, animated barista, seated customers —
  ordering costs 2 funds and pulls a random menu item) and its auditorium has a stage,
  a randomly generated speaker mid-lecture, and randomly generated seated audience (the
  conference defense still starts at the stage). Labs get benches/glassware/patrolling
  researchers + a microscope to poke; clinics get an exam bed/curtain/nurse; offices get
  desks. Med School specifics: the **corridor to UMass Memorial is real SE double doors
  that walk you straight into the hospital lobby**, the **library is upstairs** (stairs in
  the NW) with stacks, reading tables, studying students, and a librarian to talk to; the
  lecture hall is an auditorium with speaker + audience.

## Fourth pass (same day): streets + traffic, no in-game citations

- **Streets are 3 tiles wide** (all five: North Rd, South Rd, Route 9, Plantation, Lake Ave),
  with sidewalks re-flanked, 3-wide water bridges, and the spawn point moved off the asphalt.
  `gen_campus.py` regenerates it (its output path is now portable, not hardcoded to a sandbox).
- **Car traffic:** tinted cars loop in both directions on every street (right-hand lanes,
  randomized colors/speeds/offsets, Y-sorted, crossing the bridges). Ambient only — no
  collisions with the player.
- **No article citations anywhere in gameplay.** `[n]` markers are stripped at render time
  (battle console, attending hints, debrief ledger, emergency notes); citation spans removed
  from the debrief, shop (spec sources), sim lab (Sluzewski line, IFU lines), and the legacy
  EMR. The data keeps all cite fields for the dashboard/website. The ONLY in-game citation
  surface is the **conference-defense dossier** — study results + PMID shown before the
  research minigame, exactly per your rule.

## CITED (verify the source text)

- **Chest-port preop rules** — cited to the chapter you provided ([1] in the existing style):
  - Routine INR in all patients, goal **< 1.5**
  - PTT if on IV unfractionated heparin, normal 25–35 s, must be **< 1.5× control** (encoded as 52.5 s)
  - Platelet transfusion recommended **< 50 ×10⁹/L** (not routinely required)
  - Absolute contraindications: **bacteremia/sepsis, cellulitis at insertion site, catheter-material allergy**
  - Location: **IR suite** ("All tunneled catheters and ports are placed in a fluoroscopy suite")
- Complication *rates* in the rolls remain the CITED complications-table values.

## MODELED (review/tune; flagged in-data)

- Preop **risk multipliers**: INR>1.5 → bleeding ×3.0; missing INR → ×1.5; plt<50 → ×3.0
  (mirrors the engine's existing multLow); PTT>1.5× control → ×2.0.
- **UFE preop** entirely MODELED pending your citation: INR<1.5 + plt≥50 (SIR moderate-risk
  convention); contraindications pregnancy / active pelvic infection / suspected gyn malignancy.
- **lab_catalog** reference intervals (standard reference ranges).
- Lab derangement spawn ranges (e.g. INR 1.7–3.4).

## DESIGN (game balance)

- `progression`: L1 PGY-2 (0) → L2 120 → L3 300 → L4 600 → L5 1000 → L6 1600 XP; XP = score ÷ 2;
  correct turn-down +10 XP / +5 clout; wrong turn-down −10 clout; fails: bailed −5, takeover −5,
  kicked −3 clout. Chest-port `min_level` 1, UFE 2.
- `ward`: 6 beds; respawn 120–300 s; spawn mix 12% contraindicated / 40% deranged lab /
  22% missing lab / 26% clean (one problem per patient, to keep each lesson focused).
- Wrong-location penalty −5 (safety).
- `attending_dialogue` lines (5 blocked-step escalations, kicked line), strike/hint caps of 5.
- Step `blocked` lists in `case_steps` (which maneuvers are physically impossible per step).

## Ryan to-dos

1. Confirm the chest-port preop encodings match your chapter (esp. PTT 52.5 s for "<1.5× control").
2. Cite the UFE preop block (thresholds + 3 contraindications) or adjust.
3. Tune DESIGN values (XP curve, spawn mix, penalties) after playtesting.
4. Consider whether performing on a contraindicated patient should also raise infection-type
   complication *rolls* (currently: big score penalty + scripted post-op adverse outcome note).

## Where things live

- Rules/fixtures (source of truth, shared with tests): `game/tests/chestport_preop.js`,
  `ufe_preop.js`, `chestport_steps.js`, `ufe_steps.js` (now with `blocked` lists).
- Generator: `game/tools/gen_ward_sql.js` → `db/seed_ward_preop.sql`.
- Logic: `game/js/ward.js` (pure, Node-tested); engine additions in `game/js/engine.js`
  (preop mults, blocked/strikes, hints, leave, no-repeat, failed-case scoring).
- Tests: `game/tests/ward.test.js` (12), `preop.jsdom.js` (5), `battle.jsdom.js` (12, rewritten).
  Full suite: 13 files, 95 tests, all green. Advisors: unchanged (2 known WARNs).
