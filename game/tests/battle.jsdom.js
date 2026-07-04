/* Battle-screen Angio (jsdom) — the Pokémon-style command loop:
   root menu (Actions/Bag/Imaging/Notes), arming a tool from the Bag cart, arming
   imaging, the nested Actions taxonomy, proceed-and-penalize on a wrong maneuver,
   and a clean best-path run to debrief. Run: npm i jsdom, node game/tests/battle.jsdom.js */
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const STEPS = require(path.join(__dirname, "chestport_steps.js"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ir.test/" });
const win = dom.window;
const load = (f) => win.eval(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"));
load("engine.js"); load("econ.js"); load("ui.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };
const $$ = (s) => Array.from(win.document.querySelectorAll(s));
const click = (el) => { assert.ok(el, "clickable exists"); el.onclick ? el.onclick() : el.click(); };
const byText = (sel, re) => $$(sel).find(b => re.test(b.textContent));

const CONFIG = { scoring_weights: { safety: 40, radiation: 20, renal: 20, technical: 20 } };
const VESSEL = { graph: { nodes: [{ id: "caj", fragility: 5, tortuosity: 1 }, { id: "rij_access", fragility: 3, tortuosity: 2 }] } };
const DEVICES = [
  { id: "micropuncture-needle-21g", name: "21G micropuncture needle", device_class: "needle", status: "published" },
  { id: "mp-wire-018", name: "0.018 micropuncture wire", device_class: "micro_guidewire", status: "published" },
  { id: "transitional-dilator-5f", name: "4-5F transitional dilator", device_class: "other", status: "published" },
  { id: "bentson-035-145", name: "0.035 Bentson guidewire", device_class: "guidewire", status: "published" },
  { id: "peelaway-sheath-9f", name: "9F peel-away sheath", device_class: "sheath", status: "published" },
  { id: "port-catheter-8f", name: "8F chest port + catheter", device_class: "port", status: "published" },
  { id: "huber-needle-20g", name: "20G Huber needle", device_class: "needle", status: "published" },
];
const TAXONOMY = [
  { id: "access", name: "Access & sheath", moves: [["us-micropuncture", "US-guided micropuncture"], ["landmark-x", "Landmark puncture"], ["place-sheath", "Place vascular sheath"]] },
  { id: "imaging", name: "Imaging", moves: [["fluoro", "Fluoroscopy (spot)"], ["dsa", "DSA run"]] },
];
const INV = {}; ["micropuncture-needle-21g", "mp-wire-018", "transitional-dilator-5f", "bentson-035-145", "peelaway-sheath-9f", "port-catheter-8f", "huber-needle-20g"].forEach(id => INV[id] = true);
const patient = () => ({ pmh: [], meds: [], coag: { platelets: 250 }, renal: { contrastLimitMl: 100 }, labs: {}, seed: 1, __rng: () => 0.999 });
const PARAMS = { fluoro_target_min: 3.0, base_payout: 1200, case_steps: STEPS };

function startBattle(onFinish) {
  const engine = win.IRAngio.create({ params: PARAMS, vesselMap: VESSEL, devices: DEVICES, complications: [], patient: patient(), config: CONFIG, seed: 1, inventory: INV });
  win.IRUI.Angio.start(engine, { procedure: { title: "Chest port placement" }, params: PARAMS, patient: patient(), taxonomy: TAXONOMY, devices: DEVICES, inventory: INV }, { onFinish });
  return engine;
}
const openActions = () => click(byText(".bmenu .btn", /^Actions$/));

console.log("battle screen: menu, bag, imaging, actions");
let engine = startBattle(() => {});

t("root command menu shows Actions / Bag / Imaging / Notes over a patient scene", () => {
  assert.ok(win.document.querySelector(".card.battle .bscene .bsvg"), "patient + C-arm scene");
  assert.ok(win.document.querySelector(".bstatus .bbar i"), "patient stability bar (enemy HP)");
  ["Actions", "Bag", "Imaging", "Notes"].forEach(lbl => assert.ok(byText(".bmenu .btn", new RegExp("^" + lbl + "$")), lbl + " command"));
});

t("Bag opens the supply cart and arming a tool shows it on the command bar", () => {
  click(byText(".bmenu .btn", /^Bag$/));
  const slots = $$(".bcart .bslot");
  assert.strictEqual(slots.length, 7, "one slot per carried device");
  click(slots.find(s => /chest port/.test(s.title)));       // arm the port catheter
  click(byText(".bmenu .btn", /Back/));
  assert.ok(/Armed tool:.*chest port/i.test(win.document.querySelector(".barm").textContent), "armed tool shown");
});

t("Imaging arms ultrasound (and it is offered, not just fluoro)", () => {
  click(byText(".bmenu .btn", /^Imaging$/));
  assert.ok(byText(".btn.amove", /Ultrasound/), "ultrasound is an imaging option");
  click(byText(".btn.amove", /Ultrasound/));
  assert.ok(/Imaging:.*ultrasound/i.test(win.document.querySelector(".barm").textContent), "ultrasound armed");
});

t("Actions shows the step maneuvers AND the expansive nested taxonomy", () => {
  openActions();
  assert.ok(byText(".bcat-h", /This step/), "step group present");
  assert.ok(byText(".btn.amove", /Time-out/), "step maneuver reachable");
  assert.ok(byText(".btn.bcat", /Access & sheath/), "taxonomy category present");
  click(byText(".btn.bcat", /Access & sheath/));
  assert.ok(byText(".btn.amove", /US-guided micropuncture/), "nested moves listed");
  click(byText(".btn.ghost", /Back/));
});

t("a wrong maneuver from the taxonomy proceeds and takes the default penalty", () => {
  // at step 1; pick an unrelated move → step default (off-protocol) fires and advances
  click(byText(".btn.bcat", /Access & sheath/));
  click(byText(".btn.amove", /Place vascular sheath/));
  assert.strictEqual(engine.currentStep().n, 2, "advanced despite the wrong move");
  assert.ok(engine.ledger.some(l => l.category === "technical" && l.delta < 0), "penalty logged");
});

console.log("battle screen: clean best-path run");
t("selecting the best maneuver each step runs to a scored debrief", () => {
  let final = null;
  startBattle((s) => { final = s; });
  const move = (re) => { openActions(); click(byText(".btn.amove", re)); };
  move(/Time-out/); move(/US-guided micropuncture \(21G\)/); move(/Anesthetize/);
  move(/Measure against the wire/); move(/Valsalva/); move(/aspirate \+ flush/i); move(/DSA spot/);
  assert.ok(final, "onFinish fired");
  assert.strictEqual(final.total, 100, JSON.stringify(final.breakdown));
});

t("IRUI.Bag renders the overworld cart overlay", () => {
  let closed = false;
  win.IRUI.Bag.show({ inventory: INV, devices: DEVICES }, { onClose: () => { closed = true; win.IRUI.clear(); } });
  assert.ok(win.document.querySelector(".card.bagcard .bcart .bslot"), "cart slots render");
  click(byText(".bagcard .btn", /Close/));
  assert.ok(closed, "close fires");
});

console.log("\nAll " + n + " battle-screen tests passed.");
