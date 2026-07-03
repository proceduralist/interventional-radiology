-- P1 accuracy fixes: replace MODELED placeholders with CITED data.
-- Applied to live project 2026-07-03 as two migrations (data_version -> 57):
--   p1fix_cited_port_generator_ahn2012   (patient generator demographics)
--   p1fix_cited_fluoro_dap_jonczyk2018   (radiation reference, DAP-based)
-- Sources uploaded/verified by Ryan; both open-access.
--
-- Accuracy contract labeling:
--   CITED   : generator age/sex/cancer-type mix (Ahn 2012 Table 1);
--             radiation reference DAP 0.56 Gy.cm2 (Jonczyk 2018, right-IJV subgroup).
--   MODELED : lab/comorbidity distributions (not reported by Ahn 2012);
--             fluoro-minute accumulator + fluoro->DAP conversion (game_config.radiation_model).
--   Guardrail thresholds remain CITED to SIR 2019 / Cigarroa 1989 / ACR (site standards).

-- ========== 1. Patient generator: demographics CITED to Ahn 2012 ==========
-- Ahn SJ et al. Ultrasound and Fluoroscopy-Guided Placement of Central Venous
-- Ports via Internal Jugular Vein: Retrospective Analysis of 1254 Port
-- Implantations at a Single Center. Korean J Radiol 2012;13(3):314-323.
-- PMID 22563269. 1254 IJ ports / 1237 oncology patients.
--   Table 1: age 57 +/- 12 (18-84); male 693 (56%), female 544 (44%);
--   underlying disease mix (colorectal 58.9%, stomach 18.8%, breast 7.5%, ...).
--   Exclusion: platelets <50/nL, PTT <50%, INR >1.5, active infection, IJV/SVC thrombosis.
-- The paper reports NO fluoroscopy time / dose, so it does NOT supply the DRL.
--
-- (papers row + patient_generators UPDATE — see migration
--  p1fix_cited_port_generator_ahn2012 for the full statement; generator now
--  carries source_paper_id, cited age/sex_female/cancer_type variables, and
--  lab variables tagged MODELED with "NOT reported in Ahn 2012" basis notes.)

-- ========== 2. Radiation reference: DAP CITED to Jonczyk 2018 ==========
-- Jonczyk M et al. Totally Implantable Central Venous Port Catheters: Radiation
-- Exposure as a Function of Puncture Site and Operator Experience. In Vivo
-- 2018;32(1):179-184. PMID 29275317. 1,870 port implantations.
--   Right-jugular access DAP = 56.15 uGy.m2 = 0.56 Gy.cm2 (matches our right-IJ map).
--   (1 uGy.m2 = 0.01 Gy.cm2; value is a group mean, not a formal 75th-percentile DRL.)
-- Greffier 2018 (0.35 Gy.cm2) could NOT be verified against a primary source and was not used.
--
-- Schema + config changes (see migration p1fix_cited_fluoro_dap_jonczyk2018):
alter table procedure_game_params
  add column if not exists reference_dap_gycm2 numeric,
  add column if not exists dap_citation text;
-- procedure_game_params(chest-port): reference_dap_gycm2 = 0.56, dap_citation = Jonczyk 2018.
-- game_config.radiation_model (MODELED): { scored_metric: dose_area_product_gycm2,
--   dap_per_fluoro_min: 0.42 } — calibrated so a clean ~1.2 fluoro-min case lands
--   ~0.50 Gy.cm2 (just under the 0.56 reference); extra imaging pushes over it.
-- Engine (game/js/engine.js) now scores Radiation on DAP vs reference_dap_gycm2,
-- falling back to fluoro_target_min when no DAP reference is present (back-compat).
