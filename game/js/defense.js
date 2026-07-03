/* IR RPG — conference defense engine (P3, spec §10).
   Green-room dossier = the actual papers row. Podium gauntlet spawns 3–5
   critics from the npc_archetypes; questions come from
   defense_question_templates. THE ACCURACY CONTRACT: the correct answer is
   always the literal entered paper data (answer_path into the papers row, or
   a hand-authored 'literal:' string). Distractors are systematic
   perturbations or hand-authored wrong options — never invented "facts"
   presented as real. Credibility 100→0; wrong answers −20..30; below the
   fail line ⇒ ejected, no reward, reputation penalty. All rewards DESIGN
   (game_config.defense_rewards). Pure + seedable: Node-testable. */
(function (root) {
  "use strict";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // resolve an answer_path against the papers row
  function resolve(path, paper) {
    if (path.startsWith("literal:")) return path.slice(8);
    let v = paper;
    for (const part of path.split(".")) {
      if (v == null) return null;
      v = v[part];
    }
    return v == null ? null : v;
  }

  const fmt = (v) => typeof v === "number" ? String(v) : String(v);

  function makeDistractors(t, answer, rnd) {
    const d = t.distractors || {};
    if (Array.isArray(d.options)) return d.options.map(String);
    const num = parseFloat(answer);
    const out = new Set();
    const push = (x) => { const s = fmt(x); if (s !== fmt(answer)) out.add(s); };
    if (d.strategy === "year_perturb") {
      while (out.size < 3) push(Math.round(num + (1 + Math.floor(rnd() * 4)) * (rnd() < 0.5 ? -1 : 1)));
    } else if (d.strategy === "pct_perturb") {
      while (out.size < 3) {
        const delta = 5 + Math.floor(rnd() * 16);
        push(Math.max(1, Math.min(99, Math.round(num + delta * (rnd() < 0.5 ? -1 : 1)))));
      }
    } else { // num_perturb: ±7–18%, plus a digit-swap flavor perturbation
      push(Math.round(num * (1 + (0.07 + rnd() * 0.11))));
      push(Math.round(num * (1 - (0.07 + rnd() * 0.11))));
      while (out.size < 3) push(Math.round(num + (2 + Math.floor(rnd() * 30)) * (rnd() < 0.5 ? -1 : 1)));
    }
    return [...out].slice(0, 3);
  }

  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // fill {dot.path} placeholders in template text from the paper (rarely used)
  const interpolate = (text, paper) => text.replace(/\{([\w.]+)\}/g, (_, p) => fmt(resolve(p, paper)));

  function create(opts) {
    const paper = opts.paper, config = opts.config || {};
    const gauge = config.credibility_gauge || { start: 100, fail_below: 30, wrong_answer_penalty: [20, 30] };
    const rewards = config.defense_rewards || { base_clout: 40, credibility_bonus_max: 20, repeat_mult: 0.25, eject_clout_penalty: 10 };
    const rnd = mulberry32(opts.seed == null ? 1 : opts.seed);
    const byId = {}; (opts.archetypes || []).forEach(a => byId[a.id] = a);

    // eligible templates: this paper's hand-authored ones + generic ones that resolve
    const eligible = (opts.templates || []).filter(t =>
      (t.paper_id === paper.id || t.paper_id == null) && resolve(t.answer_path, paper) != null);
    // one question per archetype, paper-specific templates first
    const pool = shuffle(eligible.filter(t => t.paper_id === paper.id), rnd)
      .concat(shuffle(eligible.filter(t => t.paper_id == null), rnd));
    const qMin = rewards.questions_min || 3, qMax = rewards.questions_max || 5;
    const want = Math.min(qMin + Math.floor(rnd() * (qMax - qMin + 1)), pool.length);
    const usedArch = new Set();
    const questions = [];
    for (const t of pool) {
      if (questions.length >= want) break;
      if (usedArch.has(t.archetype_id)) continue;
      const answer = fmt(resolve(t.answer_path, paper));
      const distractors = makeDistractors(t, answer, rnd);
      if (distractors.length < 3) continue;
      const options = shuffle([answer].concat(distractors), rnd);
      usedArch.add(t.archetype_id);
      questions.push({
        archetype: byId[t.archetype_id] || { id: t.archetype_id, name: t.archetype_id, description: "" },
        text: interpolate(t.template, paper),
        options,
        correctIdx: options.indexOf(answer),
      });
    }

    const st = { credibility: gauge.start, idx: 0, ejected: false, done: false, correct: 0 };

    function answer(optIdx) {
      if (st.done) throw new Error("defense finished");
      const q = questions[st.idx];
      const correct = optIdx === q.correctIdx;
      if (correct) st.correct++;
      else {
        const [lo, hi] = gauge.wrong_answer_penalty;
        st.credibility = Math.max(0, st.credibility - (lo + Math.floor(rnd() * (hi - lo + 1))));
      }
      if (st.credibility < gauge.fail_below) { st.ejected = true; st.done = true; }
      st.idx++;
      if (st.idx >= questions.length) st.done = true;
      return { correct, credibility: st.credibility, ejected: st.ejected, done: st.done,
               answerText: q.options[q.correctIdx] };
    }

    function verdict(priorDefenses) {
      const prior = priorDefenses || 0;
      if (st.ejected) return { ejected: true, credibility: st.credibility, correct: st.correct,
        total: questions.length, clout: -(rewards.eject_clout_penalty || 0) };
      const span = gauge.start - gauge.fail_below;
      const bonus = Math.round((rewards.credibility_bonus_max || 0) * (st.credibility - gauge.fail_below) / span);
      const clout = Math.round((rewards.base_clout + bonus) * Math.pow(rewards.repeat_mult, prior));
      return { ejected: false, credibility: st.credibility, correct: st.correct,
        total: questions.length, clout };
    }

    // green-room dossier: readable summary of the literal papers row
    function dossier() {
      const b = paper.baselines || {};
      const lines = [];
      if (paper.study_design) lines.push(["Design", paper.study_design]);
      if (paper.n_enrolled) lines.push(["Patients", String(paper.n_enrolled)]);
      if (b.n_ports) lines.push(["Implantations", String(b.n_ports)]);
      if (b.age_mean) lines.push(["Age", b.age_mean + " ± " + (b.age_sd || "?") + (b.age_range ? " (" + b.age_range[0] + "–" + b.age_range[1] + ")" : "")]);
      if (b.female_pct) lines.push(["Sex", b.female_pct + "% F / " + (b.male_pct || 100 - b.female_pct) + "% M"]);
      if (b.access && b.access.right_IJV_pct) lines.push(["Access", b.access.right_IJV_pct + "% right IJV"]);
      if (b.indication) lines.push(["Indication", b.indication]);
      if (b.underlying_disease_pct) {
        const top = Object.entries(b.underlying_disease_pct).sort((x, y) => y[1] - x[1]).slice(0, 3)
          .map(([k, v]) => k.replace(/_/g, " ") + " " + v + "%").join(", ");
        lines.push(["Top diagnoses", top]);
      }
      return { title: paper.title, journal: paper.journal, year: paper.pub_year,
        pmid: paper.pmid, lines, exclusions: paper.exclusion || [], notes: paper.notes || "" };
    }

    return { questions, answer, verdict, dossier, state: st, gauge };
  }

  const api = { create, resolve, mulberry32 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IRDefense = api;
})(typeof window !== "undefined" ? window : globalThis);
