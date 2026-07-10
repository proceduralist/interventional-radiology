/* Bedside preop consult + location picker (jsdom).
   Spec coverage: the 4-option NPC menu (Perform / Order Lab Work / Recommend
   against / Come Back Later), missing-lab chart rendering, lab ordering with
   next-visit pending state, proceed-anyway confirmation on violations, the
   contraindication banner, and the room picker with the one-patient-per-room
   "You have a patient waiting" lock. Run with jsdom on NODE_PATH. */
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const PREOP = require(path.join(__dirname, "chestport_preop.js"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ir.test/" });
const win = dom.window;
const load = (f) => win.eval(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"));
load("ward.js"); load("ui.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };
const $$ = (s) => Array.from(win.document.querySelectorAll(s));
const click = (el) => { assert.ok(el, "clickable exists"); el.onclick ? el.onclick() : el.click(); };
const byText = (sel, re) => $$(sel).find(b => re.test(b.textContent));

const CONFIG = { lab_catalog: { labs: [
  { id: "inr", name: "INR", unit: "", normal: [0.9, 1.2], fixNote: "Anticoagulation held — INR rechecked." },
  { id: "ptt", name: "PTT", unit: "s", normal: [25, 35] },
  { id: "platelets", name: "Platelet count (CBC)", unit: "×10⁹/L", normal: [150, 400] },
] } };
const PROC = { title: "Chest port placement" };
const mkPatient = () => ({
  demographics: { age: 61, sex: "Female", weightKg: 70 },
  indication: "Breast cancer — long-term venous access",
  pmh: ["Hypertension"], meds: ["Chemotherapy regimen (per oncology)"],
  labs: { creatinine: { value: 0.9, unit: "mg/dL", flag: "" }, egfr: { value: 78, unit: "", flag: "" },
          platelets: { value: 240, unit: "×10⁹/L", flag: "" }, inr: { value: 1.0, unit: "", flag: "" },
          hemoglobin: { value: 12.5, unit: "g/dL", flag: "" } },
  coag: { platelets: 240, inr: 1.0, onAnticoagulant: false },
  renal: { egfr: 78, contrastLimitMl: 380, riskTier: "standard" },
  imagingNote: "Right IJ patent.", generatorName: "test-gen", seed: 42, dataClass: "TEST",
});

console.log("preop consult card");
t("shows the 4 spec options at a clean bedside", () => {
  const p = mkPatient();
  const rec = { seed: 42, procId: "chest-port", labOverrides: {}, pending: [], contra: null };
  const ev = win.IRWard.evalPreop(p, rec, PREOP);
  let performed = 0, later = 0;
  win.IRUI.Preop.show(p, PROC, ev, rec, { bedNo: 3, config: CONFIG,
    onPerform: () => performed++, onOrderLab: () => {}, onTurnDown: () => {}, onLater: () => later++ });
  assert.ok(byText("button", /Perform procedure/), "Perform Procedure");
  assert.ok(byText("button", /Order lab work/i), "Order Lab Work");
  assert.ok(byText("button", /Recommend against/), "Recommend against procedure");
  assert.ok(byText("button", /Come back later/i), "Come Back Later");
  assert.ok(/Medically optimized/.test(win.document.body.textContent), "clean banner");
  click(byText("button", /Perform procedure/));
  assert.strictEqual(performed, 1, "clean patient goes straight through (no confirm)");
  click(byText("button", /Come back later/i));
  assert.strictEqual(later, 1);
  win.IRUI.clear();
});

t("missing INR renders as not-on-file and violations force a proceed-anyway confirm", () => {
  const p = mkPatient();
  const rec = { seed: 1, procId: "chest-port", labOverrides: { inr: { missing: true } }, pending: [], contra: null };
  win.IRWard.applyOverrides(p, rec);
  const ev = win.IRWard.evalPreop(p, rec, PREOP);
  let performed = 0;
  win.IRUI.Preop.show(p, PROC, ev, rec, { bedNo: 1, config: CONFIG, onPerform: () => performed++, onOrderLab: () => {}, onTurnDown: () => {}, onLater: () => {} });
  assert.ok(/not on file/.test(win.document.body.textContent), "chart shows the gap");
  assert.ok(/Not yet optimized/.test(win.document.body.textContent), "warning banner");
  click(byText("button", /Perform procedure/));
  assert.strictEqual(performed, 0, "blocked behind the confirm");
  assert.ok(/Proceed against preop standards/.test(win.document.body.textContent), "confirm screen");
  assert.ok(/lose points/.test(win.document.body.textContent), "consequences spelled out");
  click(byText("button", /Proceed anyway/));
  assert.strictEqual(performed, 1, "spec: you can still perform it");
  win.IRUI.clear();
});

t("Order Lab Work lists the catalog; ordering marks it pending until the next visit", () => {
  const p = mkPatient();
  const rec = { seed: 1, procId: "chest-port", labOverrides: { inr: { value: 2.6 } }, pending: [], contra: null };
  win.IRWard.applyOverrides(p, rec);
  const ev = win.IRWard.evalPreop(p, rec, PREOP);
  win.IRUI.Preop.show(p, PROC, ev, rec, { bedNo: 1, config: CONFIG,
    onPerform: () => {}, onOrderLab: (id) => win.IRWard.orderLabs(rec, [id]), onTurnDown: () => {}, onLater: () => {} });
  click(byText("button", /Order lab work/i));
  assert.ok(byText("button", /INR/), "INR orderable");
  assert.ok(byText("button", /PTT/), "PTT orderable");
  assert.ok(byText("button", /Platelet count/), "CBC orderable");
  assert.ok(/current 2.6/.test(byText("button", /INR/).textContent), "shows the current deranged value");
  click(byText("button", /INR/));
  assert.deepStrictEqual(rec.pending, ["inr"], "pending recorded");
  assert.ok(/pending — results next visit/.test(byText("button", /INR/).textContent), "button flips to pending");
  click(byText("button", /Back to the bedside/));
  assert.ok(/Labs pending:/.test(win.document.body.textContent), "main card shows the pending badge");
  win.IRUI.clear();
});

t("contraindicated patient: red-flag chart note, decline framed as the right call", () => {
  const p = mkPatient();
  const rec = { seed: 1, procId: "chest-port", labOverrides: {}, pending: [], contra: PREOP.contraindications[0] };
  win.IRWard.applyOverrides(p, rec);
  const ev = win.IRWard.evalPreop(p, rec, PREOP);
  assert.ok(ev.shouldDecline, "ward says decline");
  let turned = 0;
  win.IRUI.Preop.show(p, PROC, ev, rec, { bedNo: 2, config: CONFIG, onPerform: () => {}, onOrderLab: () => {}, onTurnDown: () => turned++, onLater: () => {} });
  assert.ok(/blood culture bottles growing/.test(win.document.body.textContent), "EMR carries the contra flavor");
  assert.ok(/Unfixable contraindication/.test(win.document.body.textContent), "banner nudges the decline");
  click(byText("button", /Recommend against/));
  assert.ok(/Turning away an operable/.test(win.document.body.textContent) || /costs clout/.test(win.document.body.textContent), "confirm explains the stakes");
  click(byText("button", /discharge from the IR list/i));
  assert.strictEqual(turned, 1, "turn-down callback fired");
  win.IRUI.clear();
});

console.log("location picker (spec: room per procedure + one-patient-per-room lock)");
t("offers the 4 locations; an occupied room shows the waiting-patient message and blocks", () => {
  let picked = null;
  const rooms = { ir_suite: { procId: "chest-port" }, ct_suite: null, us_room: null };
  win.IRUI.LocationPick.show(PROC, rooms, { onPick: (l) => { picked = l; }, onBack: () => {} });
  ["IR Suite", "CT Suite", "Ultrasound Room", "Bedside"].forEach(lbl =>
    assert.ok(byText("button", new RegExp(lbl)), lbl + " offered"));
  click(byText("button", /IR Suite/));
  assert.strictEqual(picked, null, "occupied room refuses the booking");
  assert.ok(byText(".toast", /You have a patient waiting for you in the IR Suite!/), "spec message toast");
  click(byText("button", /CT Suite/));
  assert.strictEqual(picked, "ct_suite", "free room books");
  win.IRUI.clear();
});

console.log("\nAll " + n + " preop/location tests passed.");
