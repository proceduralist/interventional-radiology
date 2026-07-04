/* EMR (bedside scrub-in) buttons (jsdom): the ward screen must offer a bail-out
   ("Leave — don't scrub in") and a "View bag" option alongside Scrub in / Next patient.
   Run: npm i jsdom, node game/tests/emr.jsdom.js */
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { JSDOM } = require("jsdom");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ir.test/" });
const win = dom.window;
win.eval(fs.readFileSync(path.join(__dirname, "..", "js", "ui.js"), "utf8"));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };
const $$ = (s) => Array.from(win.document.querySelectorAll(s));
const byText = (re) => $$(".btn").find(b => re.test(b.textContent));
const click = (el) => { assert.ok(el, "clickable exists"); el.onclick(); };

function patient(canProceed) {
  return {
    demographics: { age: 57, sex: "F", weightKg: 74 }, indication: "Chemotherapy port access",
    pmh: ["Breast cancer"], meds: ["None"],
    labs: { creatinine: { value: 0.9, unit: "mg/dL", flag: "" }, egfr: { value: 88, unit: "mL/min", flag: "" },
      platelets: { value: canProceed ? 210 : 12, unit: "x10^9/L", flag: canProceed ? "" : "L" }, inr: { value: 1.1, flag: "" }, hemoglobin: { value: 12, unit: "g/dL", flag: "" } },
    renal: { egfr: 88, riskTier: "standard", contrastLimitMl: 100 }, imagingNote: "CT chest: no central stenosis.",
    canProceed: canProceed, warnings: [], violationsIfProceed: canProceed ? [] : [{ text: "Platelets 12 < 20 — correct first.", cite: "SIR 2019" }],
    generatorName: "test-gen", seed: 7, dataClass: "MODELED",
  };
}

t("scrub-in screen offers Leave and View bag next to Scrub in / Next patient", () => {
  let cancelled = false, viewedBag = false;
  win.IRUI.EMR.show(patient(true), { title: "Chest port placement" }, {
    onReroll: () => {}, onOrderCorrection: () => {}, onProceed: () => {},
    onCancel: () => { cancelled = true; }, onViewBag: () => { viewedBag = true; },
  });
  assert.ok(byText(/Scrub in/), "scrub in present");
  assert.ok(byText(/Next patient/), "reroll present");
  assert.ok(byText(/View bag/), "view bag present");
  assert.ok(byText(/Leave/), "bail-out present");
  click(byText(/View bag/)); assert.ok(viewedBag, "View bag fires onViewBag");
  click(byText(/Leave/)); assert.ok(cancelled, "Leave fires onCancel");
});

t("Leave and View bag are available even when the case is blocked (labs out of range)", () => {
  let cancelled = false;
  win.IRUI.EMR.show(patient(false), { title: "Chest port placement" }, {
    onReroll: () => {}, onOrderCorrection: () => {}, onProceed: () => {},
    onCancel: () => { cancelled = true; }, onViewBag: () => {},
  });
  assert.ok(!byText(/Scrub in/), "cannot scrub in when blocked");
  assert.ok(byText(/Order platelet transfusion/), "correction offered");
  assert.ok(byText(/View bag/) && byText(/Leave/), "bag + bail-out still offered");
  click(byText(/Leave/)); assert.ok(cancelled, "can bail out of a blocked case");
});

console.log("\nAll " + n + " EMR scrub-in tests passed.");
