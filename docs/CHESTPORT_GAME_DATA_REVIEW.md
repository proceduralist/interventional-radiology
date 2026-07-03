# Chest-port game data — accuracy review sheet

Everything entered on 2026-07-03 to make `chest-port` satisfy `v_game_ready`, sorted
by data class per the accuracy contract (MASTER_SPEC §1). **Review the "Needs you"
items in `/admin` — those are placeholders I could not source without fabricating.**

## CITED (verify the sourcing is acceptable; nothing invented)
| Value | Where | Source used |
|---|---|---|
| Micropuncture set: 21G needle, 0.018″ wire, 4–5F dilator | `devices` | Procedure equipment list [1] |
| 0.035″ Bentson working wire, 145 cm | `devices` | Procedure equipment list [1]; category-standard |
| 8F silicone port catheter (kit range 6–9.5F) | `devices` | Procedure equipment list [1] |
| 9F peel-away sheath; 20G non-coring Huber | `devices` | Procedure equipment list [1] |
| SIR periprocedural thresholds (plt ≥20 low-risk / ≥50 pocket; INR ≤2.0–3.0; AC hold) | generator guardrails | Procedure preop [1] (SIR 2019) |
| Cigarroa V_max = 5·kg/SCr; ACR eGFR risk tiers | guardrails + engine | `game_config` (Cigarroa 1989; ACR Manual) |
| CKD-EPI 2021 race-free eGFR | engine `patient.js` | Inker NEJM 2021 (verified by hand-calc: 60F/SCr0.9 → 73.2) |
| Complication rates (pneumothorax <1%, pocket hematoma 1–2%, etc.) | `complications` | Your P0 entries, unchanged |

**Manufacturer IFU URLs still missing** on every device (`spec_source` cites the
equipment list, not an IFU). Add IFU links in `/admin` for anything you want
presented as a specific product spec. Devices use generic names to avoid unsourced
manufacturer claims.

## MODELED (simulation parameters — labeled everywhere; tune freely)
| Value | Where | Basis note attached |
|---|---|---|
| Vessel tortuosity/fragility 1–10 (CAJ fragility 5) | `vessel_maps.graph` | Perforation→tamponade risk if advanced too deep |
| Node diameters (IJ 13, BCT 16, SVC 20, CAJ 21 mm) | `vessel_maps.graph` | Approximate adult anatomy, not patient-specific |
| Device 1–10 stiffness/lubricity/etc. | `devices.*` + `modeled_basis` | Per-device basis notes |
| Vessel-stress formula + push forces + crit factor 0.6, perforation 40% | `engine.js` M{} | Spec §7 MODELED; belongs in `game_config` later |
| Fluoro dose rate 12 mGy/min; DSA/tap minute costs | `engine.js` M{} | Modeled telemetry |
| **Patient generator distributions (all 11 variables)** | `patient_generators` | **Oncology-default placeholders — NOT a real Table 1** |

## DESIGN (game economy)
| Value | Where |
|---|---|
| Device prices 300–3200 funds | `devices.price_funds` |
| base_payout 1200, complexity 2 | `procedure_game_params` |
| Scoring weights 40/20/20/20, clout tiers | `game_config` (from P0) |

## ⚠ Needs you (I would not fabricate these)
1. **Patient generator → real cohort.** Replace the MODELED distributions with a
   cited port/oncology cohort's Table 1 and attach `source_paper_id`. Until then the
   generator is honestly labeled `oncology-default (MODELED — pending real cohort Table 1)`.
2. **Fluoro reference level.** `fluoro_target_min = 3.0` is a MODELED placeholder;
   `fluoro_citation` says so. Enter a cited DRL for tunneled central venous access so
   the Radiation score (20 pts) grades against real evidence.
3. **Optional:** enable Auth "leaked password protection" now that accounts are live
   (Dashboard → Authentication → Password security) — flagged by the security advisor.

All of the above is editable in `/admin`; publishing bumps `data_version` and the
game picks it up on next load.
