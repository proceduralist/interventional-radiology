/* IR RPG — Angio Suite engine (chest-port vertical slice).
   Turn-based. Drives the 7 case steps from procedure_game_params.case_steps,
   tracks telemetry (vitals + fluoro/contrast accumulators), rolls complications
   weighted by their CITED incidence, and scores 0–100 (spec §7).

   Accuracy: complication *rates* are CITED (from the complications table). Pure
   technique-failure consequences with no published incidence (air embolism from a
   skipped breath-hold, CAJ perforation from over-forceful advance) are MODELED
   engine events, tagged as such — never presented with an invented rate.
   Tunable constants below are MODELED (spec: they belong in game_config later).

   Pure logic: window.IRAngio in the browser, module.exports in Node (testable). */
(function (root) {
  "use strict";

  // MODELED simulation constants (tag: MODELED) --------------------------
  const M = {
    pushForce: { gentle: 1.0, firm: 2.0, forceful: 3.5 },
    critFactor: 0.6,             // stress > fragility*critFactor => CRITICAL tactile resistance
    perforationRiskPct: 40,      // MODELED: chance a CRITICAL-resistance forceful push perforates
    landmarkPtxMult: 5.0,         // landmark vs US-guided access multiplier
    lowPltHematomaMult: 3.0,      // platelets <50 raises pocket-hematoma odds
    veryLowPltHematomaMult: 8.0,  // platelets <20 uncorrected
    fluoro: { tap: 0.3, dsa: 0.6, reposition: 0.8 }, // minutes per imaging act
    doseRatePerMin: 12,           // mGy air-kerma per fluoro minute (modeled)
    contrastDsaMl: 3,             // small confirm run
    airEmbolismSbpDrop: 18, airEmbolismSpo2Drop: 6,
    perforationSbpDrop: 30,
    ptxSpo2Drop: 4, ptxRrRise: 6,
  };

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function vesselStress(device, node, pushForce) {
    const stiff = device && device.stiffness ? device.stiffness : 4;
    const lub = device && device.lubricity ? device.lubricity : 5;
    const tort = node && node.tortuosity ? node.tortuosity : 2;
    return (stiff * tort / lub) * pushForce; // spec §7 MODELED formula
  }

  function create(cfg) {
    const params = cfg.params;                     // procedure_game_params row
    const steps = (params.case_steps || []).slice().sort((a, b) => a.n - b.n);
    const nodesById = {};
    (cfg.vesselMap.graph.nodes || []).forEach(n => { nodesById[n.id] = n; });
    const devById = {};
    (cfg.devices || []).forEach(d => { devById[d.id] = d; });
    const compsByName = {};
    (cfg.complications || []).forEach(c => { compsByName[c.name] = c; });
    const rng = (cfg.patient && cfg.patient.__rng) ||
      (root.IRPatient ? root.IRPatient.mulberry32((cfg.seed || 1) ^ 0x9e3779b9)
                      : Math.random);
    // P2: buy-once inventory {deviceId:true}. If omitted, no gating (back-compat).
    const inv = cfg.inventory || null;
    const ownsDev = (id) => !inv || !!inv[id];

    const patient = cfg.patient;
    const baselineSbp = patient && patient.pmh && patient.pmh.indexOf("Hypertension") >= 0 ? 136 : 120;

    const eng = {
      stepIndex: 0,
      done: false,
      emergency: null,               // active complication awaiting rescue
      vitals: { sbp: baselineSbp, dbp: 76, hr: 78, spo2: 98, rr: 14, act: null },
      decline: null,                 // {sbpDrop, spo2Drop, rrRise, reason} applied per turn
      accum: { fluoroMin: 0, airKermaMgy: 0, contrastMl: 0, dapGycm2: 0 },
      sbpSeries: [],
      usedDevices: [],
      ledger: [],                    // {category, delta(+/-), reason, cite}
      flags: {},
    };

    function log(category, delta, reason, cite) {
      eng.ledger.push({ category, delta, reason, cite: cite || "" });
    }
    function useDevice(id) {
      const dup = eng.usedDevices.indexOf(id) >= 0;
      eng.usedDevices.push(id);
      if (dup) log("technical", -2, "Wasted/duplicate device: " + id, "");
    }
    // MODELED fluoro->DAP conversion (game_config.radiation_model); the scored
    // radiation metric is DAP vs the procedure's CITED reference (spec §7).
    const dapPerMin = (cfg.config && cfg.config.radiation_model && cfg.config.radiation_model.dap_per_fluoro_min) || 0.42;
    function image(kind) {
      const mins = M.fluoro[kind] || M.fluoro.tap;
      eng.accum.fluoroMin = +(eng.accum.fluoroMin + mins).toFixed(2);
      eng.accum.airKermaMgy = +(eng.accum.airKermaMgy + mins * M.doseRatePerMin).toFixed(1);
      eng.accum.dapGycm2 = +(eng.accum.dapGycm2 + mins * dapPerMin).toFixed(3);
    }
    function endTurn() {
      if (eng.decline) {
        eng.vitals.sbp = clamp(eng.vitals.sbp - eng.decline.sbpDrop, 30, 220);
        eng.vitals.spo2 = clamp(eng.vitals.spo2 - (eng.decline.spo2Drop || 0), 60, 100);
        eng.vitals.rr = clamp(eng.vitals.rr + (eng.decline.rrRise || 0), 6, 45);
        eng.vitals.hr = clamp(eng.vitals.hr + 6, 50, 170); // compensatory tachycardia
      }
      eng.sbpSeries.push(eng.vitals.sbp);
    }
    function triggerComplication(comp, mult, declineSpec) {
      const base = (comp.rate_high_pct != null ? comp.rate_high_pct : 2);
      const eff = base * (mult || 1);
      const rolled = rng() * 100;
      if (rolled < eff) {
        eng.emergency = { comp, decline: declineSpec };
        eng.decline = Object.assign({ reason: comp.name }, declineSpec);
        log("event", 0, "COMPLICATION: " + comp.name + " (rolled " + rolled.toFixed(1) +
          "% vs " + eff.toFixed(1) + "% effective incidence; base " + base + "% " +
          (comp.rate_text || "") + ")", comp.citation_text || "complications table");
        return true;
      }
      return false;
    }
    // MODELED technique-failure event (no published rate)
    function triggerModeledEvent(name, declineSpec, note) {
      eng.emergency = { modeled: { name, note }, decline: declineSpec };
      eng.decline = Object.assign({ reason: name }, declineSpec);
      log("event", 0, "EVENT (MODELED): " + name + " — " + note, "MODELED simulation event");
    }

    // ---- step choice trees --------------------------------------------
    const STEP = {
      1: {
        prompt: "Pre-procedure. How do you begin?",
        choices: [
          { id: "timeout", label: "Time-out + US survey of the right IJ", note: "Correct — confirm patency/compressibility",
            apply() { log("technical", 0, "Time-out and US survey performed.", ""); return "Site confirmed; right IJ patent and compressible."; } },
          { id: "skip", label: "Skip the time-out, patient's waiting", note: "Guideline violation",
            apply() { log("technical", -3, "Skipped surgical time-out.", "Universal Protocol"); return "You proceed without a time-out."; } },
        ],
      },
      2: {
        prompt: "Obtain venous access and secure a working wire to the SVC/IVC.",
        choices: [
          { id: "us", label: "US-guided micropuncture (21G), 0.018 → exchange → 0.035 Bentson", note: "Correct, lowest pneumothorax risk",
            needs: ["micropuncture-needle-21g", "mp-wire-018", "transitional-dilator-5f", "bentson-035-145"],
            apply() {
              useDevice("micropuncture-needle-21g"); useDevice("mp-wire-018");
              useDevice("transitional-dilator-5f"); useDevice("bentson-035-145");
              image("tap");
              const comp = compsByName["Pneumothorax"];
              const hit = comp && triggerComplication(comp, 1.0, { sbpDrop: 4, spo2Drop: M.ptxSpo2Drop, rrRise: M.ptxRrRise });
              return hit ? "Access obtained, but the post-access check shows a pneumothorax."
                         : "Clean US-guided access; 0.035 wire seated in the SVC.";
            } },
          { id: "us_glide", label: "US-guided micropuncture, exchange to 0.035 hydrophilic wire", note: "Equivalent safe technique — hydrophilic tracks easier (MODELED)",
            needs: ["micropuncture-needle-21g", "mp-wire-018", "transitional-dilator-5f", "glidewire-035-150"],
            ownedOnly: true, // offered only once the wire is purchased (P2 shop)
            apply() {
              useDevice("micropuncture-needle-21g"); useDevice("mp-wire-018");
              useDevice("transitional-dilator-5f"); useDevice("glidewire-035-150");
              image("tap");
              log("technical", 0, "US-guided access; exchanged to a hydrophilic working wire (lubricity 9, MODELED).", "");
              const comp = compsByName["Pneumothorax"];
              const hit = comp && triggerComplication(comp, 1.0, { sbpDrop: 4, spo2Drop: M.ptxSpo2Drop, rrRise: M.ptxRrRise });
              return hit ? "Access obtained, but the post-access check shows a pneumothorax."
                         : "Clean US-guided access; hydrophilic wire glides to the SVC.";
            } },
          { id: "landmark", label: "Landmark stick (faster, no US)", note: "Higher pneumothorax risk",
            needs: ["micropuncture-needle-21g", "bentson-035-145"],
            apply() {
              useDevice("micropuncture-needle-21g"); useDevice("bentson-035-145"); image("tap");
              log("technical", -3, "Landmark venipuncture instead of real-time US guidance.", "US guidance is standard of care [1]");
              const comp = compsByName["Pneumothorax"];
              const hit = comp && triggerComplication(comp, M.landmarkPtxMult, { sbpDrop: 4, spo2Drop: M.ptxSpo2Drop, rrRise: M.ptxRrRise });
              return hit ? "Blind stick — the patient desaturates; pneumothorax."
                         : "Landmark access happened to work this time.";
            } },
        ],
      },
      3: {
        prompt: "Create the subcutaneous pocket on the pectoralis fascia.",
        choices: [
          { id: "pocket", label: "Anesthetize, incise, develop a snug pocket", note: "Coag-dependent",
            apply() {
              const plt = patient.coag.platelets;
              let mult = 1.0, viol = "";
              if (plt < 20) { mult = M.veryLowPltHematomaMult; viol = "very-low"; log("technical", -10, "Proceeded with platelets " + plt + " (<20) without correction.", "SIR 2019 [1]"); }
              else if (plt < 50) { mult = M.lowPltHematomaMult; }
              const comp = compsByName["Pocket hematoma"];
              const hit = comp && triggerComplication(comp, mult, { sbpDrop: 6, spo2Drop: 0, rrRise: 0 });
              return hit ? "Oozing in the pocket — a hematoma is developing."
                         : "Pocket created with good hemostasis.";
            } },
          { id: "transfuse", label: "Order platelet transfusion first, then pocket", note: "Only meaningful if platelets are low",
            apply() {
              const plt = patient.coag.platelets;
              if (plt >= 50) { log("technical", -2, "Unnecessary platelet transfusion (plt " + plt + ").", "SIR 2019 [1]"); return "Platelets were adequate; transfusion was unnecessary."; }
              eng.flags.transfused = true;
              log("safety", 0, "Corrected platelets before pocket creation.", "SIR 2019 [1]");
              return "Platelets transfused to a safe range; pocket created cleanly.";
            } },
        ],
      },
      4: {
        prompt: "Tunnel the catheter and set tip length to the cavoatrial junction.",
        choices: [
          { id: "measure", label: "Measure against the wire under fluoro, trim to CAJ", note: "Correct",
            needs: ["port-catheter-8f"],
            apply() { useDevice("port-catheter-8f"); image("tap"); log("technical", 0, "Tip length measured to the CAJ under fluoroscopy.", ""); return "Catheter trimmed so the tip will sit at the CAJ."; } },
          { id: "estimate", label: "Eyeball the length to save fluoro", note: "Malposition risk",
            needs: ["port-catheter-8f"],
            apply() {
              useDevice("port-catheter-8f");
              log("technical", -4, "Estimated catheter length instead of fluoroscopic measurement — tip malposition.", "");
              eng.flags.malposition = true; image("reposition");
              return "Estimated length; the tip looks high — you'll need to reposition later.";
            } },
        ],
      },
      5: {
        prompt: "Deliver the catheter through the peel-away sheath to the CAJ.",
        choices: [
          { id: "valsalva_gentle", label: "Valsalva/breath-hold, pinch sheath, gentle advance", note: "Correct technique",
            needs: ["peelaway-sheath-9f"],
            apply() {
              useDevice("peelaway-sheath-9f");
              const s = vesselStress(devById["port-catheter-8f"], nodesById["caj"], M.pushForce.gentle);
              return "Sheath placed with air-embolism precautions; catheter advanced gently (resistance LOW). Tip at the CAJ.";
            } },
          { id: "no_breathhold", label: "Advance briskly without a breath-hold", note: "Air-embolism risk",
            needs: ["peelaway-sheath-9f"],
            apply() {
              useDevice("peelaway-sheath-9f");
              triggerModeledEvent("Air embolism", { sbpDrop: M.airEmbolismSbpDrop, spo2Drop: M.airEmbolismSpo2Drop, rrRise: 4 },
                "Open sheath without breath-hold entrained air (procedure step 5 precaution).");
              return "As the dilator comes out you hear a gasp — air embolism.";
            } },
          { id: "forceful", label: "Seat it deep with a firm forceful push", note: "Watch tactile resistance",
            needs: ["peelaway-sheath-9f"],
            apply() {
              useDevice("peelaway-sheath-9f");
              const node = nodesById["caj"];
              const s = vesselStress(devById["port-catheter-8f"], node, M.pushForce.forceful);
              const crit = s > node.fragility * M.critFactor;
              if (crit) {
                log("technical", -4, "Advanced against CRITICAL tactile resistance at the CAJ (stress " + s.toFixed(1) + " > fragility " + node.fragility + "×" + M.critFactor + " = " + (node.fragility * M.critFactor).toFixed(1) + ").", "MODELED vessel-stress");
                if (rng() * 100 < M.perforationRiskPct) {
                  triggerModeledEvent("CAJ perforation → pericardial effusion", { sbpDrop: M.perforationSbpDrop, spo2Drop: 2, rrRise: 4 },
                    "Over-forceful advance at the fragile cavoatrial junction against critical resistance.");
                  return "Sudden give, then hypotension — you've perforated the CAJ.";
                }
                return "It seats deep — resistance was CRITICAL but it held this time. Don't push against that.";
              }
              return "It seats deep; resistance was high but held.";
            } },
        ],
      },
      6: {
        prompt: "Connect the port and test it.",
        choices: [
          { id: "aspirate", label: "Lock to stem; Huber access; aspirate + flush each lumen", note: "Correct",
            needs: ["huber-needle-20g"],
            apply() { useDevice("huber-needle-20g"); log("technical", 0, "Brisk blood return and free flush confirmed.", ""); return "Brisk blood return, free flush, no pocket swelling."; } },
          { id: "skip", label: "Skip the aspiration test, it looked fine", note: "Guideline violation",
            apply() { log("technical", -3, "Skipped the aspiration/flush patency test.", ""); return "You skip the patency check."; } },
        ],
      },
      7: {
        prompt: "Confirm final tip position and close.",
        choices: [
          { id: "dsa", label: "DSA spot to document CAJ tip, then two-layer close", note: "Correct",
            apply() {
              image("dsa"); eng.accum.contrastMl += M.contrastDsaMl;
              if (eng.flags.malposition) { log("technical", -3, "Malpositioned tip required repositioning before closure.", ""); image("reposition"); return "Spot shows the tip was high; repositioned to the CAJ, then closed."; }
              log("technical", 0, "Fluoroscopic spot documents CAJ tip without kinks.", "");
              return "Tip confirmed at the CAJ; pocket closed in two layers.";
            } },
          { id: "noconfirm", label: "Close without a confirmatory image", note: "Misses malposition",
            apply() {
              log("technical", -6, "Closed without documenting final tip position.", "");
              if (eng.flags.malposition) log("safety", 0, "Undocumented malpositioned tip left in place.", "");
              return "You close without a confirmatory spot film.";
            } },
        ],
      },
    };

    // ---- public API ---------------------------------------------------
    // P2 inventory gating: choices whose devices aren't stocked are locked;
    // ownedOnly choices (shop unlocks) are hidden until purchased.
    function visibleChoices(logic) {
      return logic.choices
        .filter(c => !c.ownedOnly || (c.needs || []).every(ownsDev))
        .map(c => {
          const missing = (c.needs || []).filter(id => !ownsDev(id));
          return { id: c.id, label: c.label, note: c.note, locked: missing.length > 0, missing };
        });
    }

    eng.currentStep = function () {
      if (eng.done) return null;
      const s = steps[eng.stepIndex];
      const logic = STEP[s.n];
      return { n: s.n, title: s.title, teaching: s.teaching, node: s.node,
               prompt: logic.prompt, choices: visibleChoices(logic) };
    };

    eng.choose = function (choiceId) {
      if (eng.done || eng.emergency) return { error: "blocked" };
      const s = steps[eng.stepIndex];
      const logic = STEP[s.n];
      const choice = logic.choices.find(c => c.id === choiceId);
      if (!choice) return { error: "bad choice" };
      if ((choice.needs || []).some(id => !ownsDev(id))) return { error: "not stocked — visit procurement" };
      const narrative = choice.apply();
      endTurn();
      if (eng.emergency) return { narrative, emergency: describeEmergency() };
      return advance(narrative);
    };

    function describeEmergency() {
      const e = eng.emergency;
      if (e.comp) {
        return { name: e.comp.name, note: e.comp.rate_text, cite: e.comp.citation_text,
                 rescues: (e.comp.rescue_actions || []).map(r => ({ id: r.action_id, label: r.label })).concat([{ id: "none", label: "Do nothing / press on" }]) };
      }
      return { name: e.modeled.name, note: e.modeled.note, cite: "MODELED event",
               rescues: rescueForModeled(e.modeled.name) };
    }
    function rescueForModeled(name) {
      if (name === "Air embolism") return [
        { id: "trendelenburg", label: "Left lateral decubitus + Trendelenburg, 100% O₂, aspirate air" },
        { id: "none", label: "Do nothing / press on" }];
      return [
        { id: "pericardiocentesis", label: "Stop, call for echo, prepare pericardiocentesis, resuscitate" },
        { id: "none", label: "Do nothing / press on" }];
    }

    eng.resolveEmergency = function (rescueId) {
      const e = eng.emergency;
      const good = rescueId && rescueId !== "none";
      if (good) {
        eng.decline = null; // rescue halts decompensation
        // one recovery turn
        eng.vitals.sbp = clamp(eng.vitals.sbp + 10, 30, 220);
        eng.vitals.spo2 = clamp(eng.vitals.spo2 + 3, 60, 100);
        log("safety", 0, "Rescued " + (e.comp ? e.comp.name : e.modeled.name) + " with an appropriate maneuver.", e.comp ? (e.comp.citation_text || "") : "");
      } else {
        log("safety", -6, "No rescue for " + (e.comp ? e.comp.name : e.modeled.name) + " — ongoing decompensation.", "");
        endTurn(); endTurn(); // decline continues
      }
      eng.emergency = null;
      eng.sbpSeries.push(eng.vitals.sbp);
      return advance(good ? "Situation stabilized." : "The patient keeps deteriorating.");
    };

    function advance(narrative) {
      eng.stepIndex++;
      if (eng.stepIndex >= steps.length) { eng.done = true; return { narrative, done: true }; }
      return { narrative, done: false };
    }

    // ---- scoring (spec §7) --------------------------------------------
    eng.finish = function () {
      const w = (cfg.config && cfg.config.scoring_weights) || { safety: 40, radiation: 20, renal: 20, technical: 20 };
      const target = params.fluoro_target_min || 3.0;
      const dapRef = params.reference_dap_gycm2 || null; // CITED per procedure
      const limit = (patient && patient.renal && patient.renal.contrastLimitMl) || 9999;

      // Safety: area under SBP<100 + shock turns
      let safety = w.safety, shockTurns = 0, aucDeficit = 0;
      eng.sbpSeries.forEach(sbp => { if (sbp < 100) { shockTurns++; aucDeficit += (100 - sbp); } });
      safety -= aucDeficit * 0.2 + Math.max(0, shockTurns - 1) * 3;
      // fold in any safety ledger deltas
      eng.ledger.filter(l => l.category === "safety").forEach(l => { safety += l.delta; });
      safety = clamp(Math.round(safety), 0, w.safety);

      // Radiation — scored on DAP vs the CITED reference when available
      // (Jonczyk 2018); falls back to the MODELED fluoro-minute target otherwise.
      let radiation = w.radiation;
      if (dapRef) {
        if (eng.accum.dapGycm2 > dapRef) radiation = w.radiation * Math.max(0, 1 - (eng.accum.dapGycm2 - dapRef) / dapRef);
      } else if (eng.accum.fluoroMin > target) {
        radiation = w.radiation * Math.max(0, 1 - (eng.accum.fluoroMin - target) / target);
      }
      radiation = clamp(Math.round(radiation), 0, w.radiation);

      // Renal
      let renal = w.renal;
      if (eng.accum.contrastMl > limit) renal = w.renal * Math.max(0, 1 - (eng.accum.contrastMl - limit) / limit);
      renal = clamp(Math.round(renal), 0, w.renal);

      // Technical
      let technical = w.technical;
      eng.ledger.filter(l => l.category === "technical").forEach(l => { technical += l.delta; });
      technical = clamp(Math.round(technical), 0, w.technical);

      const total = clamp(safety + radiation + renal + technical, 0, 100);
      return {
        total,
        breakdown: { safety, radiation, renal, technical },
        max: w,
        telemetry: {
          fluoroMin: eng.accum.fluoroMin, fluoroTargetMin: target,
          airKermaMgy: eng.accum.airKermaMgy,
          dapGycm2: eng.accum.dapGycm2, referenceDapGycm2: dapRef,
          contrastMl: eng.accum.contrastMl, contrastLimitMl: limit,
          finalSbp: eng.vitals.sbp, lowestSbp: Math.min.apply(null, eng.sbpSeries.concat([eng.vitals.sbp])),
        },
        ledger: eng.ledger,
        usedDevices: eng.usedDevices.slice(),
        seed: patient ? patient.seed : null,
      };
    };

    eng.state = function () {
      return { stepIndex: eng.stepIndex, total: steps.length, vitals: Object.assign({}, eng.vitals),
               accum: Object.assign({}, eng.accum), emergency: eng.emergency ? describeEmergency() : null, done: eng.done };
    };

    return eng;
  }

  const api = { create, vesselStress, M };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IRAngio = api;
})(typeof window !== "undefined" ? window : globalThis);
