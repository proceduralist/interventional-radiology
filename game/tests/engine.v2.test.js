/* Engine v2 — data-driven interpreter (acceptable-set, proceed-and-penalize).
   Chest-port is now 14 GRANULAR TAXONOMY-KEYED steps (no labeled answer list in
   the UI). Confirms: branches come from case_steps[].outcomes, the best taxonomy
   path scores 100, a suboptimal action proceeds but scores lower, an unknown
   action falls to the step `default`, complication multipliers differ per action,
   and a skipped precaution (open sheath) arms the MODELED air-embolism event.
   Run: node game/tests/engine.v2.test.js */
"use strict";
const assert = require("assert");
const path = require("path");
const angio = require(path.join(__dirname, "..", "js", "engine.js"));
const STEPS = require(path.join(__dirname, "chestport_steps.js"));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };

const CONFIG = { scoring_weights: { safety: 40, radiation: 20, renal: 20, technical: 20 } };
const VESSEL = { graph: { nodes: [{ id: "caj", fragility: 5, tortuosity: 1 }, { id: "rij_access", fragility: 3, tortuosity: 2 }, { id: "svc", fragility: 4, tortuosity: 1 }, { id: "right_bct", fragility: 4, tortuosity: 3 }] } };
const PTX = { name: "Pneumothorax", rate_high_pct: 1, rate_text: "~1%", citation_text: "[test]", rescue_actions: [{ action_id: "chest-tube", label: "Place a chest tube" }] };

function mk(opts) {
  opts = opts || {};
  const patient = { pmh: [], meds: [], coag: { platelets: opts.plt || 250 },
    renal: { contrastLimitMl: 100 }, labs: {}, seed: 1, __rng: () => (opts.roll != null ? opts.roll : 0.999) };
  return angio.create({ params: { fluoro_target_min: 3.0, base_payout: 1200, case_steps: STEPS },
    vesselMap: VESSEL, devices: [{ id: "port-catheter-8f", stiffness: 4, lubricity: 4 }],
    complications: opts.comps || [], patient, config: CONFIG, seed: 1, inventory: opts.inv || null });
}
// the 14-maneuver best path (each id is a taxonomy move)
const BEST = ["timeout", "sterile-prep", "ultrasound", "us-micropuncture", "advance-wire",
  "local-anesthesia", "blunt-pocket", "tunnel", "measure-trim", "place-sheath",
  "advance-cath", "connect-device", "aspirate", "dsa"];

t("14 granular steps; branches derive from case_steps[].outcomes (no STEP map)", () => {
  const e = mk();
  assert.strictEqual(STEPS.length, 14);
  const s1 = e.currentStep();
  assert.strictEqual(s1.n, 1);
  assert.deepStrictEqual(s1.choices.map(c => c.id), ["timeout"]);
  assert.ok(/Surgical time-out/.test(s1.choices[0].label));
  assert.strictEqual(s1.best, "timeout");
});

t("best taxonomy path scores a clean 100", () => {
  const e = mk();
  BEST.forEach(id => { const r = e.choose(id); assert.ok(!r.error && !r.emergency && !r.blocked, id); });
  assert.strictEqual(e.finish().total, 100);
});

t("a suboptimal-but-acceptable action proceeds and scores lower (landmark −3 technical)", () => {
  const best = mk(); BEST.forEach(id => best.choose(id));
  const lm = mk();
  BEST.map(id => id === "us-micropuncture" ? "landmark" : id).forEach(id => {
    const r = lm.choose(id); assert.ok(!r.error, id); assert.ok(!r.emergency, id + " should not fire at rng .999");
  });
  const sBest = best.finish(), sLm = lm.finish();
  assert.strictEqual(sBest.total, 100);
  assert.strictEqual(sLm.total, 97, "landmark's −3 technical shows up: " + JSON.stringify(sLm.breakdown));
  assert.ok(sLm.total < sBest.total, "suboptimal < best");
});

t("an unknown action proceeds via the step `default` and takes its penalty", () => {
  const e = mk();
  const r = e.choose("deploy-coil"); // not an outcome of step 1 (no taxonomy configured → no hard block)
  assert.ok(!r.error && !r.blocked, "proceeds, not blocked");
  assert.ok(/something else/.test(r.narrative), r.narrative);
  assert.ok(e.ledger.some(l => l.category === "technical" && l.delta === -3), "default penalty logged");
  assert.strictEqual(e.currentStep().n, 2, "advanced to the next step");
});

t("complication multiplier differs per action: landmark (×5) fires where US (×1) doesn't", () => {
  // roll = 0.03 → 3%. US eff = 1×1 = 1% (3 ≥ 1, no fire); landmark eff = 1×5 = 5% (3 < 5, fires).
  const pre = ["timeout", "sterile-prep", "ultrasound"];
  const eUs = mk({ comps: [PTX], roll: 0.03 });
  pre.forEach(id => eUs.choose(id));
  assert.ok(!eUs.choose("us-micropuncture").emergency, "US access should not trigger PTX at 3% roll");
  const eLm = mk({ comps: [PTX], roll: 0.03 });
  pre.forEach(id => eLm.choose(id));
  const r = eLm.choose("landmark");
  assert.ok(r.emergency && /Pneumothorax/.test(r.emergency.name), "landmark should trigger PTX");
  assert.ok(r.emergency.rescues.some(x => x.id === "chest-tube"), "CITED rescue offered");
});

t("proceed-and-penalize: platelets <20 pocket keeps going but logs the −10 violation", () => {
  const e = mk({ plt: 12 });
  ["timeout", "sterile-prep", "ultrasound", "us-micropuncture", "advance-wire", "local-anesthesia"].forEach(id => e.choose(id));
  const r = e.choose("blunt-pocket");
  assert.ok(!r.error, "pocket proceeds even with platelets 12");
  assert.ok(e.ledger.some(l => l.delta === -10 && /platelets 12/.test(l.reason)), "SIR-threshold violation scored");
});

t("skipped sheath precautions (step-10 default) arm the MODELED air embolism on delivery", () => {
  const e = mk({ roll: 0.03 }); // ifFlagEvent riskPct 60 → 3 < 60 fires
  ["timeout", "sterile-prep", "ultrasound", "us-micropuncture", "advance-wire",
   "local-anesthesia", "blunt-pocket", "tunnel", "measure-trim"].forEach(id => e.choose(id));
  const skip = e.choose("fluoro");                       // possible-but-wrong at the sheath step
  assert.ok(!skip.blocked && !skip.emergency, "sheath step default proceeds");
  const r = e.choose("advance-cath");
  assert.ok(r.emergency && /Air embolism/.test(r.emergency.name), "open sheath → air embolism: " + JSON.stringify(r));
  // and with proper technique the same roll is safe:
  const ok = mk({ roll: 0.03 });
  BEST.slice(0, 10).forEach(id => ok.choose(id));        // includes place-sheath
  assert.ok(!ok.choose("advance-cath").emergency, "no event when precautions were taken");
});

console.log("\nAll " + n + " engine-v2 tests passed — data-driven, taxonomy-keyed, proceed-and-penalize.");
