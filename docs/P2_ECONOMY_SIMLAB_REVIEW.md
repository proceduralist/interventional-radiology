# P2 Review Sheet — Economy, Procurement, Sim Lab (2026-07-03)

For Ryan's accuracy/design sign-off. Everything below is live in the DB (data_version 51) and playable in `/game`. Nothing clinically presented as real was invented; items needing your eyes are marked ⚠.

## What P2 adds

Buy → test → use loop (spec §12, P2): procurement shop and sim lab rooms in the hospital hub. Buying a device signs a "supply contract" (buy-once, stays stocked — DESIGN abstraction, no per-case consumption). The angio engine now gates step choices on stocked devices, and the EMR blocks scrub-in if the procedure's required kit is incomplete.

## DESIGN decisions I made (change freely via /admin → game_config.economy)

- Ownership model: buy-once supply contract, not consumables. Rationale: base payout (1200) is below the summed kit price (6350), so consumable restocking would bankrupt the player; also avoids per-case shop micromanagement.
- Starter inventory = the 7-item tier-1 chest-port kit, so the case is playable from minute one.
- Required kit for chest-port = the same 7 items (elective port equipment list).
- New device prices: C2 600 · Glidewire-type 2400 · Glidecath-type 2800 · Progreat-type 5500 (≈2–5 good cases each).

## ⚠ New devices — dimensions PENDING your IFU citations

4 rows added (`c2-cobra-5f`, `glidewire-035-150`, `glidecath-4f-65`, `progreat-24-110`) to seed the spec §8 tier ladder. Dimensions are class-typical nominal values, explicitly labeled "PENDING manufacturer IFU — treat as MODELED until cited" in `spec_source`, and the Spec Bench displays that line verbatim. Attach real IFU sources via /admin (or edit/delete any row). The 1–10 scales all carry `modeled_basis` notes per the contract.

## ⚠ Embolic Playground citation to verify

Packing-density formula (volumetric: Σ coil cylinder volume / aneurysm volume) is CITED to: Sluzewski M, van Rooij WJ, Slob MJ, et al. Radiology. 2004;231(3):653-658. The UI shows the "≥ ~24% associated with absence of compaction" note with an explicit VERIFY flag — from memory, not source-checked. Please confirm citation + threshold (game_config.packing_density) or I'll pull the paper metadata via the dashboard prefill.

Particle-size demo is qualitative only (smaller → more distal penetration; no rates), tagged MODELED; attach a reference if you want it CITED.

## Flow Bench (MODELED, transfers to engine)

Readouts use the identical vessel-stress formula and constants as the case engine (unit-tested equal). 4 synthetic profiles in `game_config.flow_bench_profiles` (tortuosity 1–5, fragility = stress threshold, same scales as the vessel map). Rename/retune at will.

## Engine addition

If you own the hydrophilic wire, step 2 offers "US-guided micropuncture, exchange to 0.035 hydrophilic wire" — same CITED pneumothorax roll (access technique, not wire, drives PTX risk), zero scoring difference, labeled MODELED. Purely demonstrates purchased-device use in a case.

## Verification done

12 Node unit tests + 7 jsdom E2E tests (in `game/tests/`), all passing: shop math, kit gating, bench-vs-engine formula identity, packing-density math checked against closed-form values, full click-through buy → bench → case → 100-point debrief with payout. Supabase advisors: no new findings (2 known WARNs remain: intentional `is_admin` definer; leaked-password protection is a console toggle for you).

## Still open from P1 (unchanged)

- Replace MODELED patient-generator distributions with a cited cohort Table 1.
- Enter a cited fluoro DRL (target is a 3.0-min MODELED placeholder).
- Browser playtest of `/game` (now including the two new rooms).
