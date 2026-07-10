/* Regenerates db/seed_ward_preop.sql (migration ward_preop_progression) from the
   repo fixtures — the single source of truth shared with the test suite:
     game/tests/chestport_steps.js + chestport_preop.js
     game/tests/ufe_steps.js       + ufe_preop.js
   Run: node game/tools/gen_ward_sql.js > db/seed_ward_preop.sql */
"use strict";
const path = require("path");
const T = (f) => require(path.join(__dirname, "..", "tests", f));
const chest = T("chestport_steps.js"), chestPreop = T("chestport_preop.js");
const ufe = T("ufe_steps.js"), ufePreop = T("ufe_preop.js");
const q = (o) => "$steps$" + JSON.stringify(o) + "$steps$::jsonb";

const progression = {
  levels: [
    { level: 1, xp: 0, title: "PGY-2 Resident" },
    { level: 2, xp: 120, title: "PGY-4 Resident" },
    { level: 3, xp: 300, title: "IR Fellow" },
    { level: 4, xp: 600, title: "Junior Attending" },
    { level: 5, xp: 1000, title: "Attending" },
    { level: 6, xp: 1600, title: "Division Chief" },
  ],
  xp_per_score_pct: 0.5, turn_down_xp: 10, turn_down_clout: 5, wrong_turn_down_clout: -10,
  fail_clout: { bailed: -5, takeover: -5, kicked: -3 },
};
const labCatalog = { labs: [
  { id: "inr", name: "INR", unit: "", normal: [0.9, 1.2], fixNote: "Anticoagulation held / plasma given — INR rechecked." },
  { id: "pt", name: "PT", unit: "s", normal: [11, 13.5], fixNote: "PT rechecked." },
  { id: "ptt", name: "PTT", unit: "s", normal: [25, 35], fixNote: "Heparin held per protocol — PTT rechecked." },
  { id: "platelets", name: "Platelet count (CBC)", unit: "×10⁹/L", normal: [150, 400], fixNote: "Platelets transfused — post-transfusion count rechecked." },
  { id: "hemoglobin", name: "Hemoglobin (CBC)", unit: "g/dL", normal: [12, 16], fixNote: "CBC rechecked." },
  { id: "creatinine", name: "Creatinine (BMP)", unit: "mg/dL", normal: [0.6, 1.3], fixNote: "BMP rechecked after gentle hydration." },
  { id: "fibrinogen", name: "Fibrinogen", unit: "mg/dL", normal: [200, 400], fixNote: "Cryoprecipitate given if low — fibrinogen rechecked." },
  { id: "abg", name: "ABG", unit: "", normal: null, note: "pH 7.35–7.45 · pO₂ 80–100 · pCO₂ 35–45", fixNote: "ABG resulted." },
  { id: "type_screen", name: "Type & Screen", unit: "", normal: null, fixNote: "Type & screen on file — blood available." },
] };
const ward = { beds: 6, respawn_min_s: 120, respawn_max_s: 300, p_contra: 0.12, p_deranged: 0.4, p_missing: 0.22 };
const attending = {
  blocked: [
    "Excuse me lad, but aren't you missing a step?",
    "Think it through — what has to happen before that is even possible?",
    "You physically cannot do that yet. What comes first?",
    "Stop. Look at the field. Tell me what is missing.",
    "You clearly need to read a book. I am taking over this case.",
  ],
  hints: [
    "The attending pokes their head in and points at the field.",
    "The attending sighs and walks you through it.",
    "The attending taps the monitor meaningfully.",
    "The attending narrates the step like you're a med student.",
    "The attending does everything but grab your hands.",
  ],
  kicked: "That's five hints. Scrub out, go read the chapter, and come back when you can talk me through the steps.",
  strike_cap: 5, hint_cap: 5,
};

process.stdout.write(`-- Ward NPCs + preop optimization + progression + procedure locations.
-- Repo copy of migration ward_preop_progression (applied 2026-07-10, data_version 78).
-- Regenerate: node game/tools/gen_ward_sql.js > db/seed_ward_preop.sql

-- 1. procedure_game_params: level gate, standard-of-care location, preop rules
alter table public.procedure_game_params
  add column if not exists min_level int not null default 1,
  add column if not exists location text not null default 'ir_suite',
  add column if not exists preop jsonb not null default '{}';
do $$ begin
  alter table public.procedure_game_params
    add constraint procedure_game_params_location_check
    check (location in ('ir_suite','ct_suite','us_room','bedside'));
exception when duplicate_object then null; end $$;

-- 2. v_game_ready surfaces the gate + location to the client
create or replace view public.v_game_ready
with (security_invoker = true) as
select p.id, p.title, p.category_id, g.pacing, g.complexity, g.min_level, g.location
from public.procedures p
join public.procedure_game_params g on g.procedure_id = p.id
join public.vessel_maps vm          on vm.id = g.vessel_map_id
where p.status = 'published'
  and exists (select 1 from public.patient_generators pg
              where pg.procedure_id = p.id and pg.status = 'published')
  and exists (select 1 from public.complications c
              where (c.procedure_id = p.id or c.procedure_id is null)
                and c.status = 'published');

-- 3. Chest port: fluoroscopy suite [1]; preop CITED to [1]; min_level DESIGN.
update public.procedure_game_params set
  min_level = 1, location = 'ir_suite',
  preop = ${q(chestPreop)},
  case_steps = ${q(chest)}
where procedure_id = 'chest-port';

-- UFE: IR suite. Preop rules MODELED pending citation. min_level 2 DESIGN.
update public.procedure_game_params set
  min_level = 2, location = 'ir_suite',
  preop = ${q(ufePreop)},
  case_steps = ${q(ufe)}
where procedure_id = 'uterine-fibroid-embolization';

-- 4. game_config
insert into public.game_config (key, value, data_class, citation, description) values
 ('progression', ${q(progression)}, 'design', '',
  'XP/level ladder gating which procedures spawn in ward beds. All DESIGN.'),
 ('lab_catalog', ${q(labCatalog)}, 'modeled', '',
  'Orderable preop labs + reference intervals (standard reference ranges; MODELED).'),
 ('ward', ${q(ward)}, 'design', '',
  'Ward bed count, respawn window (compressed 2-5 min; spec 15-30 min), spawn mix.'),
 ('attending_dialogue', ${q(attending)}, 'design', '',
  'Attending escalation lines for blocked steps, hints, and the 5-strike takeover.')
on conflict (key) do update
  set value = excluded.value, data_class = excluded.data_class, description = excluded.description;
`);
