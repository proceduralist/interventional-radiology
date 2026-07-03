/* IR RPG — grounded patient generator.
   Samples the DB patient_generator's distributions (MODELED oncology defaults,
   pending a cited cohort) and applies REAL clinical guardrails:
     - eGFR via CKD-EPI 2021 race-free creatinine equation
     - contrast limit via Cigarroa V_max = 5 * kg / SCr (game_config.contrast_vmax_formula)
     - ACR eGFR risk tiers (game_config.egfr_contrast_tiers)
     - SIR 2019 periprocedural coag thresholds (procedure preop [1])
   Pure logic: usable in the browser (window.IRPatient) and in Node (module.exports)
   so it can be unit-tested. Every distribution value it emits is MODELED; every
   threshold it checks is CITED and traceable to its source.  */
(function (root) {
  "use strict";

  // --- seedable RNG (mulberry32) + Box-Muller normal ---------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(rng, mean, sd, min, max) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    let z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    let x = mean + sd * z;
    if (typeof min === "number") x = Math.max(min, x);
    if (typeof max === "number") x = Math.min(max, x);
    return x;
  }

  // --- CITED clinical math -----------------------------------------------
  // CKD-EPI 2021 (race-free) creatinine eGFR. Inker LA et al. NEJM 2021.
  function egfrCkdEpi2021(scr, age, isFemale) {
    const kappa = isFemale ? 0.7 : 0.9;
    const alpha = isFemale ? -0.241 : -0.302;
    const r = scr / kappa;
    const egfr = 142 *
      Math.pow(Math.min(r, 1), alpha) *
      Math.pow(Math.max(r, 1), -1.200) *
      Math.pow(0.9938, age) *
      (isFemale ? 1.012 : 1);
    return egfr;
  }
  // Cigarroa RG et al. Am J Med. 1989 — maximum contrast dose.
  function cigarroaVmaxMl(weightKg, scr) {
    return (5 * weightKg) / scr;
  }
  // ACR Manual on Contrast Media eGFR risk tiers (qualitative).
  function acrRiskTier(egfr) {
    if (egfr >= 45) return "standard";
    if (egfr >= 30) return "caution";
    return "high_risk_minimize";
  }

  function round(x, d) { const f = Math.pow(10, d || 0); return Math.round(x * f) / f; }

  // Weighted pick from [{label, p}] (p need not sum to exactly 1; normalized).
  function categorical(rng, categories) {
    const total = categories.reduce((s, c) => s + (c.p || 0), 0) || 1;
    let r = rng() * total;
    for (const c of categories) { r -= (c.p || 0); if (r <= 0) return c.label; }
    return categories[categories.length - 1].label;
  }

  function sampleVariables(vars, rng) {
    const out = {};
    for (const v of vars) {
      if (v.kind === "bernoulli") out[v.name] = rng() < v.p;
      else if (v.kind === "normal") out[v.name] = normal(rng, v.mean, v.sd, v.min, v.max);
      else if (v.kind === "categorical") out[v.name] = categorical(rng, v.categories || []);
      else out[v.name] = v.mean; // fallback
    }
    return out;
  }

  /* Build a patient from a DB generator row.
     generator = { variables:[...], guardrails:[...], name, source_paper_id }
     seed = integer (stored in case_logs.patient_seed for reproducibility). */
  function generate(generator, seed) {
    seed = (seed == null) ? (Math.random() * 2 ** 31) | 0 : seed;
    const rng = mulberry32(seed);
    const raw = sampleVariables(generator.variables || [], rng);

    const isFemale = !!raw.sex_female;
    const age = Math.round(raw.age);
    const weightKg = round(raw.weight_kg, 0);
    const scr = round(raw.creatinine, 2);
    const platelets = Math.round(raw.platelets);
    const inr = round(raw.inr, 1);
    const hgb = round(raw.hemoglobin, 1);

    const egfr = round(egfrCkdEpi2021(scr, age, isFemale), 0);
    const vmax = round(cigarroaVmaxMl(weightKg, scr), 0);
    const tier = acrRiskTier(egfr);

    // --- guardrail evaluation (SIR 2019 low-risk thresholds, [1]) --------
    const warnings = [];
    const violationsIfProceed = [];
    let canProceed = true;

    if (platelets < 20) {
      canProceed = false;
      violationsIfProceed.push({
        text: "Platelets " + platelets + " ×10⁹/L below the SIR low-risk threshold (≥20). Transfuse before proceeding.",
        cite: "SIR 2019 periprocedural thresholds [1]",
      });
    } else if (platelets < 50) {
      warnings.push({
        text: "Platelets " + platelets + " ×10⁹/L: above the ≥20 low-risk floor, but many operators prefer ≥50 for pocket hemostasis.",
        cite: "Procedure preop note [1]",
      });
    }
    if (inr > 3.0) {
      warnings.push({
        text: "INR " + inr + " exceeds the SIR low-risk ceiling (≤2.0–3.0); consider correction.",
        cite: "SIR 2019 [1]",
      });
    }
    if (raw.on_anticoagulant) {
      warnings.push({
        text: "On anticoagulation — SIR does not require holding for low-risk access, but confirm a hold/bridge plan.",
        cite: "SIR 2019 [1]",
      });
    }
    if (scr >= 1.5) {
      warnings.push({
        text: "Creatinine " + scr + " mg/dL (eGFR " + egfr + "): " + tier.replace(/_/g, " ") +
              " contrast risk. Keep contrast under the Cigarroa V_max of " + vmax + " mL.",
        cite: "Cigarroa 1989 + ACR eGFR tiers",
      });
    }

    // Chart narrative
    const pmh = [];
    if (raw.hypertension) pmh.push("Hypertension");
    if (raw.diabetes) pmh.push("Diabetes mellitus");
    if (raw.ckd || scr >= 1.5) pmh.push("Chronic kidney disease");
    pmh.push("Malignancy requiring systemic chemotherapy");
    const meds = ["Chemotherapy regimen (per oncology)"];
    if (raw.on_anticoagulant) meds.push("Oral anticoagulant");
    if (raw.hypertension) meds.push("Antihypertensive");

    const cited = !!generator.source_paper_id;
    const indication = raw.cancer_type
      ? raw.cancer_type + " — long-term venous access for chemotherapy"
      : "Long-term venous access for chemotherapy";

    return {
      seed: seed,
      generatorName: generator.name || "default",
      dataClass: cited
        ? "Demographics CITED (cohort Table 1) · labs MODELED · guardrails CITED"
        : "MODELED (distributions) + CITED (guardrails)",
      sourcePaperId: generator.source_paper_id || null,
      demographics: { age, sex: isFemale ? "Female" : "Male", weightKg },
      indication,
      pmh, meds,
      labs: {
        creatinine: { value: scr, unit: "mg/dL", flag: scr >= 1.3 ? "H" : "" },
        egfr: { value: egfr, unit: "mL/min/1.73m²", flag: egfr < 60 ? "L" : "" },
        platelets: { value: platelets, unit: "×10⁹/L", flag: platelets < 100 ? "L" : "" },
        inr: { value: inr, unit: "", flag: inr > 1.2 ? "H" : "" },
        hemoglobin: { value: hgb, unit: "g/dL", flag: hgb < 12 ? "L" : "" },
      },
      imagingNote: "Prior CT chest reviewed: right IJ patent, no central stenosis or prior line thrombus.",
      renal: { egfr, contrastLimitMl: vmax, riskTier: tier },
      coag: { platelets, inr, onAnticoagulant: !!raw.on_anticoagulant },
      canProceed, warnings, violationsIfProceed,
    };
  }

  const api = { generate, egfrCkdEpi2021, cigarroaVmaxMl, acrRiskTier, mulberry32 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IRPatient = api;
})(typeof window !== "undefined" ? window : globalThis);
