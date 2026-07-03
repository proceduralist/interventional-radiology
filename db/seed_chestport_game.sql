-- ============================================================================
-- Chest-port GAME DATA seed (P1) — applied 2026-07-03 to project ueveooemzpzqebnhllcp.
-- Makes 'chest-port' satisfy v_game_ready (published proc + game params +
-- vessel map + published generator + >=1 published complication).
--
-- Data-class contract (docs/MASTER_SPEC.md §1):
--   CITED   physical/clinical values (procedure equipment list [1], SIR 2019, Cigarroa, ACR).
--   MODELED simulation parameters (1-10 scales, tortuosity/fragility, distributions) — labeled.
--   DESIGN  economy (prices, payout).
-- NOTE: the patient_generator distributions are MODELED oncology-default placeholders,
--       NOT a real Table 1. Ryan replaces them via /admin with a cited cohort and
--       attaches source_paper_id; values then become CITED.
-- ============================================================================

-- 1) Vessel map: right IJ -> cavoatrial junction -----------------------------
insert into public.vessel_maps (id, name, region, graph, notes) values (
 'right-ij-to-caj',
 'Right Internal Jugular → Cavoatrial Junction',
 'Central venous (right neck to heart)',
 jsonb_build_object(
   'nodes', jsonb_build_array(
     jsonb_build_object('id','rij_access','name','Right internal jugular v. (low, access)','diameter_mm',13,'tortuosity',2,'fragility',3,'depth','shallow'),
     jsonb_build_object('id','rij_lower','name','Lower IJ approaching venous confluence','diameter_mm',14,'tortuosity',2,'fragility',3,'depth','shallow'),
     jsonb_build_object('id','right_bct','name','Right brachiocephalic (innominate) v.','diameter_mm',16,'tortuosity',3,'fragility',4,'depth','mid'),
     jsonb_build_object('id','svc','name','Superior vena cava','diameter_mm',20,'tortuosity',1,'fragility',4,'depth','deep'),
     jsonb_build_object('id','caj','name','Cavoatrial junction (target)','diameter_mm',21,'tortuosity',1,'fragility',5,'depth','deep')
   ),
   'edges', jsonb_build_array(
     jsonb_build_object('from','rij_access','to','rij_lower'),
     jsonb_build_object('from','rij_lower','to','right_bct'),
     jsonb_build_object('from','right_bct','to','svc'),
     jsonb_build_object('from','svc','to','caj')
   )
 ),
 'Straightest central route (right IJ preferred, procedure step 1). diameter_mm = approximate adult anatomy (reference values, not patient-specific). tortuosity & fragility are MODELED 1-10 simulation parameters: CAJ fragility 5 encodes perforation->tamponade risk if advanced too deep.'
)
on conflict (id) do update set graph = excluded.graph, notes = excluded.notes, name = excluded.name, region = excluded.region;

-- 2) Devices (physical CITED to equipment list [1]; 1-10 MODELED; price DESIGN)
insert into public.devices
 (id, name, manufacturer, device_class, tier, french_size, od_inches, id_inches, length_cm, tip_shape, coating, material, spec_source,
  stiffness, lubricity, trackability, support, visibility, modeled_basis, compat, price_funds, status)
values
 ('micropuncture-needle-21g','21G micropuncture access needle','generic','needle',1,null,null,null,7,'bevel',null,'stainless steel',
  'Standard micropuncture set (21G needle / 0.018-in wire / 4-5F transitional dilator); see procedure equipment list [1].',
  null,null,null,null,7,'visibility 7: echogenic bevel under high-frequency US (access is US-guided, step 2).',
  jsonb_build_object('accepts_wire_od',0.018),700,'published'),
 ('mp-wire-018','0.018-in micropuncture guidewire','generic','micro_guidewire',1,null,0.018,null,40,'floppy straight','PTFE','nitinol core',
  'Standard micropuncture set; see procedure equipment list [1].',
  3,6,7,3,5,'stiffness 3 / support 3: thin 0.018-in access wire, atraumatic; lubricity 6 PTFE; trackability 7 for the short IJ course.',
  jsonb_build_object('min_needle_g',21),400,'published'),
 ('transitional-dilator-5f','4-5F transitional dilator','generic','other',1,5,null,null,10,'tapered',null,'polyethylene',
  'Standard micropuncture set; converts 0.018-in access to 0.035-in [1].',
  6,3,5,6,4,'stiffness/support 6: stiff taper to convert access; low lubricity.',
  jsonb_build_object('accepts_wire_od',0.035,'over_wire_od',0.018),300,'published'),
 ('bentson-035-145','0.035-in Bentson guidewire','generic','guidewire',1,null,0.035,null,145,'long floppy straight','PTFE','stainless steel',
  'Bentson-type 0.035-in / 145 cm working wire; standard IR stock, see procedure equipment list [1].',
  3,5,6,5,6,'stiffness 3: long floppy atraumatic tip; support 5 mid-shaft; lubricity 5 PTFE; secures position to the IVC/SVC (step 2).',
  jsonb_build_object('od_inches',0.035),350,'published'),
 ('peelaway-sheath-9f','9F peel-away introducer sheath','generic','sheath',1,9,null,null,15,'tapered dilator','none','PTFE/polyethylene',
  'Peel-away sheath from the port kit, sized to the catheter [1].',
  5,3,5,6,4,'stiffness/support 5-6: supports catheter delivery; air-embolism precaution on dilator removal (step 5).',
  jsonb_build_object('min_sheath_fr',9,'accepts_catheter_fr',8),900,'published'),
 ('port-catheter-8f','8F single-lumen chest port + silicone catheter','generic','port',1,8,null,null,60,'open-ended','none','silicone / titanium port',
  '6-9.5F silicone/polyurethane port catheter per procedure equipment list [1]; manufacturer IFU URL to be added by Ryan.',
  4,4,5,4,6,'stiffness 4: silicone catheter, kink-prone at tunnel/venotomy angle (pearl 4); trimmed to CAJ length (step 4).',
  jsonb_build_object('through_sheath_fr',9),3200,'published'),
 ('huber-needle-20g','20G non-coring Huber needle','generic','needle',1,null,null,null,2,'non-coring deflected','none','stainless steel',
  'Non-coring Huber needle for access check [1].',
  null,null,null,null,5,'confirms brisk aspiration/flush from each lumen (step 6); non-coring preserves the septum.',
  jsonb_build_object('for','port_access'),500,'published')
on conflict (id) do update set
  name=excluded.name, device_class=excluded.device_class, french_size=excluded.french_size, od_inches=excluded.od_inches,
  length_cm=excluded.length_cm, spec_source=excluded.spec_source, stiffness=excluded.stiffness, lubricity=excluded.lubricity,
  trackability=excluded.trackability, support=excluded.support, visibility=excluded.visibility, modeled_basis=excluded.modeled_basis,
  compat=excluded.compat, price_funds=excluded.price_funds, status=excluded.status;

-- 3) Patient generator (MODELED distributions; real clinical guardrails) ------
insert into public.patient_generators (procedure_id, source_paper_id, name, variables, guardrails, status)
values (
 'chest-port', null,
 'oncology-default (MODELED — pending real cohort Table 1)',
 jsonb_build_array(
  jsonb_build_object('name','age','kind','normal','mean',60,'sd',13,'min',18,'max',90,'unit','years','data_class','MODELED','basis','Typical adult oncology port population; replace with cited cohort Table 1.'),
  jsonb_build_object('name','sex_female','kind','bernoulli','p',0.55,'data_class','MODELED','basis','Modeled female-majority oncology skew; replace with cited sex split.'),
  jsonb_build_object('name','weight_kg','kind','normal','mean',78,'sd',18,'min',40,'max',160,'unit','kg','data_class','MODELED','basis','Feeds Cigarroa V_max = 5*kg/SCr contrast limit.'),
  jsonb_build_object('name','creatinine','kind','normal','mean',0.9,'sd',0.25,'min',0.5,'max',3.5,'unit','mg/dL','data_class','MODELED','basis','Drives eGFR (CKD-EPI 2021) and contrast budget; tail covers CKD cases.'),
  jsonb_build_object('name','platelets','kind','normal','mean',180,'sd',70,'min',15,'max',450,'unit','x10^9/L','data_class','MODELED','basis','Low tail exercises SIR periprocedural threshold guardrail (>=20 low-risk; >=50 preferred for pocket) [1].'),
  jsonb_build_object('name','inr','kind','normal','mean',1.1,'sd',0.2,'min',0.9,'max',3.2,'unit','ratio','data_class','MODELED','basis','Exercises SIR INR <=2.0-3.0 guardrail [1].'),
  jsonb_build_object('name','hemoglobin','kind','normal','mean',11.5,'sd',1.8,'min',6.5,'max',17,'unit','g/dL','data_class','MODELED','basis','Chart realism; anemia common in chemo patients.'),
  jsonb_build_object('name','ckd','kind','bernoulli','p',0.12,'data_class','MODELED','basis','Comorbidity prevalence placeholder.'),
  jsonb_build_object('name','diabetes','kind','bernoulli','p',0.20,'data_class','MODELED','basis','Comorbidity prevalence placeholder.'),
  jsonb_build_object('name','hypertension','kind','bernoulli','p',0.40,'data_class','MODELED','basis','Comorbidity prevalence placeholder.'),
  jsonb_build_object('name','on_anticoagulant','kind','bernoulli','p',0.10,'data_class','MODELED','basis','Triggers pre-op hold/bridge decision in the EMR.')
 ),
 jsonb_build_array(
  jsonb_build_object('if','creatinine>=1.5','then', jsonb_build_array('tag:CKD','compute:egfr_ckd_epi_2021','limit:contrast=min(cigarroa_vmax,acr_egfr_tier)'),'source','game_config.contrast_vmax_formula (Cigarroa 1989) + egfr_contrast_tiers (ACR)'),
  jsonb_build_object('if','platelets<20','then', jsonb_build_array('block:proceed','order:platelet_transfusion'),'source','SIR 2019 periprocedural thresholds [1]'),
  jsonb_build_object('if','platelets<50','then', jsonb_build_array('warn:pocket_hemostasis'),'source','Procedure preop note: many operators prefer >=50 for pocket [1]'),
  jsonb_build_object('if','inr>3.0','then', jsonb_build_array('warn:correct_inr'),'source','SIR 2019 low-risk INR <=2.0-3.0 [1]'),
  jsonb_build_object('if','on_anticoagulant==true','then', jsonb_build_array('flag:hold_bridge_decision'),'source','SIR 2019: hold generally not required for low-risk access, decision surfaced to player [1]')
 ),
 'published'
)
on conflict do nothing;

-- 4) Procedure game params (case_steps map site steps -> engine actions) ------
insert into public.procedure_game_params
 (procedure_id, vessel_map_id, access_node, target_node, pacing, emergent_decay,
  fluoro_target_min, fluoro_citation, base_payout, complexity, required_devices, case_steps)
values (
 'chest-port','right-ij-to-caj','rij_access','caj','stable','{}'::jsonb,
 3.0,
 'MODELED placeholder reference (port placement is a low-fluoro procedure). Replace with a cited institutional/national DRL for tunneled port/central venous access (Ryan).',
 1200, 2,
 jsonb_build_array('needle','micro_guidewire','guidewire','sheath','port'),
 jsonb_build_array(
  jsonb_build_object('n',1,'title','Time-out & positioning','node','rij_access','actions', jsonb_build_array('timeout','us_survey'),'teaching','Right IJ preferred: straightest course to the CAJ.'),
  jsonb_build_object('n',2,'title','US-guided venous access','node','rij_access','actions', jsonb_build_array('access:micropuncture-needle-21g','wire:mp-wire-018','exchange:transitional-dilator-5f','wire:bentson-035-145'),'devices', jsonb_build_array('micropuncture-needle-21g','mp-wire-018','transitional-dilator-5f','bentson-035-145'),'imaging','fluoro','teaching','21G under real-time US; advance 0.018 then exchange to 0.035 to the IVC/SVC.'),
  jsonb_build_object('n',3,'title','Create the pocket','node','rij_access','actions', jsonb_build_array('anesthetize','incision','pocket'),'teaching','Pocket snug to prevent flipping; >=50k platelets preferred for hemostasis.'),
  jsonb_build_object('n',4,'title','Tunnel & measure','node','right_bct','actions', jsonb_build_array('tunnel','measure_to_caj','trim:port-catheter-8f'),'devices', jsonb_build_array('port-catheter-8f'),'imaging','fluoro','teaching','Measure against the wire so the tip lands at the CAJ (~2 vertebral bodies below carina).'),
  jsonb_build_object('n',5,'title','Peel-away sheath & catheter delivery','node','svc','actions', jsonb_build_array('dilate','sheath:peelaway-sheath-9f','valsalva','deliver_catheter','peel_withdraw'),'devices', jsonb_build_array('peelaway-sheath-9f'),'risk','air_embolism','teaching','Valsalva/breath-hold and pinch the sheath on dilator removal - air-embolism precaution.'),
  jsonb_build_object('n',6,'title','Connect & test','node','caj','actions', jsonb_build_array('lock_to_stem','access:huber-needle-20g','aspirate','flush'),'devices', jsonb_build_array('huber-needle-20g'),'teaching','Brisk blood return from each lumen; flush without pocket swelling.'),
  jsonb_build_object('n',7,'title','Confirm tip & close','node','caj','actions', jsonb_build_array('dsa_spot','confirm_tip','close_two_layer','dressing'),'imaging','dsa','teaching','Fluoroscopic spot documents CAJ tip position without kinks; close in two layers.')
 )
)
on conflict (procedure_id) do update set
  vessel_map_id=excluded.vessel_map_id, access_node=excluded.access_node, target_node=excluded.target_node,
  pacing=excluded.pacing, fluoro_target_min=excluded.fluoro_target_min, fluoro_citation=excluded.fluoro_citation,
  base_payout=excluded.base_payout, complexity=excluded.complexity, required_devices=excluded.required_devices,
  case_steps=excluded.case_steps;
