/* IR RPG — Angio Suite engine (data-driven interpreter).
   Turn-based. Every step's branching lives in DATA (procedure_game_params.case_steps[].outcomes),
   not code — so any procedure plays with zero engine changes (spec §12 P4). Tracks telemetry
   (vitals + fluoro/contrast accumulators), rolls complications weighted by their CITED incidence,
   and scores 0–100 (spec §7).

   Interaction model (confirmed 2026-07-03): each step offers a *set of acceptable actions*, each
   scored differently; a chosen action always PROCEEDS and takes its score/complication hit (no
   block-and-retry). An action not in the step's outcomes falls to the step `default` (off-protocol).

   Accuracy: complication *rates* are CITED (complications table). Pure technique-failure events
   with no published incidence (air embolism, CAJ perforation) are MODELED engine events, tagged as
   such — never an invented rate. Tunable constants (M) are MODELED (belong in game_config later).

   Pure logic: window.IRAngio in the browser, module.exports in Node (testable). */
(function (root) {
  "use strict";

  // MODELED simulation constants (tag: MODELED) --------------------------
  const M = {
    pushForce: { gentle: 1.0, firm: 2.0, forceful: 3.5 },
    critFactor: 0.6,             // stress > fragility*critFactor => CRITICAL tactile resistance
    perforationRiskPct: 40,      // MODELED: chance a CRITICAL-resistance forceful push perforates
    landmarkPtxMult: 5.0,        // (kept for reference; multipliers now live in step data)
    lowPltHematomaMult: 3.0,
    veryLowPltHematomaMult: 8.0,
    fluoro: { tap: 0.3, fluoro: 0.3, dsa: 0.6, reposition: 0.8, us: 0.0, roadmap: 0.4, cbct: 1.2 }, // minutes per imaging act (US adds no dose)
    doseRatePerMin: 12,          // mGy air-kerma per fluoro minute (modeled)
    contrastDsaMl: 3,
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
    ((cfg.vesselMap && cfg.vesselMap.graph && cfg.vesselMap.graph.nodes) || []).forEach(n => { nodesById[n.id] = n; });
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
      selectedItem: null,            // armed instrument from the Bag (battle UI)
      imaging: null,                 // current imaging modality (Imaging menu)
    };

    function log(category, delta, reason, cite) {
      eng.ledger.push({ category, delta, reason, cite: cite || "" });
    }
    function useDevice(id) {
      if (!id) return;
      const dup = eng.usedDevices.indexOf(id) >= 0;
      eng.usedDevices.push(id);
      if (dup) log("technical", -2, "Wasted/duplicate device: " + id, "");
    }
    const dapPerMin = (cfg.config && cfg.config.radiation_model && cfg.config.radiation_model.dap_per_fluoro_min) || 0.42;
    function image(kind) {
      const mins = M.fluoro[kind] != null ? M.fluoro[kind] : M.fluoro.tap;
      if (!mins) return; // e.g. ultrasound: no ionizing dose
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
    function triggerModeledEvent(name, declineSpec, note) {
      eng.emergency = { modeled: { name, note }, decline: declineSpec };
      eng.decline = Object.assign({ reason: name }, declineSpec);
      log("event", 0, "EVENT (MODELED): " + name + " — " + note, "MODELED simulation event");
    }

    // ---- data-driven outcome interpreter ------------------------------
    // An outcome (from case_steps[step].outcomes[actionId], or step.default) may declare:
    //   label, note            — UI text (labels preserved for the legacy choice view)
    //   needs:[deviceId]       — required stock; unstocked => choice locked / act blocked
    //   consumes:[deviceId]    — devices marked used (defaults to needs)
    //   imaging:"tap|dsa|us|…" — imaging act (adds dose per M.fluoro)
    //   contrastMl:n           — contrast added
    //   score:[{cat,delta,reason,cite}]        — ledger deltas (applied always)
    //   setFlag:"malposition"  — sets eng.flags[…]
    //   transfuse:true         — platelet-correction special (chest-port step 3)
    //   complication:{name,mult|multFrom:"platelets"(+multLow,multVeryLow),decline} — CITED roll
    //   stress:{device,node,force,critScore,riskPct,event:{name,decline,note},hit,critOk} — vessel-stress-gated MODELED event
    //   modeledEvent:{name,decline,note}       — unconditional MODELED event
    //   ifFlag:"malposition" + ifFlagScore/ifFlagImaging/ifFlagNarrative + elseScore/elseImaging/elseNarrative
    //   ok / hit / narrative   — result text
    function applyOutcome(o) {
      o = o || {};
      (o.consumes || o.needs || []).forEach(useDevice);
      if (o.imaging) image(o.imaging);
      if (o.contrastMl) eng.accum.contrastMl += o.contrastMl;
      (o.score || []).forEach(x => log(x.cat || x.category, x.delta, x.reason, x.cite));
      if (o.setFlag) eng.flags[o.setFlag] = true;

      if (o.transfuse) {
        const plt = patient.coag.platelets;
        if (plt >= 50) { log("technical", -2, "Unnecessary platelet transfusion (plt " + plt + ").", "SIR 2019 [1]"); return "Platelets were adequate; transfusion was unnecessary."; }
        eng.flags.transfused = true;
        log("safety", 0, "Corrected platelets before pocket creation.", "SIR 2019 [1]");
        return "Platelets transfused to a safe range; pocket created cleanly.";
      }

      if (o.stress) {
        const dev = devById[o.stress.device];
        const node = nodesById[o.stress.node] || { fragility: 5 };
        const sVal = vesselStress(dev, node, M.pushForce[o.stress.force] || 1);
        if (sVal > node.fragility * M.critFactor) {
          log("technical", o.stress.critScore != null ? o.stress.critScore : -4,
            "Advanced against CRITICAL tactile resistance at " + o.stress.node + " (stress " + sVal.toFixed(1) +
            " > fragility " + node.fragility + "×" + M.critFactor + " = " + (node.fragility * M.critFactor).toFixed(1) + ").",
            "MODELED vessel-stress");
          if (rng() * 100 < (o.stress.riskPct != null ? o.stress.riskPct : M.perforationRiskPct)) {
            triggerModeledEvent(o.stress.event.name, o.stress.event.decline, o.stress.event.note);
            return o.stress.hit || o.hit || "Complication.";
          }
          return o.stress.critOk || o.ok || "Resistance was critical but it held this time.";
        }
        return o.ok || "Advanced without excess resistance.";
      }

      if (o.complication && o.complication.name) {
        let mult = o.complication.mult != null ? o.complication.mult : 1.0;
        if (o.complication.multFrom === "platelets") {
          const plt = patient.coag.platelets;
          if (plt < 20) { mult = o.complication.multVeryLow || 8; log("technical", -10, "Proceeded with platelets " + plt + " (<20) without correction.", "SIR 2019 [1]"); }
          else if (plt < 50) { mult = o.complication.multLow || 3; }
          else mult = o.complication.mult != null ? o.complication.mult : 1;
        }
        const comp = compsByName[o.complication.name];
        const hit = comp && triggerComplication(comp, mult, o.complication.decline || { sbpDrop: 4 });
        return hit ? (o.hit || "Complication: " + o.complication.name + ".") : (o.ok || "Done.");
      }

      if (o.modeledEvent) {
        triggerModeledEvent(o.modeledEvent.name, o.modeledEvent.decline, o.modeledEvent.note);
        return o.hit || "Complication.";
      }

      let narrative = o.ok || o.narrative || "Done.";
      if (o.ifFlag) {
        if (eng.flags[o.ifFlag]) {
          (o.ifFlagScore || []).forEach(x => log(x.cat || x.category, x.delta, x.reason, x.cite));
          if (o.ifFlagImaging) image(o.ifFlagImaging);
          narrative = o.ifFlagNarrative || narrative;
        } else {
          (o.elseScore || []).forEach(x => log(x.cat || x.category, x.delta, x.reason, x.cite));
          if (o.elseImaging) image(o.elseImaging);
          narrative = o.elseNarrative || narrative;
        }
      }
      return narrative;
    }

    // ---- public API ---------------------------------------------------
    function outcomesOf(step) { return step.outcomes || {}; }

    // Legacy choice view (for the current Angio UI + tests): one choice per
    // acceptable action, labelled from the outcome. ownedOnly actions (shop
    // unlocks) hide until their gating device is stocked.
    function visibleChoices(step) {
      const outs = outcomesOf(step);
      return Object.keys(outs)
        .filter(id => { const o = outs[id]; return !o.ownedOnly || (o.needs || []).every(ownsDev); })
        .map(id => {
          const o = outs[id];
          const missing = (o.needs || []).filter(x => !ownsDev(x));
          return { id: id, label: o.label || id, note: o.note || "", locked: missing.length > 0, missing: missing };
        });
    }

    eng.currentStep = function () {
      if (eng.done) return null;
      const s = steps[eng.stepIndex];
      return {
        n: s.n, title: s.title, teaching: s.teaching, node: s.node,
        prompt: s.prompt, best: s.best,
        actions: s.actions || Object.keys(outcomesOf(s)),  // hint set for the taxonomy UI
        choices: visibleChoices(s),                         // back-compat labelled view
      };
    };

    // act(actionId[, {item, imaging}]) — the generic model. choose() is an alias
    // kept for the current UI/tests. Any action proceeds; unknown actions use the
    // step `default` outcome. A required-but-unstocked device blocks (can't use a
    // tool you don't carry) rather than "penalize" — that's inability, not error.
    function act(actionId, opts) {
      if (eng.done || eng.emergency) return { error: "blocked" };
      opts = opts || {};
      if (opts.imaging) eng.imaging = opts.imaging;
      if (opts.item) eng.selectedItem = opts.item;
      const s = steps[eng.stepIndex];
      const outs = outcomesOf(s);
      const o = outs[actionId] || s.default || { score: [{ cat: "technical", delta: -4, reason: "Off-protocol maneuver for this step.", cite: "" }], narrative: "That doesn't accomplish this step." };
      if ((o.needs || []).some(id => !ownsDev(id))) return { error: "not stocked — visit procurement" };
      const narrative = applyOutcome(o);
      endTurn();
      if (eng.emergency) return { narrative, emergency: describeEmergency() };
      return advance(narrative);
    }
    eng.act = act;
    eng.choose = act;
    eng.selectItem = function (id) { eng.selectedItem = id; return ownsDev(id); };
    eng.setImaging = function (kind) { eng.imaging = kind; return kind; };

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
        eng.decline = null;
        eng.vitals.sbp = clamp(eng.vitals.sbp + 10, 30, 220);
        eng.vitals.spo2 = clamp(eng.vitals.spo2 + 3, 60, 100);
        log("safety", 0, "Rescued " + (e.comp ? e.comp.name : e.modeled.name) + " with an appropriate maneuver.", e.comp ? (e.comp.citation_text || "") : "");
      } else {
        log("safety", -6, "No rescue for " + (e.comp ? e.comp.name : e.modeled.name) + " — ongoing decompensation.", "");
        endTurn(); endTurn();
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
      const dapRef = params.reference_dap_gycm2 || null;
      const limit = (patient && patient.renal && patient.renal.contrastLimitMl) || 9999;

      let safety = w.safety, shockTurns = 0, aucDeficit = 0;
      eng.sbpSeries.forEach(sbp => { if (sbp < 100) { shockTurns++; aucDeficit += (100 - sbp); } });
      safety -= aucDeficit * 0.2 + Math.max(0, shockTurns - 1) * 3;
      eng.ledger.filter(l => l.category === "safety").forEach(l => { safety += l.delta; });
      safety = clamp(Math.round(safety), 0, w.safety);

      let radiation = w.radiation;
      if (dapRef) {
        if (eng.accum.dapGycm2 > dapRef) radiation = w.radiation * Math.max(0, 1 - (eng.accum.dapGycm2 - dapRef) / dapRef);
      } else if (eng.accum.fluoroMin > target) {
        radiation = w.radiation * Math.max(0, 1 - (eng.accum.fluoroMin - target) / target);
      }
      radiation = clamp(Math.round(radiation), 0, w.radiation);

      let renal = w.renal;
      if (eng.accum.contrastMl > limit) renal = w.renal * Math.max(0, 1 - (eng.accum.contrastMl - limit) / limit);
      renal = clamp(Math.round(renal), 0, w.renal);

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
               accum: Object.assign({}, eng.accum), emergency: eng.emergency ? describeEmergency() : null, done: eng.done,
               selectedItem: eng.selectedItem, imaging: eng.imaging };
    };

    return eng;
  }

  const api = { create, vesselStress, M };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IRAngio = api;
})(typeof window !== "undefined" ? window : globalThis);
