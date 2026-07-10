/* Action taxonomy (game_config.action_taxonomy) — source of truth mirrored to the
   DB by game/tools/gen_ward_sql.js. The battle Actions menu is ONLY this nested
   list (no per-step answer buttons — the player must find the right maneuver).
   12 categories / ~80 moves. DESIGN/MODELED; Ryan curates.
   New vs the original 11-category set: "surgical" (device-implant moves the
   chest-port case needs) and medications/transfuse. */
module.exports = { categories: [
  { id: "access", name: "Access & sheath", moves: [
    ["us-micropuncture", "Ultrasound-guided micropuncture"],
    ["landmark", "Landmark puncture (no US)"],
    ["upsize-035", "Upsize to 0.035 dilator"],
    ["place-sheath", "Place vascular sheath"],
    ["upsize-sheath", "Upsize sheath"],
    ["long-sheath", "Place long/guide sheath"],
    ["manual-closure", "Manual compression closure"],
    ["closure-device", "Deploy closure device"]] },
  { id: "wire", name: "Wire", moves: [
    ["advance-wire", "Advance guidewire"],
    ["exchange-wire", "Exchange wire over catheter"],
    ["shape-tip", "Shape / curve tip"],
    ["steer", "Steer / torque"],
    ["pullback", "Pullback / reposition"],
    ["park-wire", "Park a buddy wire"]] },
  { id: "catheter", name: "Catheter / micro", moves: [
    ["advance-cath", "Advance catheter"],
    ["select-vessel", "Select target vessel"],
    ["reform", "Reform reverse curve (Simmons/SOS)"],
    ["exchange-cath", "Exchange catheter"],
    ["advance-micro", "Advance microcatheter (coaxial)"],
    ["superselect", "Superselect distal branch"],
    ["aspirate", "Aspirate"],
    ["flush", "Flush / double-flush"]] },
  { id: "imaging", name: "Imaging", moves: [
    ["ultrasound", "Ultrasound"],
    ["fluoro", "Fluoroscopy (spot)"],
    ["dsa", "DSA run"],
    ["roadmap", "Roadmap overlay"],
    ["projection", "Change projection"],
    ["collimate", "Collimate"],
    ["magnify", "Magnify"],
    ["cbct", "Cone-beam CT"]] },
  { id: "contrast", name: "Contrast", moves: [
    ["hand-injection", "Hand injection (test)"],
    ["power-injection", "Power injection (rate/vol)"],
    ["co2", "CO2 angiography"]] },
  { id: "embolization", name: "Embolization", moves: [
    ["coil-pushable", "Deploy pushable coil"],
    ["coil-detachable", "Deploy detachable coil"],
    ["particles", "Inject particles / spheres"],
    ["glue", "Inject n-BCA glue"],
    ["evoh", "Inject EVOH (Onyx)"],
    ["plug", "Deploy vascular plug"],
    ["gelfoam", "Gelfoam slurry"]] },
  { id: "angioplasty", name: "Angioplasty / stent", moves: [
    ["balloon", "Inflate balloon"],
    ["hp-balloon", "High-pressure / prolonged inflation"],
    ["stent-se", "Deploy self-expanding stent"],
    ["stent-be", "Deploy balloon-expandable stent"],
    ["post-dilate", "Post-dilate"],
    ["covered-stent", "Deploy covered stent"]] },
  { id: "recanalize", name: "Recanalize / retrieve", moves: [
    ["cross-lesion", "Cross lesion"],
    ["thrombolysis", "Thrombolysis infusion"],
    ["thrombectomy", "Aspiration thrombectomy"],
    ["snare", "Snare foreign body"],
    ["ivc-filter", "Deploy IVC filter"],
    ["ivc-retrieve", "Retrieve IVC filter"]] },
  { id: "percutaneous", name: "Percutaneous", moves: [
    ["target-needle", "Advance access needle to target"],
    ["core-biopsy", "Core biopsy pass"],
    ["fna", "FNA pass"],
    ["place-drain", "Place drainage catheter"],
    ["pigtail", "Form locking pigtail"],
    ["aspirate-collection", "Aspirate collection"]] },
  { id: "surgical", name: "Surgical / implant", moves: [
    ["sterile-prep", "Chlorhexidine prep & drape"],
    ["local-anesthesia", "Infiltrate local anesthetic"],
    ["incise", "Skin incision / nick"],
    ["blunt-pocket", "Blunt-dissect a device pocket"],
    ["tunnel", "Tunnel the catheter"],
    ["measure-trim", "Measure & trim to length"],
    ["connect-device", "Assemble / connect the device"],
    ["close-pocket", "Close the pocket (two-layer)"]] },
  { id: "medications", name: "Medications & support", moves: [
    ["heparin", "Heparin (+ ACT)"],
    ["nitroglycerin", "Nitroglycerin (antispasm)"],
    ["sedation", "Titrate sedation"],
    ["transfuse", "Transfuse blood product"],
    ["reversal", "Reversal agent"],
    ["pressor", "Vasopressor"],
    ["fluids", "IV fluid bolus"],
    ["antibiotics", "Antibiotics"]] },
  { id: "control", name: "Procedure control", moves: [
    ["timeout", "Time-out"],
    ["reposition", "Reposition table / patient"],
    ["call-attending", "Call attending"],
    ["convert", "Convert / abort"],
    ["completion", "Completion angiogram"],
    ["close", "Close & dress"]] },
] };
