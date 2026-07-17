/* IR RPG — character appearance.
   Single source of truth for the player's look: the option palettes plus pure
   pixel-art "op list" generators used by BOTH renderers —
     • world.js paints them with a Phaser Graphics object → the "playersheet"
       walk-cycle texture (3 steps × 4 directions, same layout as one NPC block)
     • ui.js (CharCreator) paints them onto a <canvas> for the live preview
   so the sprite you build is exactly the sprite you play. Pure + Node-testable.

   Art direction (Ryan, 2026-07-17): match the assets/npcs.png cast — chibi
   proportions (head ≈ half the 80×120 frame), warm dark outlines, big
   white-sclera eyes with a coloured iris, hair with highlight streaks. The
   player renders at the same 0.6 scale as the NPCs so the cast reads as one
   family.

   Options (Ryan, 2026-07-13): a male or female resident; outfit = lab coat /
   scrubs / business attire; glasses on/off; hair blond / brown / black / bald;
   beard on/off; plus a skin tone. Exposes window.IRAppearance. */
(function (root) {
  "use strict";

  // --- palettes -----------------------------------------------------------
  const SKIN = [0xf6d5b5, 0xecc0a0, 0xd9a878, 0xc08a5e, 0x9a6a44, 0x6d4a30];
  // hair: blond / brown / black / bald (bald = no hair). c = base, dark = base
  // shadow/outline tone, hi = highlight streak, iris = matching eye colour.
  const HAIR = [
    { id: "blond", label: "Blond", c: 0xe6c463, dark: 0xb08a34, hi: 0xf5e29a, iris: 0x3a8f5f },
    { id: "brown", label: "Brown", c: 0x7a4d26, dark: 0x54331a, hi: 0xa06c38, iris: 0x3f6fb5 },
    { id: "black", label: "Black", c: 0x2b2733, dark: 0x17141d, hi: 0x3d3847, iris: 0x6b4a2e },
    { id: "bald",  label: "Bald",  c: null,     dark: null,     hi: null,     iris: 0x4a6f96 },
  ];
  const OUTFITS = [
    { id: "labcoat", label: "Lab coat",   // warm off-white like the cast's coats
      coat: 0xf2ede2, coatShade: 0xd6ccba, inner: 0x2f9096, pants: 0x2f6f7d, shoes: 0x8a6a4a, shoeHi: 0xa8875f },
    { id: "scrubs", label: "Scrubs",
      top: 0x2f9b8e, topShade: 0x24796f, pants: 0x287a70, shoes: 0xe7ebef, shoeHi: 0xffffff },
    { id: "business", label: "Business",
      blazer: 0x2a3450, blazerShade: 0x1d2740, shirt: 0xdfe6f0, tie: 0x8a2f3a, pants: 0x232a3d, shoes: 0x2a1c14, shoeHi: 0x46301f },
  ];
  const OUT = 0x2e2018;                    // warm near-black silhouette outline

  const DEFAULT = { name: "Scrubby Resident", sex: 0, skin: 2, hair: 1, outfit: 1, glasses: false, beard: false };

  // walk-sheet geometry — one character block in the NPC sheet's layout
  const FRAME_W = 80, FRAME_H = 120;
  const DIRS = ["d", "l", "r", "u"];       // row order (matches scenes.js NPC_DIR)
  const WALK_SEQ = [1, 0, 1, 2];           // step loop starting FROM the stand pose (1) — no pop on tap-steps
  const WALK_FPS = 10;                     // player strides at 200 px/s (NPCs 4.5 @ ~37)

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

  // ========================================================================
  //  Walk-cycle frame generator — 80×120, chibi NPC style.
  //  dir: "d" | "l" | "r" | "u"; step: 0 | 1 | 2 (1 = stand, NPC convention).
  //  Every major part is drawn as OUTLINE HALO (2px dark rect) + fill, which
  //  is what gives the cast its sticker-like outlined look.
  // ========================================================================
  function frameOps(app, dir, step) {
    app = normalize(app);
    dir = DIRS.indexOf(dir) >= 0 ? dir : "d";
    step = step === 0 || step === 2 ? step : 1;
    if (dir === "r") return mirrorOps(frameOps(app, "l", step));

    const sk = SKIN[app.skin], skD = shade(sk, -14), skH = shade(sk, 10);
    const H = HAIR[app.hair], O = OUTFITS[app.outfit];
    const female = app.sex === 1;
    const beardC = H.c != null ? H.dark : 0x54331a;
    const ops = [];
    const R = (c, x, y, w, h, a) => ops.push({ c: c, x: x, y: y, w: w, h: h, a: a == null ? 1 : a });
    const E = (c, x, y, w, h, a) => { R(c, x, y, w, h, a); ops[ops.length - 1].shape = "ellipse"; };
    const RO = (c, x, y, w, h) => { R(OUT, x - 2, y - 2, w + 4, h + 4); R(c, x, y, w, h); }; // halo + fill

    // walk offsets: oL/oR = leg extend(+)/lift(−); sL/sR = arm swing
    const oL = step === 0 ? 4 : step === 2 ? -4 : 0;
    const oR = -oL;
    const sL = step === 0 ? -3 : step === 2 ? 3 : 0;
    const sR = -sL;

    E(0x000000, 40, 112, 46, 10, 0.30);                                   // ground shadow

    // ---------- outfit part painters (shared by front/back/side) ----------
    const sleeveC = app.outfit === 0 ? O.coat : app.outfit === 1 ? O.top : O.blazer;
    const sleeveD = app.outfit === 0 ? O.coatShade : app.outfit === 1 ? O.topShade : O.blazerShade;
    const legs2 = (lx, rx, w) => {                                        // front/back legs
      RO(O.pants, lx, 92, w, 12 + oL); RO(O.pants, rx, 92, w, 12 + oR);
      RO(O.shoes, lx, 102 + oL, w, 8); RO(O.shoeHi, lx + 2, 102 + oL, w - 4, 2);
      RO(O.shoes, rx, 102 + oR, w, 8); RO(O.shoeHi, rx + 2, 102 + oR, w - 4, 2);
    };
    const armsFB = (lx, rx) => {                                          // hanging arms, front/back
      RO(sleeveC, lx, 56, 9, 22 + sL); R(sleeveD, lx, 74 + sL, 9, 3);
      RO(sleeveC, rx, 56, 9, 22 + sR); R(sleeveD, rx, 74 + sR, 9, 3);
      RO(sk, lx + 1, 80 + sL, 7, 8); RO(sk, rx + 1, 80 + sR, 7, 8);
    };
    const torsoFront = (tx, tw) => {
      if (app.outfit === 0) {              // lab coat, open over teal scrubs
        RO(O.coat, tx, 52, tw, 42);
        R(O.inner, 36, 54, 8, 22); R(shade(O.inner, -10), 36, 72, 8, 4);
        R(O.coatShade, 33, 54, 3, 38); R(O.coatShade, 44, 54, 3, 38);    // lapel shadows
        R(O.coat, 30, 54, 4, 34); R(O.coat, 46, 54, 4, 34);              // lapels
        R(O.coatShade, tx, 88, tw, 3);                                   // hem shadow
        R(O.coatShade, tx + 3, 60, 6, 2); R(shade(O.coat, -6), tx + 3, 62, 6, 8); // chest pocket
      } else if (app.outfit === 1) {       // scrub top
        RO(O.top, tx, 52, tw, 42);
        R(O.topShade, 34, 52, 12, 4); R(O.topShade, 37, 54, 6, 4);       // v-neck
        R(O.topShade, tx, 88, tw, 4);
        R(O.topShade, tx + 4, 74, 8, 10, 0.7); R(O.topShade, tx + tw - 12, 74, 8, 10, 0.7); // hip pockets
        R(0xe8e4d8, tx + tw - 10, 58, 6, 8);                             // badge
      } else {                             // business: blazer + shirt + tie
        RO(O.blazer, tx, 52, tw, 42);
        R(O.shirt, 34, 52, 12, 26);
        R(O.tie, 38, 54, 4, 20); R(shade(O.tie, -12), 38, 70, 4, 4);
        R(O.blazerShade, 31, 54, 3, 38); R(O.blazerShade, 46, 54, 3, 38);
        R(O.blazerShade, tx, 90, tw, 4);
      }
    };
    const torsoBack = (tx, tw) => {
      const base = app.outfit === 0 ? O.coat : app.outfit === 1 ? O.top : O.blazer;
      RO(base, tx, 52, tw, 42);
      R(sleeveD, 39, 56, 2, 34);                                          // centre seam
      R(sleeveD, tx, 52, tw, 4);                                          // collar/yoke shadow
      R(sleeveD, tx, 88, tw, app.outfit === 0 ? 3 : 4);
    };

    // ---------- head painters ---------------------------------------------
    // Heads + hair are ELLIPSES (both renderers rasterize them) — that's what
    // gives the cast its round chibi skull; rect steps vanish at 0.6 scale.
    const headSkin = (hx, hw) => {                                       // cx = hx + hw/2
      const cx = hx + hw / 2;
      E(OUT, cx, 35, hw + 6, 44);
      E(sk, cx, 35, hw + 2, 40);
      E(skD, cx, 51, hw - 14, 8, 0.55);                                  // jaw shade
    };
    const slopeShoulders = (tx, tw) => {
      R(OUT, tx, 52, 3, 2); R(OUT, tx, 54, 1, 2);
      R(OUT, tx + tw - 3, 52, 3, 2); R(OUT, tx + tw - 1, 54, 1, 2);
    };
    const eye = (ex, ey) => {
      R(0xf8f8f4, ex, ey, 7, 9);
      R(OUT, ex - 1, ey - 1, 9, 2);                                      // lash line
      R(OUT, ex, ey + 9, 7, 1, 0.55);                                    // soft lower lid
      R(H.iris, ex + 2, ey + 2, 4, 6);
      R(0x1d1a16, ex + 3, ey + 3, 2, 4);
      R(0xffffff, ex + 2, ey + 2, 1, 2, 0.9);
    };
    const brow = (ex, ey) => R(H.c != null ? H.dark : 0x6b5030, ex - 1, ey - 5, 9, 2);
    const glassesFront = () => {
      const f = 0x2a2622;
      [24, 47].forEach((gx) => {                                          // hollow frames around each eye
        R(f, gx - 1, 32, 11, 2); R(f, gx - 1, 44, 11, 2);
        R(f, gx - 1, 32, 2, 14); R(f, gx + 8, 32, 2, 14);
        R(0xbfe0ee, gx + 1, 34, 3, 3, 0.4);
      });
      R(f, 34, 37, 13, 2);                                                // bridge
      R(f, 18, 38, 6, 2); R(f, 57, 38, 5, 2);                             // temples
    };
    const beardFront = () => {
      RO(beardC, 22, 46, 36, 9);                                         // chin band (past the jaw)
      R(beardC, 21, 42, 3, 8); R(beardC, 56, 42, 3, 8);                  // slim jaw wrap
      R(beardC, 32, 45, 16, 3);                                          // moustache
      R(sk, 33, 48, 14, 4);                                              // mouth window
      R(0x8a4a3c, 37, 49, 6, 2);                                         // mouth
    };

    // ======================================================================
    if (dir === "d") {
      const tx = female ? 24 : 22, tw = female ? 32 : 36;
      legs2(female ? 27 : 25, female ? 42 : 43, female ? 11 : 12);
      torsoFront(tx, tw); slopeShoulders(tx, tw);
      armsFB(tx - 8, tx + tw - 1);
      RO(sk, 16, 38, 4, 8); RO(sk, 60, 38, 4, 8);                        // ears
      R(skD, 17, 40, 2, 4); R(skD, 61, 40, 2, 4);
      headSkin(20, 40);
      if (H.c != null) {                                                  // hair BEHIND the face features
        RO(H.c, 16, 20, 6, female ? 34 : 18); RO(H.c, 58, 20, 6, female ? 34 : 18); // side locks / falls
        if (female) { R(H.dark, 16, 44, 6, 10); R(H.dark, 58, 44, 6, 10); E(H.c, 19, 54, 8, 8); E(H.c, 61, 54, 8, 8); }
        E(OUT, 40, 22, 52, 34); E(H.c, 40, 22, 48, 30);                  // dome
        R(H.c, 20, 24, 9, 8); R(H.dark, 20, 30, 9, 2);                   // fringe tufts, varying
        R(H.c, 29, 24, 11, 6); R(H.dark, 29, 28, 11, 2);                 // lengths + tuft shadow
        R(H.c, 40, 24, 10, 8); R(H.dark, 40, 30, 10, 2);
        R(H.c, 50, 24, 10, 6); R(H.dark, 50, 28, 10, 2);
        E(H.hi, 33, 13, 20, 5); E(H.c, 36, 16, 22, 6);                   // highlight arc
      } else {
        E(skH, 40, 21, 26, 8, 0.5);                                      // bald scalp shine
      }
      brow(25, 34); brow(48, 34);
      eye(25, 34); eye(48, 34);
      R(skD, 39, 44, 3, 4);                                              // nose
      if (app.beard) beardFront(); else R(0x8a4a3c, 37, 50, 7, 2);        // mouth
      R(shade(sk, -6), 24, 47, 5, 3, 0.5); R(shade(sk, -6), 51, 47, 5, 3, 0.5); // cheeks
      if (app.glasses) glassesFront();

    } else if (dir === "u") {
      const tx = female ? 24 : 22, tw = female ? 32 : 36;
      legs2(female ? 27 : 25, female ? 42 : 43, female ? 11 : 12);
      torsoBack(tx, tw); slopeShoulders(tx, tw);
      armsFB(tx - 8, tx + tw - 1);
      if (H.c != null) {                                                  // back of head = hair dome
        RO(sk, 30, 44, 20, 10);                                          // nape below the hairline
        if (female) { RO(H.c, 16, 20, 8, 34); RO(H.c, 56, 20, 8, 34); E(H.c, 20, 56, 10, 8); E(H.c, 60, 56, 10, 8); }
        RO(H.c, 22, 30, 36, female ? 20 : 12);                           // flat back of the head
        E(OUT, 40, 26, 52, 42); E(H.c, 40, 26, 48, 38);                  // dome covers the rect seam
        if (female) R(H.dark, 22, 44, 36, 6); else R(H.dark, 22, 38, 36, 4);
        const sy = female ? 48 : 42;                                     // scalloped hair bottom
        E(H.c, 28, sy, 14, 9); E(H.c, 41, sy + 1, 16, 9); E(H.c, 53, sy, 12, 9);
        E(H.hi, 33, 13, 20, 5); E(H.c, 36, 16, 22, 6);
        R(H.dark, 38, 12, 4, female ? 30 : 24, 0.5);                     // part line
      } else {
        headSkin(20, 40);
        E(skH, 40, 23, 26, 9, 0.5);
      }

    } else { // "l" — facing left; "r" is the mirror
      const tw = 30, tx = 25;
      // far arm sliver behind the torso
      R(OUT, tx + tw - 2, 58, 8, 24); R(sleeveC, tx + tw, 60, 5, 20);
      // legs scissor: back leg first (paint order), then front
      RO(O.pants, 38 + oR, 92, 11, 12); RO(O.shoes, 36 + oR * 2, 102, 14, 8);
      R(O.shoeHi, 38 + oR * 2, 102, 10, 2);
      RO(O.pants, 30 + oL, 92, 11, 12); RO(O.shoes, 26 + oL * 2, 102, 14, 8);
      R(O.shoeHi, 28 + oL * 2, 102, 10, 2);
      // torso in profile
      if (app.outfit === 0) {
        RO(O.coat, tx, 52, tw, 42);
        R(O.inner, tx + 1, 54, 5, 20);
        R(O.coatShade, tx + 6, 54, 3, 36); R(O.coatShade, tx, 88, tw, 3);
      } else if (app.outfit === 1) {
        RO(O.top, tx, 52, tw, 42);
        R(O.topShade, tx + 1, 52, 8, 4); R(O.topShade, tx, 88, tw, 4);
        R(O.topShade, tx + 4, 74, 8, 10, 0.7);
      } else {
        RO(O.blazer, tx, 52, tw, 42);
        R(O.shirt, tx + 1, 54, 4, 16); R(O.blazerShade, tx + 5, 54, 3, 34);
        R(O.blazerShade, tx, 90, tw, 4);
      }
      slopeShoulders(tx, tw);
      // near arm swings over the torso front
      RO(sleeveC, 32 + sL, 58, 10, 22); R(sleeveD, 32 + sL, 76, 10, 3);
      RO(sk, 33 + sL, 80 + Math.max(0, sL), 8, 8);
      // head — face left, hair sweeps back
      headSkin(20, 40);
      RO(sk, 17, 42, 4, 6);                                              // nose bump
      RO(sk, 50, 38, 5, 9); R(skD, 52, 40, 2, 4);                        // ear
      if (H.c != null) {                                                  // hair BEHIND the face features
        RO(H.c, 44, 16, 18, female ? 40 : 26);                           // back sweep / fall
        if (female) { R(H.dark, 46, 46, 16, 10); E(H.c, 53, 56, 16, 8); }
        E(OUT, 41, 22, 50, 34); E(H.c, 41, 22, 46, 30);                  // dome
        R(H.c, 20, 24, 9, 7); R(H.dark, 20, 29, 9, 2);                   // scalloped fringe
        R(H.c, 29, 24, 9, 5); R(H.dark, 29, 27, 9, 2);
        E(H.hi, 35, 13, 20, 5); E(H.c, 38, 16, 22, 6);
      } else {
        E(skH, 40, 21, 26, 8, 0.5);
      }
      brow(24, 34); eye(24, 34);
      R(skD, 20, 44, 3, 3);
      if (app.beard) {
        RO(beardC, 20, 47, 20, 8); R(beardC, 36, 42, 5, 10);
        R(sk, 25, 49, 8, 4); R(0x8a4a3c, 26, 50, 5, 2);
      } else R(0x8a4a3c, 25, 50, 6, 2);
      R(shade(sk, -6), 27, 46, 5, 3, 0.5);
      if (app.glasses) {
        const f = 0x2a2622;
        R(f, 22, 32, 11, 2); R(f, 22, 44, 11, 2); R(f, 22, 32, 2, 14); R(f, 31, 32, 2, 14);
        R(0xbfe0ee, 24, 34, 3, 3, 0.4);
        R(f, 33, 38, 19, 2);                                             // temple to the ear
      }
    }
    return ops;
  }

  function mirrorOps(ops) {
    return ops.map((o) => {
      const m = { c: o.c, x: o.shape === "ellipse" ? FRAME_W - o.x : FRAME_W - o.x - o.w, y: o.y, w: o.w, h: o.h, a: o.a };
      if (o.shape) m.shape = o.shape;
      return m;
    });
  }

  // world sprite (down-facing standing frame) — kept as the single-frame API
  function bodyOps(app) { return frameOps(app, "d", 1); }

  // --- preview portrait: 40×44 head-and-shoulders, same chibi language -----
  function portraitOps(app) {
    app = normalize(app);
    const sk = SKIN[app.skin], skD = shade(sk, -14), skH = shade(sk, 10);
    const H = HAIR[app.hair], O = OUTFITS[app.outfit];
    const female = app.sex === 1;
    const ops = [];
    const R = (c, x, y, w, h, a) => ops.push({ c: c, x: x, y: y, w: w, h: h, a: a == null ? 1 : a });
    const RO = (c, x, y, w, h) => { R(OUT, x - 1, y - 1, w + 2, h + 2); R(c, x, y, w, h); };

    // shoulders / outfit
    if (app.outfit === 0) {
      RO(O.coat, 4, 35, 32, 9);
      R(O.inner, 16, 34, 8, 10);
      R(O.coat, 12, 34, 4, 10); R(O.coat, 24, 34, 4, 10);
      R(O.coatShade, 12, 34, 1, 10); R(O.coatShade, 27, 34, 1, 10);
    } else if (app.outfit === 1) {
      RO(O.top, 4, 35, 32, 9);
      R(O.topShade, 15, 35, 10, 3);
      R(sk, 17, 34, 6, 3);
    } else {
      RO(O.blazer, 4, 35, 32, 9);
      R(O.shirt, 15, 34, 10, 10);
      R(O.tie, 19, 36, 3, 8);
      R(O.blazerShade, 13, 35, 2, 9); R(O.blazerShade, 25, 35, 2, 9);
    }
    // neck + round head with outline (ellipses, same language as the walk sheet)
    RO(sk, 17, 28, 6, 6); R(skD, 17, 31, 6, 2);
    const E = (c, x, y, w, h, a) => { R(c, x, y, w, h, a); ops[ops.length - 1].shape = "ellipse"; };
    E(OUT, 20, 18, 26, 28); E(sk, 20, 18, 24, 25);
    E(skD, 20, 27, 14, 6, 0.5);
    RO(sk, 7, 15, 3, 6); RO(sk, 30, 15, 3, 6);                            // ears
    R(skD, 8, 17, 1, 3); R(skD, 31, 17, 1, 3);
    // hair BEHIND the face features
    if (H.c != null) {
      RO(H.c, 6, 10, 4, female ? 20 : 8); RO(H.c, 30, 10, 4, female ? 20 : 8); // side locks / falls
      if (female) { R(H.dark, 6, 24, 4, 6); R(H.dark, 30, 24, 4, 6); E(H.c, 8, 31, 6, 5); E(H.c, 32, 31, 6, 5); }
      E(OUT, 20, 9, 28, 16); E(H.c, 20, 9, 26, 14);                       // dome
      R(H.c, 9, 10, 6, 4); R(H.dark, 9, 12, 6, 1);                        // scalloped fringe
      R(H.c, 15, 10, 6, 3); R(H.dark, 15, 12, 6, 1);
      R(H.c, 21, 10, 5, 4); R(H.dark, 21, 13, 5, 1);
      R(H.c, 26, 10, 5, 3); R(H.dark, 26, 12, 5, 1);
      E(H.hi, 16, 4, 12, 3); E(H.c, 18, 6, 12, 3);                        // highlight arc
    } else {
      E(skH, 20, 8, 14, 4, 0.55);
    }
    // beard
    if (app.beard) {
      const bc = H.c != null ? H.dark : 0x54331a;
      RO(bc, 10, 23, 20, 6); R(bc, 9, 18, 3, 7); R(bc, 28, 18, 3, 7);
      R(bc, 13, 21, 14, 2);                                               // moustache
      R(sk, 15, 24, 10, 3);                                               // mouth window
    }
    // brows + big sclera-and-iris eyes (lash line, no full box)
    const browC = H.c != null ? H.dark : 0x6b5030;
    R(browC, 11, 12, 7, 2); R(browC, 22, 12, 7, 2);
    R(0xf8f8f4, 12, 15, 6, 6); R(0xf8f8f4, 23, 15, 6, 6);
    R(OUT, 11, 14, 8, 2); R(OUT, 22, 14, 8, 2);                           // lashes
    R(OUT, 12, 21, 6, 1, 0.55); R(OUT, 23, 21, 6, 1, 0.55);
    R(H.iris, 14, 16, 3, 5); R(H.iris, 25, 16, 3, 5);
    R(0x1d1a16, 15, 17, 2, 3); R(0x1d1a16, 26, 17, 2, 3);
    R(0xffffff, 14, 16, 1, 2, 0.9); R(0xffffff, 25, 16, 1, 2, 0.9);
    // nose + mouth + cheeks
    R(skD, 19, 20, 2, 4); R(skD, 18, 23, 4, 1);
    R(0x8a4a3c, 17, 26, 6, 1);
    R(shade(sk, -6), 11, 22, 3, 2, 0.5); R(shade(sk, -6), 26, 22, 3, 2, 0.5);
    // glasses (hollow frames so the eyes read through)
    if (app.glasses) {
      const f = 0x2a2622;
      R(f, 10, 13, 10, 1); R(f, 10, 21, 10, 1); R(f, 10, 13, 1, 9); R(f, 19, 13, 1, 9);
      R(f, 21, 13, 10, 1); R(f, 21, 21, 10, 1); R(f, 21, 13, 1, 9); R(f, 30, 13, 1, 9);
      R(f, 19, 16, 3, 1); R(f, 7, 16, 3, 1); R(f, 31, 16, 3, 1);
      R(0xbfe0ee, 12, 15, 3, 2, 0.45); R(0xbfe0ee, 23, 15, 3, 2, 0.45);
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
    SKIN, HAIR, OUTFITS, DEFAULT, OPTIONS, OUT,
    normalize, bodyOps, portraitOps, frameOps, hexStr, shade,
    BODY_W: FRAME_W, BODY_H: FRAME_H, PORTRAIT_W: 40, PORTRAIT_H: 44,
    FRAME_W, FRAME_H, DIRS, WALK_SEQ, WALK_FPS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IRAppearance = api;
})(typeof window !== "undefined" ? window : this);
