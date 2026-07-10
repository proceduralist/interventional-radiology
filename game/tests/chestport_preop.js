/* Chest-port preop rules (procedure_game_params.preop) — source of truth mirrored
   to the DB by game/tools/gen_ward_sql.js. Thresholds + absolute contraindications
   CITED to the procedure's preprocedure chapter [1]: routine INR (goal < 1.5),
   PTT < 1.5× control on IV heparin, platelet transfusion < 50k; bacteremia/sepsis,
   insertion-site cellulitis, catheter-material allergy. Risk multipliers MODELED. */
module.exports = {
  labs: [
    { id: "inr", label: "INR", kind: "max", limit: 1.5, required: true, canBeMissing: true,
      goalText: "goal < 1.5", cite: "Routine INR in all patients; goal < 1.5 [1]",
      derange: [1.7, 3.4],
      violation: {
        score: [{ cat: "safety", delta: -6, reason: "Proceeded with INR above the 1.5 goal for a moderate-bleeding-risk procedure without correction.", cite: "Preprocedure preparation [1]" }],
        risk: [{ match: "hematoma|bleed", mult: 3.0, basis: "MODELED multiplier" }] },
      missingViolation: {
        score: [{ cat: "safety", delta: -4, reason: "Proceeded without a documented INR (routine for all patients).", cite: "Preprocedure preparation [1]" }],
        risk: [{ match: "hematoma|bleed", mult: 1.5, basis: "MODELED multiplier" }] } },
    { id: "platelets", label: "Platelet count", kind: "min", limit: 50, required: false,
      goalText: "transfuse if < 50 ×10⁹/L", cite: "Transfusion recommended for counts < 50,000/µL [1]",
      derange: [22, 46],
      violation: {
        score: [{ cat: "safety", delta: -5, reason: "Proceeded with platelets < 50 ×10⁹/L without transfusion.", cite: "Preprocedure preparation [1]" }],
        risk: [{ match: "hematoma|bleed", mult: 3.0, basis: "MODELED — mirrors the engine's multLow" }] } },
    { id: "ptt", label: "PTT", kind: "max", limit: 52.5, required: false, onlyIf: "on_anticoagulant",
      goalText: "< 1.5× control (normal 25–35 s)", cite: "PTT recommended on IV unfractionated heparin; < 1.5× control [1]",
      derange: [60, 95],
      violation: {
        score: [{ cat: "safety", delta: -4, reason: "Proceeded on anticoagulation with PTT > 1.5× control.", cite: "Preprocedure preparation [1]" }],
        risk: [{ match: "hematoma|bleed", mult: 2.0, basis: "MODELED multiplier" }] } },
  ],
  contraindications: [
    { id: "bacteremia", label: "Bacteremia / sepsis", cite: "Absolute contraindication [1]",
      emr: "Febrile to 38.9 °C overnight; 2/2 blood culture bottles growing gram-negative rods; on empiric antibiotics.",
      violation: {
        score: [{ cat: "safety", delta: -15, reason: "Implanted a subcutaneous port in an actively bacteremic patient.", cite: "Absolute contraindications [1]" }],
        postop: "POD 5: port pocket infection with persistent bacteremia — device explanted, PICC bridge while clearing cultures." } },
    { id: "cellulitis", label: "Cellulitis at the insertion site", cite: "Absolute contraindication [1]",
      emr: "Warm, indurated erythema over the right anterior chest and lower neck at the planned insertion site.",
      violation: {
        score: [{ cat: "safety", delta: -12, reason: "Placed the port through cellulitic skin.", cite: "Absolute contraindications [1]" }],
        postop: "Early pocket infection tracking from the cellulitic entry — explant and IV antibiotics." } },
    { id: "allergy", label: "Allergy to catheter material", cite: "Absolute contraindication [1]",
      emr: "Allergy list: documented severe reaction to the implant catheter material.",
      violation: {
        score: [{ cat: "safety", delta: -12, reason: "Implanted a device the patient has a documented material allergy to.", cite: "Absolute contraindications [1]" }],
        postop: "Progressive local reaction around the pocket — device removed." } },
  ],
};
