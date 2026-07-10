/* Battle-screen Angio (jsdom) — the Pokémon-style command loop:
   root menu (Actions/Bag/Imaging/Ask For Help/Leave Procedure), arming a tool,
   imaging, nested Actions taxonomy, proceed-and-penalize on possible-but-wrong
   maneuvers, the attending hard-block escalation (5 strikes → takeover), the
   hint cap (>5 → kicked), Leave Procedure, and a clean best-path run.
   Run: npm i jsdom, node game/tests/battle.jsdom.js */
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

const CONFIG = {
  scoring_weights: { safety: 40, radiation: 20, renal: 20, technical: 20 },
  // the REAL taxonomy fixture (mirrored to the DB) — the Actions menu is only this
  action_taxonomy: require(path.join(__dirname, "action_taxonomy.js")),
  attending_dialogue: { strike_cap: 5, hint_cap: 5,
    blocked: ["Excuse me lad, but aren't you missing a step?", "Think.", "You cannot do that yet.", "Stop.", "You clearly need to read a book. I am taking over this case."],
    kicked: "That's five hints. Scrub out and go read." },
};
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
const TAXONOMY = CONFIG.action_taxonomy.categories;
const INV = {}; ["micropuncture-needle-21g", "mp-wire-018", "transitional-dilator-5f", "bentson-035-145", "peelaway-sheath-9f", "port-catheter-8f", "huber-needle-20g"].forEach(id => INV[id] = true);
const patient = () => ({ pmh: [], meds: [], coag: { platelets: 250 }, renal: { contrastLimitMl: 100 }, labs: {}, seed: 1, __rng: () => 0.999 });
const PARAMS = { fluoro_target_min: 3.0, base_payout: 1200, case_steps: STEPS };

function startBattle(onFinish, ctxExtra) {
  const engine = win.IRAngio.create({ params: PARAMS, vesselMap: VESSEL, devices: DEVICES, complications: [], patient: patient(), config: CONFIG, seed: 1, inventory: INV });
  win.IRUI.Angio.start(engine, Object.assign({ procedure: { title: "Chest port placement" }, params: PARAMS, patient: patient(), config: CONFIG, taxonomy: TAXONOMY, devices: DEVICES, inventory: INV }, ctxExtra || {}), { onFinish });
  return engine;
}
const openActions = () => click(byText(".bmenu .btn", /^Actions$/));
const pick = (catRe, moveRe) => { openActions(); click(byText(".btn.bcat", catRe)); click(byText(".btn.amove", moveRe)); };

console.log("battle screen: menu, bag, actions (taxonomy-only)");
let engine = startBattle(() => {});

t("root command menu is exactly Actions / Bag / Ask For Help / Leave Procedure (spec)", () => {
  assert.ok(win.document.querySelector(".card.battle .bscene .bsvg"), "patient + C-arm scene");
  assert.ok(win.document.querySelector(".bstatus .bbar i"), "patient stability bar (enemy HP, top-right)");
  assert.ok(win.document.querySelector(".bscene .bequip"), "equipped-item hub (top-left)");
  assert.ok(win.document.querySelector(".bscene .bcase .bmeters"), "fluoro/DAP/contrast hub (bottom-left)");
  ["Actions", "Bag", "Ask For Help", "Leave Procedure"].forEach(lbl => assert.ok(byText(".bmenu .btn", new RegExp("^" + lbl + "$")), lbl + " command"));
  assert.ok(!byText(".bmenu .btn", /^Imaging$/), "Imaging is NOT a root command — it lives inside Actions");
});

t("Actions gives NO answers away: only taxonomy categories, no per-step move list", () => {
  openActions();
  assert.ok(!$$(".bcat-h").some(h => /This step/i.test(h.textContent)), "no 'This step' give-away header");
  assert.strictEqual($$(".btn.amove").length, 0, "no moves visible until a category is opened");
  assert.strictEqual($$(".btn.bcat").length, 12, "all 12 taxonomy categories listed");
  click(byText(".btn.bcat", /Procedure control/));
  assert.ok(byText(".btn.amove", /^Time-out$/), "moves appear only inside their category");
  click(byText(".btn.ghost", /Back/)); click(byText(".btn.ghost", /Back/));
});

t("Bag opens the supply cart and arming a tool shows it in the equip hub", () => {
  click(byText(".bmenu .btn", /^Bag$/));
  const slots = $$(".bcart .bslot");
  assert.strictEqual(slots.length, 7, "one slot per carried device");
  click(slots.find(s => /chest port/.test(s.title)));       // arm the port catheter
  click(byText(".bmenu .btn", /Back/));
  assert.ok(/chest port/i.test(win.document.querySelector(".bequip").textContent), "armed tool shown top-left");
});

t("imaging maneuvers (incl. ultrasound) live under Actions → Imaging", () => {
  openActions();
  click(byText(".btn.bcat", /^Imaging/));
  assert.ok(byText(".btn.amove", /^Ultrasound$/), "ultrasound is an Actions move");
  assert.ok(byText(".btn.amove", /DSA run/), "DSA run is an Actions move");
  click(byText(".btn.ghost", /Back/)); click(byText(".btn.ghost", /Back/));
});

t("a possible-but-wrong maneuver proceeds and takes the default penalty", () => {
  // at step 1; a DSA run is physically possible (not in step.blocked) → default fires, advances
  pick(/^Imaging/, /DSA run/);
  assert.strictEqual(engine.currentStep().n, 2, "advanced despite the wrong move");
  assert.ok(engine.ledger.some(l => l.category === "technical" && l.delta < 0), "penalty logged");
});

console.log("battle screen: attending hard-blocks, hints, leave");
t("a physically impossible maneuver is BLOCKED: attending pokes in, no advance", () => {
  engine = startBattle(() => {});
  pick(/Access & sheath/, /Place vascular sheath/); // step 1 blocked list (exact id)
  assert.strictEqual(engine.currentStep().n, 1, "did NOT advance");
  assert.strictEqual(engine.state().strikes, 1, "strike counted");
  assert.ok(win.document.querySelector(".bscene .attn .attn-bubble"), "attending appears in the scene");
  assert.ok(/missing a step/i.test(win.document.querySelector(".attn-bubble").textContent), "first escalation line");
});

t("five impossible maneuvers → the attending takes over; case fails with 0 points", () => {
  let final = null;
  engine = startBattle((s) => { final = s; });
  for (let k = 0; k < 5; k++) {
    pick(/^Wire ›/, /Advance guidewire/); // cat:wire blocked at step 1
    if (final) break;
  }
  assert.ok(final, "onFinish fired on takeover");
  assert.strictEqual(final.failed, "takeover");
  assert.strictEqual(final.total, 0, "no points (spec)");
});

t("Ask For Help shows an attending hint; the 6th ask kicks you out (0 points)", () => {
  let final = null;
  engine = startBattle((s) => { final = s; });
  click(byText(".bmenu .btn", /^Ask For Help$/));
  assert.ok(/Hint 1\/5/.test(win.document.querySelector(".attn-bubble").textContent), "hint counter shown");
  assert.ok(engine.state().hints === 1, "engine tracked the hint");
  for (let k = 0; k < 5; k++) { if (final) break; click(byText(".bmenu .btn", /^Ask For Help$/)); }
  assert.ok(final, "kicked out fires finish");
  assert.strictEqual(final.failed, "kicked");
  assert.strictEqual(final.total, 0);
});

t("Leave Procedure bails the case: failed, 0 points", () => {
  let final = null;
  engine = startBattle((s) => { final = s; });
  click(byText(".bmenu .btn", /^Leave Procedure$/));
  click(byText(".btn.amove", /accept the failure/i));
  assert.ok(final, "finish fired");
  assert.strictEqual(final.failed, "bailed");
  assert.strictEqual(final.total, 0);
});

t("per-location backdrops render (bedside shows a ward room, CT shows a gantry)", () => {
  startBattle(() => {}, { location: "bedside" });
  assert.ok(/Bedside — /.test(win.document.querySelector(".bh").textContent), "bedside header");
  const svgBed = win.document.querySelector(".bsvg").innerHTML;
  startBattle(() => {}, { location: "ct_suite" });
  assert.ok(/CT Suite — /.test(win.document.querySelector(".bh").textContent), "CT header");
  assert.notStrictEqual(win.document.querySelector(".bsvg").innerHTML, svgBed, "distinct scenes");
});

console.log("battle screen: clean best-path run (14 taxonomy maneuvers)");
t("finding the right maneuver in the taxonomy each step runs to a 100 debrief", () => {
  let final = null;
  startBattle((s) => { final = s; });
  [[/Procedure control/, /^Time-out$/],
   [/Surgical/, /Chlorhexidine prep/],
   [/^Imaging/, /^Ultrasound$/],
   [/Access & sheath/, /Ultrasound-guided micropuncture/],
   [/^Wire ›/, /Advance guidewire/],
   [/Surgical/, /Infiltrate local anesthetic/],
   [/Surgical/, /Blunt-dissect a device pocket/],
   [/Surgical/, /Tunnel the catheter/],
   [/Surgical/, /Measure & trim to length/],
   [/Access & sheath/, /Place vascular sheath/],
   [/Catheter \/ micro/, /^Advance catheter$/],
   [/Surgical/, /Assemble \/ connect the device/],
   [/Catheter \/ micro/, /^Aspirate$/],
   [/^Imaging/, /DSA run/]].forEach(([c, m]) => pick(c, m));
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
