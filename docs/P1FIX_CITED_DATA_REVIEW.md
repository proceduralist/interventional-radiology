# P1 Accuracy-Fix Review — Cited Generator + Fluoro/DAP (2026-07-03)

Two MODELED placeholders from P1 are now grounded in cited literature you uploaded/approved. Live in the DB (data_version 57) and in `/game`. Both sources are open-access; every value below is labeled honestly under the accuracy contract.

## 1. Patient generator — demographics now CITED (Ahn 2012)

Source: Ahn SJ, Kim HC, Chung JW, et al. *Ultrasound and Fluoroscopy-Guided Placement of Central Venous Ports via Internal Jugular Vein: Retrospective Analysis of 1254 Port Implantations at a Single Center.* Korean J Radiol 2012;13(3):314-323. PMID 22563269 (the PDF you sent). 1254 IJ ports / 1237 adult oncology patients.

Now CITED to this paper's Table 1 (source_paper_id attached to the generator):

- Age: mean 57 ± 12, range 18–84.
- Sex: 44% female (was a MODELED 55% female skew).
- Cancer type: sampled from the real underlying-disease mix (colorectal 58.9%, stomach 18.8%, breast 7.5%, hematologic 4.3%, …). This drives the EMR indication line, so patients now read as a realistic Korean IJ-port oncology cohort. (New `categorical` variable kind added to the sampler; unit-tested to converge on Table 1 within ~2%.)

⚠ Still MODELED (this paper does **not** report them — I did not fake a citation): weight, creatinine/eGFR, platelets, INR, hemoglobin, comorbidity prevalences, anticoagulant use. Each variable's `basis` now says "NOT reported in Ahn 2012 … MODELED." They're retained mainly to exercise the guardrail teaching (the cohort itself excluded platelets <50 and INR >1.5, so a strict cohort-faithful sampler would never trip the SIR thresholds). If you want these lab distributions cited too, they need a second source with a fuller Table 1 — tell me and I'll find/enter one.

Guardrail thresholds are unchanged and still CITED to SIR 2019 / Cigarroa 1989 / ACR. Ahn's exclusion criteria corroborate them.

## 2. Fluoro reference — now a CITED DAP, scored (Jonczyk 2018)

You chose the DAP approach. The Ahn paper reports no fluoro time or dose, and I could **not** verify the Greffier 2018 0.35 Gy·cm² figure against a primary source, so I did not use it. Instead I used a source I verified directly:

Source: Jonczyk M, Gebauer B, Rotzinger R, et al. *Totally Implantable Central Venous Port Catheters: Radiation Exposure as a Function of Puncture Site and Operator Experience.* In Vivo 2018;32(1):179-184. PMID 29275317. 1,870 port implantations, reporting both fluoroscopy time and DAP by access site.

- Reference DAP = **0.56 Gy·cm²** (right-jugular access, 56.15 µGy·m² × 0.01) — chosen because it matches our right-IJ vessel map. ⚠ This is a group **mean**, not a formal 75th-percentile DRL; labeled as such in `dap_citation`.
- Radiation is now scored on DAP vs this reference (was: MODELED 3.0-min fluoro placeholder). The debrief/telemetry lead with "DAP x.xx / 0.56 Gy·cm² ref (CITED)."
- The fluoro-minute accumulator stays as MODELED flavor. The fluoro→DAP conversion `dap_per_fluoro_min = 0.42` (game_config.radiation_model, MODELED) is calibrated so a clean textbook case (~1.2 sim-min) lands ~0.50 Gy·cm² — just under the reference (full radiation points) — while extra imaging/repositioning pushes over it and costs points.

If you'd rather cite a formal DRL (e.g., a verified Greffier value or your institutional 75th-percentile), give me the number and I'll swap `reference_dap_gycm2` + `dap_citation`.

## Verification

19 automated tests pass (4 cited-generator, 3 DAP-scoring, 12 P2 economy/sim-lab) plus the 7 jsdom E2E — no regressions. Supabase advisors unchanged (2 known WARNs: intentional `is_admin`; leaked-password toggle).

## Open

- Browser playtest of `/game` — blocked: the Claude-in-Chrome extension isn't connected right now (see chat).
- Optional: cite the lab distributions (needs a fuller Table 1 source); confirm/replace the Jonczyk mean with a formal DRL if you prefer.
