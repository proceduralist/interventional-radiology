/* Character appearance unit tests (pure Node, no jsdom).
   Covers: normalize clamping + name handling, idempotence, option-list sizes,
   and that bodyOps/portraitOps emit valid ops that respond to every choice
   (hair incl. bald, glasses, beard, outfit, sex, skin).
   Run: node game/tests/appearance.test.js */
"use strict";
const assert = require("assert");
const path = require("path");
const A = require(path.join(__dirname, "..", "js", "appearance.js"));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };
const bodyKey = (app) => JSON.stringify(A.bodyOps(app));
const validOps = (ops) => ops.forEach((o) => {
  assert.ok(typeof o.c === "number" && isFinite(o.c), "colour is a finite number");
  ["x", "y", "w", "h"].forEach((k) => assert.ok(typeof o[k] === "number" && isFinite(o[k]), k + " finite"));
  assert.ok(o.a == null || (o.a >= 0 && o.a <= 1), "alpha in range");
});

t("normalize clamps indices and coerces flags", () => {
  const hi = A.normalize({ sex: 9, skin: 99, hair: 99, outfit: 7, glasses: 1, beard: "yes" });
  assert.strictEqual(hi.sex, 1);
  assert.strictEqual(hi.skin, A.SKIN.length - 1);
  assert.strictEqual(hi.hair, A.HAIR.length - 1);
  assert.strictEqual(hi.outfit, A.OUTFITS.length - 1);
  assert.strictEqual(hi.glasses, true);
  assert.strictEqual(hi.beard, true);
  const lo = A.normalize({ sex: -3, skin: -4, hair: -1, outfit: -9, glasses: 0, beard: false });
  assert.deepStrictEqual([lo.sex, lo.skin, lo.hair, lo.outfit], [0, 0, 0, 0]);
  assert.strictEqual(lo.glasses, false);
});

t("normalize trims + caps the name, falls back when blank", () => {
  assert.strictEqual(A.normalize({ name: "   " }).name, A.DEFAULT.name);
  assert.strictEqual(A.normalize({ name: "  Dr. Vas  " }).name, "Dr. Vas");
  assert.strictEqual(A.normalize({ name: "x".repeat(50) }).name.length, 24);
  assert.strictEqual(A.normalize(undefined).name, A.DEFAULT.name);
});

t("normalize is idempotent", () => {
  const once = A.normalize({ sex: 1, skin: 5, hair: 2, outfit: 2, glasses: true, beard: true, name: "Kim" });
  assert.deepStrictEqual(A.normalize(once), once);
});

t("option lists match the palettes", () => {
  assert.strictEqual(A.OPTIONS.sex.length, 2);
  assert.strictEqual(A.OPTIONS.skin.length, A.SKIN.length);
  assert.strictEqual(A.OPTIONS.hair.length, A.HAIR.length);
  assert.strictEqual(A.OPTIONS.outfit.length, A.OUTFITS.length);
  assert.deepStrictEqual(A.OPTIONS.hair, ["Blond", "Brown", "Black", "Bald"]);
  assert.deepStrictEqual(A.OPTIONS.outfit, ["Lab coat", "Scrubs", "Business"]);
  assert.strictEqual(A.OPTIONS.glasses.length, 2);
  assert.strictEqual(A.OPTIONS.beard.length, 2);
});

t("every combination yields valid, non-empty ops", () => {
  let combos = 0;
  for (let sex = 0; sex < 2; sex++)
    for (let skin = 0; skin < A.SKIN.length; skin++)
      for (let hair = 0; hair < A.HAIR.length; hair++)
        for (let outfit = 0; outfit < A.OUTFITS.length; outfit++)
          for (let g = 0; g < 2; g++)
            for (let b = 0; b < 2; b++) {
              const app = { sex, skin, hair, outfit, glasses: !!g, beard: !!b };
              const bo = A.bodyOps(app), po = A.portraitOps(app);
              assert.ok(bo.length && po.length, "non-empty ops");
              validOps(bo); validOps(po);
              combos++;
            }
  assert.strictEqual(combos, 2 * A.SKIN.length * A.HAIR.length * A.OUTFITS.length * 2 * 2);
});

t("bald removes hair ops (fewer than a haired head)", () => {
  const base = { sex: 0, skin: 2, outfit: 1, glasses: false, beard: false };
  const bald = A.bodyOps(Object.assign({}, base, { hair: 3 }));
  const brown = A.bodyOps(Object.assign({}, base, { hair: 1 }));
  assert.ok(bald.length < brown.length, "bald sprite has fewer ops than a haired one");
});

t("glasses and beard each add ops", () => {
  const base = { sex: 0, skin: 2, hair: 1, outfit: 1 };
  const plain = A.portraitOps(Object.assign({}, base, { glasses: false, beard: false }));
  const specs = A.portraitOps(Object.assign({}, base, { glasses: true, beard: false }));
  const bearded = A.portraitOps(Object.assign({}, base, { glasses: false, beard: true }));
  assert.ok(specs.length > plain.length, "glasses add ops");
  assert.ok(bearded.length > plain.length, "beard adds ops");
});

t("outfit and sex change the sprite", () => {
  const base = { skin: 2, hair: 1, glasses: false, beard: false };
  const coat = bodyKey(Object.assign({}, base, { sex: 0, outfit: 0 }));
  const scrubs = bodyKey(Object.assign({}, base, { sex: 0, outfit: 1 }));
  const business = bodyKey(Object.assign({}, base, { sex: 0, outfit: 2 }));
  assert.ok(coat !== scrubs && scrubs !== business && coat !== business, "the three outfits differ");
  const male = bodyKey(Object.assign({}, base, { sex: 0, outfit: 1 }));
  const female = bodyKey(Object.assign({}, base, { sex: 1, outfit: 1 }));
  assert.ok(male !== female, "male and female sprites differ");
});

t("hexStr formats 6-digit hex", () => {
  assert.strictEqual(A.hexStr(0x2f9b8e), "#2f9b8e");
  assert.strictEqual(A.hexStr(0x000000), "#000000");
  assert.strictEqual(A.hexStr(0xffffff), "#ffffff");
});

console.log("\nAll " + n + " appearance tests passed.");
