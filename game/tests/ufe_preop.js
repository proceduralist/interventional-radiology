/* UFE preop rules (procedure_game_params.preop) — mirrored to the DB by
   game/tools/gen_ward_sql.js. ALL thresholds/contraindications here are
   MODELED pending Ryan's citation (SIR moderate-bleeding-risk convention;
   standard UFE contraindications: viable pregnancy, active pelvic infection,
   suspected gynecologic malignancy). */
module.exports = {
  labs: [
    { id: "inr", label: "INR", kind: "max", limit: 1.5, required: true, canBeMissing: true,
      goalText: "goal < 1.5 (moderate bleeding risk)", cite: "MODELED — pending citation (SIR moderate-risk convention)",
      derange: [1.7, 3.0],
      violation: {
        score: [{ cat: "safety", delta: -6, reason: "Proceeded with INR above the 1.5 goal without correction.", cite: "MODELED — pending citation" }],
        risk: [{ match: "hematoma|bleed|puncture", mult: 3.0, basis: "MODELED multiplier" }] },
      missingViolation: {
        score: [{ cat: "safety", delta: -4, reason: "Proceeded without a documented INR.", cite: "MODELED — pending citation" }],
        risk: [{ match: "hematoma|bleed|puncture", mult: 1.5, basis: "MODELED multiplier" }] } },
    { id: "platelets", label: "Platelet count", kind: "min", limit: 50, required: false,
      goalText: "transfuse if < 50 ×10⁹/L", cite: "MODELED — pending citation (SIR moderate-risk convention)",
      derange: [24, 46],
      violation: {
        score: [{ cat: "safety", delta: -5, reason: "Proceeded with platelets < 50 ×10⁹/L without transfusion.", cite: "MODELED — pending citation" }],
        risk: [{ match: "hematoma|bleed|puncture", mult: 3.0, basis: "MODELED multiplier" }] } },
  ],
  contraindications: [
    { id: "pregnancy", label: "Viable pregnancy", cite: "MODELED — pending citation (standard UFE contraindication)",
      emr: "This morning's β-hCG returned positive; bedside ultrasound shows an early intrauterine pregnancy.",
      violation: {
        score: [{ cat: "safety", delta: -15, reason: "Embolized the uterine arteries of a pregnant patient.", cite: "MODELED — pending citation" }],
        postop: "Pregnancy loss attributed to uterine devascularization — root-cause analysis opened." } },
    { id: "pelvic_infection", label: "Active pelvic infection", cite: "MODELED — pending citation (standard UFE contraindication)",
      emr: "Purulent cervical discharge with uterine tenderness; WBC 15.8 — gynecology is treating active PID.",
      violation: {
        score: [{ cat: "safety", delta: -12, reason: "Embolized a uterus with active pelvic infection.", cite: "MODELED — pending citation" }],
        postop: "Pyometra requiring hysterectomy — infected, devascularized tissue." } },
    { id: "gyn_malignancy", label: "Suspected gynecologic malignancy", cite: "MODELED — pending citation (standard UFE contraindication)",
      emr: "Rapidly enlarging uterine mass with irregular enhancement and ascites — malignancy not yet excluded; biopsy pending.",
      violation: {
        score: [{ cat: "safety", delta: -12, reason: "Embolized a mass suspicious for malignancy before tissue diagnosis.", cite: "MODELED — pending citation" }],
        postop: "Final pathology: leiomyosarcoma — embolization delayed the oncologic diagnosis." } },
  ],
};
