/* Ward NPC / preop / progression unit tests (pure Node, no jsdom).
   Covers: XP→level ladder, level-gated spawning, the one-problem-per-patient
   spawn mix (contra / deranged / missing), order-labs → resolve-on-next-visit,
   preop evaluation (violations, penalties, risk mods, contra), turn-down
   outcomes, bed respawn timers, and the engine preop wiring (risk multipliers,
   ledger penalties, no-repeat complications).
   Run: node game/tests/ward.test.js */
"use strict";
const assert = require("assert");
const path = require("path");
const Ward = require(path.join(__dirname, "..", "js", "ward.js"));
const Angio = require(path.join(__dirname, "..", "js", "engine.js"));
const STEPS = require(path.join(__dirname, "chestport_steps.js"));
const PREOP = require(path.join(__dirname, "chestport_preop.js"));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };
// deterministic rnd from a queue (falls back to 0.5)
const seq = (vals) => { let i = 0; return () => (i < vals.length ? vals[i++] : 0.5); };

const CONFIG = {
  progression: {
    levels: [{ level: 1, xp: 0, title: "PGY-2" }, { level: 2, xp: 120, title: "PGY-4" }, { level: 3, xp: 300, title: "Fellow" }],
    xp_per_score_pct: 0.5, turn_down_xp: 10, turn_down_clout: 5, wrong_turn_down_clout: -10,
    fail_clout: { bailed: -5, takeover: -5, kicked: -3 },
  },
  ward: { beds: 6, respawn_min_s: 120, respawn_max_s: 300, p_contra: 0.12, p_deranged: 0.4, p_missing: 0.22 },
  lab_catalog: { labs: [
    { id: "inr", name: "INR", unit: "", normal: [0.9, 1.2], fixNote: "Anticoagulation held — INR rechecked." },
    { id: "platelets", name: "Platelet count (CBC)", unit: "×10⁹/L", normal: [150, 400], fixNote: "Platelets transfused." },
    { id: "ptt", name: "PTT", unit: "s", normal: [25, 35] },
  ] },
};
const CASES = [
  { id: "chest-port", title: "Chest port", min_level: 1, location: "ir_suite", complexity: 1 },
  { id: "uterine-fibroid-embolization", title: "UFE", min_level: 2, location: "ir_suite", complexity: 4 },
];
const PREOPS = { "chest-port": PREOP, "uterine-fibroid-embolization": PREOP };

console.log("progression ladder");
t("levelFor walks the XP thresholds and reports the next rung", () => {
  assert.strictEqual(Ward.levelFor(CONFIG, 0).level, 1);
  assert.strictEqual(Ward.levelFor(CONFIG, 119).level, 1);
  assert.strictEqual(Ward.levelFor(CONFIG, 120).level, 2);
  assert.strictEqual(Ward.levelFor(CONFIG, 9999).level, 3);
  assert.strictEqual(Ward.levelFor(CONFIG, 0).next.xp, 120);
  assert.strictEqual(Ward.levelFor(CONFIG, 9999).next, null);
});
t("xpForScore = round(score × 0.5) (DESIGN)", () => {
  assert.strictEqual(Ward.xpForScore(CONFIG, 100), 50);
  assert.strictEqual(Ward.xpForScore(CONFIG, 87), 44);
  assert.strictEqual(Ward.xpForScore(CONFIG, 0), 0);
});

console.log("level-gated spawning (spec: no NPC above your level)");
t("level 1 never spawns the min_level-2 procedure; level 2 can", () => {
  assert.deepStrictEqual(Ward.eligibleCases(CASES, 1).map(c => c.id), ["chest-port"]);
  assert.deepStrictEqual(Ward.eligibleCases(CASES, 2).map(c => c.id), CASES.map(c => c.id));
  for (let k = 0; k < 40; k++) {
    const rec = Ward.spawnPatient(CASES, CONFIG, 1, Math.random, 0, PREOPS);
    assert.strictEqual(rec.procId, "chest-port");
  }
});
t("spawn mix: contra / deranged / missing / clean branches are all reachable", () => {
  // rnd order: casePick, problemRoll, [poolPick, valueRoll…], seed uses rnd too:
  // spawnPatient: elig pick, seed, problem roll, …
  const contra = Ward.spawnPatient(CASES, CONFIG, 1, seq([0, 0.5, 0.05, 0.4]), 0, PREOPS);
  assert.ok(contra.contra, "contra patient");
  assert.ok(contra.contra.emr.length > 10, "contra carries chart flavor");
  const der = Ward.spawnPatient(CASES, CONFIG, 1, seq([0, 0.5, 0.3, 0.0, 0.5]), 0, PREOPS);
  assert.ok(!der.contra && Object.keys(der.labOverrides).length === 1, "one deranged lab");
  const missing = Ward.spawnPatient(CASES, CONFIG, 1, seq([0, 0.5, 0.6, 0.0]), 0, PREOPS);
  const mkey = Object.keys(missing.labOverrides)[0];
  assert.ok(missing.labOverrides[mkey].missing, "missing lab");
  const clean = Ward.spawnPatient(CASES, CONFIG, 1, seq([0, 0.5, 0.99]), 0, PREOPS);
  assert.ok(!clean.contra && Object.keys(clean.labOverrides).length === 0, "clean patient");
});

console.log("order labs → results on the NEXT visit (spec)");
const mkPatient = () => ({
  pmh: [], meds: [],
  labs: { inr: { value: 1.0, unit: "", flag: "" }, platelets: { value: 220, unit: "×10⁹/L", flag: "" },
          creatinine: { value: 1.0 }, egfr: { value: 90 }, hemoglobin: { value: 13 } },
  coag: { platelets: 220, inr: 1.0, onAnticoagulant: false },
  renal: { egfr: 90, contrastLimitMl: 300, riskTier: "standard" },
});
t("deranged INR: violation before; ordered → corrected on next interaction; violation clears", () => {
  const rec = { seed: 1, procId: "chest-port", labOverrides: { inr: { value: 2.4 } }, pending: [], contra: null };
  const p1 = mkPatient(); Ward.applyOverrides(p1, rec);
  assert.strictEqual(p1.labs.inr.value, 2.4);
  const ev1 = Ward.evalPreop(p1, rec, PREOP);
  assert.strictEqual(ev1.violations.length, 1, "INR violation flagged");
  assert.ok(ev1.penalties.some(x => x.delta === -6), "CITED −6 penalty queued");
  assert.ok(ev1.riskMods.some(r => /hematoma/.test(r.match) && r.mult === 3), "bleeding risk ×3 queued");
  Ward.orderLabs(rec, ["inr"]);
  assert.deepStrictEqual(rec.pending, ["inr"]);
  const notes = Ward.resolvePending(rec, PREOP, CONFIG, seq([0.5, 0.5]));
  assert.ok(/INR/.test(notes[0].name) && /recheck/i.test(notes[0].note), "fix note surfaced");
  const p2 = mkPatient(); Ward.applyOverrides(p2, rec);
  assert.ok(p2.labs.inr.value <= 1.2 && p2.labs.inr.value >= 0.9, "INR corrected into range, got " + p2.labs.inr.value);
  assert.strictEqual(Ward.evalPreop(p2, rec, PREOP).violations.length, 0, "optimized");
});
t("missing required INR: violation; order → appears (can come back high and need re-order)", () => {
  const rec = { seed: 1, procId: "chest-port", labOverrides: { inr: { missing: true } }, pending: [], contra: null };
  const p1 = mkPatient(); Ward.applyOverrides(p1, rec);
  assert.ok(p1.labs.inr.missing, "chart shows not-on-file");
  const ev1 = Ward.evalPreop(p1, rec, PREOP);
  assert.ok(ev1.penalties.some(x => x.delta === -4), "missing-INR penalty (−4) queued");
  // 30% branch: resulted abnormal (rnd < .3) → still deranged, must re-order
  Ward.orderLabs(rec, ["inr"]);
  Ward.resolvePending(rec, PREOP, CONFIG, seq([0.1, 0.5]));
  assert.ok(rec.labOverrides.inr.value > 1.5, "resulted high");
  // re-order: deranged → corrected
  Ward.orderLabs(rec, ["inr"]);
  Ward.resolvePending(rec, PREOP, CONFIG, seq([0.5]));
  assert.ok(rec.labOverrides.inr.value <= 1.2, "second order normalizes");
});
t("PTT rule only applies to anticoagulated patients (onlyIf)", () => {
  const rec = { seed: 1, procId: "chest-port", labOverrides: { ptt: { value: 80 } }, pending: [], contra: null };
  const pOff = mkPatient(); Ward.applyOverrides(pOff, rec);
  assert.strictEqual(Ward.evalPreop(pOff, rec, PREOP).violations.length, 0, "no PTT flag off heparin");
  const pOn = mkPatient(); pOn.coag.onAnticoagulant = true; Ward.applyOverrides(pOn, rec);
  assert.strictEqual(Ward.evalPreop(pOn, rec, PREOP).violations.length, 1, "PTT flagged on heparin");
});

console.log("turn-down (spec: clout loss for refusing an operable case)");
t("declining a contraindicated case pays clout+XP; declining a fixable one costs clout", () => {
  const save1 = { clout: 20, xp: 0 };
  const good = Ward.turnDown(save1, { contra: PREOP.contraindications[0] }, CONFIG);
  assert.ok(good.correct && save1.clout === 25 && save1.xp === 10);
  const save2 = { clout: 20, xp: 0 };
  const bad = Ward.turnDown(save2, { contra: null, labOverrides: { inr: { value: 2.2 } } }, CONFIG);
  assert.ok(!bad.correct && save2.clout === 10 && save2.xp === 0);
});

console.log("beds: fill, clear, compressed respawn window");
t("ensureWard fills all 6 beds and initializes rooms/xp", () => {
  const save = {};
  const changed = Ward.ensureWard(save, CASES, CONFIG, 1000, Math.random, PREOPS);
  assert.strictEqual(changed.length, 6);
  assert.strictEqual(save.ward.beds.filter(b => b.seed).length, 6);
  assert.deepStrictEqual(Object.keys(save.rooms).sort(), ["ct_suite", "ir_suite", "us_room"]);
  assert.strictEqual(save.xp, 0);
});
t("clearBed respawns within the 2–5 min window; refill only when due", () => {
  const save = {};
  Ward.ensureWard(save, CASES, CONFIG, 1000, Math.random, PREOPS);
  Ward.clearBed(save, 2, CONFIG, 1000, seq([0.5]));
  const until = save.ward.beds[2].emptyUntil;
  assert.ok(until >= 1000 + 120000 && until <= 1000 + 300000, "respawn in [2min,5min], got +" + (until - 1000) / 1000 + "s");
  assert.deepStrictEqual(Ward.ensureWard(save, CASES, CONFIG, until - 1, Math.random, PREOPS), [], "not due → stays empty");
  assert.ok(!save.ward.beds[2].seed, "still empty");
  assert.deepStrictEqual(Ward.ensureWard(save, CASES, CONFIG, until + 1, Math.random, PREOPS), [2], "due → refilled");
  assert.ok(save.ward.beds[2].seed, "new NPC in the bed");
});

console.log("engine wiring: preop penalties, risk multipliers, no-repeat complications");
const DEVICES = ["micropuncture-needle-21g", "mp-wire-018", "transitional-dilator-5f", "bentson-035-145", "peelaway-sheath-9f", "port-catheter-8f", "huber-needle-20g"]
  .map(id => ({ id, name: id, device_class: "other", status: "published" }));
const INV = {}; DEVICES.forEach(d => INV[d.id] = true);
const COMPS = [{ name: "Pocket hematoma", rate_high_pct: 4, rate_text: "", citation_text: "test", rescue_actions: [{ action_id: "evac", label: "Evacuate + pressure" }] }];
const engCfg = (preop, rngVals) => ({
  params: { fluoro_target_min: 3, base_payout: 1200, case_steps: STEPS },
  vesselMap: { graph: { nodes: [{ id: "caj", fragility: 5 }] } },
  devices: DEVICES, complications: COMPS, config: { scoring_weights: { safety: 40, radiation: 20, renal: 20, technical: 20 } },
  inventory: INV, preop,
  patient: { pmh: [], coag: { platelets: 250, inr: 2.4 }, renal: { contrastLimitMl: 300 }, labs: {}, seed: 7, __rng: seq(rngVals || []) },
});
const BEST14 = ["timeout", "sterile-prep", "ultrasound", "us-micropuncture", "advance-wire",
  "local-anesthesia", "blunt-pocket", "tunnel", "measure-trim", "place-sheath",
  "advance-cath", "connect-device", "aspirate", "dsa"];
const TO_POCKET = BEST14.slice(0, 6); // through local-anesthesia; next act = blunt-pocket
t("preop penalties land in the ledger and reduce the final score", () => {
  const eng = Angio.create(engCfg({ penalties: [{ cat: "safety", delta: -6, reason: "INR 2.4 uncorrected", cite: "[1]" }], riskMods: [], postop: ["POD 2: pocket hematoma drained."] },
    Array(20).fill(0.99)));
  assert.ok(eng.ledger.some(l => /INR 2.4/.test(l.reason)), "penalty pre-logged");
  BEST14.forEach(a => eng.act(a));
  const fin = eng.finish();
  assert.strictEqual(fin.breakdown.safety, 34, "40 − 6 preop penalty");
  assert.deepStrictEqual(fin.postopNotes, ["POD 2: pocket hematoma drained."], "post-op note carried to the debrief");
});
t("preop risk multiplier drives the roll; a resolved complication never re-fires (spec)", () => {
  // Huge mult ⇒ effective incidence ≥100% ⇒ pocket step MUST fire the hematoma.
  const eng = Angio.create(engCfg({ penalties: [], riskMods: [{ match: "hematoma|bleed", mult: 1000 }], postop: [] }, Array(10).fill(0.99)));
  TO_POCKET.forEach(a => eng.act(a));
  const r = eng.act("blunt-pocket");
  assert.ok(r.emergency && /hematoma/i.test(r.emergency.name), "bleeding emergency fired via preop risk");
  assert.ok(eng.ledger.some(l => /×1000 preop risk/.test(l.reason)), "roll annotated with the preop multiplier");
  eng.resolveEmergency("evac");
  assert.ok(eng.firedComps["Pocket hematoma"], "complication recorded as fired");
  const eng2 = Angio.create(engCfg({ penalties: [], riskMods: [{ match: "hematoma", mult: 1000 }], postop: [] }, Array(10).fill(0.99)));
  eng2.firedComps["Pocket hematoma"] = true; // simulate already-resolved
  TO_POCKET.forEach(a => eng2.act(a));
  const r2 = eng2.act("blunt-pocket");
  assert.ok(!r2.emergency, "no second identical emergency in one case");
});

console.log("\nAll " + n + " ward/preop tests passed.");
