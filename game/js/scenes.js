/* IR RPG — Phaser scenes + case flow.
   Boot (auth + data) → Overworld (stylized Boston, T fast-travel) → Hospital hub
   (Ward EMR / Angio suite). Text-heavy screens are HTML overlays (see ui.js);
   Phaser handles the navigable overworld/hub. Procedural placeholder art (no
   external assets yet — see assets/CREDITS.md). window.IRScenes + window.IRState. */
(function (root) {
  "use strict";
  const Phaser = root.Phaser;
  const S = root.IRState = { user: null, guest: false, bundle: null, save: null, slot: 1 };

  const COL = { bg: 0x0e1420, road: 0x1b2436, river: 0x1f3a5f, block: 0x24304a,
    hosp: 0x8a1c2b, hospDoor: 0xf0c040, tstop: 0xd23b3b, ward: 0x2f6f4f, angio: 0x3a4a7a,
    simlab: 0x6f5a2f, shop: 0x2f5a6f,
    player: 0xf2f2f2, exit: 0x555f73, text: "#dfe6f2" };

  // ----- proximity portals (shared helper) --------------------------------
  function makePortals(scene, list) {
    scene._portals = list.map(p => Object.assign({}, p));
    scene._hint = scene.add.text(0, 0, "", { fontFamily: "monospace", fontSize: "13px", color: "#ffe08a", backgroundColor: "#0009", padding: { x: 6, y: 3 } })
      .setDepth(50).setVisible(false);
    scene._eKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  }
  function updatePortals(scene) {
    if (scene.busy) return;
    let near = null;
    for (const p of scene._portals) {
      if (Math.abs(scene.player.x - p.x) < p.w / 2 + 22 && Math.abs(scene.player.y - p.y) < p.h / 2 + 22) { near = p; break; }
    }
    if (near) {
      scene._hint.setText("▸ " + near.label + "   [E]").setPosition(scene.player.x - 40, scene.player.y - 46).setVisible(true);
      if (Phaser.Input.Keyboard.JustDown(scene._eKey)) { scene.busy = true; near.onEnter(); }
    } else scene._hint.setVisible(false);
  }
  function movePlayer(scene, speed) {
    const c = scene.cursors, w = scene.wasd; let vx = 0, vy = 0;
    if (c.left.isDown || w.left.isDown) vx = -speed;
    else if (c.right.isDown || w.right.isDown) vx = speed;
    if (c.up.isDown || w.up.isDown) vy = -speed;
    else if (c.down.isDown || w.down.isDown) vy = speed;
    scene.player.body.setVelocity(vx, vy);
  }
  function stdControls(scene) {
    scene.cursors = scene.input.keyboard.createCursorKeys();
    scene.wasd = scene.input.keyboard.addKeys({ up: "W", down: "S", left: "A", right: "D" });
  }
  function label(scene, x, y, txt, size) {
    return scene.add.text(x, y, txt, { fontFamily: "monospace", fontSize: (size || 12) + "px", color: COL.text }).setOrigin(0.5).setDepth(5);
  }

  // ======================================================================
  const Boot = {
    key: "Boot",
    create() {
      this.cameras.main.setBackgroundColor("#0e1420");
      label(this, 480, 250, "The Academic IR RPG", 22);
      const status = label(this, 480, 300, "Loading…", 13);
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
        // P2: seed the starter supply-contract inventory (migrates old saves too)
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
  const Overworld = {
    key: "Overworld",
    create() {
      this.busy = false;
      this.cameras.main.setBackgroundColor("#0e1420");
      // river band (stylized Charles)
      this.add.rectangle(480, 70, 960, 90, COL.river).setDepth(0);
      label(this, 90, 70, "Charles R.", 11).setOrigin(0, 0.5).setAlpha(0.7);
      // brownstone blocks
      const blocks = [[170, 250], [330, 250], [650, 250], [810, 250], [170, 470], [810, 470]];
      blocks.forEach(([x, y]) => { this.add.rectangle(x, y, 120, 90, COL.block).setStrokeStyle(2, 0x39466a); });
      // roads
      this.add.rectangle(480, 300, 960, 40, COL.road).setDepth(0);
      this.add.rectangle(480, 300, 40, 620, COL.road).setDepth(0);
      // hospital
      this.add.rectangle(480, 470, 190, 120, COL.hosp).setStrokeStyle(3, 0xba2b3d);
      label(this, 480, 440, "Longwood IR Hospital", 12);
      this.add.rectangle(480, 520, 46, 24, COL.hospDoor);
      // T station
      this.add.circle(180, 360, 16, COL.tstop); label(this, 180, 360, "T", 14);

      this.player = this.add.rectangle(300, 360, 20, 20, COL.player);
      this.physics.add.existing(this.player);
      this.player.body.setCollideWorldBounds(true);
      this.physics.world.setBounds(0, 30, 960, 600);
      stdControls(this);

      label(this, 480, 600, "Arrow keys / WASD to walk · [E] to enter · The T is fast travel", 12).setAlpha(0.8);
      const hud = label(this, 12, 44, "", 12).setOrigin(0, 0);
      hud.setText("Funds " + S.save.funds + "  ·  " + (S.guest ? "guest (no save)" : (S.user.email || "resident")));

      makePortals(this, [
        { x: 480, y: 520, w: 60, h: 40, label: "Enter hospital", onEnter: () => this.scene.start("Hospital") },
        { x: 180, y: 360, w: 40, h: 40, label: "Take the T to the hospital", onEnter: () => { this.busy = false; root.IRUI.toast("🚇 The Red Line whisks you to Longwood."); this.player.setPosition(480, 500); } },
      ]);
    },
    update() { movePlayer(this, 220); updatePortals(this); },
  };

  // ======================================================================
  const Hospital = {
    key: "Hospital",
    create() {
      this.busy = false;
      this.cameras.main.setBackgroundColor("#121a28");
      this.add.rectangle(480, 330, 720, 460, 0x18223a).setStrokeStyle(2, 0x2b3757);
      label(this, 480, 120, "3rd Floor — Interventional Radiology", 16);

      this.add.rectangle(250, 300, 150, 100, COL.ward).setStrokeStyle(2, 0x3f8f6f);
      label(this, 250, 300, "Inpatient Ward\n(bedside EMR)", 12);
      this.add.rectangle(710, 300, 150, 100, COL.angio).setStrokeStyle(2, 0x5a6fbf);
      label(this, 710, 300, "Angio Suite", 12);
      this.add.rectangle(250, 460, 150, 80, COL.simlab).setStrokeStyle(2, 0x9f8a4f);
      label(this, 250, 460, "Sim Lab", 12);
      this.add.rectangle(710, 460, 150, 80, COL.shop).setStrokeStyle(2, 0x4f8a9f);
      label(this, 710, 460, "Procurement", 12);
      this.add.rectangle(480, 520, 120, 44, COL.exit); label(this, 480, 520, "Exit → Boston", 11);

      this.player = this.add.rectangle(480, 400, 20, 20, COL.player);
      this.physics.add.existing(this.player);
      this.player.body.setCollideWorldBounds(true);
      this.physics.world.setBounds(60, 150, 840, 420);
      stdControls(this);
      const hud = label(this, 12, 20, "", 12).setOrigin(0, 0);
      const refreshHud = () => hud.setText("Funds " + S.save.funds + "  ·  Cases " + S.save.casesCompleted + "  ·  Best " + S.save.bestScore);
      refreshHud(); this._refreshHud = refreshHud;

      const openOverlay = (fn) => {
        this.scene.pause();
        const close = () => { root.IRUI.clear(); this.busy = false; this.scene.resume(); refreshHud(); };
        fn(close);
      };
      const persist = async () => {
        if (S.guest || !S.user) return;
        try { S.save.updatedAt = new Date().toISOString(); await root.IRNet.writeSlot(S.slot, S.save); }
        catch (e) { root.IRUI.toast("Save failed: " + (e.message || e)); }
      };

      makePortals(this, [
        { x: 250, y: 300, w: 150, h: 100, label: "Round on the next patient", onEnter: () => CaseFlow.run(this) },
        { x: 710, y: 300, w: 150, h: 100, label: "Angio suite (round first)", onEnter: () => { this.busy = false; root.IRUI.toast("See the patient at the bedside first — round in the Ward."); } },
        { x: 250, y: 460, w: 150, h: 80, label: "Practice in the Sim Lab", onEnter: () => openOverlay((close) =>
            root.IRUI.SimLab.show({ save: S.save, devices: S.bundle.devices, config: S.bundle.config, configMeta: S.bundle.configMeta }, { onClose: close })) },
        { x: 710, y: 460, w: 150, h: 80, label: "Procurement office", onEnter: () => openOverlay((close) =>
            root.IRUI.Shop.show({ save: S.save, devices: S.bundle.devices, config: S.bundle.config }, { onPurchase: () => persist(), onClose: close })) },
        { x: 480, y: 520, w: 120, h: 44, label: "Head out to Boston", onEnter: () => this.scene.start("Overworld") },
      ]);
    },
    update() { movePlayer(this, 200); updatePortals(this); },
  };

  // ======================================================================
  // Case flow: EMR → Angio → Debrief (overlay-driven). Pauses the Phaser hub.
  const CaseFlow = {
    run(scene) {
      scene.scene.pause();
      const B = S.bundle;
      let seed = (Math.random() * 2 ** 31) | 0;
      let patient = root.IRPatient.generate(B.generator, seed);

      const backToHub = () => { root.IRUI.clear(); scene.busy = false; scene.scene.resume(); if (scene._refreshHud) scene._refreshHud(); };

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

  root.IRScenes = [Boot, Overworld, Hospital];
})(window);
