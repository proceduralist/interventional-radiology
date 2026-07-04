/* UFE (uterine fibroid embolization) — data-only endovascular procedure on the new
   engine. Proves: best taxonomy-keyed path scores clean, a wrong maneuver falls to the
   step default (proceed-and-penalize), and complications reference the CITED UFE rows.
   Run: node game/tests/ufe.test.js */
"use strict";
const assert = require("assert");
const path = require("path");
const angio = require(path.join(__dirname, "..", "js", "engine.js"));
const STEPS = require(path.join(__dirname, "ufe_steps.js"));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };

const CONFIG = { scoring_weights: { safety: 40, radiation: 20, renal: 20, technical: 20 } };
const VESSEL = { graph: { nodes: [
  { id: "cfa_access", fragility: 3, tortuosity: 2 }, { id: "aortic_bifurc", fragility: 3, tortuosity: 1 },
  { id: "contra_iia", fragility: 4, tortuosity: 4 }, { id: "uterine_origin", fragility: 5, tortuosity: 6 },
  { id: "uterine_target", fragility: 6, tortuosity: 7 } ] } };
const COMPS = [
  { name: "Nontarget embolization (bladder, vagina, skin)", procedure_id: "uterine-fibroid-embolization", rate_high_pct: null, rate_text: "rare", citation_text: "[UFE complications]", rescue_actions: [] },
  { name: "Ovarian insufficiency", procedure_id: "uterine-fibroid-embolization", rate_high_pct: 3, rate_text: "1–3% under 45", citation_text: "[UFE complications]", rescue_actions: [] },
];
const KIT = ["micropuncture-needle-21g", "vascular-sheath-5f", "bentson-035-145", "stiff-glidewire-035",
  "pigtail-flush-5f", "sos-omni-5f", "microcatheter-27-150", "microspheres-500-700", "collagen-plug-closure"];
const INV = {}; KIT.forEach(id => INV[id] = true);
const PARAMS = { fluoro_target_min: 15.0, base_payout: 2400, case_steps: STEPS };
function mk(roll) {
  const patient = { pmh: [], meds: [], coag: { platelets: 260 }, renal: { contrastLimitMl: 250 }, labs: {}, seed: 3, __rng: () => (roll != null ? roll : 0.999) };
  return angio.create({ params: PARAMS, vesselMap: VESSEL, devices: [], complications: COMPS, patient, config: CONFIG, seed: 3, inventory: INV });
}
const BEST = ["timeout", "us-micropuncture", "dsa", "reform", "superselect", "particles", "reform", "closure-device"];

t("UFE is 8 taxonomy-keyed steps; step 6 (embolize) accepts the particles maneuver", () => {
  assert.strictEqual(STEPS.length, 8);
  assert.strictEqual(STEPS[1].best, "us-micropuncture");
  assert.ok(STEPS[5].outcomes.particles, "embolize step keyed to the taxonomy `particles` move");
});

t("best-path UFE run scores a clean 100 (no penalties, dose well under the target)", () => {
  const e = mk();
  BEST.forEach(id => { const r = e.choose(id); assert.ok(!r.error && !r.emergency, id + ": " + (r.error || "emergency")); });
  const s = e.finish();
  assert.strictEqual(s.total, 100, JSON.stringify(s.breakdown));
  assert.ok(s.telemetry.fluoroMin < 15, "fluoro " + s.telemetry.fluoroMin + " under target");
  assert.ok(s.usedDevices.includes("microspheres-500-700") && s.usedDevices.includes("sos-omni-5f"));
});

t("a wrong maneuver from the taxonomy proceeds via the step default and is penalized", () => {
  const e = mk();
  const r = e.choose("coil-pushable"); // not valid at the time-out step
  assert.ok(!r.error, "proceeds");
  assert.ok(/skip the checklist/.test(r.narrative), r.narrative);
  assert.ok(e.ledger.some(l => l.category === "technical" && l.delta === -3));
  assert.strictEqual(e.currentStep().n, 2);
});

t("embolization can trigger the CITED nontarget-embolization complication", () => {
  const e = mk(0.01); // 1% roll; nontarget base incidence (null→2% fallback) fires
  ["timeout", "us-micropuncture", "dsa", "reform", "superselect"].forEach(id => e.choose(id));
  const r = e.choose("particles");
  assert.ok(r.emergency && /Nontarget embolization/.test(r.emergency.name), "nontarget fired: " + JSON.stringify(r.emergency));
  assert.ok(e.ledger.some(l => /COMPLICATION: Nontarget/.test(l.reason)), "logged against the CITED row");
});

t("undertreating (unilateral) is an accepted-but-worse maneuver: proceeds, −5 technical", () => {
  const e = mk();
  ["timeout", "us-micropuncture", "dsa", "reform", "superselect", "particles"].forEach(id => e.choose(id));
  const r = e.choose("single-side");
  assert.ok(!r.error, "proceeds");
  assert.ok(e.ledger.some(l => l.delta === -5 && /Unilateral/.test(l.reason)), "undertreatment penalized");
});

console.log("\nAll " + n + " UFE tests passed — data-only endovascular procedure on the generic engine.");
