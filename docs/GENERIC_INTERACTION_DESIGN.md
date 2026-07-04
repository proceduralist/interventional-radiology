# Generic supply-driven angio interaction — design

**Draft 2026-07-03.** Redesign of the Angio Suite core loop (Ryan's direction). Replaces the current per-step *labeled* choice tree (which telegraphs the right answer) with **generic verbs + a supply cart the player must sift**. This is also what makes procedures *data-driven*: with a generic engine, a new procedure is pure data entry (spec §12 P4).

## Screen layout — Pokémon-battle framing (Ryan's direction)

Entering a procedure swaps to a **battle-style screen** (like a Pokémon encounter):

- **The "opponent"** (upper area) is the **patient on the operating table under a C-arm**, rendered in 3/4 pixel art in the angio suite. Their **vitals + a "stability" bar** sit in an enemy-HP-style status box (SBP/HR/SpO₂; stability = the compensatory-shock reserve from the telemetry engine). Complications visibly hit this bar.
- **The player's side** (lower-left) is the operator + a **case box** (current step objective, fluoro-min, contrast-mL).
- **The command menu** (lower-right) is the Pokémon bottom menu: **Actions · Bag · Imaging · Notes** (≈ Fight/Bag/Pokémon/Run). See the two chat mockups.

## The loop

Each step the player sees the same generic actions, not procedure-specific labeled options:

- **Use item** — apply the currently-selected instrument.
- **Choose different item** — open the supply cart (their carried inventory) and click an instrument to select it.
- **Ultrasound** / **Use fluoroscopy** — imaging modality (adds dose; some steps require the correct one).
- **Inject contrast** — adds to the renal/contrast budget.
- (extensible: **Aspirate/flush**, **Anesthetize**, **Deploy/embolize**, **Advance/manipulate**, **Give med** — all generic verbs.)

The skill is **knowing which instrument (and imaging) is correct for this step** and picking it out of a full cart of plausible distractors — not reading it off a button. Right tool (+ right imaging) → step correct, advance. Wrong tool → rejected with feedback, retry.

## Per-step data schema (the only thing a new procedure author fills in)

Each entry in `procedure_game_params.case_steps` grows a small, declarative spec:

```
{
  "n": 2,
  "title": "Ultrasound-guided venous access",
  "prompt": "Gain venous access to the right internal jugular vein.",
  "node": "rij_access",
  "correct_action": "us-micropuncture",          // maneuver id from the action taxonomy (the "moves")
  "correct_item": "micropuncture-needle-21g",    // device id … (optional; some actions imply their tool)
  "correct_class": "needle",                     // …or accept any device of this class
  "imaging": "us",                               // us | fluoro | dsa | null
  "consumes": ["micropuncture-needle-21g","mp-wire-018","bentson-035-145"], // marked used
  "wrong_item_msg": "That won't get you access here.",
  "teaching": "Real-time US lowers carotid-puncture/pneumothorax risk.",
  "on_wrong_item": "retry",                      // retry | penalize | complication
  "complication": { "name": "Pneumothorax", "when": "no_us", "mult": 1.0 }
}
```

- **Correctness** = `selected ∈ (correct_item OR correct_class)` **and** (`imaging` matches when required).
- **Consequences** reuse the existing engine: `complication.name` looks up the procedure's already-**CITED** complication row and fires the current vessel-stress / vitals-decay / emergency machinery. No clinical rates are invented — they come from the DB.
- **Scoring** is unchanged (safety / radiation / renal / technical); wrong-imaging and wrong-tool feed the technical + radiation ledgers exactly as the hardcoded version does today.

## Action taxonomy — the "moves" (expansive, nested)

`Actions` opens a categorized, scrollable list of IR maneuvers (not two obvious buttons). Lives in `game_config.action_taxonomy` (DESIGN/MODELED, extensible; Ryan curates). Each step's `correct_action` points into it. Proposed v1 (≈60 moves, nest as needed):

1. **Access & sheath** — US-guided micropuncture · landmark puncture · upsize to 0.035 · place sheath · upsize sheath · long/guide sheath · manual closure · closure device
2. **Wire** — advance · exchange over catheter · shape/curve tip · steer/torque · pullback · park buddy wire
3. **Catheter / micro** — advance catheter · select vessel · reform reverse-curve (Simmons/SOS) · exchange · advance microcatheter (coaxial) · superselect · aspirate · flush/double-flush
4. **Imaging** — fluoro spot · DSA run · roadmap · change projection · collimate · magnify · ultrasound · cone-beam CT
5. **Contrast** — hand/test injection · power injection (rate/vol) · CO₂
6. **Embolization** — pushable coil · detachable coil · particles/spheres · n-BCA glue · EVOH/Onyx · vascular plug · gelfoam
7. **Angioplasty / stent** — inflate balloon (atm/time) · high-pressure/prolonged · self-expanding stent · balloon-expandable stent · post-dilate · covered stent
8. **Recanalize / retrieve** — cross lesion · thrombolysis infusion · aspiration thrombectomy · snare · deploy IVC filter · retrieve filter
9. **Percutaneous** (non-vascular) — advance needle to target · core biopsy · FNA · place drain · form locking pigtail · aspirate collection
10. **Medications & support** — heparin (+ACT) · nitroglycerin (antispasm) · sedation · reversal · vasopressor · fluids · antibiotics
11. **Procedure control** — time-out · reposition table/patient · call attending · convert/abort · completion angiogram · close & dress

Correctness per step = chosen `action == correct_action` **and** (item/imaging match where required). Wrong maneuver → feedback + optional complication (e.g., choosing *landmark puncture* skips US → the CITED pneumothorax roll fires).

## Overworld Bag (view the cart anywhere)

The same supply-cart overlay is bound to a **Bag button + the `B` key** in the overworld/hospital scenes (read-only inventory browse while walking — quantities, spec bench link). `IRUI.Bag.show(save.inventory)`; wire `keydown 'B'` in `scenes.js` overworld/hospital `update()`; add a HUD Bag button next to the campus-map [M] button. In a procedure the same cart is the battle **Bag** command.

## Engine changes (`game/js/engine.js`)

Delete the hardcoded `STEP` map. The engine becomes a small interpreter:

1. `eng.currentStep()` returns `{title, prompt, node, actions:[…generic…], selected}` from `case_steps[i]` — no procedure-specific code.
2. `eng.selectItem(id)` sets the active instrument (must be in the player's inventory).
3. `eng.setImaging('us'|'fluoro'|'dsa')` toggles modality, accrues dose.
4. `eng.useItem()` validates against the step spec → success (advance, consume devices) or failure (feedback, optional complication/penalty).
5. Telemetry, `vesselStress`, complications, emergencies, and `finish()` scoring are **kept as-is**.

A tiny reusable **action vocabulary** (access / wire / select / advance / image / inject / deploy-embolize / close / give-med) lets steps name effects in data without moving clinical logic into the DB.

## UI changes (`game/js/ui.js` Angio overlay)

The supply cart is styled as an **Old-School-RuneScape bank tab** (Ryan's reference image): a dense **8-column grid** of instrument slots, each a small sprite with a **stack-count** in the top-left (yellow, black-shadowed), **category tabs** across the top (All / Access / Wires / Caths / Devices / Embolics), and a scrollbar for overflow. Click a slot to select; the selected slot gets a gold inset border. (See the chat mockup.)

- **Generic action bar** of verbs: Use item · Choose different item · Ultrasound · Use fluoroscopy · Inject contrast (extensible: aspirate/flush, deploy/embolize, give med).
- Cart draws from `save.inventory` (P2 economy) — only carried instruments appear; consumables show real stock counts, durables show none.
- Keep the telemetry strip, emergency panel, and debrief ledger.

### Sprite-sheet requirements (per-tool icons)

- **One 32×32 px icon sprite per device**, transparent background, flat 3/4 pixel-art style matching the world tiles (16-bit palette). Rendered in a 40×40 slot with 4px padding.
- Delivered as a **single sprite sheet, 8 icons per row**, indexed by `device.id` via a small atlas `assets/tools.json` (`{ "device-id": [col,row] }`). A new device needs one 32×32 cell + one atlas line — no code change.
- Stack-count uses the world pixel font, `#ffec5c` with a 1px black shadow, top-left of the slot.
- Optional 2× (64px) variants for the Spec Bench detail view; same atlas.
- **Until real sprites exist**, the engine falls back to one simple vector glyph per `device_class` (as in the mockup), so the cart is functional now and CC0/commissioned sprites drop in later per the asset-approval flow (spec §13.3).

### Battle-scene assets (procedure screen)

- **Angio-suite background** — one ~640×240 (2×) room plate: dark suite, boom monitors, floor. Static.
- **Patient-on-table** — a draped supine patient sprite on an OR table, ~180×90 at 2×, 3/4 view; 2–3 frames (breathing idle; a "decompensating" frame for complications).
- **C-arm** — ~120×150, its own layer arching over the table (so projection changes can rotate/swap frames later); detector + tube ends.
- **Operator** — back-view figure in a lead apron at the tableside, ~56×56, 2 frames (idle / acting).
- All transparent PNG, same 16-bit palette as the world tiles. Placeholder vector versions ship first (see the battle mockup); real art follows the asset-approval flow. `Y`-sort not needed here (fixed composition).

## What this unlocks

- Any **endovascular** procedure becomes **data entry**: author a vessel map + generator + `case_steps` with `correct_item`/`imaging` and it plays. The 72-device catalog becomes the distractor pool.
- **Non-vascular** procedures (biopsy, drainage, MSK, most GU/hepatobiliary) still need a non-navigation model — proposed as a later, separate "percutaneous" step type (target-a-lesion under US/CT) rather than a vessel graph. Flagged, not built here.

## Decisions (confirmed with Ryan, 2026-07-03)

1. **A set of acceptable actions per step, each scored differently** — e.g. `us-micropuncture` (best) and `landmark` (works, but −technical and ×5 pneumothorax) both *proceed*. Each step declares a `best` action plus an `outcomes` map of accepted actions → consequences; anything else falls to a `default` (off-protocol) outcome.
2. **Wrong/suboptimal proceeds and takes the hit** — no block-and-retry. The case advances and the score/complication consequences apply (more realistic).
3. **Taxonomy** = the ~60-move list in this doc, for now (editable in `game_config`).
4. **Imaging modalities include ultrasound** (ultrasound · fluoro · DSA · roadmap · CBCT), not just fluoro.
5. Chest-port is migrated to this `outcomes` schema first as the reference case (tests updated); then we template an endovascular procedure (UFE).

## Build order

1. Extend `case_steps` schema + migrate chest-port (DB) — reviewable SQL.
2. Refactor `engine.js` to the interpreter + action vocabulary; rewrite engine unit tests.
3. Rebuild the Angio overlay (action bar + supply cart); rewrite the jsdom E2E.
4. Verify full suite green; then author one endovascular procedure end-to-end to prove data-only expansion.
