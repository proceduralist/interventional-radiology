/* IR RPG — HTML overlay UI (layered over the Phaser canvas for text-heavy
   screens: auth, bedside EMR, angio console, debrief). Exposes window.IRUI. */
(function (root) {
  "use strict";
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function overlay() { let o = document.getElementById("ui-overlay"); if (!o) { o = el("div"); o.id = "ui-overlay"; document.body.appendChild(o); } return o; }
  function clear() { const o = overlay(); o.innerHTML = ""; o.style.display = "none"; }
  function show(node) { const o = overlay(); o.innerHTML = ""; o.appendChild(node); o.style.display = "flex"; }
  function toast(msg, ms) {
    const t = el("div", "toast", msg); document.body.appendChild(t);
    setTimeout(() => t.classList.add("in"), 10);
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, ms || 2200);
  }
  const flag = (f) => f ? '<span class="flag flag-' + (f === "H" ? "hi" : "lo") + '">' + f + '</span>' : "";

  // --- Auth ---------------------------------------------------------------
  const Auth = {
    show(opts) {
      const card = el("div", "card auth");
      card.appendChild(el("h1", "brand", "The Academic IR RPG"));
      card.appendChild(el("p", "sub", "Vertical slice — chest port placement. Sign in for cross-device saves (3 slots), or explore without saving."));
      const form = el("div", "form");
      const email = el("input"); email.type = "email"; email.placeholder = "email";
      const pass = el("input"); pass.type = "password"; pass.placeholder = "password (min 6 chars)";
      const name = el("input"); name.type = "text"; name.placeholder = "display name (for sign-up)";
      form.append(email, pass, name);
      const msg = el("div", "msg");
      const row = el("div", "btnrow");
      const bIn = el("button", "btn", "Sign in");
      const bUp = el("button", "btn primary", "Create account");
      const bGuest = el("button", "btn ghost", "Explore without saving");
      row.append(bUp, bIn, bGuest);
      const busy = (b) => { [bIn, bUp, bGuest].forEach(x => x.disabled = b); };
      bUp.onclick = async () => { busy(true); msg.textContent = "Creating account…"; try { await opts.onSignUp(email.value.trim(), pass.value, name.value.trim()); } catch (e) { msg.textContent = e.message || String(e); busy(false); } };
      bIn.onclick = async () => { busy(true); msg.textContent = "Signing in…"; try { await opts.onSignIn(email.value.trim(), pass.value); } catch (e) { msg.textContent = e.message || String(e); busy(false); } };
      bGuest.onclick = () => opts.onGuest();
      card.append(form, row, msg);
      const foot = el("div", "foot", 'All clinical numbers are live from the IR Casebook database. <span class="tag cited">CITED</span> literature · <span class="tag modeled">MODELED</span> simulation · <span class="tag design">DESIGN</span> game balance.');
      card.appendChild(foot);
      show(card);
    },
  };

  // --- Bedside EMR --------------------------------------------------------
  const EMR = {
    show(patient, procedure, opts) {
      const card = el("div", "card emr");
      card.appendChild(el("h2", null, "Inpatient Ward — Bedside EMR"));
      const p = patient;
      const hdr = el("div", "emr-hdr",
        "<strong>" + p.demographics.age + " y/o " + p.demographics.sex + "</strong> · " + p.demographics.weightKg + " kg · <em>" + p.indication + "</em>");
      card.appendChild(hdr);
      const grid = el("div", "emr-grid");
      grid.appendChild(el("div", "emr-box", "<h4>PMH</h4><ul><li>" + p.pmh.join("</li><li>") + "</li></ul>"));
      grid.appendChild(el("div", "emr-box", "<h4>Medications</h4><ul><li>" + p.meds.join("</li><li>") + "</li></ul>"));
      const L = p.labs;
      grid.appendChild(el("div", "emr-box", "<h4>Labs</h4>" +
        "<div class='lab'>Creatinine <b>" + L.creatinine.value + "</b> " + L.creatinine.unit + flag(L.creatinine.flag) + "</div>" +
        "<div class='lab'>eGFR <b>" + L.egfr.value + "</b> " + L.egfr.unit + flag(L.egfr.flag) + "</div>" +
        "<div class='lab'>Platelets <b>" + L.platelets.value + "</b> " + L.platelets.unit + flag(L.platelets.flag) + "</div>" +
        "<div class='lab'>INR <b>" + L.inr.value + "</b>" + flag(L.inr.flag) + "</div>" +
        "<div class='lab'>Hgb <b>" + L.hemoglobin.value + "</b> " + L.hemoglobin.unit + flag(L.hemoglobin.flag) + "</div>"));
      grid.appendChild(el("div", "emr-box", "<h4>Imaging</h4><p>" + p.imagingNote + "</p>" +
        "<h4>Contrast budget</h4><p>eGFR " + p.renal.egfr + " → <b>" + p.renal.riskTier.replace(/_/g, " ") + "</b>. Cigarroa V<sub>max</sub> <b>" + p.renal.contrastLimitMl + " mL</b>.</p>"));
      card.appendChild(grid);

      // guardrail banner
      const gr = el("div", "guardrails");
      if (!p.canProceed) {
        gr.classList.add("block");
        gr.innerHTML = "<strong>⛔ Cannot proceed as-is.</strong> " +
          p.violationsIfProceed.map(v => v.text + " <span class='cite'>" + v.cite + "</span>").join(" ");
      } else if (p.warnings.length) {
        gr.classList.add("warn");
        gr.innerHTML = "<strong>⚠ Review before proceeding:</strong><ul><li>" +
          p.warnings.map(w => w.text + " <span class='cite'>" + w.cite + "</span>").join("</li><li>") + "</li></ul>";
      } else {
        gr.classList.add("okr");
        gr.innerHTML = "<strong>✓ Labs within SIR periprocedural thresholds.</strong> Cleared for a low-bleeding-risk access procedure.";
      }
      card.appendChild(gr);

      const prov = el("div", "prov", "Patient sampled from generator: <em>" + patient.generatorName + "</em> · seed " + patient.seed + " · " + patient.dataClass);
      card.appendChild(prov);

      const row = el("div", "btnrow");
      const bProceed = el("button", "btn primary", "Scrub in →");
      const bReroll = el("button", "btn ghost", "Next patient");
      if (!p.canProceed) {
        bProceed.disabled = true;
        const bOrder = el("button", "btn", "Order platelet transfusion & recheck");
        bOrder.onclick = () => opts.onOrderCorrection();
        row.append(bOrder, bReroll);
      } else {
        row.append(bProceed, bReroll);
      }
      bProceed.onclick = () => opts.onProceed();
      bReroll.onclick = () => opts.onReroll();
      card.appendChild(row);
      show(card);
    },
  };

  // --- Angio console ------------------------------------------------------
  // --- tool sprite glyphs (vector fallback until assets/tools.json ships) ----
  const TOOLCOLOR = { needle: "#B4B2A9", micro_guidewire: "#85B7EB", guidewire: "#85B7EB", catheter: "#5DCAA5",
    sheath: "#AFA9EC", microcatheter: "#5DCAA5", balloon: "#F0997B", stent: "#EF9F27", stent_graft: "#EF9F27",
    coil: "#D3D1C7", plug: "#EF9F27", particle: "#97C459", liquid_embolic: "#ED93B1", closure: "#B4B2A9",
    drain: "#5DCAA5", filter: "#B4B2A9", port: "#AFA9EC", snare: "#5DCAA5", other: "#B4B2A9" };
  function toolGlyph(cls) {
    const c = TOOLCOLOR[cls] || "#B4B2A9";
    const s = 'width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linecap="round"';
    const G = {
      needle: '<line x1="20" y1="4" x2="8" y2="16"/><rect x="3" y="15" width="6" height="6" rx="1" fill="' + c + '" stroke="none"/>',
      micro_guidewire: '<path d="M3 14 q2.5 -6 5 0 t5 0 t5 0 t3 -2"/>', guidewire: '<path d="M3 14 q2.5 -6 5 0 t5 0 t5 0 t3 -2"/>',
      catheter: '<path d="M4 21 C4 9 20 15 20 3"/>', microcatheter: '<path d="M4 21 C9 8 15 17 20 4"/><circle cx="20" cy="4" r="1.6" fill="' + c + '" stroke="none"/>',
      sheath: '<rect x="6" y="9" width="14" height="6" rx="2"/><rect x="2" y="7" width="4" height="10" rx="1" fill="' + c + '" stroke="none"/>',
      balloon: '<line x1="2" y1="12" x2="22" y2="12"/><ellipse cx="12" cy="12" rx="5.5" ry="3.4"/>',
      stent: '<rect x="5" y="8" width="14" height="8" rx="1"/><path d="M5 12h14M9 8l6 8M15 8l-6 8" stroke-width="1"/>',
      stent_graft: '<rect x="5" y="8" width="14" height="8" rx="1"/><path d="M5 12h14" stroke-width="1"/>',
      coil: '<path d="M12 12 m-6 0 a6 6 0 1 1 6 6 a4 4 0 1 1 -4 -4 a2 2 0 1 1 2 2"/>',
      plug: '<path d="M6 6 L18 6 L12 19 Z"/><path d="M8 10h8M9 14h6" stroke-width="1"/>',
      particle: '<path d="M8 4h8v4l-2 3v7a2 2 0 0 1-4 0v-7L8 8z"/><circle cx="11" cy="16" r="1" fill="' + c + '" stroke="none"/>',
      liquid_embolic: '<path d="M12 3 C7 11 8 20 12 20 C16 20 17 11 12 3Z"/>', closure: '<circle cx="12" cy="9" r="4"/><path d="M12 13 v7 M9 20 h6"/>',
      drain: '<path d="M5 3 v9 a4 4 0 1 0 8 0 a2 2 0 1 0 -4 0"/>', filter: '<path d="M6 5 L18 5 L12 20 Z"/>',
      port: '<circle cx="9" cy="12" r="5"/><line x1="14" y1="12" x2="22" y2="12"/>', snare: '<circle cx="10" cy="9" r="5"/><line x1="13" y1="13" x2="21" y2="20"/>',
      contrast: '<rect x="8" y="4" width="6" height="13" rx="1"/><line x1="11" y1="4" x2="11" y2="1"/><line x1="11" y1="17" x2="11" y2="22"/>',
    };
    return '<svg ' + s + '>' + (G[cls] || '<circle cx="12" cy="12" r="7"/>') + '</svg>';
  }
  // Supply-cart grid (shared by the Angio Bag command + the overworld Bag).
  function cartGrid(inventory, devById, onPick, selectedId) {
    const owned = Object.keys(inventory || {}).filter(id => inventory[id]);
    const grid = el("div", "bcart");
    owned.forEach(id => {
      const d = devById[id] || { id, name: id, device_class: "other" };
      const cell = el("button", "bslot" + (selectedId === id ? " on" : ""));
      cell.title = d.name; cell.innerHTML = toolGlyph(d.device_class);
      if (onPick) cell.onclick = () => onPick(id, d);
      grid.appendChild(cell);
    });
    if (!owned.length) grid.appendChild(el("div", "bsub", "(cart empty — restock at procurement)"));
    return grid;
  }
  function battleSceneHTML() {
    return '<svg class="bsvg" viewBox="0 0 260 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<ellipse cx="150" cy="132" rx="96" ry="10" fill="#0c0f13"/>' +
      '<rect x="60" y="86" width="180" height="16" rx="4" fill="#5a6472"/><rect x="60" y="86" width="180" height="5" rx="2" fill="#727d8d"/>' +
      '<rect x="74" y="102" width="9" height="26" fill="#3d4550"/><rect x="217" y="102" width="9" height="26" fill="#3d4550"/>' +
      '<rect x="78" y="78" width="150" height="10" rx="5" fill="#c7cfdb"/><rect x="90" y="70" width="128" height="12" rx="6" fill="#9fb4d6"/>' +
      '<circle cx="92" cy="76" r="9" fill="#e8c9a8"/>' +
      '<path d="M40 40 A44 44 0 0 1 40 128" fill="none" stroke="#8b97a7" stroke-width="12"/>' +
      '<rect x="28" y="30" width="34" height="16" rx="3" fill="#6b7686"/><rect x="28" y="122" width="34" height="16" rx="3" fill="#6b7686"/>' +
      '<line x1="45" y1="46" x2="45" y2="70" stroke="#4b5462" stroke-width="3"/>' +
      '<rect x="170" y="16" width="40" height="26" rx="3" fill="#0a1418" stroke="#2b3038"/><path d="M176 40 l-14 22" stroke="#2b3038" stroke-width="3"/>' +
      '</svg>';
  }

  // --- Angio Suite: Pokémon-battle screen (patient+C-arm vs. the operator) ---
  const Angio = {
    start(engine, ctx, opts) {
      let selectedItem = null, imaging = null;
      const inv = ctx.inventory || {};
      const devById = {}; (ctx.devices || []).forEach(d => { devById[d.id] = d; });
      const taxonomy = (ctx.taxonomy && ctx.taxonomy.length) ? ctx.taxonomy
        : (ctx.config && ctx.config.action_taxonomy && ctx.config.action_taxonomy.categories) || [];

      const card = el("div", "card battle angioscreen");
      const scene = el("div", "bscene"); scene.innerHTML = battleSceneHTML();
      const statusBox = el("div", "bstatus");
      const caseBox = el("div", "bcase");
      scene.append(statusBox, caseBox);
      const lower = el("div", "blower");
      const narr = el("div", "bnarr");
      const menu = el("div", "bmenu");
      lower.append(narr, menu);
      card.append(el("h2", "bh", "Angio Suite — " + ctx.procedure.title), scene, lower);
      show(card);

      const stabilityPct = (sbp) => Math.max(0, Math.min(100, Math.round((sbp - 40) / 0.9)));
      function renderStatus() {
        const s = engine.state(), v = s.vitals, stab = stabilityPct(v.sbp);
        const col = stab > 60 ? "var(--ok)" : stab > 30 ? "var(--warn)" : "var(--danger)";
        const tag = v.sbp < 90 ? "unstable" : v.sbp < 100 ? "guarded" : "stable";
        statusBox.innerHTML =
          "<div class='bstat-h'><span>Patient</span><span style='color:" + col + "'>" + tag + "</span></div>" +
          "<div class='bbar'><i style='width:" + stab + "%;background:" + col + "'></i></div>" +
          "<div class='bvit'><span>SBP <b>" + Math.round(v.sbp) + "</b></span><span>HR <b>" + Math.round(v.hr) + "</b></span><span>SpO₂ <b>" + Math.round(v.spo2) + "</b></span><span>RR <b>" + Math.round(v.rr) + "</b></span></div>";
        const st = engine.currentStep(), dapRef = ctx.params.reference_dap_gycm2;
        caseBox.innerHTML =
          "<div class='bcase-h'>" + (st ? "Step " + st.n + " · " + st.title : "Wrapping up") + "</div>" +
          "<div class='bmeters'>fluoro <b>" + s.accum.fluoroMin.toFixed(1) + "</b> min · DAP <b>" + (s.accum.dapGycm2 || 0).toFixed(2) + "</b>" + (dapRef ? "/" + dapRef.toFixed(2) : "") + " · contrast <b>" + s.accum.contrastMl.toFixed(0) + "</b>/" + ctx.patient.renal.contrastLimitMl + " mL</div>";
      }
      function say(html, kind) { const l = el("div", "bline" + (kind ? " " + kind : ""), html); narr.appendChild(l); narr.scrollTop = narr.scrollHeight; }
      const scroller = () => el("div", "bscroll");
      const backBtn = (fn) => { const b = el("button", "btn ghost", "‹ Back"); b.onclick = fn; return b; };

      function armRow() {
        const r = el("div", "barm");
        const dn = selectedItem ? (devById[selectedItem] ? devById[selectedItem].name : selectedItem) : "—";
        r.innerHTML = "<span>Armed tool: <b>" + dn + "</b></span><span>Imaging: <b>" + (imaging || "—") + "</b></span>";
        return r;
      }
      function rootMenu() {
        menu.innerHTML = ""; menu.appendChild(armRow());
        const g = el("div", "bcmd");
        [["Actions", actionsMenu, true], ["Bag", bagMenu], ["Imaging", imagingMenu], ["Notes", notesMenu]].forEach(o => {
          const b = el("button", "btn" + (o[2] ? " primary" : ""), o[0]); b.onclick = o[1]; g.appendChild(b);
        });
        menu.appendChild(g);
      }
      function actionsMenu() {
        menu.innerHTML = ""; menu.appendChild(el("p", "bsub", "Pick the maneuver. Arm a tool (Bag) + imaging first if the step needs them."));
        const sc = scroller(), st = engine.currentStep();
        if (st && st.choices && st.choices.length) {
          sc.appendChild(el("div", "bcat-h", "◆ This step"));
          st.choices.forEach(c => {
            const b = el("button", "btn amove" + (c.locked ? " locked" : ""),
              c.label + (c.note ? "<small>" + c.note + "</small>" : "") + (c.locked ? "<small>🔒 not stocked: " + c.missing.join(", ") + "</small>" : ""));
            if (c.locked) b.disabled = true; else b.onclick = () => doAction(c.id);
            sc.appendChild(b);
          });
        }
        if (taxonomy.length) sc.appendChild(el("div", "bcat-h", "All maneuvers"));
        taxonomy.forEach(cat => { const h = el("button", "btn bcat", cat.name + " ›"); h.onclick = () => subMenu(cat); sc.appendChild(h); });
        menu.appendChild(sc); menu.appendChild(backBtn(rootMenu));
      }
      function subMenu(cat) {
        menu.innerHTML = ""; menu.appendChild(el("p", "bsub", cat.name));
        const sc = scroller();
        (cat.moves || []).forEach(m => { const b = el("button", "btn amove", m[1]); b.onclick = () => doAction(m[0]); sc.appendChild(b); });
        menu.appendChild(sc); menu.appendChild(backBtn(actionsMenu));
      }
      function doAction(actionId) {
        const r = engine.act(actionId, { item: selectedItem, imaging });
        if (r.error) { say("⛔ " + r.error, "bad"); return; }
        if (r.narrative) say(r.narrative);
        renderStatus();
        if (r.emergency) return renderEmergency(r.emergency);
        if (r.done) return finish();
        rootMenu();
      }
      function renderEmergency(em) {
        say("⚠ " + em.name + (em.note ? " (" + em.note + ")" : ""), "emerg");
        menu.innerHTML = ""; menu.appendChild(el("div", "bcat-h crit", "EMERGENCY — " + em.name));
        if (em.cite) menu.appendChild(el("p", "bsub", (em.note ? em.note + " · " : "") + em.cite));
        const sc = scroller();
        em.rescues.forEach(rr => {
          const b = el("button", "btn amove" + (rr.id === "none" ? " danger" : ""), rr.label);
          b.onclick = () => { const res = engine.resolveEmergency(rr.id); if (res.narrative) say(res.narrative, rr.id === "none" ? "emerg" : "good"); renderStatus(); if (res.done) return finish(); rootMenu(); };
          sc.appendChild(b);
        });
        menu.appendChild(sc);
      }
      function bagMenu() {
        menu.innerHTML = ""; menu.appendChild(el("p", "bsub", "Supply cart — click a tool to arm it, then use it via Actions."));
        menu.appendChild(cartGrid(inv, devById, (id, d) => { selectedItem = id; say("Armed <b>" + d.name + "</b>."); bagMenu(); }, selectedItem));
        menu.appendChild(backBtn(rootMenu));
      }
      function imagingMenu() {
        menu.innerHTML = ""; menu.appendChild(el("p", "bsub", "Arm imaging (ultrasound adds no dose; fluoro/DSA do)."));
        const sc = scroller();
        [["Ultrasound", "ultrasound"], ["Fluoroscopy", "fluoro"], ["DSA run", "dsa"], ["Roadmap", "roadmap"]].forEach(o => {
          const b = el("button", "btn amove" + (imaging === o[1] ? " on" : ""), o[0]);
          b.onclick = () => { imaging = o[1]; engine.setImaging(o[1]); say("Imaging armed: " + o[0] + "."); rootMenu(); };
          sc.appendChild(b);
        });
        menu.appendChild(sc); menu.appendChild(backBtn(rootMenu));
      }
      function notesMenu() {
        menu.innerHTML = ""; const st = engine.currentStep();
        menu.appendChild(el("p", "bsub", st ? ("Objective — " + st.prompt) : "Case objective."));
        if (st && st.teaching) menu.appendChild(el("div", "bteach", st.teaching));
        menu.appendChild(backBtn(rootMenu));
      }
      function finish() { opts.onFinish(engine.finish()); }

      renderStatus();
      say("Case start. Patient prepped, sterile field up.", "good");
      rootMenu();
    },
  };

  // --- Bag: read-only supply cart, openable in the overworld (Bag button / B) -
  const Bag = {
    show(p, opts) {
      const devById = {}; (p.devices || []).forEach(d => { devById[d.id] = d; });
      const card = el("div", "card battle bagcard");
      card.appendChild(el("h2", "bh", "🎒 Supply Cart"));
      card.appendChild(el("p", "bsub", "Everything you carry into a case. Buy more at Procurement; the angio Bag arms these mid-case."));
      const owned = Object.keys(p.inventory || {}).filter(id => p.inventory[id]);
      card.appendChild(el("div", "bsub", owned.length + " item" + (owned.length === 1 ? "" : "s") + " stocked"));
      card.appendChild(cartGrid(p.inventory, devById, (id, d) => opts.onInspect && opts.onInspect(id, d), null));
      const back = el("button", "btn ghost", "Close");
      const onKey = (e) => { if (e.key === "Escape" || e.key.toLowerCase() === "b") { e.stopPropagation(); e.preventDefault(); doClose(); } };
      const doClose = () => { document.removeEventListener("keydown", onKey); clear(); opts.onClose(); };
      back.onclick = doClose;
      card.appendChild(back);
      document.addEventListener("keydown", onKey);
      show(card);
    },
  };

  // --- Debrief ------------------------------------------------------------
  const Debrief = {
    show(score, ctx, opts) {
      const card = el("div", "card debrief");
      const grade = score.total >= 90 ? "A" : score.total >= 80 ? "B" : score.total >= 70 ? "C" : score.total >= 60 ? "D" : "F";
      card.appendChild(el("h2", null, "Post-op Debrief"));
      const ring = el("div", "score");
      ring.innerHTML = "<div class='big'>" + score.total + "</div><div class='grade grade-" + grade + "'>" + grade + "</div><div class='out'>/ 100</div>";
      card.appendChild(ring);
      const bars = el("div", "bars");
      const b = score.breakdown, m = score.max;
      [["Patient Safety", b.safety, m.safety], ["Radiation", b.radiation, m.radiation], ["Renal Protection", b.renal, m.renal], ["Technical Skill", b.technical, m.technical]].forEach(([label, v, mx]) => {
        const row = el("div", "bar");
        row.innerHTML = "<span class='bl'>" + label + "</span><span class='bt'><i style='width:" + Math.round(100 * v / mx) + "%'></i></span><span class='bv'>" + v + "/" + mx + "</span>";
        bars.appendChild(row);
      });
      card.appendChild(bars);

      const tel = score.telemetry;
      const dapStr = tel.referenceDapGycm2
        ? "DAP " + (tel.dapGycm2 || 0).toFixed(2) + " / " + tel.referenceDapGycm2.toFixed(2) + " Gy·cm² ref <span class='tag cited'>CITED</span>"
        : "DAP " + (tel.dapGycm2 || 0).toFixed(2) + " Gy·cm²";
      card.appendChild(el("div", "telemetry-sum",
        dapStr + " · Fluoro " + tel.fluoroMin.toFixed(1) + " min (sim) · Contrast " + tel.contrastMl.toFixed(0) +
        " / " + tel.contrastLimitMl + " mL · Lowest SBP " + Math.round(tel.lowestSbp)));

      const led = el("div", "ledger");
      led.appendChild(el("h4", null, "Scoring ledger (every deduction, tied to the log)"));
      const deducts = score.ledger.filter(l => l.delta < 0 || l.category === "event");
      if (!deducts.length) led.appendChild(el("div", "ll good", "Flawless — no deductions. Textbook port."));
      deducts.forEach(l => {
        const sign = l.delta ? (l.delta > 0 ? "+" : "") + l.delta : "";
        led.appendChild(el("div", "ll " + (l.category === "event" ? "emerg" : "bad"),
          "<b>" + (sign ? sign + " " : "") + "</b>" + l.reason + (l.cite ? " <span class='cite'>" + l.cite + "</span>" : "")));
      });
      card.appendChild(led);

      const econ = el("div", "econ");
      econ.innerHTML = "Payout: <b>" + opts.payout + " funds</b> (base " + ctx.params.base_payout + " × " + score.total + "% × clout " + opts.cloutMult + "×) · " +
        (opts.saved ? "Progress saved to slot " + opts.slot : "<em>not saved (guest)</em>");
      card.appendChild(econ);

      const row = el("div", "btnrow");
      const again = el("button", "btn primary", "Another case →");
      const hub = el("button", "btn ghost", "Back to hospital");
      again.onclick = () => opts.onAgain();
      hub.onclick = () => opts.onHub();
      row.append(again, hub);
      card.appendChild(row);
      show(card);
    },
  };

  // --- Procurement shop (P2) -----------------------------------------------
  // Prices/tiers are DESIGN; dimensions CITED-pending-IFU; scales MODELED.
  const Shop = {
    show(ctx, opts) {
      const E = root.IREcon, save = ctx.save, devices = ctx.devices.slice()
        .filter(d => d.status === "published")
        .sort((a, b) => (a.tier - b.tier) || (a.price_funds || 0) - (b.price_funds || 0));
      const card = el("div", "card shop");
      card.appendChild(el("h2", null, "Procurement — Supply Contracts"));
      card.appendChild(el("p", "sub", "Buying a device establishes a standing supply contract: it stays stocked for every case and sim-lab bench. Prices are <span class='tag design'>DESIGN</span> game balance, not clinical fact."));
      const funds = el("div", "shop-funds");
      const list = el("div", "shop-list");
      const render = () => {
        funds.innerHTML = "Hospital funds: <b>" + save.funds + "</b> · Clout tier: " + E.cloutTierName(ctx.config, save.clout);
        list.innerHTML = "";
        let tier = 0;
        devices.forEach(d => {
          if (d.tier !== tier) { tier = d.tier; list.appendChild(el("div", "shop-tier", E.TIER_LABEL[tier] || "Tier " + tier)); }
          const row = el("div", "shop-row" + (E.owns(save, d.id) ? " owned" : ""));
          const dims = [d.french_size ? d.french_size + "F" : null, d.length_cm ? d.length_cm + " cm" : null, d.coating, d.tip_shape].filter(Boolean).join(" · ");
          row.appendChild(el("div", "shop-info",
            "<b>" + d.name + "</b> <span class='tag design'>" + d.device_class + "</span>" +
            "<small>" + dims + (d.spec_source ? " <span class='cite'>" + d.spec_source + "</span>" : "") + "</small>" +
            (d.stiffness ? "<small class='scales'>stiffness " + d.stiffness + " · lubricity " + d.lubricity + " · track " + d.trackability + " · support " + d.support + " · vis " + d.visibility + " <span class='tag modeled'>MODELED</span></small>" : "")));
          const buyBox = el("div", "shop-buy");
          if (E.owns(save, d.id)) buyBox.appendChild(el("span", "owned-tag", "✓ stocked"));
          else {
            const b = el("button", "btn primary", d.price_funds + " funds");
            const chk = E.canBuy(save, d);
            if (!chk.ok) { b.disabled = true; if (chk.why === "funds") b.title = "Insufficient funds"; }
            b.onclick = () => {
              const r = E.buy(save, d);
              if (r.ok) { toast("Supply contract signed: " + d.name); if (opts.onPurchase) opts.onPurchase(d); render(); }
            };
            buyBox.appendChild(b);
          }
          row.appendChild(buyBox);
          list.appendChild(row);
        });
      };
      render();
      const row = el("div", "btnrow");
      const back = el("button", "btn ghost", "Back to the hub");
      back.onclick = () => opts.onClose();
      row.append(back);
      card.append(funds, list, row);
      show(card);
    },
  };

  // --- Sim Lab (P2, spec §9: Flow / Spec / Embolic benches) -----------------
  const SimLab = {
    show(ctx, opts) {
      const E = root.IREcon, M = root.IRAngio.M;
      const devices = ctx.devices.filter(d => d.status === "published");
      const owned = devices.filter(d => E.owns(ctx.save, d.id));
      const card = el("div", "card simlab");
      card.appendChild(el("h2", null, "Simulation Lab"));
      const tabs = el("div", "btnrow tabs");
      const body = el("div", "simlab-body");
      const mk = (label, fn) => { const b = el("button", "btn", label); b.onclick = () => { tabs.querySelectorAll(".btn").forEach(x => x.classList.remove("primary")); b.classList.add("primary"); fn(); }; return b; };

      // ---- Flow Bench ----
      const flow = () => {
        body.innerHTML = "";
        body.appendChild(el("p", "sub", "Test any stocked wire/catheter against a synthetic anatomy profile. Readouts use the <em>same</em> <span class='tag modeled'>MODELED</span> vessel-stress formula as the angio engine — bench practice transfers."));
        const testable = owned.filter(d => d.stiffness && d.lubricity);
        if (!testable.length) { body.appendChild(el("p", null, "No stocked wires/catheters to test. Visit procurement.")); return; }
        const profiles = (ctx.config.flow_bench_profiles || {}).profiles || [];
        const selD = el("select"), selP = el("select");
        testable.forEach(d => selD.appendChild(new Option(d.name, d.id)));
        profiles.forEach(p => selP.appendChild(new Option(p.name, p.id)));
        const out = el("div", "bench-out");
        const run = () => {
          const d = testable.find(x => x.id === selD.value), p = profiles.find(x => x.id === selP.value);
          if (!d || !p) return;
          const r = E.flowBench(d, p, M);
          out.innerHTML = "<table class='bench-table'><tr><th>Push force</th><th>Vessel stress</th><th>vs critical @" + r.rows[0].criticalThreshold + "</th><th>Tactile grade</th></tr>" +
            r.rows.map(x => "<tr class='g-" + x.grade.toLowerCase() + "'><td>" + x.force + "</td><td>" + x.stress + "</td><td>" +
              (x.grade === "CRITICAL" ? "exceeds" : "under") + "</td><td>" + x.grade +
              (x.perforationRollPct ? " — perforation roll " + x.perforationRollPct + "% <span class='tag modeled'>MODELED</span>" : "") + "</td></tr>").join("") +
            "</table><div class='prov'>stress = (stiffness " + d.stiffness + " × tortuosity " + p.tortuosity + " / lubricity " + d.lubricity + ") × force · support " + (r.support || "—") + " · trackability " + (r.trackability || "—") + " · all <span class='tag modeled'>MODELED</span> simulation parameters</div>";
        };
        selD.onchange = run; selP.onchange = run;
        const picker = el("div", "bench-pick"); picker.append(selD, selP);
        body.append(picker, out); run();
      };

      // ---- Spec Bench ----
      const spec = () => {
        body.innerHTML = "";
        body.appendChild(el("p", "sub", "Device specifications. Dimensions are <span class='tag cited'>CITED</span> when an IFU/source is attached; gameplay scales are <span class='tag modeled'>MODELED</span> with a stated basis."));
        const selD = el("select");
        devices.forEach(d => selD.appendChild(new Option(d.name + (E.owns(ctx.save, d.id) ? " ✓" : " (not stocked)"), d.id)));
        const out = el("div", "bench-out");
        const run = () => {
          const d = devices.find(x => x.id === selD.value); if (!d) return;
          out.innerHTML =
            "<div class='emr-box'><h4>" + d.name + "</h4>" +
            "<div class='lab'>Class <b>" + d.device_class + "</b></div>" +
            (d.french_size ? "<div class='lab'>French <b>" + d.french_size + "F</b></div>" : "") +
            (d.length_cm ? "<div class='lab'>Length <b>" + d.length_cm + " cm</b></div>" : "") +
            (d.coating ? "<div class='lab'>Coating <b>" + d.coating + "</b></div>" : "") +
            (d.tip_shape ? "<div class='lab'>Tip <b>" + d.tip_shape + "</b></div>" : "") +
            (d.material ? "<div class='lab'>Material <b>" + d.material + "</b></div>" : "") +
            "<p class='cite'>" + (d.spec_source || "no source attached") + "</p>" +
            (d.stiffness ? "<h4>Simulation parameters <span class='tag modeled'>MODELED</span></h4>" +
              "<div class='lab'>Stiffness <b>" + d.stiffness + "</b></div><div class='lab'>Lubricity <b>" + d.lubricity + "</b></div>" +
              "<div class='lab'>Trackability <b>" + d.trackability + "</b></div><div class='lab'>Support <b>" + d.support + "</b></div>" +
              "<div class='lab'>Visibility <b>" + d.visibility + "</b></div>" +
              "<p class='prov'>Basis: " + (d.modeled_basis || "—") + "</p>" : "") +
            "</div>";
        };
        selD.onchange = run;
        body.append(selD, out); run();
      };

      // ---- Embolic Playground ----
      const embolic = () => {
        body.innerHTML = "";
        const pd = ctx.config.packing_density || {};
        body.appendChild(el("p", "sub", "Coil packing-density sandbox — published volumetric formula <span class='tag cited'>CITED</span>: <span class='cite'>" + (ctx.configMeta && ctx.configMeta.packing_density_citation || "see codex") + "</span>"));
        const f = el("div", "bench-pick embolic-form");
        const mkNum = (ph, val) => { const i = el("input"); i.type = "number"; i.placeholder = ph; i.value = val; i.step = "0.1"; i.min = "0"; return i; };
        const dMm = mkNum("aneurysm ⌀ (mm)", 7);
        const coilD = mkNum("coil primary ⌀ (mm)", 0.25);
        const coilL = mkNum("coil length (cm)", 20);
        const nCoils = mkNum("# coils", 4); nCoils.step = "1";
        f.append(dMm, coilD, coilL, nCoils);
        const out = el("div", "bench-out");
        const run = () => {
          const coils = [];
          for (let i = 0; i < (+nCoils.value || 0); i++) coils.push({ primaryDiameterMm: +coilD.value || 0, lengthCm: +coilL.value || 0 });
          const r = root.IREcon.packingDensity({ dMm: +dMm.value || 0 }, coils);
          out.innerHTML = "<div class='pack-res'>Aneurysm volume <b>" + r.aneurysmVolumeMm3 + " mm³</b> · coil volume <b>" + r.coilVolumeMm3 + " mm³</b> · packing density <b class='big-pct'>" + r.packingPct + "%</b></div>" +
            "<div class='prov'>" + (pd.formula || "") + "</div>" +
            (pd.threshold_note ? "<div class='prov warn-note'>" + pd.threshold_note + "</div>" : "");
        };
        [dMm, coilD, coilL, nCoils].forEach(i => i.oninput = run);
        body.append(f, out); run();
        const po = ctx.config.particle_occlusion || {};
        const pbox = el("div", "emr-box particle-demo");
        pbox.innerHTML = "<h4>Particle size vs occlusion level <span class='tag modeled'>MODELED</span></h4>" +
          "<p class='sub'>" + (po.note || "") + "</p>" +
          "<table class='bench-table'>" + ((po.bands || []).map(b => "<tr><td>" + b.range_um + " µm</td><td>" + b.level + "</td></tr>").join("")) + "</table>";
        body.appendChild(pbox);
      };

      const tFlow = mk("Flow Bench", flow), tSpec = mk("Spec Bench", spec), tEmb = mk("Embolic Playground", embolic);
      const back = el("button", "btn ghost", "Back to the hub");
      back.onclick = () => opts.onClose();
      tabs.append(tFlow, tSpec, tEmb, back);
      card.append(tabs, body);
      show(card);
      tFlow.click();
    },
  };

  // --- Campus map (fast travel) --------------------------------------------
  // Clickable SVG rendered from the same IRWorld layout data the overworld uses.
  const CampusMap = {
    show(W, playerPos, opts) {
      const card = el("div", "card mapcard");
      card.appendChild(el("h2", null, "UMass Chan — University Campus"));
      card.appendChild(el("p", "sub", "Click a building to take the campus shuttle · [M] / [Esc] to close"));
      const wrap = el("div", "mapwrap");
      let s = '<svg viewBox="0 0 ' + W.COLS + ' ' + W.ROWS + '" xmlns="http://www.w3.org/2000/svg">';
      s += W.mapSvgInner(); // terrain + mask-accurate footprints from the site plan
      const px = playerPos.x / W.TILE, py = playerPos.y / W.TILE;
      s += '<circle class="youdot" cx="' + px + '" cy="' + py + '" r="1.1" fill="#ff5555" stroke="#fff" stroke-width="0.25"/>';
      s += '<text class="maplbl" x="' + px + '" y="' + (py + 3) + '" text-anchor="middle" font-size="1.8" fill="#ffb0b0">YOU</text>';
      s += "</svg>";
      wrap.innerHTML = s;
      const onKey = (e) => {
        if (e.key === "Escape" || e.key.toLowerCase() === "m") { e.stopPropagation(); e.preventDefault(); close(); }
      };
      const close = (travelId) => {
        document.removeEventListener("keydown", onKey);
        clear();
        if (travelId) opts.onTravel(travelId); else opts.onClose();
      };
      wrap.querySelectorAll("[data-b]").forEach(r => { r.addEventListener("click", () => close(r.getAttribute("data-b"))); });
      const btn = el("button", "btn ghost", "Close map");
      btn.onclick = () => close();
      card.append(wrap, btn);
      document.addEventListener("keydown", onKey);
      show(card);
    },
  };

  // --- Conference defense (P3) ----------------------------------------------
  // Green room (dossier = the literal papers row) → podium gauntlet → verdict.
  const Conference = {
    show(engine, meta, opts) {
      const card = el("div", "card conf");
      const render = (fn) => { card.innerHTML = ""; fn(); show(card); };

      const credBar = () => {
        const wrap = el("div", "credwrap");
        wrap.appendChild(el("span", "credlbl", "CREDIBILITY"));
        const bar = el("div", "credbar");
        const fill = el("div", "credfill");
        const pct = Math.max(0, engine.state.credibility);
        fill.style.width = pct + "%";
        fill.className = "credfill" + (pct < 50 ? " low" : "");
        bar.appendChild(fill);
        const num = el("span", "crednum", engine.state.credibility + "/" + engine.gauge.start);
        wrap.append(bar, num);
        return wrap;
      };

      const greenRoom = () => render(() => {
        const d = engine.dossier();
        card.appendChild(el("h2", null, "🎤 Green Room — dossier review"));
        card.appendChild(el("p", "sub", "You present the data behind your program's chest-port service. Everything on this card is the literal published record — it is also the answer key."));
        const box = el("div", "dossier");
        box.appendChild(el("h3", null, d.title));
        box.appendChild(el("p", "sub", d.journal + " (" + d.year + ") · PMID " + d.pmid + ' <span class="tag cited">CITED</span>'));
        const dl = el("div", "doslines");
        d.lines.forEach(([k, v]) => dl.appendChild(el("div", "dosline", "<b>" + k + ":</b> " + v)));
        box.appendChild(dl);
        if (d.exclusions.length) box.appendChild(el("div", "dosline", "<b>Exclusions:</b> " + d.exclusions.join(" · ")));
        card.appendChild(box);
        const row = el("div", "btnrow");
        const go = el("button", "btn primary", "Take the podium (" + engine.questions.length + " questions)");
        const back = el("button", "btn ghost", "Back out quietly");
        go.onclick = () => podium();
        back.onclick = () => opts.onClose();
        row.append(go, back);
        card.appendChild(row);
      });

      const podium = () => render(() => {
        const q = engine.questions[engine.state.idx];
        card.appendChild(el("h2", null, "🎤 Podium — question " + (engine.state.idx + 1) + " of " + engine.questions.length));
        card.appendChild(credBar());
        const critic = el("div", "critic");
        critic.appendChild(el("div", "critic-name", q.archetype.name));
        if (q.archetype.description) critic.appendChild(el("div", "critic-desc", q.archetype.description));
        card.appendChild(critic);
        card.appendChild(el("p", "confq", "“" + q.text + "”"));
        const optsBox = el("div", "confopts");
        q.options.forEach((o, i) => {
          const b = el("button", "btn opt", o);
          b.dataset.i = i;
          b.onclick = () => {
            const res = engine.answer(i);
            [...optsBox.children].forEach((x, xi) => {
              x.disabled = true;
              if (xi === q.correctIdx) x.classList.add("right");
              else if (xi === i) x.classList.add("wrong");
            });
            card.querySelector(".credfill").style.width = Math.max(0, res.credibility) + "%";
            card.querySelector(".crednum").textContent = res.credibility + "/" + engine.gauge.start;
            const msg = el("div", "confres " + (res.correct ? "okr" : "bad"),
              res.correct ? "✓ The literal entered data. The critic sits down." :
                "✗ The room murmurs. Correct answer: <b>" + res.answerText + "</b>");
            card.appendChild(msg);
            const next = el("button", "btn primary", res.done ? "Hear the verdict" : "Next question");
            next.onclick = () => res.done ? verdictView() : podium();
            card.appendChild(next);
          };
          optsBox.appendChild(b);
        });
        card.appendChild(optsBox);
      });

      const verdictView = () => render(() => {
        const v = engine.verdict(meta.prior || 0);
        card.appendChild(el("h2", null, v.ejected ? "🥀 Ejected from the podium" : "🏛 Verdict"));
        card.appendChild(credBar());
        const box = el("div", "dossier");
        box.appendChild(el("div", "dosline", "<b>Answers:</b> " + v.correct + " / " + v.total + " correct"));
        box.appendChild(el("div", "dosline", "<b>Academic Clout:</b> " + (v.clout >= 0 ? "+" : "") + v.clout +
          (meta.prior ? " <em>(repeat presentation ×" + (meta.prior + 1) + " — diminishing returns)</em>" : "")));
        if (meta.tierLine) box.appendChild(el("div", "dosline", "<b>Standing:</b> " + meta.tierLine(v)));
        if (v.ejected) box.appendChild(el("div", "dosline bad", "Moderator: “We'll… move to the next abstract.” No rewards; word gets around."));
        card.appendChild(box);
        const done = el("button", "btn primary", "Leave the stage");
        done.onclick = () => opts.onFinish(v);
        card.appendChild(done);
      });

      greenRoom();
    },
  };

  // --- Case picker (P4: every v_game_ready procedure is playable) -----------
  const CasePick = {
    show(cases, currentId, opts) {
      const card = el("div", "card casepick");
      card.appendChild(el("h2", null, "🛏 Tonight's list"));
      card.appendChild(el("p", "sub", "Every case here is live from the Casebook database — new procedures appear as they're published."));
      const col = el("div", "elevfloors");
      cases.forEach(c => {
        const stars = "★".repeat(c.complexity || 1) + "☆".repeat(Math.max(0, 5 - (c.complexity || 1)));
        const b = el("button", "btn", "<b>" + c.title + "</b><br><small>" + stars + " · " + (c.pacing || "") + " · " + (c.category_id || "") +
          (c.id === currentId ? " · <em>last worked up</em>" : "") + "</small>");
        b.onclick = () => opts.onPick(c.id);
        col.appendChild(b);
      });
      const back = el("button", "btn ghost", "Back to the ward");
      back.onclick = () => opts.onClose();
      card.append(col, back);
      show(card);
    },
  };

  // --- Call room: profile & achievements (spec §11) --------------------------
  const CallRoom = {
    show(p, opts) {
      const s = p.save || {};
      let tier = { name: "—", payout_mult: 1 };
      (p.tiers || []).forEach(t => { if ((s.clout || 0) >= t.min) tier = t; });
      const card = el("div", "card callroom");
      card.appendChild(el("h2", null, "🛌 Call Room"));
      card.appendChild(el("p", "sub", (p.guest ? "Guest resident (progress not saved)" : ((p.user && p.user.email) || "Resident")) + " · UMass Memorial IR"));
      const box = el("div", "dossier");
      const dl = el("div", "doslines");
      [["Funds", s.funds || 0], ["Academic Clout", (s.clout || 0) + " — " + tier.name],
       ["Payout multiplier", "×" + (tier.payout_mult || 1)], ["Cases completed", s.casesCompleted || 0],
       ["Best debrief", (s.bestScore || 0) + "/100"], ["Devices owned", Object.keys(s.inventory || {}).length],
       ["Podium defenses", Object.values(s.defenses || {}).reduce((a, b) => a + b, 0)],
       ["Playable procedures", (p.cases || []).length]]
        .forEach(([k, v]) => dl.appendChild(el("div", "dosline", "<b>" + k + ":</b> " + v)));
      box.appendChild(dl);
      card.appendChild(box);
      const ach = [
        ["🩺", "First Stick", "Complete a case", (s.casesCompleted || 0) >= 1],
        ["📈", "Case Series", "Complete 10 cases", (s.casesCompleted || 0) >= 10],
        ["💯", "Clean Debrief", "Score 100 on a case", (s.bestScore || 0) >= 100],
        ["🎤", "Podium Survivor", "Finish a conference defense", Object.keys(s.defenses || {}).length > 0],
        ["🔬", "Rising Researcher", "Reach 51 clout", (s.clout || 0) >= 51],
        ["🌟", "Key Opinion Leader", "Reach 151 clout", (s.clout || 0) >= 151],
        ["💰", "Matched", "Claim the KOL matching grant", !!s.grantClaimed],
        ["🧰", "Supply Closet Key", "Own 10 devices", Object.keys(s.inventory || {}).length >= 10],
      ];
      const grid = el("div", "achgrid");
      ach.forEach(([icon, name, desc, got]) => {
        grid.appendChild(el("div", "ach" + (got ? " got" : ""), "<span class='achico'>" + icon + "</span><b>" + name + "</b><small>" + desc + "</small>"));
      });
      card.appendChild(grid);
      const back = el("button", "btn ghost", "Back to work");
      back.onclick = () => opts.onClose();
      card.appendChild(back);
      show(card);
    },
  };

  // --- Staff lounge: attending's pearls (live from the procedure row) --------
  const Lounge = {
    show(procedure, opts) {
      const card = el("div", "card lounge");
      card.appendChild(el("h2", null, "☕ Staff Lounge"));
      card.appendChild(el("p", "sub", "The attending stirs a third sugar into burnt coffee and holds forth on <b>" + procedure.title + "</b>."));
      const pearls = (procedure.pearls || []).slice(0, 8);
      const box = el("div", "dossier");
      if (pearls.length) {
        pearls.forEach(t => box.appendChild(el("div", "dosline", "“" + t + "”")));
        box.appendChild(el("p", "sub", 'Straight from the Casebook — <span class="tag cited">the same pearls the website shows</span>.'));
      } else {
        box.appendChild(el("div", "dosline", "The attending is post-call and communicates only in espresso sips. (No pearls entered for this procedure yet.)"));
      }
      card.appendChild(box);
      const back = el("button", "btn ghost", "Back to the ward");
      back.onclick = () => opts.onClose();
      card.appendChild(back);
      show(card);
    },
  };

  // --- Hospital elevator ----------------------------------------------------
  const Elevator = {
    show(current, order, info, opts) {
      const card = el("div", "card elevcard");
      card.appendChild(el("h2", null, "🛗 Elevator"));
      card.appendChild(el("p", "sub", "Select a floor · [Esc] to stay"));
      const col = el("div", "elevfloors");
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } };
      const close = (picked) => {
        document.removeEventListener("keydown", onKey);
        clear();
        if (picked) opts.onPick(picked); else opts.onClose();
      };
      order.slice().reverse().forEach(f => {
        const here = f === current;
        const b = el("button", "btn" + (here ? " ghost" : ""), "<b>" + f + "</b> — " + info[f].title.replace(/^.*?— /, "") + (here ? " · you are here" : ""));
        b.disabled = here;
        b.onclick = () => close(f);
        col.appendChild(b);
      });
      const stay = el("button", "btn ghost", "Stay on this floor");
      stay.onclick = () => close();
      card.append(col, stay);
      document.addEventListener("keydown", onKey);
      show(card);
    },
  };

  root.IRUI = { overlay, clear, toast, Auth, EMR, Angio, Debrief, Shop, SimLab, CampusMap, Elevator, Conference, CasePick, CallRoom, Lounge, Bag };
})(window);
