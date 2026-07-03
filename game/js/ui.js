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
  const Angio = {
    start(engine, ctx, opts) {
      const card = el("div", "card angio");
      const top = el("div", "angio-top");
      const vit = el("div", "vitals");
      const tele = el("div", "tele");
      top.append(vit, tele);
      const stage = el("div", "angio-stage");
      const logBox = el("div", "log");
      const prompt = el("div", "prompt");
      stage.append(logBox, prompt);
      card.append(el("h2", null, "Angio Suite — " + ctx.procedure.title), top, stage);
      show(card);

      function renderVitals() {
        const s = engine.state(); const v = s.vitals;
        const cls = v.sbp < 90 ? "crit" : v.sbp < 100 ? "warn" : "ok";
        vit.innerHTML =
          "<div class='vrow " + cls + "'><span>SBP/DBP</span><b>" + Math.round(v.sbp) + "/" + Math.round(v.dbp) + "</b></div>" +
          "<div class='vrow'><span>HR</span><b>" + Math.round(v.hr) + "</b></div>" +
          "<div class='vrow'><span>SpO₂</span><b>" + Math.round(v.spo2) + "%</b></div>" +
          "<div class='vrow'><span>RR</span><b>" + Math.round(v.rr) + "</b></div>";
        const dapRef = ctx.params.reference_dap_gycm2;
        const dapCls = dapRef && s.accum.dapGycm2 > dapRef ? "warn" : "";
        tele.innerHTML =
          "<div class='vrow " + dapCls + "'><span>DAP</span><b>" + (s.accum.dapGycm2 || 0).toFixed(2) + "</b><small>Gy·cm² / " + (dapRef ? dapRef.toFixed(2) + " ref" : "—") + "</small></div>" +
          "<div class='vrow'><span>Fluoro</span><b>" + s.accum.fluoroMin.toFixed(1) + "</b><small>min (sim)</small></div>" +
          "<div class='vrow'><span>Contrast</span><b>" + s.accum.contrastMl.toFixed(0) + "</b><small>mL / " + ctx.patient.renal.contrastLimitMl + " lim</small></div>" +
          "<div class='vrow'><span>Step</span><b>" + Math.min(s.stepIndex + 1, s.total) + " / " + s.total + "</b></div>";
      }
      function pushLog(text, kind) { const line = el("div", "logline" + (kind ? " " + kind : ""), text); logBox.appendChild(line); logBox.scrollTop = logBox.scrollHeight; }

      function renderStep() {
        renderVitals();
        const st = engine.currentStep();
        prompt.innerHTML = "";
        if (!st) return finish();
        prompt.appendChild(el("div", "step-h", "Step " + st.n + " · " + st.title));
        prompt.appendChild(el("div", "teach", st.teaching || ""));
        prompt.appendChild(el("div", "ask", st.prompt));
        const btns = el("div", "choices");
        st.choices.forEach(c => {
          const b = el("button", "btn choice");
          b.innerHTML = c.label + (c.note ? "<small>" + c.note + "</small>" : "");
          if (c.locked) {
            b.disabled = true;
            b.innerHTML += "<small>🔒 not stocked: " + c.missing.join(", ") + " — visit procurement</small>";
          }
          b.onclick = () => {
            const r = engine.choose(c.id);
            if (r.narrative) pushLog(r.narrative);
            if (r.emergency) return renderEmergency(r.emergency);
            renderVitals();
            if (r.done) return finish();
            renderStep();
          };
          btns.appendChild(b);
        });
        prompt.appendChild(btns);
      }

      function renderEmergency(em) {
        renderVitals();
        pushLog("⚠ " + em.name + (em.note ? " (" + em.note + ")" : ""), "emerg");
        prompt.innerHTML = "";
        const box = el("div", "emergency");
        box.appendChild(el("div", "step-h crit", "EMERGENCY — " + em.name));
        box.appendChild(el("div", "teach", (em.cite ? "Incidence: " + (em.note || "") + " · " + em.cite : "")));
        box.appendChild(el("div", "ask", "Select a rescue action:"));
        const btns = el("div", "choices");
        em.rescues.forEach(r => {
          const b = el("button", "btn choice" + (r.id === "none" ? " danger" : ""), r.label);
          b.onclick = () => {
            const res = engine.resolveEmergency(r.id);
            if (res.narrative) pushLog(res.narrative, r.id === "none" ? "emerg" : "good");
            renderVitals();
            if (res.done) return finish();
            renderStep();
          };
          btns.appendChild(b);
        });
        box.appendChild(btns);
        prompt.appendChild(box);
      }

      function finish() { const score = engine.finish(); opts.onFinish(score); }
      pushLog("Case start. Patient prepped, sterile field up.", "good");
      renderStep();
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
      const onKey = (e) => { if (e.key === "Escape" || e.key.toLowerCase() === "m") close(); };
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

  // --- Hospital elevator ----------------------------------------------------
  const Elevator = {
    show(current, order, info, opts) {
      const card = el("div", "card elevcard");
      card.appendChild(el("h2", null, "🛗 Elevator"));
      card.appendChild(el("p", "sub", "Select a floor · [Esc] to stay"));
      const col = el("div", "elevfloors");
      const onKey = (e) => { if (e.key === "Escape") close(); };
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

  root.IRUI = { overlay, clear, toast, Auth, EMR, Angio, Debrief, Shop, SimLab, CampusMap, Elevator };
})(window);
