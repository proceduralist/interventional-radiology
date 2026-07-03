-- P2 seed: procurement/economy config, sim-lab config, tier 1-3 shop devices.
-- Applied to live project 2026-07-03 as migration `p2_economy_simlab_seed` (data_version -> 51).
--
-- Accuracy contract:
--   prices/economy                = DESIGN
--   gameplay scales + bench profiles = MODELED
--   packing-density formula       = CITED (Sluzewski 2004; Ryan to verify threshold)
--   NEW device dimensions         = class-typical nominal values PENDING IFU citation
--                                   (treated as MODELED until Ryan attaches sources via /admin).

insert into devices (id, name, manufacturer, device_class, tier, french_size, length_cm, tip_shape, coating, material, spec_source, stiffness, lubricity, trackability, support, visibility, modeled_basis, compat, price_funds, status) values
('c2-cobra-5f', '5F Cobra (C2) selective catheter', 'generic', 'catheter', 1, 5, 65, 'cobra curve', 'standard', 'braided nylon',
 'Class-typical nominal values (Cobra-2 type); dimensions PENDING manufacturer IFU (Ryan to attach) - treat as MODELED until cited.',
 5, 4, 5, 6, 5,
 'Braided 5F selective catheter: moderate stiffness/support 5-6 from braid; non-hydrophilic coating -> lubricity 4.',
 '{"over_wire_od": 0.035}', 600, 'published'),
('glidewire-035-150', '0.035-in hydrophilic guidewire, angled (Glidewire-type)', 'generic', 'guidewire', 2, null, 150, 'angled', 'hydrophilic polymer', 'nitinol core',
 'Class-typical nominal values (Glidewire-type); dimensions PENDING manufacturer IFU (Ryan to attach) - treat as MODELED until cited.',
 4, 9, 8, 5, 6,
 'Hydrophilic polymer jacket -> lubricity 9; kink-resistant nitinol core -> trackability 8; slightly stiffer shaft than a Bentson -> stiffness 4, support 5.',
 '{"od_inches": 0.035}', 2400, 'published'),
('glidecath-4f-65', '4F hydrophilic angled catheter (Glidecath-type)', 'generic', 'catheter', 2, 4, 65, 'angled taper', 'hydrophilic', 'polyurethane',
 'Class-typical nominal values (Glidecath-type); dimensions PENDING manufacturer IFU (Ryan to attach) - treat as MODELED until cited.',
 4, 8, 8, 4, 5,
 'Hydrophilic 4F selective catheter: lubricity 8, trackability 8; low-profile shaft gives less support (4) than braided 5F.',
 '{"over_wire_od": 0.035}', 2800, 'published'),
('progreat-24-110', '2.4F coaxial microcatheter (Progreat-type)', 'generic', 'microcatheter', 3, 2.4, 110, 'straight, radiopaque tip marker', 'hydrophilic', 'coil-reinforced polymer',
 'Class-typical nominal values (Progreat-type); dimensions PENDING manufacturer IFU (Ryan to attach) - treat as MODELED until cited.',
 2, 8, 9, 2, 7,
 'Microcatheter: very low stiffness/support 2 (needs a guide/selective catheter for support); hydrophilic lubricity 8; trackability 9 for distal work; visibility 7 from tip marker.',
 '{"coaxial_through": "5F selective catheter"}', 5500, 'published')
on conflict (id) do update set
 name=excluded.name, device_class=excluded.device_class, tier=excluded.tier, french_size=excluded.french_size,
 length_cm=excluded.length_cm, tip_shape=excluded.tip_shape, coating=excluded.coating, material=excluded.material,
 spec_source=excluded.spec_source, stiffness=excluded.stiffness, lubricity=excluded.lubricity,
 trackability=excluded.trackability, support=excluded.support, visibility=excluded.visibility,
 modeled_basis=excluded.modeled_basis, compat=excluded.compat, price_funds=excluded.price_funds, status=excluded.status;

insert into game_config (key, value, data_class, citation) values
('economy', '{
  "starting_funds": 0,
  "ownership_model": "buy-once: purchasing a device establishes a supply contract; it stays stocked (no per-case consumption)",
  "starter_inventory": ["micropuncture-needle-21g","mp-wire-018","transitional-dilator-5f","bentson-035-145","peelaway-sheath-9f","port-catheter-8f","huber-needle-20g"],
  "required_kit": {"chest-port": ["micropuncture-needle-21g","mp-wire-018","transitional-dilator-5f","bentson-035-145","peelaway-sheath-9f","port-catheter-8f","huber-needle-20g"]}
}', 'design', ''),
('flow_bench_profiles', '{
  "note": "Synthetic anatomy profiles for the sim-lab flow bench. Same MODELED scales as vessel_maps nodes (tortuosity 1-5; fragility = stress threshold), so bench practice transfers to the case engine.",
  "profiles": [
    {"id":"straight-venous-run","name":"Straight venous run (IJ/SVC-type)","tortuosity":1,"fragility":8},
    {"id":"aortic-arch","name":"Aortic arch takeoff","tortuosity":3,"fragility":6},
    {"id":"tortuous-iliac","name":"Tortuous calcified iliac","tortuosity":4,"fragility":5},
    {"id":"fragile-tumor-feeder","name":"Fragile tumor feeder (hepatic branch)","tortuosity":5,"fragility":2}
  ]
}', 'modeled', ''),
('packing_density', '{
  "formula": "packing_pct = 100 * sum(coil_volume) / aneurysm_volume; coil_volume = pi*(primary_wind_diameter/2)^2*inserted_length; aneurysm_volume: sphere = 4/3*pi*r^3, ellipsoid = pi/6*a*b*c",
  "threshold_note": "Packing density >= ~24% was associated with absence of coil compaction (small aneurysms) in the cited series - VERIFY with Ryan before presenting as a hard cutoff."
}', 'cited', 'Sluzewski M, van Rooij WJ, Slob MJ, et al. Relation between aneurysm volume, packing, and compaction in 145 cerebral aneurysms treated with coils. Radiology. 2004;231(3):653-658. [Ryan to verify]'),
('particle_occlusion', '{
  "note": "Qualitative teaching demo only - no invented rates. Smaller embolic particles penetrate more distally (more complete tissue devascularization, higher nontarget/ischemia risk); larger particles occlude more proximally.",
  "bands": [
    {"range_um": "40-120", "level": "most distal penetration; highest tissue-ischemia risk"},
    {"range_um": "100-300", "level": "distal arteriolar occlusion"},
    {"range_um": "300-500", "level": "small-artery occlusion (common embolotherapy workhorse)"},
    {"range_um": "500-700", "level": "more proximal small-artery occlusion"},
    {"range_um": "700-900", "level": "proximal occlusion; least distal penetration"}
  ]
}', 'modeled', 'Qualitative size-vs-level physiology; Ryan may attach a cited reference (e.g., embolotherapy reviews) via /admin.')
on conflict (key) do update set value=excluded.value, data_class=excluded.data_class, citation=excluded.citation;
