# Ward NPCs + Preop + Progression — accuracy review sheet

Built 2026-07-10 (migration `ward_preop_progression`, data_version 78). This sheet lists every
value by data class so you can review it the way you review procedure data.

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
