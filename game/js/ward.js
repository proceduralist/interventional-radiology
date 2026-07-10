/* IR RPG — ward NPC / preop / progression logic (pure; Node-testable).
   Owns the 2nd-floor inpatient beds: level-gated patient spawning, bed respawn
   timers (compressed 2–5 min; game_config.ward, DESIGN), orderable preop labs
   that resolve on the NEXT bedside interaction (spec), preop rule evaluation
   (procedure_game_params.preop — CITED for chest-port, MODELED for UFE), and
   the XP/level ladder (game_config.progression, DESIGN).

   Save shape it manages:
     save.xp, save.ward = { beds: [bedRec|{emptyUntil}] },
     save.rooms = { ir_suite:null|ticket, ct_suite:…, us_room:… }
   bedRec = { seed, procId, spawnedAt, labOverrides:{labId:{value}|{missing:true}},
              pending:[labId], contra:{id,label,emr,violation}|null }

   window.IRWard in the browser, module.exports in Node. */
(function (root) {
  "use strict";

  const DEFAULT_WARD = { beds: 6, respawn_min_s: 120, respawn_max_s: 300, p_contra: 0.12, p_deranged: 0.4, p_missing: 0.22 };
  const DEFAULT_PROG = {
    levels: [{ level: 1, xp: 0, title: "PGY-2 Resident" }],
    xp_per_score_pct: 0.5, turn_down_xp: 10, turn_down_clout: 5, wrong_turn_down_clout: -10,
    fail_clout: { bailed: -5, takeover: -5, kicked: -3 },
  };
  const ROOMS = ["ir_suite", "ct_suite", "us_room"]; // bedside is not a bookable room
  const ROOM_LABEL = { ir_suite: "IR Suite", ct_suite: "CT Suite", us_room: "Ultrasound Room", bedside: "Bedside" };

  const wardCfg = (config) => Object.assign({}, DEFAULT_WARD, (config && config.ward) || {});
  const progCfg = (config) => Object.assign({}, DEFAULT_PROG, (config && config.progression) || {});

  // ---- progression --------------------------------------------------------
  function levelFor(config, xp) {
    const p = progCfg(config);
    let cur = p.levels[0], next = null;
    for (const L of p.levels) { if ((xp || 0) >= L.xp) cur = L; else { next = L; break; } }
    return { level: cur.level, title: cur.title, xp: xp || 0, next: next ? { level: next.level, xp: next.xp, title: next.title } : null };
  }
  function xpForScore(config, total) {
    return Math.max(0, Math.round((total || 0) * (progCfg(config).xp_per_score_pct || 0.5)));
  }

  // ---- spawning -----------------------------------------------------------
  // cases = v_game_ready rows (id, title, min_level, location, complexity)
  function eligibleCases(cases, level) {
    return (cases || []).filter(c => (c.min_level || 1) <= level);
  }

  /* Roll a fresh patient for a bed. rnd = () => [0,1). Exactly one preop
     "problem" per patient (DESIGN — keeps each bedside lesson focused):
     contraindication OR one deranged lab OR one missing required lab. */
  function spawnPatient(cases, config, level, rnd, now, preopByProc) {
    const elig = eligibleCases(cases, level);
    if (!elig.length) return null;
    const c = elig[Math.floor(rnd() * elig.length)];
    const preop = (preopByProc && preopByProc[c.id]) || {};
    const W = wardCfg(config);
    const rec = {
      seed: Math.floor(rnd() * 2 ** 31), procId: c.id, procTitle: c.title,
      spawnedAt: now, labOverrides: {}, pending: [], contra: null,
    };
    const roll = rnd();
    const labs = preop.labs || [];
    if (roll < W.p_contra && (preop.contraindications || []).length) {
      const pool = preop.contraindications;
      rec.contra = pool[Math.floor(rnd() * pool.length)];
    } else if (roll < W.p_contra + W.p_deranged && labs.length) {
      const derangeable = labs.filter(l => l.derange);
      if (derangeable.length) {
        const L = derangeable[Math.floor(rnd() * derangeable.length)];
        const v = L.derange[0] + rnd() * (L.derange[1] - L.derange[0]);
        rec.labOverrides[L.id] = { value: +v.toFixed(L.id === "platelets" ? 0 : 1) };
      }
    } else if (roll < W.p_contra + W.p_deranged + W.p_missing) {
      const missable = labs.filter(l => l.canBeMissing);
      if (missable.length) {
        const L = missable[Math.floor(rnd() * missable.length)];
        rec.labOverrides[L.id] = { missing: true };
      }
    }
    return rec;
  }

  function respawnDelayMs(config, rnd) {
    const W = wardCfg(config);
    return Math.round((W.respawn_min_s + rnd() * (W.respawn_max_s - W.respawn_min_s)) * 1000);
  }

  /* Ensure save.ward/save.rooms/save.xp exist; fill any bed whose respawn is due.
     Returns array of bed indexes that changed (for the scene to redraw). */
  function ensureWard(save, cases, config, now, rnd, preopByProc) {
    rnd = rnd || Math.random;
    now = now == null ? Date.now() : now;
    save.xp = save.xp || 0;
    save.rooms = save.rooms || {};
    ROOMS.forEach(r => { if (!(r in save.rooms)) save.rooms[r] = null; });
    const W = wardCfg(config);
    if (!save.ward) save.ward = { beds: [] };
    const beds = save.ward.beds;
    while (beds.length < W.beds) beds.push({ emptyUntil: 0 });
    const level = levelFor(config, save.xp).level;
    const changed = [];
    for (let i = 0; i < W.beds; i++) {
      const b = beds[i];
      if (!b.seed && (b.emptyUntil || 0) <= now) {
        const rec = spawnPatient(cases, config, level, rnd, now, preopByProc);
        if (rec) { beds[i] = rec; changed.push(i); }
      }
    }
    return changed;
  }

  function clearBed(save, i, config, now, rnd) {
    rnd = rnd || Math.random;
    now = now == null ? Date.now() : now;
    save.ward.beds[i] = { emptyUntil: now + respawnDelayMs(config, rnd) };
    return save.ward.beds[i];
  }

  // ---- labs ---------------------------------------------------------------
  function orderLabs(rec, ids) {
    ids.forEach(id => { if (rec.pending.indexOf(id) < 0) rec.pending.push(id); });
    return rec.pending.slice();
  }

  const catalogById = (config) => {
    const map = {};
    (((config || {}).lab_catalog || {}).labs || []).forEach(l => { map[l.id] = l; });
    return map;
  };
  const midNormal = (lab, rnd) => {
    if (!lab || !lab.normal) return null;
    const [lo, hi] = lab.normal;
    const v = lo + (0.25 + rnd() * 0.5) * (hi - lo); // comfortably inside range
    return +(v.toFixed(lab.id === "platelets" ? 0 : 1));
  };

  /* Resolve every pending lab (call on the NEXT bedside interaction, per spec):
     deranged → corrected into the normal range ("medically optimized");
     missing  → results appear: 70% normal / 30% deranged (needs a re-order).
     Returns [{id, name, note}] describing what came back. */
  function resolvePending(rec, preop, config, rnd) {
    rnd = rnd || Math.random;
    const cat = catalogById(config);
    const rules = {}; ((preop || {}).labs || []).forEach(l => { rules[l.id] = l; });
    const out = [];
    (rec.pending || []).forEach(id => {
      const lab = cat[id], rule = rules[id];
      const ov = rec.labOverrides[id];
      if (ov && ov.missing) {
        if (rule && rule.derange && rnd() < 0.3) {
          const v = rule.derange[0] + rnd() * (rule.derange[1] - rule.derange[0]);
          rec.labOverrides[id] = { value: +v.toFixed(id === "platelets" ? 0 : 1) };
          out.push({ id, name: (lab && lab.name) || id, note: "resulted ABNORMAL — review and re-order after correction" });
        } else {
          const v = midNormal(lab, rnd);
          rec.labOverrides[id] = v == null ? {} : { value: v };
          out.push({ id, name: (lab && lab.name) || id, note: "resulted within normal limits" });
        }
      } else if (ov && ov.value != null) {
        const v = midNormal(lab, rnd);
        if (v != null) rec.labOverrides[id] = { value: v };
        else delete rec.labOverrides[id];
        out.push({ id, name: (lab && lab.name) || id, note: (lab && lab.fixNote) || "corrected to within normal limits" });
      } else {
        out.push({ id, name: (lab && lab.name) || id, note: "rechecked — unchanged (was already acceptable)" });
      }
    });
    rec.pending = [];
    return out;
  }

  /* Overlay the bed's lab overrides + contraindication onto a generated patient. */
  function applyOverrides(patient, rec) {
    Object.keys(rec.labOverrides || {}).forEach(id => {
      const ov = rec.labOverrides[id];
      const slot = patient.labs[id] || (patient.labs[id] = { value: null, unit: "", flag: "" });
      if (ov.missing) { slot.value = null; slot.flag = ""; slot.missing = true; }
      else if (ov.value != null) {
        slot.value = ov.value; slot.missing = false;
        slot.flag = id === "inr" ? (ov.value > 1.2 ? "H" : "") :
                    id === "platelets" ? (ov.value < 100 ? "L" : "") :
                    id === "ptt" ? (ov.value > 35 ? "H" : "") : slot.flag;
      }
      if (id === "inr" && patient.coag) patient.coag.inr = ov.missing ? null : ov.value;
      if (id === "platelets" && patient.coag && ov.value != null) patient.coag.platelets = ov.value;
    });
    if (rec.contra) {
      // The chart carries only the raw findings (nursing note) — never a labeled
      // red flag. The player must recognize the contraindication themselves.
      patient.contraNote = rec.contra.emr;
    }
    return patient;
  }

  /* Evaluate the procedure's preop rules against the (overridden) patient.
     Returns everything the UI + engine need:
       violations: [{label, text, cite}]  — shown in the banner / proceed-anyway confirm
       penalties:  score ledger entries applied if the player proceeds
       riskMods:   [{match, mult}] complication-risk multipliers if they proceed
       postop:     post-op adverse-outcome notes if they proceed (contra only)
       contra:     the contraindication rec (null if none)
       shouldDecline: true when "Recommend against procedure" is the right call */
  function evalPreop(patient, rec, preop) {
    const res = { violations: [], penalties: [], riskMods: [], postop: [], contra: rec.contra || null, shouldDecline: !!rec.contra };
    ((preop || {}).labs || []).forEach(rule => {
      if (rule.onlyIf === "on_anticoagulant" && !(patient.coag && patient.coag.onAnticoagulant)) return;
      const slot = patient.labs[rule.id];
      const missing = !slot || slot.missing || slot.value == null;
      if (missing) {
        if (rule.required) {
          const v = rule.missingViolation || rule.violation || {};
          res.violations.push({ label: rule.label, text: rule.label + " is not on file (" + (rule.goalText || "required") + ").", cite: rule.cite || "" });
          res.penalties = res.penalties.concat(v.score || []);
          res.riskMods = res.riskMods.concat(v.risk || []);
        }
        return;
      }
      const bad = rule.kind === "max" ? slot.value > rule.limit : slot.value < rule.limit;
      if (bad) {
        const v = rule.violation || {};
        res.violations.push({ label: rule.label, text: rule.label + " " + slot.value + " — outside the preop goal (" + (rule.goalText || rule.limit) + ").", cite: rule.cite || "" });
        res.penalties = res.penalties.concat(v.score || []);
        res.riskMods = res.riskMods.concat(v.risk || []);
      }
    });
    if (rec.contra) {
      const v = rec.contra.violation || {};
      res.violations.push({ label: rec.contra.label, text: rec.contra.label + " — this case should be declined, not optimized.", cite: rec.contra.cite || "" });
      res.penalties = res.penalties.concat(v.score || []);
      if (v.postop) res.postop.push(v.postop);
    }
    return res;
  }

  /* "Recommend against procedure" outcome. Correct only when the clinical
     picture is unfixable (contraindication). DESIGN clout/XP values. */
  function turnDown(save, rec, config) {
    const p = progCfg(config);
    const correct = !!rec.contra;
    if (correct) {
      save.clout = Math.max(0, (save.clout || 0) + (p.turn_down_clout || 5));
      save.xp = (save.xp || 0) + (p.turn_down_xp || 10);
    } else {
      save.clout = Math.max(0, (save.clout || 0) + (p.wrong_turn_down_clout || -10));
    }
    return { correct, cloutDelta: correct ? (p.turn_down_clout || 5) : (p.wrong_turn_down_clout || -10), xp: correct ? (p.turn_down_xp || 10) : 0 };
  }

  const api = {
    DEFAULT_WARD, ROOMS, ROOM_LABEL,
    levelFor, xpForScore, eligibleCases, spawnPatient, ensureWard, clearBed,
    respawnDelayMs, orderLabs, resolvePending, applyOverrides, evalPreop, turnDown,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IRWard = api;
})(typeof window !== "undefined" ? window : globalThis);
