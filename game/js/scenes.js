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
  const S = root.IRState = { user: null, guest: false, bundle: null, save: null, slot: 1, lastDoor: null, seenIntro: false };
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
        try {
          S.bundle = await root.IRGameData.loadCase("chest-port");
        } catch (e) {
          status.setText("Could not load case data: " + (e.message || e)); return;
        }
        if (S.user && !S.guest) {
          try {
            const slots = await root.IRNet.loadSlots();
            const existing = slots.find(x => x.slot === 1);
            S.save = existing ? existing.save : { funds: 0, clout: 0, casesCompleted: 0, bestScore: 0 };
          } catch (e) { S.save = { funds: 0, clout: 0, casesCompleted: 0, bestScore: 0 }; }
        } else {
          S.save = { funds: 0, clout: 0, casesCompleted: 0, bestScore: 0 };
        }
        root.IREcon.ensureInventory(S.save, S.bundle.config);
        root.IRUI.clear();
        this.scene.start("Overworld");
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
      const refreshHud = () => this._hud.setText("Funds " + S.save.funds + " · Cases " + S.save.casesCompleted + " · " + who + "\n[M] campus map · [E] enter · arrows/WASD walk");
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
    3: { title: "3rd Floor — Interventional Radiology" },
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
      const refreshHud = () => this._hud.setText(FLOOR_INFO[floor].title + "\nFunds " + S.save.funds + " · Cases " + S.save.casesCompleted + " · Best " + S.save.bestScore);
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
        room(280, 330, 170, 110, 0x2f6f4f, 0x3f8f6f, "Inpatient Ward\n(bedside EMR)");
        [[560, 300], [620, 300], [680, 300], [560, 480], [620, 480], [680, 480]].forEach(([px, py]) => {
          this.add.image(px, py, "t_bed").setOrigin(0.5, 0).setDepth(py + 56); solid(px, py + 30, 36, 44);
        });
        this.add.image(770, 160, "t_board").setOrigin(0).setDepth(3);
        flavor(400, 520, "Nurses' station", "\"Bed 4 pulled his IV again. Also, are you consenting your port patient or not?\"");
        portals.push({ x: 280, y: 330, w: 170, h: 110, label: "Round on the next patient", onEnter: () => CaseFlow.run(this) });
      } else if (floor === "3") {
        room(300, 350, 200, 130, 0x3a4a7a, 0x5a6fbf, "Angio Suite");
        this.add.image(300, 300, "t_carm").setOrigin(0.5, 0).setDepth(362);
        room(660, 320, 150, 80, 0x2f4a5a, 0x4f7a9f, "Control Room");
        this.add.image(150, 480, "t_bed").setOrigin(0.5, 0).setDepth(536); solid(150, 510, 36, 44); // holding bay
        label(this, 150, 462, "Holding", 9).setAlpha(0.6).setDepth(4);
        flavor(660, 490, "Reading room", "Rows of dark monitors. Somebody is dictating very, very fast.");
        portals.push({ x: 300, y: 350, w: 200, h: 130, label: "Angio suite", onEnter: () => { this.busy = false; root.IRUI.toast("Cases start at the bedside — round on the 2nd-floor ward first."); } });
        portals.push({ x: 660, y: 320, w: 150, h: 80, label: "Control room", onEnter: () => { this.busy = false; root.IRUI.toast("Behind leaded glass, the techs guard the good chairs and the good snacks."); } });
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
    },
    update() { movePlayer(this, 200); updatePortals(this); },
  };

  // ======================================================================
  // Case flow: EMR → Angio → Debrief (overlay-driven). Pauses the Phaser hub.
  const CaseFlow = {
    run(scene) {
      const B = S.bundle;
      let seed = (Math.random() * 2 ** 31) | 0;
      let patient = root.IRPatient.generate(B.generator, seed);

      const backToHub = () => { root.IRUI.clear(); scene.busy = false; scene.input.keyboard.resetKeys(); if (scene._refreshHud) scene._refreshHud(); };

      const showEMR = () => root.IRUI.EMR.show(patient, B.procedure, {
        onReroll: () => { seed = (Math.random() * 2 ** 31) | 0; patient = root.IRPatient.generate(B.generator, seed); showEMR(); },
        onOrderCorrection: () => {
          // clinically: transfuse platelets to a safe range, then recheck
          patient.coag.platelets = Math.max(patient.coag.platelets, 60);
          patient.labs.platelets.value = patient.coag.platelets; patient.labs.platelets.flag = "";
          patient.canProceed = true;
          patient.violationsIfProceed = [];
          patient.warnings = patient.warnings.filter(w => !/platelet/i.test(w.text));
          root.IRUI.toast("Platelets transfused → rechecked ≥ threshold. Cleared to proceed.");
          showEMR();
        },
        onProceed: () => {
          const missing = root.IREcon.missingKit(S.save, B.config, B.procedure.id);
          if (missing.length) { root.IRUI.toast("⛔ Kit incomplete — restock at procurement: " + missing.join(", ")); return; }
          runAngio();
        },
      });

      const cloutMult = () => {
        const tiers = (B.config.clout_tiers && B.config.clout_tiers.tiers) || [{ min: 0, payout_mult: 1 }];
        let m = 1; tiers.forEach(t => { if (S.save.clout >= t.min) m = t.payout_mult; });
        return m;
      };

      const runAngio = () => {
        root.IRUI.toast("🛏 The patient is wheeled up to the 3rd-floor angio suite.");
        const engine = root.IRAngio.create({
          params: B.params, vesselMap: B.vesselMap, devices: B.devices,
          complications: B.complications.filter(c => c.procedure_id === B.procedure.id),
          patient, config: B.config, seed,
          inventory: root.IREcon.ensureInventory(S.save, B.config),
        });
        root.IRUI.Angio.start(engine, { procedure: B.procedure, params: B.params, patient }, { onFinish: (score) => finish(score) });
      };

      const finish = async (score) => {
        const mult = cloutMult();
        const payout = Math.round(B.params.base_payout * (score.total / 100) * mult);
        S.save.funds += payout;
        S.save.casesCompleted += 1;
        S.save.bestScore = Math.max(S.save.bestScore || 0, score.total);
        S.save.updatedAt = new Date().toISOString();
        let saved = false;
        if (!S.guest && S.user) {
          try {
            await root.IRNet.writeCaseLog({ procedure_id: B.procedure.id, score_total: score.total, score_detail: score.breakdown, patient_seed: { seed } });
            await root.IRNet.writeSlot(S.slot, S.save);
            saved = true;
          } catch (e) { root.IRUI.toast("Save failed: " + (e.message || e)); }
        }
        root.IRUI.Debrief.show(score, { procedure: B.procedure, params: B.params }, {
          payout, cloutMult: mult, saved, slot: S.slot,
          onAgain: () => { seed = (Math.random() * 2 ** 31) | 0; patient = root.IRPatient.generate(B.generator, seed); showEMR(); },
          onHub: () => backToHub(),
        });
      };

      showEMR();
    },
  };

  root.IRScenes = [Boot, Overworld, Lobby, Hospital];
})(window);
