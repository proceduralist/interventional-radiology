/* Uterine fibroid embolization (UFE) case_steps — outcomes schema, keyed to the
   action taxonomy (so the battle Actions menu surfaces the correct maneuver among
   the ~71 generic moves). Source of truth mirrored to the DB (db/seed_p4_ufe.sql).
   Complication NAMES reference the existing CITED UFE complication rows; mults are
   MODELED. Node require() for tests; the real game reads this shape from the DB. */
module.exports = [
  { n: 1, title: "Time-out & planning", node: "cfa_access", best: "timeout",
    prompt: "Symptomatic fibroids, MRI reviewed. Begin the case.",
    blocked: ["cat:wire", "cat:catheter", "cat:embolization", "cat:angioplasty", "cat:recanalize",
      "place-sheath", "upsize-sheath", "long-sheath", "closure-device"],
    teaching: "Confirm symptomatic fibroids, patent uterine ostia, and no dominant ovarian supply before starting.",
    outcomes: {
      timeout: { label: "Pre-procedure time-out; confirm MRI, symptoms, consent", note: "Correct",
        ok: "MRI shows dominant fundal fibroids with patent uterine arteries. Consent confirmed." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Skipped the pre-procedure time-out." }], narrative: "You skip the checklist and press on." } },

  { n: 2, title: "Femoral access", node: "cfa_access", best: "us-micropuncture",
    prompt: "Obtain arterial access and place a working sheath.",
    blocked: ["cat:wire", "cat:catheter", "cat:embolization", "cat:angioplasty", "cat:recanalize", "closure-device"],
    teaching: "Ultrasound-guided common femoral access lowers access-site complications.",
    outcomes: {
      "us-micropuncture": { label: "Ultrasound-guided common femoral access, 5F sheath", note: "Standard of care",
        needs: ["micropuncture-needle-21g", "vascular-sheath-5f"], imaging: "us",
        ok: "Single anterior-wall CFA puncture under ultrasound; 5F sheath placed." },
      landmark: { label: "Landmark femoral stick without ultrasound", note: "Off-standard",
        needs: ["micropuncture-needle-21g", "vascular-sheath-5f"],
        score: [{ cat: "technical", delta: -3, reason: "Femoral access without ultrasound guidance.", cite: "US-guided access reduces access-site complications" }],
        ok: "Access obtained by palpation; sheath placed." },
    },
    default: { score: [{ cat: "technical", delta: -4, reason: "That does not obtain arterial access." }], narrative: "That won't get you into the femoral artery." } },

  { n: 3, title: "Pelvic arteriogram", node: "aortic_bifurc", best: "dsa",
    prompt: "Map the uterine arteries before selecting.",
    blocked: ["cat:embolization", "cat:angioplasty", "cat:recanalize"],
    teaching: "A diagnostic pelvic run identifies the uterine origins and any ovarian collateral supply.",
    outcomes: {
      dsa: { label: "Pelvic DSA through a flush catheter", note: "Correct roadmap",
        needs: ["pigtail-flush-5f", "bentson-035-145"], imaging: "dsa", contrastMl: 12,
        ok: "Pelvic arteriogram maps both uterine arteries; no dominant ovarian supply." },
      fluoro: { label: "A quick fluoro spot instead of a full run", note: "Inadequate roadmap",
        imaging: "fluoro", score: [{ cat: "technical", delta: -3, reason: "No diagnostic pelvic arteriogram before selection." }],
        ok: "You skip the full run and start poking around." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "No pelvic roadmap obtained." }], narrative: "You proceed without mapping the anatomy." } },

  { n: 4, title: "Select the uterine artery", node: "contra_iia", best: "reform",
    prompt: "Catheterize the (contralateral) uterine artery.",
    blocked: ["cat:embolization", "cat:angioplasty"],
    teaching: "A reverse-curve catheter reforms to select the sharply reflexed uterine origin up-and-over the bifurcation.",
    outcomes: {
      reform: { label: "Reform a reverse-curve catheter into the uterine artery", note: "Correct",
        needs: ["sos-omni-5f", "stiff-glidewire-035"], imaging: "fluoro",
        ok: "Reverse curve reformed; up-and-over to the contralateral internal iliac, then into the uterine artery." },
      "advance-cath": { label: "Push a straight catheter at the origin", note: "Wrong shape for this angle",
        score: [{ cat: "technical", delta: -3, reason: "A straight catheter cannot hold the sharply reflexed uterine origin." }],
        ok: "The straight catheter keeps prolapsing out — no stable selection." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Off-protocol at uterine selection." }], narrative: "That doesn't select the uterine artery." } },

  { n: 5, title: "Superselect", node: "uterine_origin", best: "superselect",
    prompt: "Position a microcatheter for embolization.",
    teaching: "Advancing distal to the cervicovaginal branch protects nontarget bladder/vaginal territory.",
    outcomes: {
      superselect: { label: "Microcatheter distal to the cervicovaginal branch", note: "Correct — protects nontarget territory",
        needs: ["microcatheter-27-150"], imaging: "fluoro",
        ok: "Microcatheter parked in the horizontal segment, beyond the cervicovaginal branch." },
      "advance-micro": { label: "Microcatheter only to the proximal uterine artery", note: "Proximal — higher nontarget risk",
        needs: ["microcatheter-27-150"], imaging: "fluoro", setFlag: "proximal_embo",
        score: [{ cat: "technical", delta: -2, reason: "Proximal microcatheter position raises nontarget/ovarian collateral risk." }],
        ok: "Microcatheter sits proximally, near the cervicovaginal origin." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Off-protocol at superselection." }], narrative: "That doesn't superselect the uterine artery." } },

  { n: 6, title: "Embolize to near-stasis", node: "uterine_target", best: "particles",
    prompt: "Devascularize the fibroids.",
    teaching: "Calibrated spheres to a slow-flow, pruned-tree endpoint — stop before stasis to limit reflux.",
    outcomes: {
      particles: { label: "Inject calibrated microspheres to a pruned-tree endpoint", note: "Correct endpoint",
        needs: ["microspheres-500-700"], imaging: "fluoro", contrastMl: 6,
        complication: { name: "Nontarget embolization (bladder, vagina, skin)", mult: 1, decline: { sbpDrop: 2 } },
        ok: "500–700 µm spheres to a slow-flow, pruned-tree endpoint.", hit: "A little reflux — some spheres reach the bladder/vaginal branches." },
    },
    default: { score: [{ cat: "technical", delta: -4, reason: "That does not embolize the fibroid bed appropriately (e.g., a proximal coil leaves collateral supply)." }], narrative: "That isn't the right way to devascularize the fibroids." } },

  { n: 7, title: "Contralateral side", node: "uterine_target", best: "reform",
    prompt: "Treat the other uterine artery.",
    teaching: "Bilateral treatment is standard — unilateral UFE has high recurrence.",
    outcomes: {
      reform: { label: "Select and embolize the opposite uterine artery to the same endpoint", note: "Bilateral is standard",
        imaging: "fluoro", contrastMl: 6,
        complication: { name: "Ovarian insufficiency", mult: 1, decline: {} },
        ok: "Contralateral uterine artery selected and embolized to near-stasis; bilateral treatment complete.", hit: "Diffuse embolization compromises some ovarian arterial supply." },
      "single-side": { label: "Treat only the accessed side; skip the contralateral artery", note: "Undertreatment",
        score: [{ cat: "technical", delta: -5, reason: "Unilateral UFE — high recurrence; both uterine arteries should be treated." }],
        ok: "You stop after one side." },
    },
    default: { score: [{ cat: "technical", delta: -3, reason: "Off-protocol before treating the second side." }], narrative: "That doesn't address the contralateral uterine artery." } },

  { n: 8, title: "Completion & closure", node: "cfa_access", best: "closure-device",
    prompt: "Finish the case.",
    teaching: "A completion run documents bilateral devascularization; both closure devices and manual pressure are acceptable.",
    outcomes: {
      "closure-device": { label: "Completion pelvic run, then a closure device", note: "Correct",
        needs: ["collagen-plug-closure"], imaging: "dsa", contrastMl: 5,
        ok: "Completion run confirms bilateral devascularization; collagen-plug closure with good hemostasis. Expect post-embolization syndrome (cramping, low-grade fever) — managed with NSAIDs/anti-emetics on the ward." },
      "manual-closure": { label: "Completion run, then hold manual pressure", note: "Also acceptable",
        imaging: "dsa", contrastMl: 5,
        ok: "Completion run good; ~15 minutes of manual pressure to hemostasis." },
    },
    default: { score: [{ cat: "technical", delta: -4, reason: "Closed without a completion angiogram." }], narrative: "You close without documenting the result." } },
];
