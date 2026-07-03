-- P3: conference defense content (applied 2026-07-03 via MCP migration p3_defense_seed,
-- data_version 62). Accuracy contract: every correct answer is the literal papers-row value.
-- Rewards/penalties are DESIGN (game balance).

insert into public.procedure_papers (procedure_id, paper_id, role)
values ('chest-port', '1ee9acb2-6679-41b8-b1cc-8140c78be258', 'defense')
on conflict do nothing;

insert into public.game_config (key, value, data_class, citation, description) values
('defense_rewards',
 '{"base_clout": 40, "credibility_bonus_max": 20, "repeat_mult": 0.25, "eject_clout_penalty": 10, "min_cases_to_present": 1, "questions_min": 3, "questions_max": 5, "matching_grant_cap": 5000}',
 'design', '',
 'Conference defense economy: clout awarded = (base + credibility bonus) * repeat_mult^(prior defenses of same paper); ejection costs clout; KOL matching grant cap (spec §11).')
on conflict (key) do update set value = excluded.value, description = excluded.description;

-- Generic templates (paper_id NULL): answer resolved from the papers row by answer_path.
insert into public.defense_question_templates (archetype_id, paper_id, template, answer_path, distractors, status) values
('biostatistician', null, 'Slide 2 says a lot of things. Let''s start simple: how many patients did you actually enroll?', 'n_enrolled', '{"strategy":"num_perturb"}', 'published'),
('biostatistician', null, 'Describe your study design — precisely, please. The word "landmark" is not a design.', 'study_design', '{"options":["Randomized controlled trial","Prospective multicenter registry","Matched case-control study"]}', 'published'),
('admin', null, 'I sign the purchase orders. How many implantations does your center''s series actually report?', 'baselines.n_ports', '{"strategy":"num_perturb"}', 'published'),
('admin', null, 'Which journal accepted this? I ask because our subscription budget is also my problem.', 'journal', '{"options":["JVIR","CardioVascular and Interventional Radiology","Radiology"]}', 'published'),
('med-student', null, 'Um, sorry — when was this published? I wasn''t… born-ish… then.', 'pub_year', '{"strategy":"year_perturb"}', 'published'),
('rival', null, 'MY series reported sex distribution to the decimal. What fraction of YOUR cohort was female?', 'baselines.female_pct', '{"strategy":"pct_perturb"}', 'published');

-- Ahn 2012-specific (hand-authored; literal Table 1 / Methods values).
insert into public.defense_question_templates (archetype_id, paper_id, template, answer_path, distractors, status) values
('rival', '1ee9acb2-6679-41b8-b1cc-8140c78be258', 'Your Table 1 — which malignancy dominated the cohort, and by how much?', 'literal:Colorectal cancer (58.9%)', '{"options":["Stomach cancer (18.8%)","Breast cancer (7.5%)","Hematologic malignancy (4.3%)"]}', 'published'),
('surgeon', '1ee9acb2-6679-41b8-b1cc-8140c78be258', 'In my day we did cutdowns and liked it. What access did your group use?', 'literal:US + fluoroscopy-guided internal jugular puncture (95.5% right IJV)', '{"options":["Landmark subclavian puncture","Cephalic vein cutdown","Tunneled femoral access"]}', 'published'),
('fellow', '1ee9acb2-6679-41b8-b1cc-8140c78be258', 'Okay okay okay — labs come back BAD pre-port. What coagulation cutoffs excluded patients in your series?', 'literal:Platelets < 50/nL, PTT < 50%, or INR > 1.5', '{"options":["Platelets < 100/nL or INR > 1.2","Platelets < 20/nL or INR > 2.0","Any antiplatelet agent within 7 days"]}', 'published'),
('med-student', '1ee9acb2-6679-41b8-b1cc-8140c78be258', 'Which vein did the ports go in? Asking for… my notes.', 'literal:Internal jugular vein', '{"options":["Subclavian vein","Cephalic vein","Femoral vein"]}', 'published'),
('consultant', '1ee9acb2-6679-41b8-b1cc-8140c78be258', 'Our imaging platform white-paper cites you. Which guidance combination did you actually use?', 'literal:Ultrasound plus fluoroscopy', '{"options":["Fluoroscopy alone","CT guidance","Landmark technique, no imaging"]}', 'published'),
('rival', '1ee9acb2-6679-41b8-b1cc-8140c78be258', 'And your radiation dose table is… where, exactly?', 'literal:The paper does not report fluoroscopy time or dose', '{"options":["Mean DAP 0.56 Gy·cm² — Table 3","Mean fluoro time 1.2 min — Table 2","Dose was below reportable thresholds"]}', 'published');
