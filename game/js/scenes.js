/* IR RPG — Phaser scenes + case flow.
   Boot (auth + data) → Overworld (UMass Chan University Campus, Worcester —
   a scrolling world larger than the screen; camera follows the player;
   [M] opens the clickable campus map for shuttle fast-travel) → building
   interiors: Hospital (IR floor hub) or Lobby (per-building flavor).
   Text-heavy screens are HTML overlays (ui.js). All art is procedurally
   generated pixel-style (world.js). window.IRScenes + window.IRState. */
(function (root) {
  "use strict";
  const Phaser = root.Phaser;
  const S = root.IRState = { user: null, guest: false, bundle: null, cases: [], save: null, slot: 1, lastDoor: null, seenIntro: false };
  const TEXT = "#dfe6f2";

  // ----- shared helpers -----------------------------------------------------
  // Portal interaction is EVENT-driven (keydown-E / keydown-ENTER), not
  // JustDown polling — polling misses events around scene pause/resume and
  // wedged the busy flag (found in browser playtest).
  function makePortals(scene, list) {
    scene._portals = list.map(p => Object.assign({}, p));
    scene._near = null;
    scene._hint = scene.add.text(0, 0, "", { fontFamily: "monospace", fontSize: "13px", color: "#ffe08a", backgroundColor: "#000c", padding: { x: 6, y: 3 } })
      .setDepth(1e6).setVisible(false);
    const enter = () => {
      if (scene.busy || !scene._near) return;
      scene.busy = true;
      scene.input.keyboard.resetKeys();
      scene._near.onEnter();
    };
    scene.input.keyboard.on("keydown-E", enter);
    scene.input.keyboard.on("keydown-ENTER", enter);
  }
  function updatePortals(scene) {
    if (scene.busy) { scene._hint.setVisible(false); return; }
    // pick the NEAREST portal in range (first-match let large zones shadow small
    // ones — e.g. the library stairs hiding behind "Browse the stacks")
    let near = null, best = Infinity;
    for (const p of scene._portals) {
      const dx = Math.abs(scene.player.x - p.x), dy = Math.abs(scene.player.y - p.y);
      const rx = p.w / 2 + 22, ry = p.h / 2 + 22;
      if (dx < rx && dy < ry) {
        const d = dx / rx + dy / ry;
        if (d < best) { best = d; near = p; }
      }
    }
    scene._near = near;
    if (near) {
      // setText re-rasterizes the label texture — only do it when the label
      // actually changes, else it fires 60×/s near a building and stutters.
      if (scene._hintLabel !== near.label) { scene._hint.setText("▸ " + near.label + "   [E]"); scene._hintLabel = near.label; }
      scene._hint.setPosition(scene.player.x - 40, scene.player.y - 52).setVisible(true);
    } else { scene._hint.setVisible(false); scene._hintLabel = null; }
  }
  function movePlayer(scene, speed) {
    if (scene.busy) { scene.player.body.setVelocity(0, 0); return; }
    const c = scene.cursors, w = scene.wasd; let vx = 0, vy = 0;
    if (c.left.isDown || w.left.isDown) vx = -1; else if (c.right.isDown || w.right.isDown) vx = 1;
    if (c.up.isDown || w.up.isDown) vy = -1; else if (c.down.isDown || w.down.isDown) vy = 1;
    if (vx && vy) { vx *= 0.7071; vy *= 0.7071; }
    scene.player.body.setVelocity(vx * speed, vy * speed);
    // Y-sort by the player's FEET (origin is 0.5,0.5, so add half-height) to match
    // every prop/NPC which sorts on its base — otherwise props ~28px north of the
    // feet wrongly draw over the player (buildings, shrubs, lamps, trees…).
    scene.player.setDepth(scene.player.y + scene.player.displayHeight / 2 - 2);
  }
  function stdControls(scene) {
    scene.cursors = scene.input.keyboard.createCursorKeys();
    scene.wasd = scene.input.keyboard.addKeys({ up: "W", down: "S", left: "A", right: "D" });
  }
  function label(scene, x, y, txt, size, opts) {
    return scene.add.text(x, y, txt, Object.assign({ fontFamily: "monospace", fontSize: (size || 12) + "px", color: TEXT, align: "center" }, opts || {})).setOrigin(0.5).setDepth(5);
  }
  function spawnPlayer(scene, x, y) {
    scene.player = scene.physics.add.image(x, y, "t_player").setScale(2); // characters are 2× (Ryan)
    scene.player.body.setSize(14, 9).setOffset(3, 18); // feet-only body → walk "behind" things (scales with sprite)
    scene.player.setCollideWorldBounds(true);
    stdControls(scene);
  }
  // NPC ↔ world physics: every patrolling NPC collides with the scene's solids
  // (walls, furniture, idle-NPC zones), with the PLAYER, and with OTHER NPCs —
  // so nobody ghosts through anybody. Call once, AFTER the player + all NPCs
  // exist. (Idle/seated NPCs are already static bodies inside `solids`.)
  function wireNpcPhysics(scene, solids) {
    const npcs = (scene._npcs || []).filter(n => n && n.body);
    if (!npcs.length) return;
    scene.physics.add.collider(npcs, solids);
    scene.physics.add.collider(npcs, npcs);
    if (scene.player) scene.physics.add.collider(scene.player, npcs);
    if (scene._cars && scene._cars.length) scene.physics.add.collider(npcs, scene._cars);
  }

  // ---- traffic: physics cars that queue and stop+honk for people ------------
  // primitive AABB (no temp objects — this runs for every car every frame)
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }
  let _audioCtx = null;
  function honkBeep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      _audioCtx = _audioCtx || new AC();
      if (_audioCtx.state === "suspended") _audioCtx.resume();
      const o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
      o.type = "square"; o.frequency.value = 300; g.gain.value = 0.04;
      o.connect(g); g.connect(_audioCtx.destination);
      const t = _audioCtx.currentTime; o.start(t); o.stop(t + 0.16);
    } catch (e) { /* audio blocked by the browser — the HONK! bubble still shows */ }
  }
  function carHonk(scene, c) {
    // Only honk within earshot — i.e., when the car is actually on-screen. A car
    // honking off-camera is just noise the player can't place (Ryan). Skips both
    // the sound and the (invisible-anyway) bubble for off-screen cars.
    const cam = scene.cameras && scene.cameras.main;
    if (cam && cam.worldView) {
      const v = cam.worldView, m = 48;   // small margin so an edge-of-screen car still honks
      if (c.x < v.x - m || c.x > v.right + m || c.y < v.y - m || c.y > v.bottom + m) return;
    }
    // reuse ONE bubble per car (creating a Text every honk re-rasterizes + churns GC)
    let t = c.honkText;
    if (!t) {
      t = c.honkText = scene.add.text(0, 0, "HONK!", {
        fontFamily: "monospace", fontSize: "13px", color: "#ffde59", backgroundColor: "#000000aa", padding: { x: 4, y: 2 } })
        .setOrigin(0.5, 1).setDepth(9000).setVisible(false);
    }
    scene.tweens.killTweensOf(t);
    t.setPosition(c.x, c.y - c.displayHeight / 2 - 8).setAlpha(1).setVisible(true);
    scene.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: 950, onComplete: () => t.setVisible(false) });
    honkBeep();
  }
  // Per-frame car AI: drive by velocity; if a person (player/NPC) is in the
  // look-ahead, STOP + honk and wait; else if another car is close ahead, queue;
  // else cruise. Zero per-frame allocation (people list cached, boxes inlined) so
  // it never triggers a GC hitch while you're moving. Wrap at the map edges.
  function updateCars(scene) {
    const cars = scene._cars; if (!cars || !cars.length) return;
    const W = root.IRWorld, now = scene.time.now, npcs = scene._npcs || [], player = scene.player;
    if (scene.busy) { for (let i = 0; i < cars.length; i++) if (cars[i].body) cars[i].body.setVelocity(0, 0); return; }
    const PERSON_GAP = 48, CAR_GAP = 16, M = 130;
    // person detection uses the FEET (physics body), not the sprite, so a head that
    // pokes into the road tile from the sidewalk does NOT trip the car (Ryan).
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]; if (!c.body) continue;
      const halfF = (c.horiz ? c.displayWidth : c.displayHeight) / 2;
      const halfP = (c.horiz ? c.displayHeight : c.displayWidth) / 2;
      const lx = c.horiz ? (c.dir > 0 ? c.x + halfF : c.x - halfF - PERSON_GAP) : c.x - halfP;
      const ly = c.horiz ? c.y - halfP : (c.dir > 0 ? c.y + halfF : c.y - halfF - PERSON_GAP);
      const lw = c.horiz ? PERSON_GAP : halfP * 2, lh = c.horiz ? halfP * 2 : PERSON_GAP;
      let stop = false, honk = false;
      const pb = player && player.body;
      if (pb && aabb(lx, ly, lw, lh, pb.x, pb.y, pb.width, pb.height)) { stop = true; honk = true; }
      if (!stop) for (let j = 0; j < npcs.length; j++) { const b = npcs[j].body; if (b && aabb(lx, ly, lw, lh, b.x, b.y, b.width, b.height)) { stop = honk = true; break; } }
      if (!stop) {
        const cx = c.horiz ? (c.dir > 0 ? c.x + halfF : c.x - halfF - CAR_GAP) : c.x - halfP;
        const cy = c.horiz ? c.y - halfP : (c.dir > 0 ? c.y + halfF : c.y - halfF - CAR_GAP);
        const cw = c.horiz ? CAR_GAP : halfP * 2, ch = c.horiz ? halfP * 2 : CAR_GAP;
        for (let j = 0; j < cars.length; j++) { const o = cars[j]; if (o !== c && o.body && aabb(cx, cy, cw, ch, o.x - o.displayWidth / 2, o.y - o.displayHeight / 2, o.displayWidth, o.displayHeight)) { stop = true; break; } }
      }
      if (stop) { c.body.setVelocity(0, 0); if (honk && now >= (c.honkCd || 0)) { carHonk(scene, c); c.honkCd = now + 1600; } }
      else c.body.setVelocity(c.horiz ? c.dir * c.cruise : 0, c.horiz ? 0 : c.dir * c.cruise);
      c.setDepth(c.y);
      const rb = c.xMax != null ? c.xMax : W.WPX;                 // bounded cars wrap at the lake shore, not the map edge
      if (c.horiz && c.dir > 0 && c.x > (c.xMax != null ? rb : rb + M)) c.x = -M;
      else if (c.horiz && c.dir < 0 && c.x < -M) c.x = (c.xMax != null ? rb : rb + M);
      else if (!c.horiz && c.dir > 0 && c.y > W.HPX + M) c.y = -M;
      else if (!c.horiz && c.dir < 0 && c.y < -M) c.y = W.HPX + M;
    }
  }
  function hud(scene, lines) {
    return scene.add.text(10, 8, lines, { fontFamily: "monospace", fontSize: "12px", color: TEXT, backgroundColor: "#0e1420cc", padding: { x: 8, y: 5 } })
      .setScrollFactor(0).setDepth(1e6);
  }

  // ======================================================================
  //  NPC CAST — game/assets/npcs.png (user-supplied sheet, 8 characters in
  //  RPG-Maker layout: 3 walk frames × 4 directions each). Roles map onto the
  //  sheet's characters; if the sheet fails to load, the old procedural
  //  pixel staff textures stand in (no anims).
  // ======================================================================
  const NPC_CHAR = { attending: 0, doctor: 1, resident: 2, residentF: 3, nurse: 4, senior: 5, surgeon: 6, visitor: 7 };
  const NPC_DIR = { d: 0, l: 1, r: 2, u: 3 };
  const NPC_SCALE = 0.6;   // characters are 2× (Ryan)
  const rndChar = () => (Math.random() * 8) | 0;
  const npcCharOf = (role) => (typeof role === "number" ? role : (NPC_CHAR[role] != null ? NPC_CHAR[role] : 7));
  const NPC_FALLBACK = { attending: "t_attending", doctor: "t_attending", surgeon: "t_tech", resident: "t_tech", residentF: "t_tech", nurse: "t_nurse", senior: "t_nurse", visitor: "t_tech" };
  function npcFrame(c, dir, f) { const rb = Math.floor(c / 4), cb = c % 4; return (rb * 4 + NPC_DIR[dir]) * 12 + cb * 3 + f; }
  function ensureNpcAnims(scene) {
    if (!scene.textures.exists("npcsheet") || scene.anims.exists("npc0-d")) return;
    for (let c = 0; c < 8; c++) Object.keys(NPC_DIR).forEach(dir => {
      scene.anims.create({ key: "npc" + c + "-" + dir, frameRate: 4.5, repeat: -1,
        frames: [0, 1, 2, 1].map(f => ({ key: "npcsheet", frame: npcFrame(c, dir, f) })) });
      scene.anims.create({ key: "npc" + c + "-talk-" + dir, frameRate: 2.5, repeat: -1,
        frames: [1, 0, 1, 2].map(f => ({ key: "npcsheet", frame: npcFrame(c, dir, f) })) });
    });
  }
  function npcIdle(scene, x, y, role, dir, solids) {
    ensureNpcAnims(scene);
    let s;
    if (!scene.textures.exists("npcsheet")) {
      const key = NPC_FALLBACK[role] || "t_tech";
      s = scene.add.image(x, y, scene.textures.exists(key) ? key : "t_player").setScale(2).setOrigin(0.5, 1).setDepth(y);
    } else {
      s = scene.add.sprite(x, y, "npcsheet", npcFrame(npcCharOf(role), dir || "d", 1))
        .setScale(NPC_SCALE).setOrigin(0.5, 0.96).setDepth(y);
    }
    if (solids) { const z = scene.add.zone(x, y - 6, 22, 12); scene.physics.add.existing(z, true); solids.add(z); }
    return s;
  }
  // animated in place — speakers mid-lecture, baristas pulling shots, working staff
  function npcTalker(scene, x, y, role, dir, solids) {
    const s = npcIdle(scene, x, y, role, dir, solids);
    if (s.play) s.play("npc" + npcCharOf(role) + "-talk-" + (dir || "d"));
    return s;
  }
  // Patrolling NPCs stroll slowly between two waypoints with natural stop-and-go:
  // walk a leg, pause a beat, then continue or turn around. Stepped once per frame
  // by updateNpcs(). They stay physics bodies, so they still collide with walls,
  // furniture, each other, the player and cars. (dur is kept for call-site compat
  // but no longer sets the pace — everyone walks at a calm human speed.)
  function npcDirKey(p) { return p.horiz ? (p.dir > 0 ? "r" : "l") : (p.dir > 0 ? "d" : "u"); }
  function npcWalkAnim(s, p) { if (s.play) s.play("npc" + p.char + "-" + npcDirKey(p), true); }
  function npcStandAnim(s, p) {
    if (s.anims) s.anims.stop();
    if (s.setFrame && s.texture && s.texture.key === "npcsheet") s.setFrame(npcFrame(p.char, npcDirKey(p), 1));
  }
  function npcPatrol(scene, x, y, role, dx, dy, dur) {
    ensureNpcAnims(scene);
    const c = npcCharOf(role);
    let s;
    if (scene.textures.exists("npcsheet")) {
      s = scene.physics.add.sprite(x, y, "npcsheet", npcFrame(c, "d", 1)).setScale(NPC_SCALE).setOrigin(0.5, 0.96);
      s.body.setSize(50, 22).setOffset(15, 93);            // feet box (frame units; scales ×0.6 → ~30×13)
    } else {
      s = scene.physics.add.image(x, y, NPC_FALLBACK[role] || "t_player").setScale(2).setOrigin(0.5, 1);
      s.body.setSize(14, 9).setOffset(3, 18);
    }
    s.body.pushable = false;                                // the player can't shove staff around
    s.setDepth(s.y);
    const horiz = Math.abs(dx) >= Math.abs(dy);
    s._pat = {
      horiz,
      lo: horiz ? Math.min(x, x + dx) : Math.min(y, y + dy),
      hi: horiz ? Math.max(x, x + dx) : Math.max(y, y + dy),
      dir: (horiz ? dx : dy) >= 0 ? 1 : -1,
      speed: 30 + Math.random() * 14,                      // calm ~30–44 px/s (player is 200)
      char: c, state: "walk", until: 0,
    };
    npcWalkAnim(s, s._pat);
    (scene._npcs = scene._npcs || []).push(s);
    return s;
  }
  // Step every patrolling NPC once per frame (from each scene's update()).
  function updateNpcs(scene) {
    const npcs = scene._npcs; if (!npcs || !npcs.length) return;
    const now = scene.time.now, busy = scene.busy;
    for (const s of npcs) {
      const p = s._pat; if (!s.body || !p) continue;
      s.setDepth(s.y);
      if (busy) { s.body.setVelocity(0, 0); continue; }
      if (p.state === "pause") {
        if (now < p.until) { s.body.setVelocity(0, 0); continue; }
        p.state = "walk"; npcWalkAnim(s, p);               // dwell over → resume
      }
      const pos = p.horiz ? s.x : s.y;
      const blocked = p.horiz
        ? (p.dir > 0 ? (s.body.blocked.right || s.body.touching.right) : (s.body.blocked.left || s.body.touching.left))
        : (p.dir > 0 ? (s.body.blocked.down || s.body.touching.down) : (s.body.blocked.up || s.body.touching.up));
      if ((p.dir > 0 ? pos >= p.hi : pos <= p.lo) || blocked) {
        p.dir = -p.dir;                                    // turn at the end / on a bump
        p.state = "pause"; p.until = now + 800 + Math.random() * 2400;
        s.body.setVelocity(0, 0); npcStandAnim(s, p);
        continue;
      }
      s.body.setVelocity(p.horiz ? p.dir * p.speed : 0, p.horiz ? 0 : p.dir * p.speed);
    }
  }
  // chair drawn over the sprite's legs ≈ seated (audience, students, waiting rooms)
  // one size for EVERY chair (empty or occupied), matched to the 2× cast
  const CHAIR_SCALE = 1.6;
  function addChair(scene, x, y) {   // an empty chair standing on the floor at (x,y)
    return scene.add.image(x, y, "t_chair").setScale(CHAIR_SCALE).setOrigin(0.5, 1).setDepth(y);
  }
  function npcSeated(scene, x, y, role, dir, solids) {
    // The cast sheet is walk-only (no sitting pose), so we fake a convincing sit:
    // the person is drawn BEHIND the chair with their lower legs/feet cropped at
    // the hip, and the chair (seat + back) is drawn IN FRONT — head and shoulders
    // rise above the chair back while the flat crop line hides behind the seat, so
    // nobody appears to stand on the chair. Depth stays feet-based (person at the
    // chair-floor y, chair a hair in front) so the player still Y-sorts correctly.
    const s = npcIdle(scene, x, y - 6, role, dir || "d");
    if (s.setCrop) {
      if (s.texture && s.texture.key === "npcsheet") s.setCrop(0, 0, 80, 92);   // drop shins + feet (body is frame-y 16–115)
      else s.setCrop(0, 0, (s.frame && s.frame.width) || 20, Math.round(((s.frame && s.frame.height) || 28) * 0.66));
    }
    s.setDepth(y);
    scene.add.image(x, y, "t_chair").setScale(CHAIR_SCALE).setOrigin(0.5, 1).setDepth(y + 1);
    if (solids) { const z = scene.add.zone(x, y - 6, 26, 18); scene.physics.add.existing(z, true); solids.add(z); }
    return s;
  }

  // ======================================================================
  //  WALLED-ROOM KIT — shared by hospital floors and building lobbies:
  //  3/4 wall face, accent stripe, south door gap, full grid collision.
  // ======================================================================
  const WALL = 12, FACE = 44, DOORW = 46;
  function roomKit(scene, solids) {
    const solid = (x, y, w, h) => { const z = scene.add.zone(x, y, w, h); scene.physics.add.existing(z, true); solids.add(z); };
    const staff = (x, y, role, dir) => { const s = npcIdle(scene, x, y, role, dir); solid(x, y - 6, 22, 12); return s; };
    // A walled room in strict 3/4 perspective (project spec): lino floor, north
    // wall face + accent stripe, grid-aligned solid walls, and ONE door — south
    // by default, or in the east/west wall (opts.door: "s"|"e"|"w", opts.doorCY)
    // so rooms attach laterally and the camera walks between them.
    const procRoom = (x0, y0, w, h, name, accent, opts) => {
      opts = opts || {};
      const side = opts.door || "s";
      const doorX = x0 + w / 2;
      const doorCY = opts.doorCY != null ? opts.doorCY : y0 + FACE + (h - FACE) / 2;
      scene.add.tileSprite(x0, y0, w, h, "t_lino").setOrigin(0).setDepth(1);
      scene.add.tileSprite(x0, y0, w, FACE, "t_iwall").setOrigin(0).setDepth(2);
      const gfx = scene.add.graphics().setDepth(3);
      gfx.fillStyle(accent, 1); gfx.fillRect(x0, y0 + FACE - 6, w, 3);
      gfx.fillStyle(0x1c2331, 1);
      gfx.fillRect(x0 - WALL, y0 - WALL, w + 2 * WALL, WALL);          // top cap
      solid(x0 + w / 2, y0 + (FACE - WALL) / 2, w, FACE + WALL);       // north wall incl. face
      const vWall = (wx) => { gfx.fillRect(wx, y0 - WALL, WALL, h + 2 * WALL); solid(wx + WALL / 2, y0 + h / 2, WALL, h + 2 * WALL); };
      const vWallGap = (wx) => {                                        // side wall with a door gap
        const gT = doorCY - DOORW / 2, gB = doorCY + DOORW / 2;
        gfx.fillRect(wx, y0 - WALL, WALL, gT - (y0 - WALL));
        gfx.fillRect(wx, gB, WALL, (y0 + h + WALL) - gB);
        gfx.fillStyle(0x8f959d, 1); gfx.fillRect(wx, gT, WALL, DOORW);
        gfx.fillStyle(0x2b303c, 1); gfx.fillRect(wx, gT - 3, WALL, 3); gfx.fillRect(wx, gB, WALL, 3);
        gfx.fillStyle(0x1c2331, 1);
        solid(wx + WALL / 2, (y0 - WALL + gT) / 2, WALL, gT - (y0 - WALL));
        solid(wx + WALL / 2, (gB + y0 + h + WALL) / 2, WALL, (y0 + h + WALL) - gB);
      };
      if (side === "w") vWallGap(x0 - WALL); else vWall(x0 - WALL);
      if (side === "e") vWallGap(x0 + w); else vWall(x0 + w);
      if (side === "s") {
        const gapL = doorX - DOORW / 2, gapR = doorX + DOORW / 2;
        gfx.fillRect(x0 - WALL, y0 + h, gapL - (x0 - WALL), WALL);
        gfx.fillRect(gapR, y0 + h, (x0 + w + WALL) - gapR, WALL);
        gfx.fillStyle(0x8f959d, 1); gfx.fillRect(gapL, y0 + h, DOORW, WALL);
        gfx.fillStyle(0x2b303c, 1); gfx.fillRect(gapL - 3, y0 + h, 3, WALL); gfx.fillRect(gapR, y0 + h, 3, WALL);
        solid((x0 - WALL + gapL) / 2, y0 + h + WALL / 2, gapL - (x0 - WALL), WALL);
        solid((gapR + x0 + w + WALL) / 2, y0 + h + WALL / 2, (x0 + w + WALL) - gapR, WALL);
        label(scene, doorX, y0 + h + WALL + 9, name, 10).setDepth(4);
      } else {
        gfx.fillRect(x0 - WALL, y0 + h, w + 2 * WALL, WALL);
        solid(x0 + w / 2, y0 + h + WALL / 2, w + 2 * WALL, WALL);
        label(scene, doorX, y0 - WALL - 9, name, 10).setDepth(4);
      }
      return { doorX, doorCY };
    };
    return { solid, staff, procRoom };
  }

  // What kind of place is behind a lobby sign? Inferred from the POI text so the
  // themed rooms stay pure data (world.js lobby entries) with zero schema change.
  function poiTheme(p) {
    if (p.action === "conference") return "auditorium";
    const s = (p.label + " " + (p.msg || "")).toLowerCase();
    if (/lecture|auditorium|conference room/.test(s)) return "auditorium";
    if (/cafe|coffee|gift|food|snack/.test(s)) return "cafe";
    if (/lab|incubator|prototyp|imaging core|magnet|cro |vivarium|research|pi's|microscope|device rep|booth/.test(s)) return "lab";
    if (/library|stacks|study|book/.test(s)) return "study";
    if (/clinic|phlebotomy|check-in|exam|queue|ticket/.test(s)) return "clinic";
    return "office";
  }
  const THEME_ACCENT = { auditorium: 0x7a6a9f, cafe: 0x9a8550, lab: 0x4f8a9f, study: 0x9f8a4f, clinic: 0x6f8f5a, office: 0x5a6fbf };

  // ======================================================================
  const Boot = {
    key: "Boot",
    preload() {
      // NPC cast sheet (user-supplied pack; see game/assets/CREDITS.md).
      // RPG-Maker layout: 8 characters, 3 walk frames × 4 directions each.
      this.load.spritesheet("npcsheet", "assets/npcs.png", { frameWidth: 80, frameHeight: 120 });
      this.load.on("loaderror", () => {}); // procedural fallback sprites cover a failed load
    },
    create() {
      this.cameras.main.setBackgroundColor("#0e1420");
      label(this, 480, 250, "The Academic IR RPG", 22);
      label(this, 480, 278, "UMass Chan Medical School · University Campus", 12).setAlpha(0.75);
      const status = label(this, 480, 320, "Loading…", 13);
      this.input.keyboard.disableGlobalCapture();
      root.IRNet.init();

      const startGame = async () => {
        status.setText("Loading case data…");
        const FRESH = { funds: 0, clout: 0, casesCompleted: 0, bestScore: 0, xp: 0 };
        if (S.user && !S.guest) {
          try {
            const slots = await root.IRNet.loadSlots();
            const existing = slots.find(x => x.slot === 1);
            S.save = existing ? existing.save : Object.assign({}, FRESH);
          } catch (e) { S.save = Object.assign({}, FRESH); }
        } else {
          S.save = Object.assign({}, FRESH);
        }
        try {
          // every v_game_ready procedure is playable (P4: data-only expansion)
          S.cases = await root.IRGameData.listReady();
          if (!S.cases.length) throw new Error("no game-ready procedures");
          const startId = S.cases.some(c => c.id === S.save.lastCase) ? S.save.lastCase : S.cases[0].id;
          S.bundle = await root.IRGameData.loadCase(startId);
          root.IREcon.ensureInventory(S.save, S.bundle.config);
          // preop rules for every ready procedure (ward spawning); tolerate failure
          try { S.preop = await root.IRGameData.loadPreopMap(); } catch (e) { S.preop = {}; }
          // fill the ward beds (level-gated NPCs; migrates old saves in place)
          root.IRWard.ensureWard(S.save, S.cases, S.bundle.config, Date.now(), Math.random, S.preop);
          const enter = () => { root.IRUI.clear(); this.scene.start("Overworld"); };
          // First play (no saved look yet) → build your resident before entering.
          if (!S.save.appearance) {
            const meta = (S.user && S.user.user_metadata) || {};
            root.IRUI.CharCreator.show({
              name: S.save.name || meta.display_name || "",
              appearance: S.save.appearance,        // undefined → sensible defaults
              startLabel: "Enter the campus ▶",
              onStart: async (app) => {
                S.save.appearance = app; S.save.name = app.name;
                if (S.user && !S.guest) { try { await root.IRNet.writeSlot(S.slot, S.save); } catch (e) { /* saved locally regardless */ } }
                enter();
              },
            });
          } else { enter(); }
        } catch (e) {
          try { console.error("startGame failed:", e); } catch (_) {}
          status.setText("Could not start: " + ((e && e.message) || e));
        }
      };

      const resume = async () => {
        const u = await root.IRNet.currentUser().catch(() => null);
        if (u) { S.user = u; return startGame(); }
        root.IRUI.Auth.show({
          onSignIn: async (e, p) => { S.user = await root.IRNet.signIn(e, p); await startGame(); },
          onSignUp: async (e, p, n) => { S.user = await root.IRNet.signUp(e, p, n); if (!S.user) throw new Error("Check your email to confirm, then sign in."); await startGame(); },
          onGuest: () => { S.guest = true; startGame(); },
        });
      };
      resume();
    },
  };

  // ======================================================================
  //  OVERWORLD — scrolling UMass Chan campus
  // ======================================================================
  const Overworld = {
    key: "Overworld",
    create(data) {
      const W = root.IRWorld, TILE = W.TILE;
      this.busy = false;
      this._npcs = []; this._cars = [];      // reset per (re)create so restarts don't keep stale bodies
      W.ensureTextures(this);

      // --- layered tilemap: background = terrain (grass/roads/lots/sidewalks)
      const built = W.buildGrid();
      const map = this.make.tilemap({ data: built.grid, tileWidth: TILE, tileHeight: TILE });
      const tiles = map.addTilesetImage("tileset");
      map.createLayer(0, tiles, 0, 0).setDepth(0);

      // helipad decal (walkable)
      this.add.image(W.helipad.x * TILE, W.helipad.y * TILE, "t_helipad").setOrigin(0).setDepth(1);
      label(this, (W.helipad.x + 2.5) * TILE, (W.helipad.y - 0.4) * TILE, "HELIPAD", 10).setAlpha(0.6).setDepth(1);

      // green / lot / street / edge labels (positions from the site plan)
      W.labels.greens.forEach(([x, y, n]) => label(this, x * TILE, y * TILE, n, 11).setAlpha(0.55).setDepth(1));
      W.labels.lots.forEach(([x, y, n]) => label(this, x * TILE, y * TILE, n, 9).setAlpha(0.5).setDepth(1));
      W.labels.streets.forEach(([x, y, ang, n]) => label(this, x * TILE, y * TILE, n, 10).setAlpha(0.55).setDepth(1).setAngle(ang));
      W.labels.signs.forEach(([x, y, t]) => label(this, x * TILE + 60, y * TILE + 16, t, 12).setAlpha(0.85).setDepth(2));

      // --- midground: mask-footprint buildings (roofs + Y-sorted wall strips,
      //     skybridge Sherman↔MSB, per-run static bodies)
      const solids = this.physics.add.staticGroup();
      const portals = [];
      W.drawBuildings(this, solids).forEach(p => {
        const b = p.b, d = { x: p.x, y: p.y };
        if (b.enter) {
          portals.push({ x: d.x, y: d.y, w: p.w, h: p.h, label: "Enter " + b.name, onEnter: () => {
            S.lastDoor = { x: d.x, y: d.y + 6 };
            this.scene.start(b.enter === "Hospital" ? "Hospital" : "Lobby", { id: b.id });
          } });
        } else if (b.lockedMsg) {
          portals.push({ x: d.x, y: d.y, w: p.w, h: p.h, label: b.name, onEnter: () => { this.busy = false; root.IRUI.toast(b.lockedMsg); } });
        }
      });

      // --- street traffic: physics cars that queue + stop/honk for people ----
      //     (immovable so the player can't shove them; driven by velocity, with
      //     look-ahead braking handled in updateCars()). ------------------------
      const RD = root.IRWorldData && root.IRWorldData.roads;
      if (RD) {
        const CAR_TINTS = [0xd05a4a, 0x4a7ad0, 0xd8b84a, 0x9aa4b0, 0x4aa06a, 0xcfd4da, 0x8a6ad0];
        const lane = 0.62 * TILE;              // right-hand traffic, one lane each way
        // rightPx (horizontal cars): east travel limit. North/South roads now
        // dead-end at the lake, so their cars turn back at the shore instead of
        // driving over open water; Route 9 keeps rightPx null → crosses the bridge.
        const mkCar = (horiz, center, dir, slot, rightPx) => {
          const tint = CAR_TINTS[(Math.random() * CAR_TINTS.length) | 0];
          let x, y;
          if (horiz) {
            const rb = rightPx != null ? rightPx : W.WPX;
            y = center * TILE + TILE / 2 + (dir > 0 ? lane : -lane);
            x = dir > 0 ? (-140 - slot * 280)
                        : (rightPx != null ? (rb - 40 - slot * 280) : (W.WPX + 140 + slot * 280));
          } else { x = center * TILE + TILE / 2 + (dir > 0 ? -lane : lane); y = dir > 0 ? (-160 - slot * 320) : (W.HPX + 160 + slot * 320); }
          const c = this.physics.add.image(x, y, horiz ? "t_car_h" : "t_car_v").setScale(2).setTint(tint).setDepth(y);
          if (horiz) c.setFlipX(dir < 0); else c.setFlipY(dir < 0);
          c.body.setImmovable(true); c.body.pushable = false; c.body.setAllowGravity(false);
          c.horiz = horiz; c.dir = dir; c.cruise = 72 + Math.random() * 46; c.honkCd = 0;
          if (horiz && rightPx != null) c.xMax = rightPx;
          this._cars.push(c);
        };
        const shoreX = (RD.water && RD.water.length ? RD.water[0] : W.COLS) * TILE - 4;  // west edge of the lake
        [RD.north, RD.south].forEach(cy => [1, -1].forEach(dir => { mkCar(true, cy, dir, 0, shoreX); mkCar(true, cy, dir, 1, shoreX); }));
        [1, -1].forEach(dir => { mkCar(true, RD.route9, dir, 0); mkCar(true, RD.route9, dir, 1); });  // Route 9 crosses the bridge, full width
        [RD.plantation, RD.lakeAve].forEach(cx => [1, -1].forEach(dir => mkCar(false, cx, dir, 0)));
      }

      // --- pedestrians strolling the campus sidewalks (slow + natural; wired into
      //     the same physics, and the cars brake/honk for them at the curb). The
      //     tile ranges below sit on verified sidewalk runs flanking the roads.
      const ped = (cx, cy, dcx, dcy, role) => npcPatrol(this, cx * TILE + 16, cy * TILE + 16, role, dcx * TILE, dcy * TILE, 0);
      ped(10, 11, 12, 0, "visitor");     // north-road sidewalk, heading east
      ped(38, 11, -12, 0, "doctor");     // north-road sidewalk, heading west
      ped(9, 48, 14, 0, "senior");       // Route 9 sidewalk
      ped(4, 14, 0, 12, "resident");     // Plantation St sidewalk (vertical)
      ped(49, 15, 0, 11, "residentF");   // Lake Ave sidewalk (vertical)
      ped(33, 30, 12, 0, "visitor");     // south-road sidewalk, east of the quads

      // --- trees (Y-sorted, trunk-only collision). Scaled 1.5× so a full-grown
      //     campus tree still towers over the 2× player/NPC cast.
      W.treeList().forEach(t => {
        const tx = (t.c + 0.5) * TILE, ty = (t.r + 1) * TILE;
        this.add.image(tx, ty, "tree" + t.v).setScale(1.5).setOrigin(0.5, 1).setDepth(ty);
        const trunk = this.add.zone(tx, ty - 8, 18, 12);
        this.physics.add.existing(trunk, true); solids.add(trunk);
      });

      // --- The two quads: a lamp post in each grass corner with a shrub beside
      //     it, plus a bike rack. Cobblestone ring + striped lawn are terrain;
      //     these props sit on top, Y-sorted, each with base collision so the
      //     player can't walk through them.
      const zone = (x, y, w2, h2) => { const z = this.add.zone(x, y, w2, h2); this.physics.add.existing(z, true); solids.add(z); };
      (W.quads || []).forEach((QD) => {
        (QD.shrubs || []).forEach(([c, r]) => {
          const sx = c * TILE + TILE / 2, sy = r * TILE + TILE - 4;
          this.add.image(sx, sy, "t_shrub").setScale(1.4).setOrigin(0.5, 1).setDepth(sy);
          zone(sx, sy - 6, 24, 10);
        });
        (QD.lamps || []).forEach(([c, r]) => {
          const lx = c * TILE + TILE / 2, ly = r * TILE + TILE - 4;
          this.add.image(lx, ly, "t_lamp").setScale(2).setOrigin(0.5, 1).setDepth(ly);   // taller than people
          zone(lx, ly - 4, 10, 8);
        });
        (QD.bikeracks || []).forEach(([c, r]) => {
          const bx = c * TILE + TILE / 2, by = r * TILE + TILE - 4;
          this.add.image(bx, by, "t_bikerack").setScale(1.6).setOrigin(0.5, 1).setDepth(by);
          zone(bx, by - 8, 62, 12);
        });
      });

      // --- player + camera follow across the whole campus
      const sp = (data && data.spawn) || S.lastDoor || W.spawnDefault;
      spawnPlayer(this, sp.x, sp.y);
      this.physics.world.setBounds(0, 0, W.WPX, W.HPX);
      this.physics.add.collider(this.player, solids);
      if (this._cars.length) this.physics.add.collider(this.player, this._cars); // can't walk through a car
      wireNpcPhysics(this, solids);                                              // NPCs vs walls/each other/player/cars
      this.cameras.main.setBounds(0, 0, W.WPX, W.HPX).startFollow(this.player, true, 0.15, 0.15).setBackgroundColor("#101724");

      // --- HUD + campus map key
      const who = (S.save && S.save.name) || (S.guest ? "guest (no save)" : ((S.user && S.user.email) || "resident"));
      this._hud = hud(this, "");
      const refreshHud = () => {
        const lv = root.IRWard.levelFor((S.bundle && S.bundle.config) || {}, S.save.xp || 0);
        this._hud.setText("Lv " + lv.level + " " + lv.title + " · Funds " + S.save.funds + " · Cases " + S.save.casesCompleted + " · " + who + "\n[M] map · [B] bag · [E] enter · arrows/WASD walk");
      };
      refreshHud();
      const mapBtn = this.add.text(950, 8, "🗺 MAP [M]", { fontFamily: "monospace", fontSize: "13px", color: "#ffe08a", backgroundColor: "#0e1420cc", padding: { x: 8, y: 5 } })
        .setOrigin(1, 0).setScrollFactor(0).setDepth(1e6).setInteractive({ useHandCursor: true });

      // NB: the scene keeps running under the map overlay (busy flag stops
      // movement/portals) — pausing here left stale keys in Phaser's queue
      // and could wedge input on resume.
      const openMap = () => {
        if (this.busy) return;
        this.busy = true;
        this.input.keyboard.resetKeys();
        root.IRUI.CampusMap.show(W, { x: this.player.x, y: this.player.y }, {
          onClose: () => { this.busy = false; this.input.keyboard.resetKeys(); },
          onTravel: (id) => {
            const b = W.byId(id), d = W.doorFor(b);
            this.player.setPosition(d.x, d.y + 4);
            this.cameras.main.centerOn(d.x, d.y);
            this.busy = false; this.input.keyboard.resetKeys();
            root.IRUI.toast("🚌 Campus shuttle → " + b.name);
          },
        });
      };
      this.input.keyboard.on("keydown-M", openMap);
      mapBtn.on("pointerdown", openMap);

      // --- Bag (supply cart), openable while walking ([B] / button)
      const bagBtn = this.add.text(950, 34, "🎒 BAG [B]", { fontFamily: "monospace", fontSize: "13px", color: "#a6ce39", backgroundColor: "#0e1420cc", padding: { x: 8, y: 5 } })
        .setOrigin(1, 0).setScrollFactor(0).setDepth(1e6).setInteractive({ useHandCursor: true });
      const openBag = () => {
        if (this.busy) return;
        this.busy = true;
        this.input.keyboard.resetKeys();
        root.IRUI.Bag.show({
          inventory: root.IREcon.ensureInventory(S.save, (S.bundle && S.bundle.config) || {}),
          devices: (S.bundle && S.bundle.devices) || [],
        }, {
          onClose: () => { this.busy = false; this.input.keyboard.resetKeys(); },
          onInspect: (id, d) => root.IRUI.toast(d.name || id),
        });
      };
      this.input.keyboard.on("keydown-B", openBag);
      bagBtn.on("pointerdown", openBag);

      makePortals(this, portals);
      if (!S.seenIntro) { S.seenIntro = true; root.IRUI.toast("Welcome to the University Campus. Walk anywhere — or press [M] for the shuttle map.", 3500); }
    },
    update() { movePlayer(this, 240); updatePortals(this); updateCars(this); updateNpcs(this); },
  };

  // ======================================================================
  //  MODULAR ROOM NODES — each room is its OWN coordinate region in a larger
  //  world; the camera follows the player and pans seamlessly between adjacent
  //  nodes (project spec: same-level rooms = adjacent nodes, seamless panning).
  //  drawNodeShell paints one room's floor + walls; sides are false=solid wall,
  //  true=centred doorway, "open"=no wall (handed off to a neighbour).
  // ======================================================================
  function drawNodeShell(scene, node, solids, doors, accent, name) {
    const x = node.x, y = node.y, w = node.w, h = node.h, WT = 12, FH = 44, DW = 72;
    doors = doors || {};
    const solid = (sx, sy, sw, sh) => { const z = scene.add.zone(sx, sy, sw, sh); scene.physics.add.existing(z, true); solids.add(z); };
    scene.add.tileSprite(x, y, w, h, "t_lino").setOrigin(0).setDepth(0);
    const g = scene.add.graphics().setDepth(2); g.fillStyle(0x1c2331, 1);
    if (doors.n !== "open") {                                        // 3/4 back wall + accent stripe
      scene.add.tileSprite(x, y, w, FH, "t_iwall").setOrigin(0).setDepth(1);
      scene.add.graphics().setDepth(3).fillStyle(accent || 0x41609f, 1).fillRect(x, y + FH - 6, w, 3);
      solid(x + w / 2, y + (FH - WT) / 2, w, FH);
    }
    const hWall = (wy, side) => {
      if (side === "open") return;
      if (side === true) { const gl = x + w / 2 - DW / 2, gr = x + w / 2 + DW / 2;
        g.fillRect(x - WT, wy, gl - (x - WT), WT); g.fillRect(gr, wy, (x + w + WT) - gr, WT);
        solid((x - WT + gl) / 2, wy + WT / 2, gl - (x - WT), WT); solid((gr + x + w + WT) / 2, wy + WT / 2, (x + w + WT) - gr, WT);
      } else { g.fillRect(x - WT, wy, w + 2 * WT, WT); solid(x + w / 2, wy + WT / 2, w + 2 * WT, WT); }
    };
    const vWall = (wx, side) => {
      if (side === "open") return;
      if (side === true) { const gt = y + h / 2 - DW / 2, gb = y + h / 2 + DW / 2;
        g.fillRect(wx, y - WT, WT, gt - (y - WT)); g.fillRect(wx, gb, WT, (y + h + WT) - gb);
        solid(wx + WT / 2, (y - WT + gt) / 2, WT, gt - (y - WT)); solid(wx + WT / 2, (gb + y + h + WT) / 2, WT, (y + h + WT) - gb);
      } else { g.fillRect(wx, y - WT, WT, h + 2 * WT); solid(wx + WT / 2, y + h / 2, WT, h + 2 * WT); }
    };
    hWall(y - WT, doors.n); hWall(y + h, doors.s); vWall(x - WT, doors.w); vWall(x + w, doors.e);
    if (name) label(scene, x + w / 2, y + 22, name, 12, { backgroundColor: "#0e1420cc", padding: { x: 6, y: 2 } }).setDepth(6);
  }
  // Camera: follow the player across the whole node world (bounds = union of all
  // nodes) so it pans smoothly from one room to the next. Tracks the current node
  // for the on-screen room label.
  function setupNodeWorld(scene, nodes, pad) {
    pad = pad || 12;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    nodes.forEach(nd => { minx = Math.min(minx, nd.x); miny = Math.min(miny, nd.y); maxx = Math.max(maxx, nd.x + nd.w); maxy = Math.max(maxy, nd.y + nd.h); });
    const bx = minx - pad, by = miny - pad, bw = (maxx - minx) + 2 * pad, bh = (maxy - miny) + 2 * pad;
    scene._nodes = nodes;
    scene.physics.world.setBounds(bx, by, bw, bh);
    scene.cameras.main.setBounds(bx, by, bw, bh).startFollow(scene.player, true, 0.12, 0.12);
  }
  function updateNodeLabel(scene) {
    const nodes = scene._nodes, p = scene.player; if (!nodes || !p || !scene._nodeTag) return;
    const cur = scene._node;
    if (cur && p.x >= cur.x && p.x <= cur.x + cur.w && p.y >= cur.y && p.y <= cur.y + cur.h) return;
    const nd = nodes.find(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (nd && nd !== cur) { scene._node = nd; scene._nodeTag.setText(nd.name || ""); }
  }

  // ======================================================================
  //  LOBBY — generic interior for non-hospital buildings
  // ======================================================================
  const Lobby = {
    key: "Lobby",
    create(data) {
      const W = root.IRWorld;
      const b = W.byId(data && data.id) || W.buildings.find(x => x.enter === "Lobby");
      const upper = data && data.floor === "library";       // MSB library lives upstairs
      this.busy = false;
      this._npcs = [];                                       // reset per (re)create
      W.ensureTextures(this); W.paintInterior(this);
      this.cameras.main.setBackgroundColor("#0b1019");

      const x0 = 96, y0 = 148, rw = 768, rh = 416;
      const solids = this.physics.add.staticGroup();
      const portals = [];
      const K = roomKit(this, solids);
      // building name — scroll-fixed so it stays put as the camera pans the nodes
      this.add.text(480, 12, b.name + (upper ? " — Library (2nd floor)" : ""),
        { fontFamily: "monospace", fontSize: "15px", color: TEXT, backgroundColor: "#0e1420cc", padding: { x: 8, y: 4 } })
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(1e6);
      this._nodeTag = this.add.text(480, 40, "", { fontFamily: "monospace", fontSize: "12px", color: "#a6c8ff", backgroundColor: "#0e142088", padding: { x: 6, y: 2 } })
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(1e6);

      if (upper) {
        // ================= LIBRARY FLOOR (Medical School) — single screen =====
        this.add.tileSprite(x0, y0 + 82, rw, rh - 82, "t_lino").setOrigin(0).setDepth(0);
        this.add.tileSprite(x0, y0, rw, 82, "t_iwall").setOrigin(0).setDepth(1);
        const frame = this.add.graphics().setDepth(2);
        frame.fillStyle(0x1c2331, 1);
        frame.fillRect(x0 - 10, y0 - 10, rw + 20, 10); frame.fillRect(x0 - 10, y0 + rh, rw + 20, 12);
        frame.fillRect(x0 - 10, y0 - 10, 10, rh + 22); frame.fillRect(x0 + rw, y0 - 10, 10, rh + 22);
        this.cameras.main.setBounds(0, 0, 960, 640);
        this.physics.world.setBounds(112, 232, 736, 330);
        const shelfRow = (sx, sy, wpx) => {
          const g = this.add.graphics().setDepth(sy + 30);
          g.fillStyle(0x5a4632, 1).fillRect(sx, sy, wpx, 30);
          g.fillStyle(0x3b2f22, 1).fillRect(sx, sy + 26, wpx, 6);
          const cols = [0x9f4a3a, 0x3a6e9f, 0x4a8a5a, 0xc4a24a, 0x7a5a9f];
          for (let bx2 = 0; bx2 < Math.floor((wpx - 8) / 7); bx2++) {
            g.fillStyle(cols[(bx2 * 7 + sy) % 5], 1).fillRect(sx + 4 + bx2 * 7, sy + 4, 5, 20);
          }
          K.solid(sx + wpx / 2, sy + 16, wpx, 30);
        };
        [252, 316, 380].forEach((sy, i) => { shelfRow(150, sy, 300); shelfRow(510, sy, 300); });
        // reading tables between the stacks
        const tbl = this.add.graphics().setDepth(470);
        tbl.fillStyle(0x9a7a56, 1).fillRect(400, 440, 160, 26); tbl.fillStyle(0xb08c62, 1).fillRect(400, 436, 160, 6);
        K.solid(480, 452, 160, 30);
        npcSeated(this, 430, 492, rndChar(), "u");
        npcSeated(this, 530, 492, rndChar(), "u");
        npcSeated(this, 480, 430, rndChar(), "d");
        // librarian desk near the stairs
        this.add.image(150, 452, "t_desk").setOrigin(0, 0).setDepth(514); K.solid(214, 492, 128, 42);
        npcTalker(this, 250, 452, "senior", "d");
        this.add.image(120, 240, "t_plant").setOrigin(0.5, 1).setDepth(240);
        this.add.image(840, 240, "t_plant").setOrigin(0.5, 1).setDepth(240);
        portals.push({ x: 250, y: 470, w: 90, h: 50, label: "Ask the librarian", onEnter: () => {
          this.busy = false; root.IRUI.toast("\u201cKandarpa is on reserve. Again. Third-years.\u201d", 3200); } });
        portals.push({ x: 660, y: 330, w: 320, h: 180, label: "Browse the stacks", onEnter: () => {
          this.busy = false; root.IRUI.toast("The stacks smell like 1978. A first-year is asleep on a copy of Kandarpa.", 3400); } });
        // stairs back down
        this.add.image(786, 154, "t_stairs").setOrigin(0).setDepth(2);
        portals.push({ x: 818, y: 262, w: 60, h: 40, label: "Stairs down — Lobby", onEnter: () => this.scene.restart({ id: b.id }) });
        spawnPlayer(this, 770, 300);
        this.physics.add.collider(this.player, solids);
        wireNpcPhysics(this, solids);
        hud(this, "[E] interact · stairs to go down");
        makePortals(this, portals);
        return;
      }

      // ================= GROUND FLOOR: themed rooms as modular NODES =========
      // Each themed room is its OWN coordinate region above a shared hall; the
      // camera follows the player and pans seamlessly between the nodes (project
      // spec: same-level rooms = adjacent nodes). Content is authored in each
      // room's own local space (rx/top), reused verbatim from the old layout.
      const pois = (b.lobby.pois || []).slice();
      const corridorPoi = pois.find(p => /corridor to umass/i.test(p.label));
      const libraryPoi = pois.find(p => /^library/i.test(p.label));
      const roomPois = pois.filter(p => p !== corridorPoi && p !== libraryPoi);

      const n = Math.max(1, roomPois.length);
      const RW = 780, ROOMH = 380, HALLH = 300, hallY = ROOMH, worldW = n * RW;
      const nodes = [];

      roomPois.forEach((p, i) => {
        const theme = poiTheme(p);
        const node = { id: "room" + i, name: p.label, x: i * RW, y: 0, w: RW, h: ROOMH };
        nodes.push(node);
        drawNodeShell(this, node, solids, { s: true }, THEME_ACCENT[theme], p.label.length > 24 ? p.label.slice(0, 23) + "…" : p.label);
        const rx = node.x, RW2 = RW, RY = node.y, top = node.y + FACE, cx = rx + RW2 / 2;
        const say = (msg) => () => { this.busy = false; root.IRUI.toast(msg, 3400); };

        if (theme === "auditorium") {
          // stage, randomly generated speaker mid-lecture, random seated audience
          const stage = this.add.graphics().setDepth(4);
          stage.fillStyle(0x3a3448, 1).fillRect(rx + 10, top + 2, RW2 - 20, 26);
          stage.fillStyle(0x584f6e, 1).fillRect(rx + 10, top + 2, RW2 - 20, 4);
          this.add.image(cx - 34, top + 10, "t_kiosk").setOrigin(0.5, 1).setDepth(top + 10); // podium
          npcTalker(this, cx - 10, top + 24, rndChar(), "d");
          for (let r = 0; r < 2; r++) for (let c2 = 0; c2 < Math.floor((RW2 - 44) / 40); c2++) {
            if (Math.random() < 0.72) npcSeated(this, rx + 34 + c2 * 40, top + 66 + r * 34, rndChar(), "u");
          }
          const act = p.action === "conference" ? () => Conference.run(this) : say(p.msg || "The talk is mid-slide 47 of 90.");
          portals.push({ x: cx, y: top + 30, w: RW2 - 30, h: 40, label: p.label, onEnter: act });
        } else if (theme === "cafe") {
          // counter, espresso rig, animated barista, menu board, seated customers
          const bar = this.add.graphics().setDepth(top + 34);
          bar.fillStyle(0x6a5530, 1).fillRect(rx + 12, top + 22, RW2 - 24, 18);
          bar.fillStyle(0x8a744a, 1).fillRect(rx + 12, top + 18, RW2 - 24, 6);
          bar.fillStyle(0x2b303c, 1).fillRect(rx + RW2 - 52, top + 4, 26, 16);   // espresso machine
          bar.fillStyle(0x69d2e7, 1).fillRect(rx + RW2 - 48, top + 8, 6, 4);
          K.solid(cx, top + 30, RW2 - 24, 20);
          this.add.image(rx + 20, RY + 6, "t_board").setOrigin(0).setDepth(3);   // menu board
          npcTalker(this, cx, top + 16, "visitor", "d");                          // barista at work
          npcSeated(this, rx + 34, top + 84, rndChar(), "r");
          npcSeated(this, rx + RW2 - 34, top + 96, rndChar(), "l");
          portals.push({ x: cx, y: top + 44, w: RW2 - 30, h: 34, label: "Order at the counter", onEnter: () => {
            this.busy = false;
            const menu = ["drip coffee", "oat-milk latte", "day-old bagel", "turkey club", "matcha", "cold brew"];
            const item = menu[(Math.random() * menu.length) | 0];
            if ((S.save.funds || 0) >= 2) {
              S.save.funds -= 2; persistSave();
              root.IRUI.toast("\u2615 One " + item + " (\u22122 funds). The barista nails your name on the first try.", 3600);
            } else {
              root.IRUI.toast("\u2615 You are broke. The barista slides you an ice water. Kindness.", 3400);
            }
          } });
        } else if (theme === "lab") {
          const bench = this.add.graphics().setDepth(top + 40);
          bench.fillStyle(0x39404d, 1).fillRect(rx + 14, top + 26, RW2 - 28, 14);
          bench.fillStyle(0x4a5262, 1).fillRect(rx + 14, top + 22, RW2 - 28, 6);
          bench.fillStyle(0x69d2e7, 0.9).fillRect(rx + 20, top + 14, 8, 10);     // reagent glassware
          bench.fillStyle(0x97c459, 0.9).fillRect(rx + 34, top + 16, 8, 8);
          K.solid(cx, top + 32, RW2 - 28, 18);
          npcIdle(this, rx + RW2 - 40, top + 20, "residentF", "d");
          npcPatrol(this, rx + 40, top + 90, "resident", RW2 - 80, 0, 4200);
          portals.push({ x: cx, y: top + 46, w: RW2 - 30, h: 36, label: p.label, onEnter: say(p.msg || "Science is occurring.") });
          portals.push({ x: rx + 27, y: top + 20, w: 34, h: 26, label: "Microscope", onEnter: say("Cells. Probably important ones.") });
        } else if (theme === "study") {
          const g2 = this.add.graphics().setDepth(top + 30);
          g2.fillStyle(0x5a4632, 1).fillRect(rx + 12, top + 6, RW2 - 24, 22);
          const cols = [0x9f4a3a, 0x3a6e9f, 0x4a8a5a, 0xc4a24a];
          for (let bx2 = 0; bx2 < Math.floor((RW2 - 32) / 7); bx2++) g2.fillStyle(cols[bx2 % 4], 1).fillRect(rx + 16 + bx2 * 7, top + 9, 5, 15);
          K.solid(cx, top + 17, RW2 - 24, 22);
          npcSeated(this, rx + 40, top + 78, rndChar(), "u");
          npcSeated(this, rx + 90, top + 78, rndChar(), "u");
          portals.push({ x: cx, y: top + 50, w: RW2 - 30, h: 40, label: p.label, onEnter: say(p.msg || "Quiet study. Someone is highlighting an entire page.") });
        } else if (theme === "clinic") {
          this.add.image(rx + 36, top + 10, "t_bed").setOrigin(0.5, 0).setDepth(top + 66); K.solid(rx + 36, top + 40, 36, 40);
          const rail = this.add.graphics().setDepth(4);
          rail.fillStyle(0x8b97a7, 1).fillRect(rx + 60, top + 2, RW2 - 76, 3);   // curtain rail
          rail.fillStyle(0x9fc4e0, 0.5).fillRect(rx + 66, top + 5, 30, 34);
          npcIdle(this, rx + RW2 - 44, top + 30, "nurse", "l");
          npcSeated(this, rx + RW2 - 34, top + 96, rndChar(), "l");
          portals.push({ x: cx, y: top + 50, w: RW2 - 30, h: 40, label: p.label, onEnter: say(p.msg || "The clinic hums along.") });
        } else { // office
          this.add.image(rx + 16, top + 8, "t_desk").setOrigin(0, 0).setDepth(top + 70); K.solid(rx + 80, top + 48, 120, 40);
          npcIdle(this, rx + 76, top + 8, "visitor", "d");
          this.add.image(rx + RW2 - 24, top + 6, "t_plant").setOrigin(0.5, 1).setDepth(top + 6);
          portals.push({ x: cx, y: top + 60, w: RW2 - 30, h: 40, label: p.label, onEnter: say(p.msg || "Office hours, allegedly.") });
        }
      });

      // ---- shared HALL node (below, spans every room) — the hub -------------
      const hall = { id: "hall", name: b.name + " — Lobby", x: 0, y: hallY, w: worldW, h: HALLH };
      nodes.push(hall);
      drawNodeShell(this, hall, solids, { n: roomPois.length ? "open" : false }, 0x41609f, null);
      const hcx = worldW / 2;
      this.add.image(hcx - 64, hallY + 78, "t_desk").setOrigin(0).setDepth(hallY + 140);
      const deskBody = this.add.zone(hcx, hallY + 118, 128, 42); this.physics.add.existing(deskBody, true); solids.add(deskBody);
      npcIdle(this, hcx, hallY + 82, "senior", "d");                                 // front desk
      [[26, hallY + 44], [worldW - 26, hallY + 44], [26, hallY + HALLH - 18], [worldW - 26, hallY + HALLH - 18]]
        .forEach(([px, py]) => this.add.image(px, py, "t_plant").setOrigin(0.5, 1).setDepth(py));
      npcPatrol(this, hcx - 180, hallY + 210, "visitor", 360, 0, 10000);
      if (Math.random() < 0.6) npcSeated(this, hcx - 260, hallY + 150, rndChar(), "r");
      // exit door (south wall of the hall) → campus
      const door = this.add.graphics().setDepth(hallY + HALLH + 4);
      door.fillStyle(0x20262e, 1).fillRect(hcx - 36, hallY + HALLH - 6, 72, 16);
      door.fillStyle(0x2a4a66, 1).fillRect(hcx - 32, hallY + HALLH - 3, 30, 12).fillRect(hcx + 2, hallY + HALLH - 3, 30, 12);
      portals.push({ x: hcx, y: hallY + HALLH, w: 90, h: 50, label: "Exit to campus", onEnter: () => this.scene.start("Overworld") });
      // MSB: stairs up to the library (hard gateway) — west end of the hall
      if (libraryPoi) {
        this.add.image(20, hallY + 24, "t_stairs").setOrigin(0).setDepth(hallY + 60);
        portals.push({ x: 56, y: hallY + 130, w: 72, h: 60, label: "Stairs up — Library", onEnter: () => this.scene.restart({ id: b.id, floor: "library" }) });
      }
      // MSB: corridor to UMass Memorial (hard gateway) — east end of the hall
      if (corridorPoi) {
        const dg = this.add.graphics().setDepth(hallY + 60);
        dg.fillStyle(0x20262e, 1).fillRect(worldW - 92, hallY + 24, 84, 56);
        dg.fillStyle(0x2a4a66, 1).fillRect(worldW - 86, hallY + 30, 34, 44).fillRect(worldW - 46, hallY + 30, 34, 44);
        label(this, worldW - 50, hallY + 12, "TO UMASS MEMORIAL →", 9).setAlpha(0.8).setDepth(hallY + 62);
        portals.push({ x: worldW - 50, y: hallY + 88, w: 110, h: 60, label: "Corridor to UMass Memorial", onEnter: () => { S.lastDoor = null; this.scene.start("Hospital", { floor: "1" }); } });
      }

      spawnPlayer(this, hcx, hallY + HALLH - 70);
      this.physics.add.collider(this.player, solids);
      wireNpcPhysics(this, solids);
      setupNodeWorld(this, nodes);
      hud(this, "[E] interact · walk room to room · exit south");
      makePortals(this, portals);
    },
    update() { movePlayer(this, 210); updatePortals(this); updateNpcs(this); updateNodeLabel(this); },
  };

  // ======================================================================
  //  CONFERENCE — podium defense in the Sherman Center auditorium (P3).
  //  Dossier + answer key = the literal papers row (accuracy contract).
  const Conference = {
    run(scene) {
      const B = S.bundle, DF = B.defense;
      const cfg = B.config.defense_rewards || {};
      const resume = () => { root.IRUI.clear(); scene.busy = false; scene.input.keyboard.resetKeys(); };
      if (!DF || !DF.papers.length || !DF.templates.length) {
        scene.busy = false; root.IRUI.toast("No defense-linked paper published yet — check back after the next data entry session."); return;
      }
      if ((S.save.casesCompleted || 0) < (cfg.min_cases_to_present || 1)) {
        scene.busy = false; root.IRUI.toast("You have no results to present — complete a case at UMass Memorial first."); return;
      }
      const paper = DF.papers[0];
      S.save.defenses = S.save.defenses || {};
      const prior = S.save.defenses[paper.id] || 0;
      const tiers = (B.config.clout_tiers && B.config.clout_tiers.tiers) || [];
      const tierFor = (clout) => { let t = tiers[0] || { name: "—" }; tiers.forEach(x => { if (clout >= x.min) t = x; }); return t; };

      const engine = root.IRDefense.create({
        paper, templates: DF.templates, archetypes: DF.archetypes,
        config: B.config, seed: (Math.random() * 2 ** 31) | 0,
      });
      root.IRUI.Conference.show(engine, {
        prior,
        tierLine: (v) => {
          const t = tierFor(Math.max(0, (S.save.clout || 0) + v.clout));
          return t.name + " (clout " + Math.max(0, (S.save.clout || 0) + v.clout) + ", payouts ×" + (t.payout_mult || 1) + ")";
        },
      }, {
        onClose: resume,
        onFinish: async (v) => {
          const before = tierFor(S.save.clout || 0);
          S.save.clout = Math.max(0, (S.save.clout || 0) + v.clout);
          if (!v.ejected) S.save.defenses[paper.id] = prior + 1;
          const after = tierFor(S.save.clout);
          let grantMsg = "";
          if (after.matching_grant && !S.save.grantClaimed && !v.ejected) {
            const g = Math.min(S.save.funds || 0, cfg.matching_grant_cap || 5000);
            if (g > 0) { S.save.funds += g; S.save.grantClaimed = true; grantMsg = " 💰 KOL matching grant: +" + g + " funds."; }
          }
          if (!S.guest && S.user) {
            try { S.save.updatedAt = new Date().toISOString(); await root.IRNet.writeSlot(S.slot, S.save); }
            catch (e) { root.IRUI.toast("Save failed: " + (e.message || e)); }
          }
          resume();
          root.IRUI.toast(v.ejected
            ? "🥀 Ejected. Clout " + v.clout + ". The moderator avoids eye contact."
            : "🏛 " + (before.name !== after.name ? "PROMOTED: " + after.name + "! " : "") + "+" + v.clout + " clout." + grantMsg, 4200);
        },
      });
    },
  };

  // ======================================================================
  //  HOSPITAL — UMass Memorial, multi-floor (B / 1 / 2 / 3)
  //  Stairs move one flight; the elevator reaches any floor; campus exit
  //  is from the 1st-floor lobby only.
  // ======================================================================
  const FLOOR_ORDER = ["B", "1", "2", "3", "4", "5", "6"];
  const FLOOR_INFO = {
    B: { title: "Basement — Sim Lab & Supply Chain" },
    1: { title: "1st Floor — Main Lobby" },
    2: { title: "2nd Floor — Inpatient Wards" },
    3: { title: "3rd Floor — Interventional Radiology" },
    4: { title: "4th Floor — CT Imaging" },
    5: { title: "5th Floor — Ultrasound" },
    6: { title: "6th Floor — Staff Lounge & Call Rooms" },
  };
  const ROOM_LABEL = { ir_suite: "IR Suite", ct_suite: "CT Suite", us_room: "Ultrasound Room", bedside: "Bedside" };
  const ROOM_FLOOR = { ir_suite: "3", ct_suite: "4", us_room: "5" };   // one procedure room per floor
  const PROC_FLOORS = { 3: "ir_suite", 4: "ct_suite", 5: "us_room" };
  // Ward bed slots on floor 2 (grid-aligned; Y-sorted with the player)
  const BED_POS = [[540, 300], [620, 300], [700, 300], [540, 470], [620, 470], [700, 470]];

  // ---- shared case-flow helpers -------------------------------------------
  function persistSave() {
    if (S.guest || !S.user) return;
    S.save.updatedAt = new Date().toISOString();
    root.IRNet.writeSlot(S.slot, S.save).catch(e => root.IRUI.toast("Save failed: " + (e.message || e)));
  }
  function backToHub(scene) {
    root.IRUI.clear();
    scene.busy = false;
    scene.input.keyboard.resetKeys();
    if (scene._refreshHud) scene._refreshHud();
    if (scene._refreshBeds) scene._refreshBeds();
    if (scene._refreshRooms) scene._refreshRooms();
  }
  function ensureWardState() {
    return root.IRWard.ensureWard(S.save, S.cases, (S.bundle && S.bundle.config) || {}, Date.now(), Math.random, S.preop || {});
  }
  const cloutMultOf = (cfg) => {
    const tiers = (cfg.clout_tiers && cfg.clout_tiers.tiers) || [{ min: 0, payout_mult: 1 }];
    let m = 1; tiers.forEach(t => { if ((S.save.clout || 0) >= t.min) m = t.payout_mult; });
    return m;
  };

  const Hospital = {
    key: "Hospital",
    create(data) {
      const W = root.IRWorld;
      const floor = (data && data.floor) || "1";
      this.busy = false;
      // scene.restart() reuses this instance — clear per-floor state or the ward
      // refreshers leak onto other floors (the "floating bodies" bug).
      this._refreshBeds = null; this._refreshRooms = null;
      this._ptSprites = []; this._roomSprites = []; this._npcs = [];
      W.ensureTextures(this); W.paintInterior(this);
      this.cameras.main.setBackgroundColor("#0b1019");

      // room shell: floor + north wall face + frame
      this.add.tileSprite(120, 150, 720, 440, "t_lino").setOrigin(0).setDepth(0);
      this.add.tileSprite(120, 150, 720, 82, "t_iwall").setOrigin(0).setDepth(1);
      const frame = this.add.graphics().setDepth(2);
      frame.fillStyle(0x1c2331, 1);
      frame.fillRect(110, 140, 740, 10); frame.fillRect(110, 590, 740, 12);
      frame.fillRect(110, 140, 10, 462); frame.fillRect(840, 140, 10, 462);
      label(this, 480, 110, "UMass Memorial Medical Center — " + FLOOR_INFO[floor].title, 15);
      if (floor === "B") this.add.rectangle(480, 371, 720, 441, 0x0a0e16, 0.22).setDepth(2000); // dim basement (above sprites, below HUD)

      const room = (x, y, w, h, color, stroke, txt) => {
        this.add.rectangle(x, y, w, h, color, 0.92).setStrokeStyle(2, stroke).setDepth(3);
        label(this, x, y, txt, 12).setDepth(4);
      };
      const solids = this.physics.add.staticGroup();
      const solid = (x, y, w, h) => { const z = this.add.zone(x, y, w, h); this.physics.add.existing(z, true); solids.add(z); };

      // --- vertical circulation on the north wall (every floor) -----------
      const portals = [];
      this.add.image(210, 154, "t_elev").setOrigin(0).setDepth(2);
      label(this, 240, 246, "ELEVATOR", 9).setAlpha(0.6).setDepth(2);
      this.add.image(680, 154, "t_stairs").setOrigin(0).setDepth(2);
      label(this, 712, 246, "STAIRS", 9).setAlpha(0.6).setDepth(2);
      const idx = FLOOR_ORDER.indexOf(floor);
      const go = (f) => this.scene.restart({ floor: f });
      portals.push({ x: 240, y: 262, w: 70, h: 40, label: "Elevator", onEnter: () => {
        root.IRUI.Elevator.show(floor, FLOOR_ORDER, FLOOR_INFO, {
          onPick: (f) => { root.IRUI.toast("🛗 " + FLOOR_INFO[f].title); go(f); },
          onClose: () => { this.busy = false; this.input.keyboard.resetKeys(); },
        });
      } });
      if (idx < FLOOR_ORDER.length - 1) {
        const up = FLOOR_ORDER[idx + 1];
        portals.push({ x: 660, y: 262, w: 46, h: 40, label: "Stairs ↑ " + FLOOR_INFO[up].title, onEnter: () => go(up) });
      }
      if (idx > 0) {
        const dn = FLOOR_ORDER[idx - 1];
        portals.push({ x: 760, y: 262, w: 46, h: 40, label: "Stairs ↓ " + FLOOR_INFO[dn].title, onEnter: () => go(dn) });
      }

      // --- shared helpers ---------------------------------------------------
      const refreshHud = () => {
        const lv = root.IRWard.levelFor((S.bundle && S.bundle.config) || {}, S.save.xp || 0);
        this._hud.setText(FLOOR_INFO[floor].title + "\nLv " + lv.level + " " + lv.title + " · XP " + (S.save.xp || 0) +
          (lv.next ? "/" + lv.next.xp : "") + " · Funds " + S.save.funds + " · Cases " + S.save.casesCompleted + " · Best " + S.save.bestScore);
      };
      this._hud = hud(this, ""); this._refreshHud = refreshHud;
      const openOverlay = (fn) => {
        const close = () => { root.IRUI.clear(); this.busy = false; this.input.keyboard.resetKeys(); refreshHud(); };
        fn(close);
      };
      const persist = async () => {
        if (S.guest || !S.user) return;
        try { S.save.updatedAt = new Date().toISOString(); await root.IRNet.writeSlot(S.slot, S.save); }
        catch (e) { root.IRUI.toast("Save failed: " + (e.message || e)); }
      };
      const flavor = (x, y, lbl, msg) => {
        this.add.image(x, y, "t_kiosk").setOrigin(0.5, 1).setDepth(y);
        portals.push({ x, y: y - 10, w: 50, h: 40, label: lbl, onEnter: () => { this.busy = false; root.IRUI.toast(msg, 3000); } });
      };

      // --- shared walled-room kit + animated NPC cast (module helpers) ---
      const K = roomKit(this, solids);
      const procRoom = K.procRoom;
      const staffNpc = (x, y, role, dir) => K.staff(x, y, role, dir);
      const wanderNpc = (x, y, role, dx, dy, dur) => npcPatrol(this, x, y, role, dx, dy, dur);

      // --- No-nesting layout (project spec: NEVER a room boxed inside another
      //     room). A floor's outer shell IS the room; where a floor holds several
      //     distinct rooms they are ADJACENT nodes sharing a single partition
      //     wall with a doorway (same-level = seamless). suiteDress names a slice
      //     of this floor; partition drops the shared wall between two of them.
      const suiteDress = (xL, xR, accent, name) => {
        const g = this.add.graphics().setDepth(3);
        g.fillStyle(accent, 1); g.fillRect(xL, 224, xR - xL, 3);          // accent stripe on the north wall base
        label(this, (xL + xR) / 2, 214, name, 10, { backgroundColor: "#0e1420cc", padding: { x: 5, y: 2 } }).setDepth(4);
      };
      const partition = (x, doorCY) => {
        const yTop = 232, yBottom = 590, gT = doorCY - DOORW / 2, gB = doorCY + DOORW / 2;
        const g = this.add.graphics().setDepth(3);
        g.fillStyle(0x1c2331, 1);
        g.fillRect(x - WALL / 2, yTop, WALL, gT - yTop);
        g.fillRect(x - WALL / 2, gB, WALL, yBottom - gB);
        g.fillStyle(0x8f959d, 1); g.fillRect(x - WALL / 2, gT, WALL, DOORW);            // doorway threshold
        g.fillStyle(0x2b303c, 1); g.fillRect(x - WALL / 2, gT - 3, WALL, 3); g.fillRect(x - WALL / 2, gB, WALL, 3);
        solid(x, (yTop + gT) / 2, WALL, gT - yTop);
        solid(x, (gB + yBottom) / 2, WALL, yBottom - gB);
      };

      if (floor === "1") {
        this.add.image(416, 300, "t_desk").setOrigin(0).setDepth(362); solid(480, 340, 128, 42);
        label(this, 480, 292, "Reception", 10).setAlpha(0.7).setDepth(4);
        for (let i = 0; i < 5; i++) addChair(this, 165 + i * 40, 420);
        this.add.image(560, 160, "t_board").setOrigin(0).setDepth(3);
        [[140, 250], [820, 250], [140, 570], [820, 570]].forEach(([px, py]) => this.add.image(px, py, "t_plant").setOrigin(0.5, 1).setDepth(py));
        flavor(360, 470, "Information desk", "The volunteer smiles: \"Interventional radiology? Elevator to 3 — but round on your patients on 2 first.\"");
        flavor(620, 470, "Gift shop", "Balloons, word-search books, and a suspicious amount of lavender lotion.");
        wanderNpc(260, 500, "visitor", 320, 0, 9000);          // family finding the elevators
        wanderNpc(700, 350, "doctor", 0, 150, 5600);           // consultant between floors
        npcSeated(this, 205, 420, "senior", "r");              // waiting on a ride home
        staffNpc(480, 300, "nurse", "d");                      // behind reception
        const door = this.add.graphics().setDepth(3);
        door.fillStyle(0x20262e, 1).fillRect(444, 580, 72, 20);
        door.fillStyle(0x2a4a66, 1).fillRect(448, 583, 30, 14).fillRect(482, 583, 30, 14);
        portals.push({ x: 480, y: 575, w: 100, h: 44, label: "Exit to campus", onEnter: () => this.scene.start("Overworld") });
      } else if (floor === "2") {
        // ---- Inpatient ward: every bed holds a level-gated NPC patient ----
        ensureWardState();
        this.add.image(770, 160, "t_board").setOrigin(0).setDepth(3);
        flavor(300, 380, "Nurses' station", "\"Rounds list is on the beds. Read the charts properly — nobody up here is going to flag things for you.\"");
        wanderNpc(240, 540, "nurse", 150, 0, 3000);       // ward nurse making rounds

        const bedSolids = [];
        BED_POS.forEach(([px, py], i) => {
          this.add.image(px, py, "t_bed").setOrigin(0.5, 0).setDepth(py + 56);
          solid(px, py + 30, 36, 44);
          bedSolids.push(null);
          label(this, px, py - 8, "Bed " + (i + 1), 9).setAlpha(0.55).setDepth(4);
        });

        // patient overlays + portal labels, rebuilt whenever the ward changes
        // (portal labels live on this._portals — the copies makePortals keeps)
        this._ptSprites = [];
        const TINTS = [0xffffff, 0xf2d1c9, 0xd1e0f2, 0xf2ecc9, 0xd9f2c9, 0xe6d1f2];
        this._refreshBeds = () => {
          ensureWardState();
          this._ptSprites.forEach(sp => sp && sp.destroy());
          this._ptSprites = [];
          S.save.ward.beds.forEach((rec, i) => {
            const [px, py] = BED_POS[i] || [];
            if (px == null) return;
            const portal = (this._portals || []).find(p => p.bedIdx === i);
            if (rec && rec.seed) {
              const sp = this.add.image(px, py + 8, "t_pt").setOrigin(0.5, 0).setDepth(py + 57)
                .setTint(TINTS[(rec.seed || 0) % TINTS.length]);
              this._ptSprites.push(sp);
              const flagged = (rec.pending || []).length ? " · labs pending" : "";
              if (portal) portal.label = "Bed " + (i + 1) + " — " + (rec.procTitle || "consult") + flagged;
            } else {
              this._ptSprites.push(null);
              if (portal) portal.label = "Bed " + (i + 1) + " — being turned over";
            }
          });
        };
        BED_POS.forEach(([px, py], i) => {
          portals.push({ x: px, y: py + 30, w: 44, h: 60, bedIdx: i, label: "Bed " + (i + 1),
            onEnter: () => WardFlow.openBed(this, i) });
        });
        // respawn ticker: refill beds whose (compressed 2–5 min) timer is due
        this.time.addEvent({ delay: 10000, loop: true, callback: () => { if (!this.busy) this._refreshBeds(); } });
      } else if (PROC_FLOORS[floor]) {
        // ---- Procedure floor: ONE real walled suite (IR=3, CT=4, US=5) that
        //      holds the single patient sent from the ward. -------------------
        const loc = PROC_FLOORS[floor];
        const X0 = 330, RW = 300, Y0 = 312, RH = 128;
        const ACCENT = { ir_suite: 0x5a6fbf, ct_suite: 0x6f8f5a, us_room: 0x4f7a9f };
        // The whole floor IS the suite — one room, no nested box. The north wall
        // carries the accent + name; the equipment fills the open floor.
        suiteDress(130, 830, ACCENT[loc], ROOM_LABEL[loc].toUpperCase());
        let tableAt;
        if (loc === "ir_suite") {
          this.add.image(480, Y0 + 20, "t_carm").setOrigin(0.5, 0).setDepth(Y0 + 78); solid(480, Y0 + 62, 44, 26);
          this.add.image(480, Y0 + 62, "t_bed").setOrigin(0.5, 0).setDepth(Y0 + 90); solid(480, Y0 + 92, 36, 40);
          this.add.image(346, Y0 + 4, "t_board").setOrigin(0).setDepth(3);          // monitor bank on the face
          const backT = this.add.graphics().setDepth(Y0 + 108);
          backT.fillStyle(0x2f6f6f, 1).fillRect(552, Y0 + 92, 44, 16); backT.fillStyle(0xe8eaee, 1).fillRect(554, Y0 + 90, 40, 4);
          solid(574, Y0 + 100, 44, 16);                                             // sterile back table
          staffNpc(408, Y0 + 112, "nurse", "r");
          staffNpc(560, Y0 + 74, "surgeon", "l");
          flavor(250, 545, "Control room", "Behind leaded glass, the techs guard the good chairs and the good snacks.");
          flavor(690, 545, "Reading room", "Rows of dark monitors. Somebody is dictating very, very fast.");
          tableAt = [480, Y0 + 68];
        } else if (loc === "ct_suite") {
          this.add.image(480, Y0 + 22, "t_ctgantry").setOrigin(0.5, 0).setDepth(Y0 + 76); solid(480, Y0 + 62, 60, 28);
          const couch = this.add.graphics().setDepth(Y0 + 58);
          couch.fillStyle(0xc7cfdb, 1).fillRect(462, Y0 + 70, 36, 54); couch.fillStyle(0x9aa3af, 1).fillRect(462, Y0 + 70, 36, 4);
          this.add.image(392, Y0 + 96, "t_kiosk").setOrigin(0.5, 1).setDepth(Y0 + 96); solid(392, Y0 + 88, 20, 14);
          label(this, 392, Y0 + 104, "console", 8).setAlpha(0.55).setDepth(4);
          staffNpc(566, Y0 + 100, "resident", "l");
          flavor(250, 545, "Warm blanket cabinet", "Radiantly warm. You briefly consider climbing in.");
          tableAt = [480, Y0 + 74];
        } else { // us_room
          this.add.image(410, Y0 + 30, "t_uscart").setOrigin(0.5, 0).setDepth(Y0 + 74); solid(410, Y0 + 62, 30, 20);
          this.add.image(480, Y0 + 52, "t_bed").setOrigin(0.5, 0).setDepth(Y0 + 80); solid(480, Y0 + 82, 36, 40);
          addChair(this, 556, Y0 + 96);
          this.add.image(600, Y0 + 50, "t_plant").setOrigin(0.5, 1).setDepth(Y0 + 50);
          staffNpc(560, Y0 + 116, "residentF", "l");
          flavor(250, 545, "Gel warmer", "A dozen bottles, all exactly body temperature. Civilization.");
          tableAt = [480, Y0 + 58];
        }

        const EMPTY_MSG = {
          ir_suite: "The IR suite is dark, table empty. Send a patient here from the 2nd-floor ward first.",
          ct_suite: "The CT gantry hums, bore empty. Send a patient here from the ward first.",
          us_room: "Gel warmer's on, room's empty. Send a patient here from the ward first.",
        };
        this._refreshRooms = () => {
          this._roomSprites.forEach(sp => sp && sp.destroy());
          this._roomSprites = [];
          const portal = (this._portals || []).find(p => p.roomLoc === loc);
          const t = (S.save.rooms || {})[loc];
          if (portal) portal.label = ROOM_LABEL[loc] + (t ? " — patient on the table" : " (no patient)");
          if (!t) return;
          const pt = this.add.image(tableAt[0], tableAt[1] + 6, "t_pt").setOrigin(0.5, 0).setDepth(tableAt[1] + 92);
          this._roomSprites.push(pt);
          const lamp = this.add.graphics().setDepth(4);                             // in-use lamp by the door
          lamp.fillStyle(0xd23c3c, 1).fillCircle(480 + DOORW / 2 + 8, Y0 + RH + 6, 3);
          this._roomSprites.push(lamp);
        };
        portals.push({ x: tableAt[0], y: tableAt[1] + 40, w: 80, h: 70, roomLoc: loc,
          label: ROOM_LABEL[loc],
          onEnter: () => {
            const t = (S.save.rooms || {})[loc];
            if (!t) { this.busy = false; root.IRUI.toast(EMPTY_MSG[loc]); return; }
            WardFlow.operate(this, loc, t);
          } });
      } else if (floor === "6") {
        // ---- Staff lounge + three call rooms: a row of ADJACENT rooms sharing
        //      partition walls with doorways (no nested boxes). ------------------
        suiteDress(130, 470, 0x9a8550, "STAFF LOUNGE");
        partition(470, 520); partition(593, 520); partition(716, 520);
        const lng = this.add.graphics().setDepth(312 + 96);
        lng.fillStyle(0x6a5530, 1).fillRect(160, 376, 74, 24);                     // couch seat
        lng.fillStyle(0x8a744a, 1).fillRect(160, 366, 74, 12);                     // couch back
        solid(197, 388, 74, 24);
        const tbl = this.add.graphics().setDepth(312 + 130);
        tbl.fillStyle(0x9a7a56, 1).fillCircle(300, 440, 18); tbl.fillStyle(0xb08c62, 1).fillCircle(300, 440, 14);
        solid(300, 440, 34, 30);
        [[270, 470], [330, 470], [270, 418], [330, 418]].forEach(([cx, cy]) => addChair(this, cx, cy));
        this.add.image(360, 316, "t_board").setOrigin(0).setDepth(3);
        this.add.image(160, 360, "t_plant").setOrigin(0.5, 1).setDepth(360);
        this.add.image(424, 372, "t_kiosk").setOrigin(0.5, 1).setDepth(372); solid(424, 364, 20, 14);
        label(this, 424, 380, "coffee", 8).setAlpha(0.55).setDepth(4);
        staffNpc(400, 400, "attending", "u");                                          // waiting on the pot
        wanderNpc(230, 468, "doctor", 130, 0, 5200);                           // pacing with a journal
        wanderNpc(370, 452, "surgeon", -50, 26, 4200);                          // orbiting the table
        portals.push({ x: 295, y: 430, w: 250, h: 130, label: "Staff lounge — attending's pearls", onEnter: () => openOverlay((close) =>
            root.IRUI.Lounge.show(S.bundle.procedure, { onClose: close })) });

        // call rooms (east): two post-call residents asleep + YOUR empty room —
        // each an adjacent room in the partitioned row above.
        const CALLX = [495, 607, 719], CW = 98, CY0 = 312, CH = 120;
        const SEC = [[470, 593], [593, 716], [716, 830]];
        CALLX.forEach((x0, i) => {
          const mine = i === CALLX.length - 1;
          suiteDress(SEC[i][0], SEC[i][1], 0x7a6a9f, mine ? "YOUR CALL ROOM" : "CALL ROOM " + (i + 1));
          const bx = x0 + 30;
          this.add.image(bx, CY0 + 52, "t_bed").setOrigin(0.5, 0).setDepth(CY0 + 108); solid(bx, CY0 + 82, 36, 40);
          if (!mine) {
            this.add.image(bx, CY0 + 60, "t_pt").setOrigin(0.5, 0).setDepth(CY0 + 109)
              .setTint(i === 0 ? 0xbfe4d9 : 0xc9d4f2);                              // resident asleep in scrubs
            label(this, bx + 26, CY0 + 52, "z Z z", 8).setAlpha(0.55).setDepth(4);
            portals.push({ x: x0 + CW / 2, y: CY0 + 80, w: 80, h: 70, label: "Call room " + (i + 1) + " — occupied",
              onEnter: () => { this.busy = false; root.IRUI.toast("Shhh. Post-call. The resident does not stir."); } });
          } else {
            // progress terminal (right) — zone narrowed so the mirror fits too
            this.add.image(x0 + 78, CY0 + 100, "t_kiosk").setOrigin(0.5, 1).setDepth(CY0 + 100); solid(x0 + 78, CY0 + 92, 20, 14);
            portals.push({ x: x0 + 78, y: CY0 + 80, w: 52, h: 60, label: "Your call room — check your progress",
              onEnter: () => openOverlay((close) =>
                root.IRUI.CallRoom.show({ save: S.save, user: S.user, guest: S.guest, tiers: (S.bundle.config.clout_tiers || {}).tiers || [],
                  level: root.IRWard.levelFor(S.bundle.config, S.save.xp || 0), cases: S.cases }, { onClose: close })) });
            // wardrobe mirror (left) — reopens the character creator; the new
            // look repaints on scene restart (ensureTextures → paintPlayer).
            const mx = x0 + 18, my = CY0 + 96;
            const mg = this.add.graphics().setDepth(3);
            mg.fillStyle(0x6a5530, 1).fillRect(mx - 12, my - 26, 24, 46);       // wooden frame
            mg.fillStyle(0x9fc7d6, 1).fillRect(mx - 9, my - 23, 18, 40);        // glass
            mg.fillStyle(0xdceef5, 0.5).fillRect(mx - 9, my - 23, 6, 40);       // sheen
            label(this, mx, my - 34, "mirror", 8).setAlpha(0.55).setDepth(4);
            solid(mx, my - 2, 24, 12);
            portals.push({ x: mx, y: my, w: 52, h: 52, label: "Mirror — change your look",
              onEnter: () => openOverlay((close) =>
                root.IRUI.CharCreator.show({
                  title: "Wardrobe mirror", startLabel: "Save look ▶",
                  subtitle: "Freshen up between cases — your new look takes effect right away.",
                  appearance: S.save.appearance, name: S.save.name || "",
                  onStart: async (app) => { S.save.appearance = app; S.save.name = app.name; await persist(); root.IRUI.clear(); this.scene.restart({ floor: floor }); },
                  onCancel: close,
                })) });
          }
        });
        flavor(480, 555, "Vending machine", "The good snack row is, as always, empty. E4 rattles but does not fall.");
      } else { // basement — Sim Lab + Procurement as real rooms
        const pipes = this.add.graphics().setDepth(2);
        pipes.fillStyle(0x4a5262, 1).fillRect(120, 158, 720, 8).fillRect(120, 172, 720, 5);
        pipes.fillStyle(0x39404d, 1).fillRect(300, 150, 10, 82).fillRect(600, 150, 10, 82);

        // Sim Lab (west) and Procurement (east) are ADJACENT rooms sharing one
        // partition wall + doorway — not boxes floating in the basement.
        suiteDress(130, 476, 0x9f8a4f, "SIMULATION LAB");
        suiteDress(476, 830, 0x4f8a9f, "PROCUREMENT / SUPPLY");
        partition(476, 520);
        const bench = this.add.graphics().setDepth(312 + 108);
        bench.fillStyle(0x6a5530, 1).fillRect(172, 380, 118, 20); bench.fillStyle(0x8a744a, 1).fillRect(172, 376, 118, 6);
        solid(231, 390, 118, 22);                                                  // flow bench
        label(this, 231, 372, "flow bench", 8).setAlpha(0.55).setDepth(4);
        this.add.image(372, 350, "t_bed").setOrigin(0.5, 0).setDepth(350 + 56); solid(372, 380, 36, 44);
        this.add.image(372, 358, "t_pt").setOrigin(0.5, 0).setDepth(350 + 57).setTint(0xd9c8ee); // silicone sim torso
        label(this, 372, 342, "SimMan", 8).setAlpha(0.55).setDepth(4);
        this.add.image(166, 316, "t_board").setOrigin(0).setDepth(3);
        staffNpc(300, 442, "resident", "u");
        portals.push({ x: 300, y: 400, w: 250, h: 110, label: "Practice in the Sim Lab", onEnter: () => openOverlay((close) =>
            root.IRUI.SimLab.show({ save: S.save, devices: S.bundle.devices, config: S.bundle.config, configMeta: S.bundle.configMeta }, { onClose: close })) });

        // Procurement: shelving racks of stock, order desk, supply clerk
        const rack = this.add.graphics().setDepth(312 + 92);
        [364, 396].forEach(ry => {
          rack.fillStyle(0x39404d, 1).fillRect(544, ry + 12, 150, 6);              // shelf
          const cols = [0x8a744a, 0x4f7a9f, 0x6f8f5a, 0x9f8a4f, 0x7a6a9f];
          for (let b = 0; b < 9; b++) { rack.fillStyle(cols[(b + ry) % 5], 1); rack.fillRect(548 + b * 16, ry, 12, 12); }
        });
        solid(619, 388, 150, 44);                                                  // both racks
        label(this, 619, 352, "sterile stock", 8).setAlpha(0.55).setDepth(4);
        this.add.image(724, 356, "t_desk").setOrigin(0.5, 0).setDepth(356 + 62); solid(724, 396, 120, 40);
        staffNpc(724, 352, "visitor", "d");                                              // supply clerk behind the desk
        portals.push({ x: 660, y: 420, w: 250, h: 90, label: "Procurement office", onEnter: () => openOverlay((close) =>
            root.IRUI.Shop.show({ save: S.save, devices: S.bundle.devices, config: S.bundle.config }, { onPurchase: () => persist(), onClose: close })) });

        flavor(480, 545, "Steam pipes", "Something hisses rhythmically. Facilities says it's \"supposed to do that.\"");
      }

      // spawn clear of any central partition wall (B/6 divide the floor at ~x480)
      const spawnX = (floor === "B" || floor === "6") ? 300 : 480;
      spawnPlayer(this, spawnX, (floor === "1" || floor === "2") ? 420 : 520);
      this.physics.world.setBounds(130, 232, 700, 358);
      this.physics.add.collider(this.player, solids);
      wireNpcPhysics(this, solids);                 // patrolling staff vs walls/furniture/each other/player
      refreshHud();
      makePortals(this, portals);
      if (this._refreshBeds) this._refreshBeds();   // initial NPC draw + live portal labels
      if (this._refreshRooms) this._refreshRooms(); // waiting patients + live room labels
    },
    update() { movePlayer(this, 200); updatePortals(this); updateNpcs(this); },
  };

  // ======================================================================
  //  WARD FLOW — bedside consult → labs / turn-down / location → battle.
  //  Replaces the old single-portal CaseFlow: every ward bed is an NPC whose
  //  procedure is level-gated (v_game_ready.min_level vs save.xp), preop rules
  //  come from procedure_game_params.preop, and CT/US/IR rooms hold one
  //  patient each (spec).
  const WardFlow = {
    async openBed(scene, i) {
      const rec = (S.save.ward && S.save.ward.beds[i]) || null;
      if (!rec || !rec.seed) { scene.busy = false; root.IRUI.toast("Housekeeping is still turning this bed over."); return; }
      let bundle;
      try { bundle = await root.IRGameData.loadCase(rec.procId); }
      catch (e) { scene.busy = false; root.IRUI.toast("Chart unavailable: " + (e.message || e)); return; }
      const showConsult = () => {
        const patient = root.IRPatient.generate(bundle.generator, rec.seed);
        const resolved = root.IRWard.resolvePending(rec, bundle.params.preop, bundle.config, Math.random);
        root.IRWard.applyOverrides(patient, rec);
        const ev = root.IRWard.evalPreop(patient, rec, bundle.params.preop);
        if (resolved.length) persistSave(); // lab results landed on the chart
        root.IRUI.Preop.show(patient, bundle.procedure, ev, rec, {
          bedNo: i + 1, config: bundle.config, resolvedNotes: resolved,
          onLater: () => backToHub(scene),
          onOrderLab: (id) => { root.IRWard.orderLabs(rec, [id]); persistSave(); if (scene._refreshBeds) scene._refreshBeds(); },
          onTurnDown: () => {
            const r = root.IRWard.turnDown(S.save, rec, bundle.config);
            const why = rec.contra ? rec.contra.label : null;
            root.IRWard.clearBed(S.save, i, bundle.config, Date.now(), Math.random);
            persistSave();
            backToHub(scene);
            root.IRUI.toast(r.correct
              ? "✅ Right call — " + why + " is an absolute contraindication. +" + r.cloutDelta + " clout, +" + r.xp + " XP."
              : "❌ That patient was operable (or fixable with preop orders). " + r.cloutDelta + " clout.", 4600);
          },
          onPerform: () => {
            const missing = root.IREcon.missingKit(S.save, bundle.config, bundle.procedure.id);
            if (missing.length) { root.IRUI.toast("⛔ Kit incomplete — restock at procurement: " + missing.join(", "), 3600); return; }
            root.IRUI.LocationPick.show(bundle.procedure, S.save.rooms, {
              onBack: () => showConsult(),
              onPick: (loc) => WardFlow.route(scene, i, rec, bundle, loc),
            });
          },
        });
      };
      showConsult();
    },

    // Location chosen: bedside starts NOW; other rooms get a wheel-away cutscene
    // and the patient waits there (one per room — spec).
    route(scene, i, rec, bundle, loc) {
      const ticket = { procId: rec.procId, seed: rec.seed, labOverrides: rec.labOverrides,
                       pending: [], contra: rec.contra, chosenLoc: loc, sentAt: Date.now() };
      if (loc === "bedside") {
        root.IRUI.clear();
        root.IRUI.toast("🧤 You gown and glove at the bedside.");
        WardFlow.battle(scene, ticket, bundle, { fromBed: i });
        return;
      }
      S.save.rooms[loc] = ticket;
      root.IRWard.clearBed(S.save, i, bundle.config, Date.now(), Math.random);
      persistSave();
      root.IRUI.clear();
      WardFlow.wheelAway(scene, i, loc);
    },

    // Cutscene: a nurse wheels the bed to the elevator — FOOT-FIRST, so the bed
    // reads as rolling on its wheels (angle 90 = foot left for the westbound
    // leg, angle 180 = foot up for the northbound leg), with the nurse pushing
    // from the head end the whole way.
    wheelAway(scene, bedIdx, loc) {
      if (scene._refreshBeds) scene._refreshBeds(); // hides the static patient (bed record already cleared)
      const [px, py] = BED_POS[bedIdx] || [480, 400];
      const cx = px, cy = py + 28;                   // rotate around the bed's center
      const bedImg = scene.add.image(cx, cy, "t_bed").setOrigin(0.5).setAngle(90).setDepth(9000);
      const ptImg = scene.add.image(cx, cy, "t_pt").setOrigin(0.5).setAngle(90).setDepth(9001);
      const nurse = npcIdle(scene, cx + 40, cy, "nurse", "l"); nurse.setDepth(9002); // pushing from the head end
      if (nurse.play) nurse.play("npc4-l");
      const done = () => {
        scene.tweens.add({ targets: [bedImg, ptImg, nurse], alpha: 0, duration: 300,
          onComplete: () => { bedImg.destroy(); ptImg.destroy(); nurse.destroy(); } });
        root.IRUI.toast("🛗 Patient transported to the " + ROOM_LABEL[loc] + " (floor " + ROOM_FLOOR[loc] + "). Meet them there.", 3800);
        scene.busy = false; scene.input.keyboard.resetKeys();
      };
      // leg 1: roll west toward the elevator bank, foot leading, nurse behind
      scene.tweens.add({
        targets: [bedImg, ptImg, nurse], x: "-=" + (cx - 240), duration: 1150, ease: "Sine.easeInOut",
        onComplete: () => {
          // pivot: swing the bed so the foot points north, nurse steps to the foot→south end
          scene.tweens.add({ targets: [bedImg, ptImg], angle: 180, duration: 260, ease: "Sine.easeInOut" });
          if (nurse.play) nurse.play("npc4-u");
          scene.tweens.add({
            targets: nurse, x: 240, y: cy + 40, duration: 260, ease: "Sine.easeInOut",
            onComplete: () => {
              // leg 2: roll north into the elevator, still foot-first
              scene.tweens.add({ targets: [bedImg, ptImg], y: 300, duration: 850, ease: "Sine.easeIn" });
              scene.tweens.add({ targets: nurse, y: 340, duration: 850, ease: "Sine.easeIn", onComplete: done });
            },
          });
        },
      });
    },

    // Interacting with a waiting patient on floor 3.
    async operate(scene, loc, ticket) {
      let bundle;
      try { bundle = await root.IRGameData.loadCase(ticket.procId); }
      catch (e) { scene.busy = false; root.IRUI.toast("Chart unavailable: " + (e.message || e)); return; }
      WardFlow.battle(scene, ticket, bundle, { room: loc });
    },

    // Shared battle launcher (bedside + rooms). Preop violations become CITED
    // ledger penalties + complication-risk multipliers; the wrong room costs
    // points but the case still happens there (proceed-and-penalize).
    battle(scene, ticket, bundle, o) {
      const patient = root.IRPatient.generate(bundle.generator, ticket.seed);
      root.IRWard.applyOverrides(patient, ticket);
      const ev = root.IRWard.evalPreop(patient, ticket, bundle.params.preop);
      const correct = bundle.params.location || "ir_suite";
      const preop = { penalties: ev.penalties.slice(), riskMods: ev.riskMods, postop: ev.postop.slice() };
      let wrongLocation = null;
      if (ticket.chosenLoc !== correct) {
        preop.penalties.push({ cat: "safety", delta: -5,
          reason: "Performed in the " + ROOM_LABEL[ticket.chosenLoc] + " — standard of care for " + bundle.procedure.title + " is the " + ROOM_LABEL[correct] + ".",
          cite: "Procedure general considerations [1]" });
        wrongLocation = "Wrong venue: " + bundle.procedure.title + " belongs in the " + ROOM_LABEL[correct] + ". (−5)";
      }
      const engine = root.IRAngio.create({
        params: bundle.params, vesselMap: bundle.vesselMap, devices: bundle.devices,
        complications: bundle.complications.filter(c => c.procedure_id === bundle.procedure.id),
        patient, config: bundle.config, seed: ticket.seed,
        inventory: root.IREcon.ensureInventory(S.save, bundle.config),
        preop,
      });
      root.IRUI.Angio.start(engine, {
        procedure: bundle.procedure, params: bundle.params, patient, config: bundle.config,
        devices: bundle.devices, inventory: root.IREcon.ensureInventory(S.save, bundle.config),
        location: ticket.chosenLoc, preopViolations: ev.violations, wrongLocation,
      }, { onFinish: (score) => WardFlow.finish(scene, score, bundle, ticket, o) });
    },

    async finish(scene, score, bundle, ticket, o) {
      const cfg = bundle.config;
      const prog = cfg.progression || {};
      const before = root.IRWard.levelFor(cfg, S.save.xp || 0);
      let payout = 0, xp = 0, cloutDelta = 0;
      const mult = cloutMultOf(cfg);
      if (score.failed) {
        cloutDelta = (prog.fail_clout || { bailed: -5, takeover: -5, kicked: -3 })[score.failed] || -5;
        S.save.clout = Math.max(0, (S.save.clout || 0) + cloutDelta);
      } else {
        payout = Math.round(bundle.params.base_payout * (score.total / 100) * mult);
        S.save.funds += payout;
        S.save.casesCompleted += 1;
        S.save.bestScore = Math.max(S.save.bestScore || 0, score.total);
        xp = root.IRWard.xpForScore(cfg, score.total);
        S.save.xp = (S.save.xp || 0) + xp;
      }
      const after = root.IRWard.levelFor(cfg, S.save.xp || 0);
      // free the room / respawn the bed (compressed 2–5 min window)
      if (o.room) S.save.rooms[o.room] = null;
      if (o.fromBed != null) root.IRWard.clearBed(S.save, o.fromBed, cfg, Date.now(), Math.random);
      S.save.lastCase = bundle.procedure.id;
      S.save.updatedAt = new Date().toISOString();
      let saved = false;
      if (!S.guest && S.user) {
        try {
          if (!score.failed) await root.IRNet.writeCaseLog({ procedure_id: bundle.procedure.id, score_total: score.total, score_detail: score.breakdown, patient_seed: { seed: ticket.seed } });
          await root.IRNet.writeSlot(S.slot, S.save);
          saved = true;
        } catch (e) { root.IRUI.toast("Save failed: " + (e.message || e)); }
      }
      root.IRUI.Debrief.show(score, { procedure: bundle.procedure, params: bundle.params }, {
        payout, cloutMult: mult, saved, slot: S.slot,
        xpLine: score.failed ? "XP +0" : "XP +" + xp + " → Lv " + after.level + " " + after.title,
        cloutDelta: score.failed ? cloutDelta : 0,
        onHub: () => {
          backToHub(scene);
          if (after.level > before.level)
            root.IRUI.toast("🎉 LEVEL UP — " + after.title + " (Lv " + after.level + "). New procedures can now appear on the ward.", 4800);
        },
      });
    },
  };

  root.IRScenes = [Boot, Overworld, Lobby, Hospital];
})(window);
