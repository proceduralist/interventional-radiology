/* Engine v2 — data-driven interpreter (acceptable-set, proceed-and-penalize).
   Confirms: branches come from case_steps[].outcomes (no hardcoded STEP), a best
   action scores full, a suboptimal action proceeds but scores lower, an unknown
   action falls to the step `default`, and complication multipliers differ per action.
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
const BEST = ["timeout", "us", "pocket", "measure", "valsalva_gentle", "aspirate", "dsa"];

t("no STEP map: currentStep().choices are derived from case_steps[].outcomes", () => {
  const e = mk();
  const s1 = e.currentStep();
  assert.strictEqual(s1.n, 1);
  assert.deepStrictEqual(s1.choices.map(c => c.id), ["timeout", "skip"]);
  assert.ok(/Time-out/.test(s1.choices[0].label));
  assert.strictEqual(s1.best, "timeout");
});

t("best-action path scores a clean 100", () => {
  const e = mk();
  BEST.forEach(id => { const r = e.choose(id); assert.ok(!r.error && !r.emergency, id); });
  assert.strictEqual(e.finish().total, 100);
});

t("a suboptimal-but-acceptable action proceeds and scores lower (landmark −3 technical)", () => {
  const best = mk(); BEST.forEach(id => best.choose(id));
  const lm = mk();
  ["timeout", "landmark", "pocket", "measure", "valsalva_gentle", "aspirate", "dsa"].forEach(id => {
    const r = lm.choose(id); assert.ok(!r.error, id); assert.ok(!r.emergency, id + " should not fire at rng .999");
  });
  const sBest = best.finish(), sLm = lm.finish();
  assert.strictEqual(sBest.total, 100);
  assert.strictEqual(sLm.total, 97, "landmark's −3 technical shows up: " + JSON.stringify(sLm.breakdown));
  assert.ok(sLm.total < sBest.total, "suboptimal < best");
});

t("an unknown action proceeds via the step `default` and takes its penalty", () => {
  const e = mk();
  const r = e.choose("deploy-coil"); // not an outcome of step 1
  assert.ok(!r.error, "proceeds, not blocked");
  assert.ok(/something else/.test(r.narrative), r.narrative);
  assert.ok(e.ledger.some(l => l.category === "technical" && l.delta === -3), "default penalty logged");
  assert.strictEqual(e.currentStep().n, 2, "advanced to the next step");
});

t("complication multiplier differs per action: landmark (×5) fires where US (×1) doesn't", () => {
  // roll = 0.03 → 3%. US eff = 1×1 = 1% (3 ≥ 1, no fire); landmark eff = 1×5 = 5% (3 < 5, fires).
  const eUs = mk({ comps: [PTX], roll: 0.03 });
  eUs.choose("timeout");
  assert.ok(!eUs.choose("us").emergency, "US access should not trigger PTX at 3% roll");
  const eLm = mk({ comps: [PTX], roll: 0.03 });
  eLm.choose("timeout");
  const r = eLm.choose("landmark");
  assert.ok(r.emergency && /Pneumothorax/.test(r.emergency.name), "landmark should trigger PTX");
  assert.ok(r.emergency.rescues.some(x => x.id === "chest-tube"), "CITED rescue offered");
});

t("proceed-and-penalize: platelets <20 pocket keeps going but logs the −10 violation", () => {
  const e = mk({ plt: 12 });
  ["timeout", "us"].forEach(id => e.choose(id));
  const r = e.choose("pocket");
  assert.ok(!r.error, "pocket proceeds even with platelets 12");
  assert.ok(e.ledger.some(l => l.delta === -10 && /platelets 12/.test(l.reason)), "SIR-threshold violation scored");
});

console.log("\nAll " + n + " engine-v2 tests passed — data-driven, acceptable-set, proceed-and-penalize.");
