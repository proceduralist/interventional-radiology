/* Chest-port case_steps — GRANULAR, TAXONOMY-KEYED (source of truth mirrored to
   the DB by game/tools/gen_ward_sql.js).

   Every step's correct move is ONE maneuver from game_config.action_taxonomy
   (tests/action_taxonomy.js) — the battle UI shows only the nested taxonomy, so
   the player must find e.g. Procedure control → Time-out, then Imaging →
   Ultrasound, without labeled answer buttons (Ryan 2026-07-10).

   Sequence follows the chapter [1]: time-out → sterile prep → US survey →
   US-guided access → working wire to IVC → anesthetize pocket/tract → pocket
   (± transfuse) → tunnel → measure/trim → peel-away (air precautions) →
   advance to CAJ → attach to port → access & test → confirm tip & close.

   `blocked` = physically impossible right now → attending hard-block (strikes).
   Everything possible-but-wrong falls to the step `default` (proceed-and-penalize).
   Skipping measure/trim or sheath precautions sets flags that later steps read
   (malposition; air-embolism roll on delivery). */
"use strict";

// Nothing intravascular exists yet (steps 1–4).
const PREVASC = ["cat:wire", "cat:catheter", "cat:embolization", "cat:angioplasty", "cat:recanalize",
  "place-sheath", "upsize-sheath", "long-sheath", "upsize-035", "closure-device"];
// Wire is in; no catheter can pass without the peel-away (steps 5–9).
const PRESHEATH = ["cat:catheter", "cat:embolization", "cat:angioplasty", "cat:recanalize", "closure-device"];
// Sheath question resolved; embolics/angioplasty stay impossible (no target).
const LATE = ["cat:embolization", "cat:angioplasty", "cat:recanalize"];

module.exports = [
  { n: 1, title: "Time-out", node: "rij_access", best: "timeout",
    prompt: "Pre-procedure. How do you begin?",
    teaching: "Universal Protocol: verify patient, procedure, site and consent before anything touches the field.",
    blocked: PREVASC,
    outcomes: {
      timeout: { label: "Surgical time-out",
        score: [{ cat: "technical", delta: 0, reason: "Time-out performed." }],
        ok: "Time-out complete — right patient, right procedure, consent on the chart." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Off-protocol before a time-out.", cite: "Universal Protocol" }], narrative: "You do something else before the time-out." } },

  { n: 2, title: "Sterile prep & drape", node: "rij_access", best: "sterile-prep",
    prompt: "Prepare the field.",
    teaching: "The skin is sterilized with a 2% chlorhexidine-based preparation; full surgical scrub protocol (hand scrub, gloves, mask, cap, gown). [1]",
    blocked: PREVASC,
    outcomes: {
      "sterile-prep": { label: "Chlorhexidine prep + full drape",
        score: [{ cat: "technical", delta: 0, reason: "2% chlorhexidine prep and full sterile drape." }],
        ok: "Skin prepped with 2% chlorhexidine; full sterile field up. [1]" },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Procedure not performed under full sterile preparation.", cite: "General considerations [1]" }],
      setFlag: "unsterile", narrative: "You press on without full sterile prep." } },

  { n: 3, title: "US survey of the right IJ", node: "rij_access", best: "ultrasound",
    prompt: "Assess the target vein before puncture.",
    teaching: "Survey the target vein first: patency, compressibility, anatomy. Ultrasound guidance is always recommended for venipuncture. [1]",
    blocked: PREVASC,
    outcomes: {
      ultrasound: { label: "US survey of the right IJ", imaging: "us",
        score: [{ cat: "technical", delta: 0, reason: "Pre-puncture US survey of the right IJ." }],
        ok: "US survey: right IJ patent, compressible, no thrombus — good target." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "No pre-puncture ultrasound survey of the target vein.", cite: "US guidance is always recommended [1]" }], narrative: "You skip the vein survey." } },

  { n: 4, title: "Venous access", node: "rij_access", best: "us-micropuncture",
    prompt: "Puncture the right IJ and transition to a working system.",
    teaching: "Real-time US-guided micropuncture (21G → 0.018 → transitional dilator) is the standard: it is the single biggest pneumothorax/arterial-puncture reducer. [1]",
    blocked: PREVASC,
    outcomes: {
      "us-micropuncture": { label: "US-guided micropuncture (21G), 0.018, transitional dilator",
        needs: ["micropuncture-needle-21g", "mp-wire-018", "transitional-dilator-5f"], imaging: "us",
        complication: { name: "Pneumothorax", mult: 1.0, decline: { sbpDrop: 4, spo2Drop: 4, rrRise: 6 } },
        ok: "Single anterior-wall puncture under real-time US; 0.018 seated; transitioned to the 5F dilator.",
        hit: "Access obtained, but the post-access check shows a pneumothorax." },
      landmark: { label: "Landmark stick (faster, no US)",
        needs: ["micropuncture-needle-21g"],
        score: [{ cat: "technical", delta: -3, reason: "Landmark venipuncture instead of real-time US guidance.", cite: "US guidance is standard of care [1]" }],
        complication: { name: "Pneumothorax", mult: 5.0, decline: { sbpDrop: 4, spo2Drop: 4, rrRise: 6 } },
        ok: "Landmark access happened to work this time.",
        hit: "Blind stick — the patient desaturates; pneumothorax." },
    },
    default: { score: [{ cat: "technical", delta: -4, reason: "That maneuver does not establish venous access." }], narrative: "That doesn't get you access." } },

  { n: 5, title: "Working wire to the IVC", node: "svc", best: "advance-wire",
    prompt: "Secure a working guidewire from the access site to the IVC.",
    teaching: "A working 0.035 guidewire is placed from the access site to the IVC before anything else advances. [1]",
    blocked: PRESHEATH,
    outcomes: {
      "advance-wire": { label: "Advance the 0.035 Bentson to the IVC",
        needs: ["bentson-035-145"], imaging: "tap",
        score: [{ cat: "technical", delta: 0, reason: "0.035 working wire advanced to the IVC under fluoroscopy." }],
        ok: "Bentson advances smoothly; tip parked in the IVC." },
      "exchange-wire": { label: "Exchange to a 0.035 hydrophilic working wire",
        needs: ["glidewire-035-150"], ownedOnly: true, imaging: "tap",
        score: [{ cat: "technical", delta: 0, reason: "Exchanged to a hydrophilic working wire (lubricity 9, MODELED)." }],
        ok: "The hydrophilic wire glides to the IVC." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "That doesn't secure a working wire to the IVC." }], narrative: "That doesn't secure the working wire." } },

  { n: 6, title: "Anesthetize pocket site & tract", node: "rij_access", best: "local-anesthesia",
    prompt: "Prepare the chest wall for the pocket and tunnel.",
    teaching: "Generously anesthetize the intended port site and the whole tunnel tract with 1% lidocaine, with minimal skin entries. [1]",
    blocked: PRESHEATH,
    outcomes: {
      "local-anesthesia": { label: "1% lidocaine along pocket site + tunnel tract",
        score: [{ cat: "technical", delta: 0, reason: "Pocket site and tunnel tract anesthetized." }],
        ok: "1% lidocaine along the pocket site and tunnel tract — single skin entry." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Proceeded without anesthetizing the pocket/tract." }], narrative: "The patient winces — that area isn't numb." } },

  { n: 7, title: "Create the port pocket", node: "rij_access", best: "blunt-pocket",
    prompt: "Create the subcutaneous pocket on the pectoralis fascia.",
    teaching: "3 cm incision, blunt dissection; the pocket must fit the port without tension — too deep is hard to access, too superficial erodes. Transfuse first if platelets are below 50. [1]",
    blocked: PRESHEATH,
    outcomes: {
      "blunt-pocket": { label: "Incise and blunt-dissect a snug pocket",
        complication: { name: "Pocket hematoma", multFrom: "platelets", mult: 1.0, multLow: 3.0, multVeryLow: 8.0, decline: { sbpDrop: 6 } },
        ok: "Pocket created with good hemostasis.",
        hit: "Oozing in the pocket — a hematoma is developing." },
      transfuse: { label: "Transfuse platelets first, then pocket", transfuse: true },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Off-protocol at pocket creation." }], narrative: "That isn't how you create the pocket." } },

  { n: 8, title: "Tunnel the catheter", node: "rij_access", best: "tunnel",
    prompt: "Tunnel from the pocket to the neck venotomy.",
    teaching: "Advance the tunneler from the pocket toward the venotomy in a gentle curve; pull the catheter through. [1]",
    blocked: PRESHEATH,
    outcomes: {
      tunnel: { label: "Tunnel pocket → venotomy, pull the catheter through",
        needs: ["port-catheter-8f"],
        score: [{ cat: "technical", delta: 0, reason: "Catheter tunneled from pocket to venotomy in a gentle curve." }],
        ok: "The tunneler makes a gentle curve; catheter pulled through to the neck." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Off-protocol at tunneling." }], narrative: "That isn't the tunneling step." } },

  { n: 9, title: "Set tip length to the CAJ", node: "right_bct", best: "measure-trim",
    prompt: "Determine catheter length so the tip sits at the cavoatrial junction.",
    teaching: "Measure against the indwelling wire under fluoroscopy and trim — estimating malpositions the tip.",
    blocked: PRESHEATH,
    outcomes: {
      "measure-trim": { label: "Measure against the wire under fluoro, trim to the CAJ", imaging: "tap",
        score: [{ cat: "technical", delta: 0, reason: "Tip length measured to the CAJ under fluoroscopy." }],
        ok: "Catheter trimmed so the tip will sit at the cavoatrial junction." },
    },
    default: { score: [{ cat: "technical", delta: -4, reason: "No fluoroscopic measurement — catheter length estimated (malposition risk)." }],
      setFlag: "malposition", narrative: "You end up estimating the length; the tip may sit high." } },

  { n: 10, title: "Place the peel-away sheath", node: "svc", best: "place-sheath",
    prompt: "Place the peel-away introducer over the wire.",
    teaching: "An appropriately sized peel-away sheath goes over the existing stiff 0.035 wire. An open sheath is an air-embolism risk: breath-hold and pinch it. [1]",
    blocked: ["cat:catheter", "cat:embolization", "cat:angioplasty", "cat:recanalize"],
    outcomes: {
      "place-sheath": { label: "Peel-away over the wire, breath-hold + pinch",
        needs: ["peelaway-sheath-9f"],
        score: [{ cat: "technical", delta: 0, reason: "Peel-away placed with air-embolism precautions (breath-hold, pinched valve)." }],
        ok: "Peel-away seated over the stiff wire; dilator out during a breath-hold; sheath pinched. [1]" },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Sloppy sheath handling — no air-embolism precautions.", cite: "Avoiding air embolism [1]" }],
      setFlag: "no_air_precautions", narrative: "The sheath goes in without breath-hold discipline; it sits open to air." } },

  { n: 11, title: "Advance the catheter to the CAJ", node: "caj", best: "advance-cath",
    prompt: "Deliver the catheter through the peel-away to the SVC/RA junction.",
    teaching: "Advance briskly through the peel-away during a breath-hold and position the tip at the SVC/RA junction; keep any open lumen clamped. [1]",
    blocked: LATE,
    outcomes: {
      "advance-cath": { label: "Advance through the peel-away to the CAJ",
        ifFlag: "no_air_precautions",
        ifFlagEvent: { name: "Air embolism", decline: { sbpDrop: 18, spo2Drop: 6, rrRise: 4 }, riskPct: 60,
          note: "Open, unpinched sheath entrained air during catheter delivery (step 10 precaution skipped). MODELED event." },
        ifFlagHit: "As the catheter goes in through the open sheath there's a gasp — air embolism.",
        ifFlagNarrative: "The catheter goes in through the open sheath — you get away with it this time.",
        score: [{ cat: "technical", delta: 0, reason: "Catheter advanced through the peel-away to the SVC/RA junction." }],
        ok: "Advanced during a breath-hold; tip at the CAJ; sheath peeled away." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Off-protocol at catheter delivery." }], narrative: "That isn't catheter delivery." } },

  { n: 12, title: "Attach the catheter to the port", node: "caj", best: "connect-device",
    prompt: "Assemble the system and seat the port.",
    teaching: "Cut the tubing at the pocket, attach it to the reservoir and secure the hub — enough slack to connect, not enough to kink. Lower the port into the pocket. [1]",
    blocked: LATE,
    outcomes: {
      "connect-device": { label: "Trim, lock to the port stem, seat the port",
        score: [{ cat: "technical", delta: 0, reason: "Catheter cut to length, secured to the port hub; port seated." }],
        ok: "Tubing trimmed at the pocket, locked to the port stem; port lowered in without kinks. [1]" },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Off-protocol at port assembly." }], narrative: "That doesn't assemble the port." } },

  { n: 13, title: "Access & test the port", node: "caj", best: "aspirate",
    prompt: "Verify function before closing.",
    teaching: "Access with a noncoring (Huber) needle; aspirate and flush each lumen; instill heparin lock per policy. [1]",
    blocked: LATE,
    outcomes: {
      aspirate: { label: "Huber access; aspirate + flush each lumen",
        needs: ["huber-needle-20g"],
        score: [{ cat: "technical", delta: 0, reason: "Brisk blood return and free flush confirmed." }],
        ok: "Huber in; brisk aspiration, free flush, heparin lock instilled. No pocket swelling." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Port function not verified before closure." }], narrative: "That doesn't verify port function." } },

  { n: 14, title: "Confirm tip & close", node: "caj", best: "dsa",
    prompt: "Confirm final tip position and close.",
    teaching: "Save a completion spot image documenting tip position, then a two-layer pocket closure. [1]",
    blocked: ["cat:embolization", "cat:angioplasty"],
    outcomes: {
      dsa: { label: "DSA spot to document the CAJ tip, then two-layer close",
        imaging: "dsa", contrastMl: 3, ifFlag: "malposition",
        ifFlagScore: [{ cat: "technical", delta: -3, reason: "Malpositioned tip required repositioning before closure." }], ifFlagImaging: "reposition",
        ifFlagNarrative: "The spot shows the tip sitting high; repositioned to the CAJ, then closed in two layers.",
        elseScore: [{ cat: "technical", delta: 0, reason: "Completion image documents the CAJ tip without kinks." }],
        elseNarrative: "Tip confirmed at the CAJ; pocket closed in two layers." },
      completion: { label: "Completion angiogram, then two-layer close",
        imaging: "dsa", contrastMl: 3, ifFlag: "malposition",
        ifFlagScore: [{ cat: "technical", delta: -3, reason: "Malpositioned tip required repositioning before closure." }], ifFlagImaging: "reposition",
        ifFlagNarrative: "The completion run shows the tip sitting high; repositioned to the CAJ, then closed.",
        elseScore: [{ cat: "technical", delta: 0, reason: "Completion image documents the CAJ tip without kinks." }],
        elseNarrative: "Tip confirmed at the CAJ; pocket closed in two layers." },
      close: { label: "Close without a confirmatory image",
        score: [{ cat: "technical", delta: -6, reason: "Closed without documenting final tip position." }],
        ifFlag: "malposition", ifFlagScore: [{ cat: "safety", delta: 0, reason: "Undocumented malpositioned tip left in place." }],
        narrative: "You close without a confirmatory spot film." },
    },
    default: { score: [{ cat: "technical", delta: -4, reason: "Off-protocol at closure." }], narrative: "That isn't the confirm/close step." } },
];
