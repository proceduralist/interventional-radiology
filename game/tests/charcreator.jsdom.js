/* Character-creator overlay (jsdom).
   Builds the creator, checks the option chips + name field + preview canvases
   render, that selecting a chip moves the ".on" state within its row, and that
   Start returns a normalized appearance reflecting the chosen options + name.
   Also checks the Cancel path used by the floor-6 wardrobe mirror.
   Run: npm i jsdom, node game/tests/charcreator.jsdom.js */
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");

// swallow the "getContext not implemented" jsdomError (no node-canvas installed)
const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM("<!doctype html><html><body></body></html>",
  { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ir.test/", virtualConsole: vc });
const win = dom.window;
const load = (f) => win.eval(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"));
load("appearance.js"); load("ui.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };
const $$ = (s) => Array.from(win.document.querySelectorAll(s));
const byText = (sel, re) => $$(sel).find((b) => re.test(b.textContent));
const click = (el) => { assert.ok(el, "clickable exists"); el.onclick(); };

t("renders option chips, name field, and two preview canvases", () => {
  win.IRUI.CharCreator.show({ appearance: { sex: 0, skin: 2, hair: 1, outfit: 1 }, name: "Dr. Test", onStart() {} });
  assert.ok($$(".cc-chip").length >= 12, "has option chips");
  assert.strictEqual($$(".cc-swatch").length, win.IRAppearance.SKIN.length, "one swatch per skin tone");
  assert.strictEqual(win.document.querySelector(".cc-namebox input").value, "Dr. Test", "name prefilled");
  assert.strictEqual($$("canvas.cc-canv").length, 2, "body + portrait canvases");
  assert.ok(byText(".btn", /Start|Enter|Save/), "has a start button");
  win.IRUI.clear();
});

t("default chip selection reflects the passed appearance", () => {
  win.IRUI.CharCreator.show({ appearance: { sex: 1, skin: 3, hair: 2, outfit: 2, glasses: true, beard: false }, onStart() {} });
  assert.ok(byText(".cc-chip", /^Female$/).classList.contains("on"), "Female selected");
  assert.ok(byText(".cc-chip", /^Black$/).classList.contains("on"), "Black hair selected");
  assert.ok(byText(".cc-chip", /^Business$/).classList.contains("on"), "Business selected");
  assert.ok(byText(".cc-chip", /^Glasses$/).classList.contains("on"), "Glasses selected");
  assert.ok(byText(".cc-chip", /^No beard$/).classList.contains("on"), "No beard selected");
  win.IRUI.clear();
});

t("selecting a chip moves the .on state within its row", () => {
  win.IRUI.CharCreator.show({ appearance: { sex: 0, skin: 0, hair: 0, outfit: 1 }, onStart() {} });
  const blond = byText(".cc-chip", /^Blond$/), black = byText(".cc-chip", /^Black$/);
  assert.ok(blond.classList.contains("on") && !black.classList.contains("on"), "starts on Blond");
  click(black);
  assert.ok(black.classList.contains("on") && !blond.classList.contains("on"), "selection moved to Black");
  win.IRUI.clear();
});

t("choosing chips + Start returns a normalized appearance", () => {
  let out = null;
  win.IRUI.CharCreator.show({ appearance: { sex: 0, skin: 0, hair: 0, outfit: 0, glasses: false, beard: false }, name: "", onStart(a) { out = a; } });
  click(byText(".cc-chip", /^Bald$/));
  click(byText(".cc-chip", /^Glasses$/));
  click(byText(".cc-chip", /^Beard$/));
  click(byText(".cc-chip", /^Business$/));
  click(byText(".cc-chip", /^Female$/));
  win.document.querySelector(".cc-namebox input").value = "  Vas Deferens  ";
  click(win.document.querySelector(".btn.primary"));
  assert.ok(out, "onStart fired");
  assert.strictEqual(out.hair, 3, "bald");
  assert.strictEqual(out.glasses, true, "glasses");
  assert.strictEqual(out.beard, true, "beard");
  assert.strictEqual(out.outfit, 2, "business");
  assert.strictEqual(out.sex, 1, "female");
  assert.strictEqual(out.name, "Vas Deferens", "name trimmed");
  win.IRUI.clear();
});

t("Cancel path fires onCancel (wardrobe mirror)", () => {
  let cancelled = false;
  win.IRUI.CharCreator.show({ appearance: {}, onStart() {}, onCancel() { cancelled = true; } });
  click(byText(".btn", /^Cancel$/));
  assert.ok(cancelled, "onCancel fired");
  win.IRUI.clear();
});

console.log("\nAll " + n + " character-creator tests passed.");
