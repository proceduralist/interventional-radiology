/* IR RPG — economy + sim-lab math (P2). Pure logic, no DOM/Phaser.
   window.IREcon in the browser, module.exports in Node (testable).

   Accuracy contract:
   - Prices, payouts, starter kit, ownership model: DESIGN (game_config.economy).
   - Flow-bench readouts: the same MODELED vessel-stress formula the case engine
     uses (spec §9: "practice transfers"), against MODELED synthetic profiles.
   - Packing density: published volumetric formula (CITED via game_config.packing_density).
   - Nothing here invents a clinical rate. */
(function (root) {
  "use strict";

  // ---- inventory (buy-once ownership model, DESIGN) ----------------------
  function ensureInventory(save, config) {
    if (!save.inventory) {
      const econ = (config && config.economy) || {};
      save.inventory = {};
      (econ.starter_inventory || []).forEach(id => { save.inventory[id] = true; });
    }
    return save.inventory;
  }
  function owns(save, deviceId) { return !!(save.inventory && save.inventory[deviceId]); }
  function canBuy(save, device) {
    if (!device || device.status !== "published") return { ok: false, why: "unavailable" };
    if (owns(save, device.id)) return { ok: false, why: "owned" };
    if ((save.funds || 0) < (device.price_funds || 0)) return { ok: false, why: "funds" };
    return { ok: true };
  }
  function buy(save, device) {
    const c = canBuy(save, device);
    if (!c.ok) return c;
    save.funds -= device.price_funds || 0;
    save.inventory[device.id] = true;
    return { ok: true, funds: save.funds };
  }
  function missingKit(save, config, procedureId) {
    const kits = ((config || {}).economy || {}).required_kit || {};
    const kit = kits[procedureId] || [];
    return kit.filter(id => !owns(save, id));
  }

  // ---- flow bench (spec §9) ----------------------------------------------
  // Same MODELED formula + constants as the case engine (IRAngio), so bench
  // numbers are exactly what the engine will compute in a case.
  function flowBench(device, profile, M) {
    const rows = [];
    const forces = M.pushForce; // {gentle, firm, forceful}
    Object.keys(forces).forEach(name => {
      const stress = ((device.stiffness || 4) * (profile.tortuosity || 2) / (device.lubricity || 5)) * forces[name];
      const critAt = (profile.fragility || 5) * M.critFactor;
      const grade = stress > critAt ? "CRITICAL" : stress > critAt * 0.6 ? "MODERATE" : "LOW";
      rows.push({
        force: name,
        stress: +stress.toFixed(2),
        criticalThreshold: +critAt.toFixed(2),
        grade,
        // Perforation only ever rolls on a forceful push against CRITICAL
        // resistance, at M.perforationRiskPct (MODELED simulation parameter).
        perforationRollPct: (grade === "CRITICAL" && name === "forceful") ? M.perforationRiskPct : 0,
      });
    });
    return {
      device: device.id, profile: profile.id, rows,
      support: device.support || null, trackability: device.trackability || null,
      dataClass: "MODELED",
    };
  }

  // ---- embolic playground (spec §9) ---------------------------------------
  // Volumetric packing density (published formula; citation lives in
  // game_config.packing_density and is displayed with the result).
  // coil: { primaryDiameterMm, lengthCm }  aneurysm: sphere {dMm} | ellipsoid {aMm,bMm,cMm}
  function coilVolumeMm3(coil) {
    const r = (coil.primaryDiameterMm || 0) / 2;
    return Math.PI * r * r * (coil.lengthCm || 0) * 10; // cm -> mm
  }
  function aneurysmVolumeMm3(a) {
    if (a.aMm && a.bMm && a.cMm) return (Math.PI / 6) * a.aMm * a.bMm * a.cMm; // ellipsoid
    const r = (a.dMm || 0) / 2;
    return (4 / 3) * Math.PI * r * r * r; // sphere
  }
  function packingDensity(aneurysm, coils) {
    const av = aneurysmVolumeMm3(aneurysm);
    const cv = (coils || []).reduce((s, c) => s + coilVolumeMm3(c), 0);
    return {
      aneurysmVolumeMm3: +av.toFixed(1),
      coilVolumeMm3: +cv.toFixed(2),
      packingPct: av > 0 ? +(100 * cv / av).toFixed(1) : 0,
    };
  }

  // ---- economy helpers -----------------------------------------------------
  function cloutTierName(config, clout) {
    const tiers = ((config || {}).clout_tiers || {}).tiers || [];
    let name = "—";
    tiers.forEach(t => { if ((clout || 0) >= t.min) name = t.name; });
    return name;
  }
  const TIER_LABEL = { 1: "Tier 1 — stock", 2: "Tier 2 — hydrophilic", 3: "Tier 3 — microsystems" };

  const api = { ensureInventory, owns, canBuy, buy, missingKit, flowBench, coilVolumeMm3, aneurysmVolumeMm3, packingDensity, cloutTierName, TIER_LABEL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IREcon = api;
})(typeof window !== "undefined" ? window : globalThis);
