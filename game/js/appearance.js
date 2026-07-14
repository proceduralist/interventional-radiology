/* IR RPG — character appearance.
   Single source of truth for the player's look: the option palettes plus two
   pure pixel-art "op list" generators used by BOTH renderers —
     • world.js paints them with a Phaser Graphics object → the t_player texture
     • ui.js (CharCreator) paints them onto a <canvas> for the live preview
   so the sprite you build is exactly the sprite you play. Pure + Node-testable.

   Options (Ryan, 2026-07-13): a male or female resident; outfit = lab coat /
   scrubs / business attire; glasses on/off; hair blond / brown / black / bald;
   beard on/off; plus a skin tone. Exposes window.IRAppearance. */
(function (root) {
  "use strict";

  // --- palettes -----------------------------------------------------------
  const SKIN = [0xf6d5b5, 0xecc0a0, 0xd9a878, 0xc08a5e, 0x9a6a44, 0x6d4a30];
  // hair: blond / brown / black / bald (bald = no hair)
  const HAIR = [
    { id: "blond", label: "Blond", c: 0xe6c463, dark: 0xc59a3c },
    { id: "brown", label: "Brown", c: 0x6b4423, dark: 0x4a2e17 },
    { id: "black", label: "Black", c: 0x211d25, dark: 0x100e13 },
    { id: "bald",  label: "Bald",  c: null,     dark: null },
  ];
  const OUTFITS = [
    { id: "labcoat", label: "Lab coat",
      coat: 0xf1f3f6, coatShade: 0xd2d8df, inner: 0x2f9096, pants: 0x2f6f7d, shoes: 0xe7ebef },
    { id: "scrubs", label: "Scrubs",
      top: 0x2f9b8e, topShade: 0x24796f, pants: 0x287a70, shoes: 0xe7ebef },
    { id: "business", label: "Business",
      blazer: 0x2a3450, blazerShade: 0x1d2740, shirt: 0xdfe6f0, tie: 0x8a2f3a, pants: 0x232a3d, shoes: 0x2a1c14 },
  ];

  const DEFAULT = { name: "Scrubby Resident", sex: 0, skin: 2, hair: 1, outfit: 1, glasses: false, beard: false };

  // --- helpers ------------------------------------------------------------
  function clampi(v, max) { v = (v | 0); return v < 0 ? 0 : (v > max ? max : v); }
  function shade(hex, amt) { // amt in ~[-100,100]
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt / 100) * 255)));
    return (f(r) << 16) | (f(g) << 8) | f(b);
  }
  function hexStr(n) { return "#" + ("000000" + ((n >>> 0) & 0xffffff).toString(16)).slice(-6); }

  function normalize(a) {
    a = a || {};
    const name = (typeof a.name === "string" && a.name.trim()) ? a.name.trim().slice(0, 24) : DEFAULT.name;
    return {
      name: name,
      sex: clampi(a.sex, 1),
      skin: clampi(a.skin == null ? DEFAULT.skin : a.skin, SKIN.length - 1),
      hair: clampi(a.hair == null ? DEFAULT.hair : a.hair, HAIR.length - 1),
      outfit: clampi(a.outfit == null ? DEFAULT.outfit : a.outfit, OUTFITS.length - 1),
      glasses: !!a.glasses,
      beard: !!a.beard,
    };
  }

  // --- world sprite: 20×28, matches the original t_player frame/feet math ---
  function bodyOps(app) {
    app = normalize(app);
    const sk = SKIN[app.skin], skD = shade(sk, -16);
    const H = HAIR[app.hair], O = OUTFITS[app.outfit];
    const female = app.sex === 1;
    const ops = [];
    const R = (c, x, y, w, h, a) => ops.push({ c: c, x: x, y: y, w: w, h: h, a: a == null ? 1 : a });

    R(0x000000, 10, 26, 15, 5, 0.28); ops[ops.length - 1].shape = "ellipse"; // shadow
    const lx = female ? [6, 10] : [5, 11];
    R(O.pants, lx[0], 19, 4, 6); R(O.pants, lx[1], 19, 4, 6);                 // legs
    R(O.shoes, lx[0], 25, 4, 2); R(O.shoes, lx[1], 25, 4, 2);                 // shoes

    const tX = female ? 5 : 4, tW = female ? 10 : 12;                          // torso
    if (app.outfit === 0) {                 // lab coat over scrubs
      R(O.coat, tX, 10, tW, 10);
      R(O.coatShade, tX, 10, tW, 1);
      R(O.inner, 9, 11, 2, 6);
      R(O.coat, tX - 2, 11, 2, 6); R(O.coat, tX + tW, 11, 2, 6);
      R(O.coatShade, tX + 1, 12, 1, 7);
    } else if (app.outfit === 1) {          // scrubs
      R(O.top, tX, 10, tW, 9);
      R(O.topShade, tX, 10, tW, 1);
      R(O.top, tX - 2, 11, 2, 6); R(O.top, tX + tW, 11, 2, 6);
      R(O.topShade, 9, 10, 2, 3);
      R(O.topShade, tX + 1, 15, 3, 3, 0.6);
    } else {                                // business
      R(O.blazer, tX, 10, tW, 10);
      R(O.blazerShade, tX, 10, tW, 1);
      R(O.shirt, 8, 10, 4, 8);
      R(O.tie, 9, 11, 2, 7);
      R(O.blazer, tX - 2, 11, 2, 6); R(O.blazer, tX + tW, 11, 2, 6);
      R(O.blazerShade, tX + 1, 11, 1, 8); R(O.blazerShade, tX + tW - 2, 11, 1, 8);
    }
    R(sk, tX - 2, 17, 2, 2); R(sk, tX + tW, 17, 2, 2);                        // hands
    R(sk, 9, 9, 2, 1);                                                        // neck
    R(sk, 6, 3, 8, 7);                                                        // face
    R(sk, 5, 5, 1, 2); R(sk, 14, 5, 1, 2);                                    // ears
    if (app.beard) {                                                          // beard
      const bc = H.c != null ? H.dark : 0x4a2e17;
      R(bc, 6, 7, 8, 3); R(bc, 5, 6, 1, 2); R(bc, 14, 6, 1, 2); R(sk, 8, 8, 4, 1);
    }
    R(0x2a2730, 7, 5, 1, 1); R(0x2a2730, 12, 5, 1, 1);                        // eyes
    if (H.c != null) {                                                        // hair
      R(H.c, 5, 0, 10, 4); R(H.dark, 5, 0, 10, 1); R(H.c, 5, 3, 10, 1);
      if (female) { R(H.c, 4, 2, 2, 9); R(H.c, 14, 2, 2, 9); R(H.dark, 4, 2, 1, 9); R(H.dark, 15, 2, 1, 9); }
      else { R(H.c, 5, 3, 1, 2); R(H.c, 14, 3, 1, 2); }
    }
    if (app.glasses) {                                                        // glasses (hollow frames)
      const f = 0x1c1f26;
      R(f, 6, 4, 3, 1); R(f, 6, 6, 3, 1); R(f, 6, 4, 1, 2); R(f, 8, 4, 1, 2);
      R(f, 11, 4, 3, 1); R(f, 11, 6, 3, 1); R(f, 11, 4, 1, 2); R(f, 13, 4, 1, 2);
      R(f, 9, 5, 2, 1);
    }
    return ops;
  }

  // --- preview portrait: 40×44 head-and-shoulders --------------------------
  function portraitOps(app) {
    app = normalize(app);
    const sk = SKIN[app.skin], skD = shade(sk, -16), skH = shade(sk, 12);
    const H = HAIR[app.hair], O = OUTFITS[app.outfit];
    const female = app.sex === 1;
    const ops = [];
    const R = (c, x, y, w, h, a) => ops.push({ c: c, x: x, y: y, w: w, h: h, a: a == null ? 1 : a });

    // shoulders / outfit
    if (app.outfit === 0) {                 // lab coat over scrubs
      R(O.pants, 8, 34, 24, 10);
      R(O.inner, 15, 33, 10, 5);
      R(O.coat, 4, 36, 12, 8); R(O.coat, 24, 36, 12, 8);
      R(O.coat, 6, 40, 28, 4);
      R(O.coat, 13, 35, 5, 7); R(O.coat, 22, 35, 5, 7);
      R(O.coatShade, 13, 35, 1, 7); R(O.coatShade, 26, 35, 1, 7);
      R(O.coatShade, 19, 37, 2, 7);
    } else if (app.outfit === 1) {          // scrubs
      R(O.top, 5, 35, 30, 9);
      R(O.topShade, 5, 35, 30, 1);
      R(sk, 17, 33, 6, 4);
      R(O.topShade, 16, 34, 3, 4); R(O.topShade, 21, 34, 3, 4);
    } else {                                // business
      R(O.blazer, 5, 35, 30, 9);
      R(O.shirt, 15, 33, 10, 11);
      R(O.tie, 19, 35, 2, 9);
      R(O.blazerShade, 13, 35, 2, 9); R(O.blazerShade, 25, 35, 2, 9);
      R(O.blazer, 5, 35, 9, 9); R(O.blazer, 26, 35, 9, 9);
    }
    // neck
    R(sk, 17, 28, 6, 7); R(skD, 17, 32, 6, 2);
    // head
    R(sk, 11, 6, 18, 24);
    R(sk, 9, 11, 2, 9); R(sk, 29, 11, 2, 9);
    R(skD, 11, 26, 18, 3);
    R(sk, 8, 16, 2, 4); R(sk, 30, 16, 2, 4);            // ears
    // beard
    if (app.beard) {
      const bc = H.c != null ? H.dark : 0x4a2e17;
      R(bc, 10, 22, 20, 7); R(bc, 9, 18, 3, 6); R(bc, 28, 18, 3, 6); R(sk, 15, 24, 10, 2);
    }
    // brows + eyes
    const browC = H.c != null ? H.dark : 0x6b5030;
    R(browC, 13, 14, 5, 1); R(browC, 22, 14, 5, 1);
    R(0xffffff, 13, 16, 4, 3); R(0xffffff, 23, 16, 4, 3);
    R(0x3a2f28, 15, 16, 2, 3); R(0x201b18, 15, 17, 2, 2);
    R(0x3a2f28, 24, 16, 2, 3); R(0x201b18, 24, 17, 2, 2);
    // nose + mouth
    R(skD, 19, 19, 2, 4); R(skD, 18, 22, 4, 1);
    R(0x9a5b52, 17, 25, 6, 1);
    // hair
    if (H.c != null) {
      R(H.c, 9, 3, 22, 8); R(H.dark, 9, 3, 22, 2);
      R(H.c, 8, 8, 3, 7); R(H.c, 29, 8, 3, 7);
      if (female) {
        R(H.c, 6, 8, 3, 22); R(H.c, 31, 8, 3, 22);
        R(H.dark, 6, 8, 1, 22); R(H.dark, 33, 8, 1, 22);
        R(H.c, 8, 6, 24, 4);
      } else {
        R(H.c, 10, 6, 9, 3); R(H.dark, 10, 10, 2, 2);
      }
    } else {
      R(skH, 13, 5, 14, 4, 0.6);                          // bald scalp highlight
    }
    // glasses (hollow frames so eyes read through)
    if (app.glasses) {
      const f = 0x15181f;
      R(f, 12, 15, 7, 1); R(f, 12, 19, 7, 1); R(f, 12, 15, 1, 5); R(f, 18, 15, 1, 5);
      R(f, 21, 15, 7, 1); R(f, 21, 19, 7, 1); R(f, 21, 15, 1, 5); R(f, 27, 15, 1, 5);
      R(f, 19, 16, 2, 1); R(f, 9, 16, 3, 1); R(f, 28, 16, 3, 1);
      R(0xbfe0ee, 13, 16, 2, 1, 0.55); R(0xbfe0ee, 22, 16, 2, 1, 0.55);
    }
    return ops;
  }

  const OPTIONS = {
    sex: ["Male", "Female"],
    skin: SKIN.map(hexStr),
    hair: HAIR.map((h) => h.label),
    outfit: OUTFITS.map((o) => o.label),
    glasses: ["No glasses", "Glasses"],
    beard: ["No beard", "Beard"],
  };

  const api = {
    SKIN, HAIR, OUTFITS, DEFAULT, OPTIONS,
    normalize, bodyOps, portraitOps, hexStr, shade,
    BODY_W: 20, BODY_H: 28, PORTRAIT_W: 40, PORTRAIT_H: 44,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IRAppearance = api;
})(typeof window !== "undefined" ? window : this);
