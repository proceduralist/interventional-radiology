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
    let near = null;
    for (const p of scene._portals) {
      if (Math.abs(scene.player.x - p.x) < p.w / 2 + 22 && Math.abs(scene.player.y - p.y) < p.h / 2 + 22) { near = p; break; }
    }
    scene._near = near;
    if (near) scene._hint.setText("▸ " + near.label + "   [E]").setPosition(scene.player.x - 40, scene.player.y - 52).setVisible(true);
    else scene._hint.setVisible(false);
  }
  function movePlayer(scene, speed) {
    if (scene.busy) { scene.player.body.setVelocity(0, 0); return; }
    const c = scene.cursors, w = scene.wasd; let vx = 0, vy = 0;
    if (c.left.isDown || w.left.isDown) vx = -1; else if (c.right.isDown || w.right.isDown) vx = 1;
    if (c.up.isDown || w.up.isDown) vy = -1; else if (c.down.isDown || w.down.isDown) vy = 1;
    if (vx && vy) { vx *= 0.7071; vy *= 0.7071; }
    scene.player.body.setVelocity(vx * speed, vy * speed);
    scene.player.setDepth(scene.player.y); // Y-sort: pass behind trees / props
  }
  function stdControls(scene) {
    scene.cursors = scene.input.keyboard.createCursorKeys();
    scene.wasd = scene.input.keyboard.addKeys({ up: "W", down: "S", left: "A", right: "D" });
  }
  function label(scene, x, y, txt, size, opts) {
    return scene.add.text(x, y, txt, Object.assign({ fontFamily: "monospace", fontSize: (size || 12) + "px", color: TEXT, align: "center" }, opts || {})).setOrigin(0.5).setDepth(5);
  }
  function spawnPlayer(scene, x, y) {
    scene.player = scene.physics.add.image(x, y, "t_player");
    scene.player.body.setSize(14, 9).setOffset(3, 18); // feet-only body → walk "behind" things
    scene.player.setCollideWorldBounds(true);
    stdControls(scene);
  }
  function hud(scene, lines) {
    return scene.add.text(10, 8, lines, { fontFamily: "monospace", fontSize: "12px", color: TEXT, backgroundColor: "#0e1420cc", padding: { x: 8, y: 5 } })
      .setScrollFactor(0).setDepth(1e6);
  }

  // ======================================================================
  const Boot = {
    key: "Boot",
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
          root.IRUI.clear();
          this.scene.start("Overworld");
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

      // --- trees (Y-sorted, trunk-only collision)
      W.treeList().forEach(t => {
        const tx = (t.c + 0.5) * TILE, ty = (t.r + 1) * TILE;
        this.add.image(tx, ty, "tree" + t.v).setOrigin(0.5, 1).setDepth(ty);
        const trunk = this.add.zone(tx, ty - 6, 14, 10);
        this.physics.add.existing(trunk, true); solids.add(trunk);
      });

      // --- player + camera follow across the whole campus
      const sp = (data && data.spawn) || S.lastDoor || W.spawnDefault;
      spawnPlayer(this, sp.x, sp.y);
      this.physics.world.setBounds(0, 0, W.WPX, W.HPX);
      this.physics.add.collider(this.player, solids);
      this.cameras.main.setBounds(0, 0, W.WPX, W.HPX).startFollow(this.player, true, 0.15, 0.15).setBackgroundColor("#101724");

      // --- HUD + campus map key
      const who = S.guest ? "guest (no save)" : ((S.user && S.user.email) || "resident");
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
    update() { movePlayer(this, 240); updatePortals(this); },
  };

  // ======================================================================
  //  LOBBY — generic interior for non-hospital buildings
  // ======================================================================
  const Lobby = {
    key: "Lobby",
    create(data) {
      const W = root.IRWorld;
      const b = W.byId(data && data.id) || W.buildings.find(x => x.enter === "Lobby");
      this.busy = false;
      W.ensureTextures(this); W.paintInterior(this);
      this.cameras.main.setBackgroundColor("#0b1019").setBounds(0, 0, 960, 640);
      this.physics.world.setBounds(112, 232, 736, 320);

      const x0 = 96, y0 = 148, rw = 768, rh = 416;      // room rect
      // floor + north wall face (front face visible per 3/4 perspective)
      this.add.tileSprite(x0, y0 + 82, rw, rh - 82, "t_lino").setOrigin(0).setDepth(0);
      this.add.tileSprite(x0, y0, rw, 82, "t_iwall").setOrigin(0).setDepth(1);
      const frame = this.add.graphics().setDepth(2);
      frame.fillStyle(0x1c2331, 1);
      frame.fillRect(x0 - 10, y0 - 10, rw + 20, 10); frame.fillRect(x0 - 10, y0 + rh, rw + 20, 12);
      frame.fillRect(x0 - 10, y0 - 10, 10, rh + 22); frame.fillRect(x0 + rw, y0 - 10, 10, rh + 22);
      // wall windows + notice board
      for (let wx = x0 + 40; wx < x0 + rw - 60; wx += 170) {
        const wg = this.add.graphics().setDepth(2);
        wg.fillStyle(0x16202e, 1).fillRect(wx, y0 + 18, 30, 40);
        wg.fillStyle(0x9fc4e0, 0.8).fillRect(wx + 2, y0 + 20, 26, 6);
        wg.fillStyle(0x6e7789, 1).fillRect(wx - 2, y0 + 58, 34, 3);
      }
      this.add.image(x0 + rw - 120, y0 + 14, "t_board").setOrigin(0).setDepth(3);

      // title + blurb
      label(this, 480, 92, b.name, 17).setDepth(10);
      label(this, 480, 118, b.lobby.blurb, 11, { wordWrap: { width: 720 } }).setAlpha(0.8).setDepth(10);

      // furniture (Y-sorted, solid)
      const solids = this.physics.add.staticGroup();
      const deskX = x0 + rw / 2 - 64, deskY = y0 + 86;
      this.add.image(deskX, deskY, "t_desk").setOrigin(0).setDepth(deskY + 62);
      const deskBody = this.add.zone(deskX + 64, deskY + 40, 128, 42);
      this.physics.add.existing(deskBody, true); solids.add(deskBody);
      [[x0 + 22, y0 + 96], [x0 + rw - 46, y0 + 96], [x0 + 22, y0 + rh - 44], [x0 + rw - 46, y0 + rh - 44]].forEach(([px, py]) => {
        this.add.image(px, py, "t_plant").setOrigin(0, 1).setDepth(py);
      });
      for (let i = 0; i < 4; i++) this.add.image(x0 + 60 + i * 30, y0 + 200, "t_chair").setOrigin(0.5, 1).setDepth(y0 + 200);

      // POI kiosks + exit
      const portals = [];
      const pois = b.lobby.pois || [];
      pois.forEach((p, i) => {
        const kx = x0 + rw * ((i + 1) / (pois.length + 1)), ky = y0 + 290;
        this.add.image(kx, ky, "t_kiosk").setOrigin(0.5, 1).setDepth(ky);
        label(this, kx, ky + 12, p.label, 10).setAlpha(0.75).setDepth(ky);
        const onEnter = p.action === "conference"
          ? () => Conference.run(this)
          : () => { this.busy = false; root.IRUI.toast(p.msg, 3200); };
        portals.push({ x: kx, y: ky - 10, w: 50, h: 40, label: p.label, onEnter });
      });
      const door = this.add.graphics().setDepth(3);
      door.fillStyle(0x20262e, 1).fillRect(444, y0 + rh - 8, 72, 20);
      door.fillStyle(0x2a4a66, 1).fillRect(448, y0 + rh - 5, 30, 14).fillRect(482, y0 + rh - 5, 30, 14);
      portals.push({ x: 480, y: y0 + rh, w: 90, h: 50, label: "Exit to campus", onEnter: () => this.scene.start("Overworld") });

      spawnPlayer(this, 480, y0 + rh - 70);
      this.physics.add.collider(this.player, solids);
      hud(this, "[E] interact · exit at the bottom door");
      makePortals(this, portals);
    },
    update() { movePlayer(this, 210); updatePortals(this); },
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
  const FLOOR_ORDER = ["B", "1", "2", "3"];
  const FLOOR_INFO = {
    B: { title: "Basement — Sim Lab & Supply Chain" },
    1: { title: "1st Floor — Main Lobby" },
    2: { title: "2nd Floor — Inpatient Wards" },
    3: { title: "3rd Floor — IR, CT & Ultrasound" },
  };
  const ROOM_LABEL = { ir_suite: "IR Suite", ct_suite: "CT Suite", us_room: "Ultrasound Room", bedside: "Bedside" };
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
      if (floor === "B") this.add.rectangle(480, 371, 720, 441, 0x0a0e16, 0.28).setDepth(50); // dim basement

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

      // --- per-floor content ------------------------------------------------
      if (floor === "1") {
        this.add.image(416, 300, "t_desk").setOrigin(0).setDepth(362); solid(480, 340, 128, 42);
        label(this, 480, 292, "Reception", 10).setAlpha(0.7).setDepth(4);
        for (let i = 0; i < 5; i++) this.add.image(170 + i * 30, 420, "t_chair").setOrigin(0.5, 1).setDepth(420);
        this.add.image(560, 160, "t_board").setOrigin(0).setDepth(3);
        [[140, 250], [820, 250], [140, 570], [820, 570]].forEach(([px, py]) => this.add.image(px, py, "t_plant").setOrigin(0.5, 1).setDepth(py));
        flavor(360, 470, "Information desk", "The volunteer smiles: \"Interventional radiology? Elevator to 3 — but round on your patients on 2 first.\"");
        flavor(620, 470, "Gift shop", "Balloons, word-search books, and a suspicious amount of lavender lotion.");
        const door = this.add.graphics().setDepth(3);
        door.fillStyle(0x20262e, 1).fillRect(444, 580, 72, 20);
        door.fillStyle(0x2a4a66, 1).fillRect(448, 583, 30, 14).fillRect(482, 583, 30, 14);
        portals.push({ x: 480, y: 575, w: 100, h: 44, label: "Exit to campus", onEnter: () => this.scene.start("Overworld") });
      } else if (floor === "2") {
        // ---- Inpatient ward: every bed holds a level-gated NPC patient ----
        ensureWardState();
        this.add.image(770, 160, "t_board").setOrigin(0).setDepth(3);
        room(210, 510, 130, 76, 0x6a5530, 0x9a8550, "Staff Lounge");
        flavor(300, 380, "Nurses' station", "\"Rounds list is on the beds — anyone with a red flag on their chart is NOT a case, no matter how much the primary team wants it.\"");

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

        portals.push({ x: 210, y: 510, w: 130, h: 76, label: "Staff lounge — attending's pearls", onEnter: () => openOverlay((close) =>
            root.IRUI.Lounge.show(S.bundle.procedure, { onClose: close })) });
      } else if (floor === "3") {
        // ---- Procedure floor: IR / CT / US rooms hold ONE sent patient each ----
        room(400, 350, 180, 120, 0x3a4a7a, 0x5a6fbf, "IR Suite");
        this.add.image(400, 302, "t_carm").setOrigin(0.5, 0).setDepth(364);
        room(190, 340, 120, 84, 0x4a5a3a, 0x6f8f5a, "CT Suite");
        this.add.image(190, 288, "t_ctgantry").setOrigin(0.5, 0).setDepth(350);
        room(640, 350, 130, 84, 0x2f4a5a, 0x4f7a9f, "Ultrasound\nRoom");
        this.add.image(690, 310, "t_uscart").setOrigin(0.5, 0).setDepth(354);
        room(680, 500, 150, 80, 0x4a3f6a, 0x7a6a9f, "Call Room");
        flavor(480, 510, "Reading room", "Rows of dark monitors. Somebody is dictating very, very fast.");

        const ROOM_AT = { ct_suite: [190, 340], ir_suite: [400, 350], us_room: [640, 350] };
        this._roomSprites = [];
        this._refreshRooms = () => {
          this._roomSprites.forEach(sp => sp && sp.destroy());
          this._roomSprites = [];
          root.IRWard.ROOMS.forEach(loc => {
            const t = (S.save.rooms || {})[loc];
            if (!t) return;
            const [rx, ry] = ROOM_AT[loc];
            const bed = this.add.image(rx, ry - 14, "t_bed").setOrigin(0.5, 0).setDepth(ry + 44);
            const pt = this.add.image(rx, ry - 6, "t_pt").setOrigin(0.5, 0).setDepth(ry + 45);
            this._roomSprites.push(bed, pt);
          });
        };
        this._refreshRooms();

        const EMPTY_MSG = {
          ir_suite: "The IR suite is dark. Send a patient here from the 2nd-floor ward first.",
          ct_suite: "The CT gantry hums, bore empty. Send a patient here from the ward first.",
          us_room: "Gel warmer's on, room's empty. Send a patient here from the ward first.",
        };
        Object.keys(ROOM_AT).forEach(loc => {
          const [rx, ry] = ROOM_AT[loc];
          portals.push({ x: rx, y: ry, w: loc === "ir_suite" ? 180 : 130, h: 90,
            label: ROOM_LABEL[loc],
            onEnter: () => {
              const t = (S.save.rooms || {})[loc];
              if (!t) { this.busy = false; root.IRUI.toast(EMPTY_MSG[loc]); return; }
              WardFlow.operate(this, loc, t);
            } });
        });
        portals.push({ x: 680, y: 500, w: 150, h: 80, label: "Call room — your profile", onEnter: () => openOverlay((close) =>
            root.IRUI.CallRoom.show({ save: S.save, user: S.user, guest: S.guest, tiers: (S.bundle.config.clout_tiers || {}).tiers || [],
              level: root.IRWard.levelFor(S.bundle.config, S.save.xp || 0), cases: S.cases }, { onClose: close })) });
      } else { // basement
        room(280, 380, 170, 110, 0x6f5a2f, 0x9f8a4f, "Sim Lab");
        room(680, 380, 170, 110, 0x2f5a6f, 0x4f8a9f, "Procurement /\nSupply Chain");
        const pipes = this.add.graphics().setDepth(2);
        pipes.fillStyle(0x4a5262, 1).fillRect(120, 158, 720, 8).fillRect(120, 172, 720, 5);
        pipes.fillStyle(0x39404d, 1).fillRect(300, 150, 10, 82).fillRect(600, 150, 10, 82);
        flavor(480, 520, "Steam pipes", "Something hisses rhythmically. Facilities says it's \"supposed to do that.\"");
        portals.push({ x: 280, y: 380, w: 170, h: 110, label: "Practice in the Sim Lab", onEnter: () => openOverlay((close) =>
            root.IRUI.SimLab.show({ save: S.save, devices: S.bundle.devices, config: S.bundle.config, configMeta: S.bundle.configMeta }, { onClose: close })) });
        portals.push({ x: 680, y: 380, w: 170, h: 110, label: "Procurement office", onEnter: () => openOverlay((close) =>
            root.IRUI.Shop.show({ save: S.save, devices: S.bundle.devices, config: S.bundle.config }, { onPurchase: () => persist(), onClose: close })) });
      }

      spawnPlayer(this, 480, 420);
      this.physics.world.setBounds(130, 232, 700, 358);
      this.physics.add.collider(this.player, solids);
      refreshHud();
      makePortals(this, portals);
      if (this._refreshBeds) this._refreshBeds(); // initial NPC draw + live portal labels
    },
    update() { movePlayer(this, 200); updatePortals(this); },
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

    // Cutscene: the patient is wheeled from the bed toward the elevator (spec).
    wheelAway(scene, bedIdx, loc) {
      if (scene._refreshBeds) scene._refreshBeds(); // hides the static patient (bed record already cleared)
      const [px, py] = BED_POS[bedIdx] || [480, 400];
      const bedImg = scene.add.image(px, py, "t_bed").setOrigin(0.5, 0).setDepth(9000);
      const ptImg = scene.add.image(px, py + 8, "t_pt").setOrigin(0.5, 0).setDepth(9001);
      scene.tweens.add({
        targets: [bedImg, ptImg], x: 240, y: 300, duration: 1500, ease: "Sine.easeIn",
        onComplete: () => {
          scene.tweens.add({ targets: [bedImg, ptImg], alpha: 0, duration: 320,
            onComplete: () => { bedImg.destroy(); ptImg.destroy(); } });
          root.IRUI.toast("🛗 Patient transported to the " + ROOM_LABEL[loc] + " (3rd floor). Meet them there.", 3800);
          scene.busy = false; scene.input.keyboard.resetKeys();
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
