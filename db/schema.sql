-- ============================================================================
-- IR Casebook Platform & Academic IR RPG — Supabase schema v1.0 (2026-07-02)
-- Paste into the Supabase SQL editor and run. Idempotent-ish: run on a fresh
-- project. See docs/MASTER_SPEC.md §4 for design rationale.
--
-- Data-class convention (accuracy contract):
--   CITED   = literature/IFU/guideline value; citation required.
--   MODELED = gameplay abstraction; basis note required, labeled in UI.
--   DESIGN  = game balance/economy; never presented as clinical fact.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Profiles (auto-created on signup)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Resident',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Admin check used by RLS policies. SECURITY DEFINER avoids RLS recursion.
-- Must be created AFTER profiles: sql-language bodies are validated at
-- definition time.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.user_id = auth.uid()),
    false
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Resident'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Data version (website -> game sync)
-- ---------------------------------------------------------------------------
create table public.data_version (
  id         int primary key default 1 check (id = 1),
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.data_version (id) values (1);

create or replace function public.bump_data_version()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.data_version set version = version + 1, updated_at = now() where id = 1;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Content tables (public read / admin write)
-- ---------------------------------------------------------------------------

create table public.categories (
  id         text primary key,                -- e.g. 'access'
  name       text not null,
  blurb      text not null default '',
  sort_order int  not null default 100
);

-- Reference content: mirrors the existing procedures.json shape (jsonb keeps
-- the dashboard forms and casebook renderer simple; game entities are
-- normalized separately below).
create table public.procedures (
  id            text primary key,             -- e.g. 'chest-port'
  category_id   text not null references public.categories(id),
  title         text not null,
  aliases       text[] not null default '{}',
  modalities    text[] not null default '{}',
  time_estimate text,
  high_yield    boolean not null default false,
  tags          text[] not null default '{}',
  overview      text not null default '',
  bleeding_risk text check (bleeding_risk in ('high','low')),
  preop         jsonb not null default '{}',  -- indications/contraindications/labs/meds/equipment
  steps         jsonb not null default '[]',
  postop        jsonb not null default '[]',
  pearls        jsonb not null default '[]',
  status        text not null default 'published' check (status in ('draft','published')),
  updated_at    timestamptz not null default now()
);

-- Numbered references per procedure (renders as superscript links, as today).
create table public.citations (
  id           uuid primary key default gen_random_uuid(),
  procedure_id text not null references public.procedures(id) on delete cascade,
  ref_number   int  not null,                 -- the [n] marker
  text         text not null,
  pmid         text,
  doi          text,
  url          text,
  unique (procedure_id, ref_number)
);

-- Structured trials entered by Ryan (conference defense + patient generators).
create table public.papers (
  id             uuid primary key default gen_random_uuid(),
  pmid           text unique,
  doi            text,
  title          text not null,
  authors        text not null default '',
  journal        text not null default '',
  pub_year       int,
  abstract       text not null default '',
  study_design   text not null default '',    -- RCT, prospective cohort, registry...
  n_enrolled     int,
  arms           jsonb not null default '[]', -- [{name, n}]
  inclusion      jsonb not null default '[]',
  exclusion      jsonb not null default '[]',
  endpoints      jsonb not null default '[]', -- [{name, primary, arm_values, effect, ci_low, ci_high, p_value}]
  adverse_events jsonb not null default '[]', -- [{name, arm, n, pct, sir_grade}]
  baselines      jsonb not null default '[]', -- Table 1: [{variable, arm, kind:'continuous'|'proportion', mean, sd, median, iqr, n, pct, unit}]
  notes          text not null default '',
  status         text not null default 'draft' check (status in ('draft','published')),
  updated_at     timestamptz not null default now()
);

create table public.procedure_papers (
  procedure_id text not null references public.procedures(id) on delete cascade,
  paper_id     uuid not null references public.papers(id) on delete cascade,
  role         text not null default 'evidence'
               check (role in ('evidence','defense','generator_source')),
  primary key (procedure_id, paper_id, role)
);

-- Device inventory. Physical fields CITED (IFU), 1-10 scales MODELED.
create table public.devices (
  id              text primary key,           -- e.g. 'bentson-035-145'
  name            text not null,
  manufacturer    text not null default '',
  device_class    text not null check (device_class in
    ('guidewire','catheter','microcatheter','micro_guidewire','sheath','balloon',
     'stent','stent_graft','coil','plug','particle','liquid_embolic','needle',
     'closure','drain','filter','port','snare','other')),
  tier            int not null default 1 check (tier between 1 and 3),
  -- CITED physical specs (source required)
  french_size     numeric,
  od_inches       numeric,                    -- guidewire OD
  id_inches       numeric,                    -- catheter inner lumen
  length_cm       numeric,
  tip_shape       text,
  coating         text,
  material        text,
  spec_source     text,                       -- IFU / spec sheet URL or citation
  -- MODELED gameplay attributes (1-10; basis note required)
  stiffness       int check (stiffness between 1 and 10),
  lubricity       int check (lubricity between 1 and 10),
  trackability    int check (trackability between 1 and 10),
  support         int check (support between 1 and 10),
  visibility      int check (visibility between 1 and 10),
  modeled_basis   text not null default '',
  -- Engine compatibility + DESIGN economy
  compat          jsonb not null default '{}', -- {max_wire_od, min_sheath_fr, ...}
  price_funds     int not null default 0,
  status          text not null default 'draft' check (status in ('draft','published')),
  updated_at      timestamptz not null default now()
);

-- Vascular navigation graphs. Node tortuosity/fragility are MODELED.
create table public.vessel_maps (
  id         text primary key,                -- e.g. 'right-ij-to-caj'
  name       text not null,
  region     text not null default '',
  graph      jsonb not null default '{"nodes":[],"edges":[]}',
  -- nodes: [{id, name, diameter_mm, tortuosity 1-10, fragility 1-10, depth}]
  -- edges: [{from, to}]
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

-- Complications: procedure_id NULL = universal library entry.
create table public.complications (
  id             uuid primary key default gen_random_uuid(),
  procedure_id   text references public.procedures(id) on delete cascade,
  name           text not null,
  rate_text      text not null default '',    -- CITED display string, e.g. '<1% with US guidance'
  rate_low_pct   numeric,                     -- parsed numeric range for the engine
  rate_high_pct  numeric,
  severity       text not null default 'moderate' check (severity in
    ('mild','moderate','severe','life_threatening','death')),  -- SIR AE classification
  management     text not null default '',    -- clinical management text (site)
  rescue_actions jsonb not null default '[]', -- game: [{action_id, label, devices:[], effect}]
  trigger_tags   text[] not null default '{}',-- engine hooks: 'wire_perforation','access','contrast',...
  citation_text  text not null default '',
  pmid           text,
  doi            text,
  status         text not null default 'published' check (status in ('draft','published')),
  updated_at     timestamptz not null default now()
);

-- Patient generators: distributions transcribed from a paper's Table 1 (CITED)
-- plus clinical guardrails.
create table public.patient_generators (
  id              uuid primary key default gen_random_uuid(),
  procedure_id    text not null references public.procedures(id) on delete cascade,
  source_paper_id uuid references public.papers(id),
  name            text not null default 'default',
  variables       jsonb not null default '[]',
  -- [{name:'age', kind:'normal', mean, sd, min, max, unit}
  --  {name:'ckd', kind:'bernoulli', p}
  --  {name:'creatinine', kind:'lognormal'|'normal', ..., depends_on:'ckd'}]
  guardrails      jsonb not null default '[]',
  -- [{if:'creatinine>=1.5', then:['tag:CKD','compute:egfr_ckd_epi_2021','limit:contrast']}]
  status          text not null default 'draft' check (status in ('draft','published')),
  updated_at      timestamptz not null default now()
);

-- Per-procedure game parameters (kept apart from reference content).
create table public.procedure_game_params (
  procedure_id      text primary key references public.procedures(id) on delete cascade,
  vessel_map_id     text references public.vessel_maps(id),
  access_node       text,
  target_node       text,
  pacing            text not null default 'stable' check (pacing in ('stable','emergent')),
  emergent_decay    jsonb not null default '{}',  -- MODELED, e.g. {sbp_per_10s: -2}
  fluoro_target_min numeric,                      -- CITED reference level
  fluoro_citation   text not null default '',
  base_payout       int not null default 1000,    -- DESIGN
  complexity        int not null default 1 check (complexity between 1 and 5),
  required_devices  jsonb not null default '[]',  -- device_class checklist for case start
  case_steps        jsonb not null default '[]',  -- maps site steps to engine actions
  updated_at        timestamptz not null default now()
);

-- Conference defense content.
create table public.npc_archetypes (
  id          text primary key,
  name        text not null,
  description text not null default '',
  targets     text not null default ''        -- which paper section they attack
);

create table public.defense_question_templates (
  id            uuid primary key default gen_random_uuid(),
  archetype_id  text not null references public.npc_archetypes(id),
  paper_id      uuid references public.papers(id) on delete cascade, -- NULL = generic template
  template      text not null,                -- 'Your study enrolled {n_enrolled} patients...'
  answer_path   text not null default '',     -- json path into papers row for the true answer
  distractors   jsonb not null default '[]',  -- strategies or literal wrong options
  status        text not null default 'published' check (status in ('draft','published')),
  updated_at    timestamptz not null default now()
);

-- Tunable constants, each tagged with its data class.
create table public.game_config (
  key         text primary key,
  value       jsonb not null,
  data_class  text not null check (data_class in ('cited','modeled','design')),
  citation    text not null default '',
  description text not null default ''
);

-- ---------------------------------------------------------------------------
-- 4. Player tables (owner-only)
-- ---------------------------------------------------------------------------
create table public.player_saves (
  user_id    uuid not null references auth.users(id) on delete cascade,
  slot       int  not null check (slot between 1 and 3),
  save       jsonb not null default '{}',     -- position, funds, clout, inventory, flags
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

create table public.case_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  procedure_id text not null references public.procedures(id),
  score_total  int not null,
  score_detail jsonb not null default '{}',   -- ledger: safety/radiation/renal/technical deductions
  patient_seed jsonb not null default '{}',   -- reproduce the generated patient
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Game-readiness view: procedures that auto-appear in the game
-- ---------------------------------------------------------------------------
create or replace view public.v_game_ready
with (security_invoker = true) as
select p.id, p.title, p.category_id, g.pacing, g.complexity
from public.procedures p
join public.procedure_game_params g on g.procedure_id = p.id
join public.vessel_maps vm          on vm.id = g.vessel_map_id
where p.status = 'published'
  and exists (select 1 from public.patient_generators pg
              where pg.procedure_id = p.id and pg.status = 'published')
  and exists (select 1 from public.complications c
              where (c.procedure_id = p.id or c.procedure_id is null)
                and c.status = 'published');

-- ---------------------------------------------------------------------------
-- 6. Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles                   enable row level security;
alter table public.data_version               enable row level security;
alter table public.categories                 enable row level security;
alter table public.procedures                 enable row level security;
alter table public.citations                  enable row level security;
alter table public.papers                     enable row level security;
alter table public.procedure_papers           enable row level security;
alter table public.devices                    enable row level security;
alter table public.vessel_maps                enable row level security;
alter table public.complications              enable row level security;
alter table public.patient_generators         enable row level security;
alter table public.procedure_game_params      enable row level security;
alter table public.npc_archetypes             enable row level security;
alter table public.defense_question_templates enable row level security;
alter table public.game_config                enable row level security;
alter table public.player_saves               enable row level security;
alter table public.case_logs                  enable row level security;

-- Profiles: read own; admin reads all; owner may update display_name only
-- (is_admin changes require the service role / SQL editor).
create policy "profiles self read"  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());
create policy "profiles self update" on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (is_admin = false or public.is_admin()));

-- Content: anyone (incl. anonymous) reads; only admin writes.
do $$
declare t text;
begin
  foreach t in array array[
    'data_version','categories','procedures','citations','papers',
    'procedure_papers','devices','vessel_maps','complications',
    'patient_generators','procedure_game_params','npc_archetypes',
    'defense_question_templates','game_config'
  ] loop
    execute format('create policy "public read"  on public.%I for select to anon, authenticated using (true);', t);
    execute format('create policy "admin insert" on public.%I for insert to authenticated with check (public.is_admin());', t);
    execute format('create policy "admin update" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin());', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using (public.is_admin());', t);
  end loop;
end $$;

-- Player data: owner-only.
create policy "saves owner" on public.player_saves for all
  to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "logs owner insert" on public.case_logs for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy "logs owner read"   on public.case_logs for select
  to authenticated using ((select auth.uid()) = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- 6b. Data API grants (REQUIRED: projects created after 2026-05-30 no longer
--     auto-expose public tables — grants + RLS are separate layers).
--     https://supabase.com/changelog/45329
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  -- Content tables: everyone reads; authenticated may attempt writes (RLS
  -- restricts to admin); service_role full for tooling.
  foreach t in array array[
    'data_version','categories','procedures','citations','papers',
    'procedure_papers','devices','vessel_maps','complications',
    'patient_generators','procedure_game_params','npc_archetypes',
    'defense_question_templates','game_config'
  ] loop
    execute format('grant select on public.%I to anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end $$;

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select, insert, update, delete on public.player_saves to authenticated;
grant all on public.player_saves to service_role;
grant select, insert on public.case_logs to authenticated;
grant all on public.case_logs to service_role;
grant select on public.v_game_ready to anon, authenticated, service_role;

-- SECURITY DEFINER lockdown (advisors): trigger functions never need caller
-- EXECUTE; is_admin() stays executable by authenticated only (RLS policies
-- evaluate it as the querying role; it reveals only the caller's own flag).
revoke execute on function public.bump_data_version() from public, anon, authenticated;
revoke execute on function public.handle_new_user()   from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. data_version bump triggers on all content tables
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'categories','procedures','citations','papers','procedure_papers',
    'devices','vessel_maps','complications','patient_generators',
    'procedure_game_params','npc_archetypes','defense_question_templates',
    'game_config'
  ] loop
    execute format(
      'create trigger bump_version after insert or update or delete on public.%I
       for each statement execute function public.bump_data_version();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Seeds
-- ---------------------------------------------------------------------------
insert into public.npc_archetypes (id, name, description, targets) values
 ('biostatistician','The Skeptical Biostatistician','Attacks sample size, power, alpha error, endpoint definitions.','methods_stats'),
 ('surgeon','The Old-School Surgeon','Questions long-term durability vs open surgical historical controls.','outcomes_durability'),
 ('fellow','The Panic-Stricken Fellow','Demands rescue protocols and bailout maneuvers for 2 AM failures.','complications_bailouts'),
 ('admin','The Cost-Conscious Admin','Focuses on device cost, room efficiency, length of stay, reimbursement.','cost_efficiency'),
 ('rival','The Aggressive Rival Author','Cites competing trial data to catch contradictions.','comparative_data'),
 ('med-student','The Curiously Lost Med Student','Asks fundamental anatomy, access, and disease-mechanism questions.','fundamentals'),
 ('consultant','The Industry-Backed Consultant','Probes device sizing, materials, and hardware compatibility.','devices_compat');

insert into public.game_config (key, value, data_class, citation, description) values
 ('scoring_weights','{"safety":40,"radiation":20,"renal":20,"technical":20}','design','','Post-op score allocation (spec §7).'),
 ('code_threshold_sbp','{"value":60}','design','','SBP at/below which the patient codes. Design rule.'),
 ('shock_model','{"basis":"ATLS shock classes","hr_rise_per_sbp_drop":0.8,"dbp_lag_factor":0.6}','modeled','ATLS 10th ed. shock classification (basis, not literal values)','Compensatory tachycardia / DBP lag curve. MODELED.'),
 ('contrast_vmax_formula','{"formula":"5 mL x weight_kg / serum_creatinine_mg_dl"}','cited','Cigarroa RG et al. Am J Med. 1989;86(6):649-652.','Cigarroa maximum contrast dose. Ryan to verify/attach PMID in dashboard.'),
 ('egfr_contrast_tiers','{"tiers":[{"egfr_min":45,"risk":"standard"},{"egfr_min":30,"risk":"caution"},{"egfr_min":0,"risk":"high_risk_minimize"}]}','cited','ACR Manual on Contrast Media (Ryan to attach current version/year in dashboard).','eGFR risk tiers gating contrast budget alongside Cigarroa V_max.'),
 ('clout_tiers','{"tiers":[{"min":0,"name":"Standard Resident","payout_mult":1.0},{"min":51,"name":"Rising Researcher","payout_mult":1.2},{"min":151,"name":"Key Opinion Leader","payout_mult":1.2,"matching_grant":true},{"min":301,"name":"Academic Chief","payout_mult":1.5,"instant_supply":true}]}','design','','Institutional favor ladder (spec §11).'),
 ('credibility_gauge','{"start":100,"fail_below":30,"wrong_answer_penalty":[20,30]}','design','','Conference defense gauge (spec §10).'),
 ('vessel_stress_formula','{"formula":"(stiffness * tortuosity / lubricity) * push_force"}','modeled','','Tactile resistance engine. MODELED.');

-- ---------------------------------------------------------------------------
-- 9. Covering indexes for foreign keys (performance advisors)
-- ---------------------------------------------------------------------------
create index idx_case_logs_procedure         on public.case_logs (procedure_id);
create index idx_case_logs_user              on public.case_logs (user_id);
create index idx_complications_procedure     on public.complications (procedure_id);
create index idx_dqt_archetype               on public.defense_question_templates (archetype_id);
create index idx_dqt_paper                   on public.defense_question_templates (paper_id);
create index idx_patient_generators_proc     on public.patient_generators (procedure_id);
create index idx_patient_generators_paper    on public.patient_generators (source_paper_id);
create index idx_game_params_vessel_map      on public.procedure_game_params (vessel_map_id);
create index idx_procedure_papers_paper      on public.procedure_papers (paper_id);
create index idx_procedures_category         on public.procedures (category_id);

-- After running this file:
-- 1) Sign up your own account in the app (or Auth > Users), then:
--    update public.profiles set is_admin = true where user_id = '<your-user-uuid>';
-- 2) Run db/migrate_procedures_json.py to import the 51 existing procedures.
