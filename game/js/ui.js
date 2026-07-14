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
  // Gameplay text NEVER shows article citations — [n] markers are stripped at
  // render time (the data keeps them for the dashboard/website). The ONLY place
  // citations appear in-game is the conference-defense dossier, where study
  // results are presented before the research minigame (Ryan 2026-07-10).
  const plain = (t) => String(t == null ? "" : t).replace(/\s*\[[0-9]+(?:\s*,\s*[0-9]+)*\]/g, "");

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
          p.violationsIfProceed.map(v => plain(v.text)).join(" ");
      } else if (p.warnings.length) {
        gr.classList.add("warn");
        gr.innerHTML = "<strong>⚠ Review before proceeding:</strong><ul><li>" +
          p.warnings.map(w => plain(w.text)).join("</li><li>") + "</li></ul>";
      } else {
        gr.classList.add("okr");
        gr.innerHTML = "<strong>✓ Labs within periprocedural thresholds.</strong> Cleared for a low-bleeding-risk access procedure.";
      }
      card.appendChild(gr);

      const row = el("div", "btnrow");
      const bReroll = el("button", "btn ghost", "Next patient");
      const bBag = el("button", "btn", "🎒 View bag");
      const bLeave = el("button", "btn ghost", "Leave — don't scrub in");
      bReroll.onclick = () => opts.onReroll();
      bBag.onclick = () => opts.onViewBag && opts.onViewBag();
      bLeave.onclick = () => opts.onCancel && opts.onCancel();
      if (!p.canProceed) {
        const bOrder = el("button", "btn", "Order platelet transfusion & recheck");
        bOrder.onclick = () => opts.onOrderCorrection();
        row.append(bOrder, bReroll, bBag, bLeave);
      } else {
        const bProceed = el("button", "btn primary", "Scrub in →");
        bProceed.onclick = () => opts.onProceed();
        row.append(bProceed, bReroll, bBag, bLeave);
      }
      card.appendChild(row);
      show(card);
    },
  };

  // --- Bedside preop consult (ward NPCs) ------------------------------------
  // Spec: Come Back Later / Perform Procedure / Recommend against / Order Lab Work.
  // p = generated+overridden patient; ev = IRWard.evalPreop result; rec = bed record.
  const Preop = {
    show(p, procedure, ev, rec, opts) {
      const card = el("div", "card emr preop");
      const catalog = ((opts.config || {}).lab_catalog || {}).labs || [];
      const labLine = (name, slot, unit) => {
        if (!slot || slot.missing || slot.value == null)
          return "<div class='lab'>" + name + " <b class='miss'>— not on file</b></div>";
        return "<div class='lab'>" + name + " <b>" + slot.value + "</b> " + (unit || "") + flag(slot.flag) + "</div>";
      };

      const main = () => {
        card.innerHTML = "";
        card.appendChild(el("h2", null, "Inpatient Ward — Bed " + (opts.bedNo || "") + " · Bedside Consult"));
        card.appendChild(el("div", "emr-hdr",
          "<strong>" + p.demographics.age + " y/o " + p.demographics.sex + "</strong> · " + p.demographics.weightKg +
          " kg · <em>" + p.indication + "</em><br>Consult request: <b>" + procedure.title + "</b>"));
        const grid = el("div", "emr-grid");
        grid.appendChild(el("div", "emr-box", "<h4>PMH</h4><ul><li>" + p.pmh.join("</li><li>") + "</li></ul>"));
        grid.appendChild(el("div", "emr-box", "<h4>Medications</h4><ul><li>" + p.meds.join("</li><li>") + "</li></ul>"));
        const L = p.labs;
        grid.appendChild(el("div", "emr-box", "<h4>Labs</h4>" +
          labLine("Creatinine", L.creatinine, "mg/dL") + labLine("eGFR", L.egfr, "") +
          labLine("Platelets", L.platelets, "×10⁹/L") + labLine("INR", L.inr, "") +
          (L.ptt ? labLine("PTT", L.ptt, "s") : "") + labLine("Hgb", L.hemoglobin, "g/dL")));
        // NO interpretive banners anywhere on this card (design rule: the chart
        // shows raw data — H/L flags, notes, results — and the player has to
        // notice what's unsafe themselves; consequences surface at the debrief).
        // The nursing note is ALWAYS present so its mere existence signals nothing.
        grid.appendChild(el("div", "emr-box", "<h4>Nursing note (overnight)</h4><p>" +
          (p.contraNote || "Uneventful night. Tolerating PO intake; ambulating with assistance. IV site clean.") + "</p>"));
        grid.appendChild(el("div", "emr-box", "<h4>Imaging</h4><p>" + p.imagingNote + "</p>" +
          "<h4>Contrast budget</h4><p>eGFR " + p.renal.egfr + " → <b>" + p.renal.riskTier.replace(/_/g, " ") + "</b>. Cigarroa V<sub>max</sub> <b>" + p.renal.contrastLimitMl + " mL</b>.</p>"));
        card.appendChild(grid);

        if ((opts.resolvedNotes || []).length)
          card.appendChild(el("div", "guardrails okr", "<strong>🧪 Lab results back:</strong><ul><li>" +
            opts.resolvedNotes.map(r => r.name + " — " + r.note).join("</li><li>") + "</li></ul>"));

        if ((rec.pending || []).length) {
          const names = rec.pending.map(id => { const c = catalog.find(x => x.id === id); return c ? c.name : id; });
          card.appendChild(el("div", "guardrails warn", "<strong>⏳ Labs pending:</strong> " + names.join(", ") + " — results will be on the chart at your next visit."));
        }

        const row = el("div", "btnrow");
        const bGo = el("button", "btn primary", "Perform procedure →");
        const bLabs = el("button", "btn", "🧪 Order lab work");
        const bNo = el("button", "btn", "Recommend against procedure");
        const bLater = el("button", "btn ghost", "Come back later");
        bGo.onclick = () => opts.onPerform();   // no confirm, no warning — their call
        bLabs.onclick = () => labMenu();
        bNo.onclick = () => confirmTurnDown();
        bLater.onclick = () => opts.onLater();
        row.append(bGo, bLabs, bNo, bLater);
        card.appendChild(row);
        show(card);
      };

      const labMenu = () => {
        card.innerHTML = "";
        card.appendChild(el("h2", null, "🧪 Order Lab Work"));
        card.appendChild(el("p", "sub", "Ordered labs result on your NEXT visit to the bedside. Out-of-range values are corrected by the primary team (held anticoagulation, transfusion, etc.)."));
        const col = el("div", "elevfloors");
        catalog.forEach(c => {
          const pending = rec.pending.indexOf(c.id) >= 0;
          const slot = p.labs[c.id];
          const cur = !slot || slot.missing || slot.value == null ? "not on file" : "current " + slot.value + (c.unit ? " " + c.unit : "");
          const b = el("button", "btn" + (pending ? " ghost" : ""),
            "<b>" + c.name + "</b><br><small>" + (pending ? "⏳ pending — results next visit" : cur +
              (c.normal ? " · ref " + c.normal[0] + "–" + c.normal[1] : "")) + "</small>");
          b.disabled = pending;
          b.onclick = () => { opts.onOrderLab(c.id); labMenu(); };
          col.appendChild(b);
        });
        const back = el("button", "btn ghost", "‹ Back to the bedside");
        back.onclick = () => main();
        card.append(col, back);
        show(card);
      };

      const confirmTurnDown = () => {
        card.innerHTML = "";
        card.appendChild(el("h2", null, "Recommend against the procedure?"));
        card.appendChild(el("p", "sub", "Declining is correct only when the clinical picture cannot be fixed (an absolute contraindication). Turning away an operable — or optimizable — case costs clout."));
        const row = el("div", "btnrow");
        const go = el("button", "btn danger", "Recommend against — discharge from the IR list");
        const back = el("button", "btn ghost", "‹ Back");
        go.onclick = () => opts.onTurnDown();
        back.onclick = () => main();
        row.append(go, back);
        card.appendChild(row);
        show(card);
      };

      main();
    },
  };

  // --- Procedure location choice (spec: IR Suite / CT Suite / US Room / Bedside)
  const LocationPick = {
    show(procedure, rooms, opts) {
      const card = el("div", "card casepick");
      card.appendChild(el("h2", null, "Where do you perform it?"));
      card.appendChild(el("p", "sub", "Book a venue for <b>" + procedure.title + "</b>."));
      const col = el("div", "elevfloors");
      const OPTS = [
        ["ir_suite", "IR Suite", "Fluoroscopy + full sterile setup, 3rd floor"],
        ["ct_suite", "CT Suite", "CT guidance, 4th floor"],
        ["us_room", "Ultrasound Room", "Dedicated US room, 5th floor"],
        ["bedside", "Bedside", "Do it here in the ward bed"],
      ];
      OPTS.forEach(([id, name, desc]) => {
        const occupied = id !== "bedside" && rooms && rooms[id];
        const b = el("button", "btn", "<b>" + name + "</b><br><small>" + desc + (occupied ? " · 🛏 a patient is already waiting there" : "") + "</small>");
        b.onclick = () => {
          if (occupied) { toast("You have a patient waiting for you in the " + name + "!"); return; }
          opts.onPick(id);
        };
        col.appendChild(b);
      });
      const back = el("button", "btn ghost", "‹ Back to the bedside");
      back.onclick = () => opts.onBack();
      card.append(col, back);
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
  // Battle backdrop per procedure location (spec: room-specific backgrounds).
  // Shared: table + draped patient. Surroundings vary by location.
  function battleSceneHTML(location) {
    const table =
      '<ellipse cx="150" cy="132" rx="96" ry="10" fill="#0c0f13"/>' +
      '<rect x="60" y="86" width="180" height="16" rx="4" fill="#5a6472"/><rect x="60" y="86" width="180" height="5" rx="2" fill="#727d8d"/>' +
      '<rect x="74" y="102" width="9" height="26" fill="#3d4550"/><rect x="217" y="102" width="9" height="26" fill="#3d4550"/>' +
      '<rect x="78" y="78" width="150" height="10" rx="5" fill="#c7cfdb"/><rect x="90" y="70" width="128" height="12" rx="6" fill="#9fb4d6"/>' +
      '<circle cx="92" cy="76" r="9" fill="#e8c9a8"/>';
    let env = "";
    if (location === "ct_suite") {
      env = '<circle cx="205" cy="86" r="52" fill="#d8dce2"/><circle cx="205" cy="86" r="38" fill="#14171d"/>' +
            '<circle cx="205" cy="86" r="33" fill="#232b36"/><rect x="188" y="30" width="34" height="6" rx="2" fill="#69d2e7"/>' +
            '<rect x="16" y="20" width="44" height="28" rx="3" fill="#0a1418" stroke="#2b3038"/><path d="M22 48 l-6 20" stroke="#2b3038" stroke-width="3"/>';
    } else if (location === "us_room") {
      env = '<rect x="22" y="34" width="40" height="30" rx="3" fill="#0a1418" stroke="#2b3038"/>' +
            '<path d="M42 62 l0 40" stroke="#4b5462" stroke-width="4"/><rect x="28" y="98" width="30" height="8" rx="2" fill="#3d4550"/>' +
            '<path d="M42 40 L32 58 L52 58 Z" fill="#9fd8e8"/>' +
            '<path d="M62 50 q14 8 20 26" stroke="#8b97a7" stroke-width="2.5" fill="none"/><rect x="80" y="72" width="7" height="12" rx="2" fill="#c7cfdb"/>' +
            '<rect x="200" y="16" width="44" height="10" rx="2" fill="#39404d"/>';
    } else if (location === "bedside") {
      env = '<rect x="20" y="12" width="220" height="10" rx="2" fill="#39404d"/>' +          // headwall rail
            '<rect x="30" y="26" width="34" height="26" rx="2" fill="#1b2a38" stroke="#2b3038"/>' + // window (night shift)
            '<circle cx="40" cy="34" r="2.5" fill="#e8e2b0"/><circle cx="52" cy="42" r="1.5" fill="#e8e2b0"/>' +
            '<path d="M226 34 l0 66" stroke="#8b97a7" stroke-width="3"/><path d="M218 36 h16" stroke="#8b97a7" stroke-width="3"/>' + // IV pole
            '<path d="M221 40 q-2 10 2 16" stroke="#9fc4e0" stroke-width="2" fill="none"/><rect x="216" y="38" width="8" height="14" rx="2" fill="#cfe4f2"/>' +
            '<rect x="180" y="20" width="36" height="24" rx="3" fill="#0a1418" stroke="#2b3038"/>' +
            '<polyline points="184,32 190,32 193,26 196,38 199,32 212,32" fill="none" stroke="#5dcaa5" stroke-width="1.6"/>' +
            '<rect x="60" y="86" width="14" height="30" fill="#4a8a8c"/><rect x="226" y="86" width="14" height="30" fill="#4a8a8c"/>'; // bed rails
    } else { // ir_suite (default)
      env = '<path d="M40 40 A44 44 0 0 1 40 128" fill="none" stroke="#8b97a7" stroke-width="12"/>' +
            '<rect x="28" y="30" width="34" height="16" rx="3" fill="#6b7686"/><rect x="28" y="122" width="34" height="16" rx="3" fill="#6b7686"/>' +
            '<line x1="45" y1="46" x2="45" y2="70" stroke="#4b5462" stroke-width="3"/>' +
            '<rect x="170" y="16" width="40" height="26" rx="3" fill="#0a1418" stroke="#2b3038"/><path d="M176 40 l-14 22" stroke="#2b3038" stroke-width="3"/>';
    }
    return '<svg class="bsvg" viewBox="0 0 260 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + table + env + '</svg>';
  }
  // Attending sprite (pokes in from the door; spec: escalating interruptions).
  function attendingSVG(cross) {
    return '<svg viewBox="0 0 40 56" width="40" height="56" aria-hidden="true">' +
      '<rect x="0" y="0" width="10" height="56" fill="#20262e"/>' +               // door edge
      '<circle cx="24" cy="14" r="9" fill="#e8c9a8"/>' +
      '<path d="M15 10 q9 -8 18 0 l0 -3 q-9 -7 -18 0 Z" fill="#aab2bc"/>' +       // gray hair
      '<rect x="14" y="24" width="20" height="22" rx="4" fill="#e8eaee"/>' +      // white coat
      '<rect x="22" y="24" width="4" height="14" fill="#4a5262"/>' +
      (cross ? '<path d="M18 10 l4 3 M22 10 l-4 3 M27 10 l4 3 M31 10 l-4 3" stroke="#7a3030" stroke-width="1.6" fill="none"/>'
             : '<circle cx="21" cy="13" r="1.4" fill="#2b303c"/><circle cx="28" cy="13" r="1.4" fill="#2b303c"/>') +
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

      const location = ctx.location || "ir_suite";
      const LOC_NAME = { ir_suite: "IR Suite", ct_suite: "CT Suite", us_room: "Ultrasound Room", bedside: "Bedside" };
      const card = el("div", "card battle angioscreen");
      const scene = el("div", "bscene"); scene.innerHTML = battleSceneHTML(location);
      const statusBox = el("div", "bstatus");   // top-right: vitals + stability (spec)
      const caseBox = el("div", "bcase");       // bottom-left: fluoro / DAP / contrast hub (spec)
      const equipBox = el("div", "bequip");     // top-left: equipped item (spec)
      scene.append(statusBox, caseBox, equipBox);
      const lower = el("div", "blower");
      const narr = el("div", "bnarr");          // console of actions (spec)
      const menu = el("div", "bmenu");          // bottom-right commands (spec)
      lower.append(narr, menu);
      card.append(el("h2", "bh", LOC_NAME[location] + " — " + ctx.procedure.title), scene, lower);
      show(card);

      // --- attending pop-in (hints + blocked-step escalation) ---
      let attnTimer = null;
      function showAttending(text, opts2) {
        const old = scene.querySelector(".attn"); if (old) old.remove();
        if (attnTimer) clearTimeout(attnTimer);
        const a = el("div", "attn" + ((opts2 && opts2.mad) ? " mad" : ""));
        a.innerHTML = attendingSVG(opts2 && opts2.mad) + "<div class='attn-bubble'>" + plain(text) + "</div>";
        scene.appendChild(a);
        if (!(opts2 && opts2.stay)) attnTimer = setTimeout(() => a.remove(), 4200);
      }

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
          (st && st.prompt ? "<div class='bobj'>" + st.prompt + "</div>" : "") +
          "<div class='bmeters'>fluoro <b>" + s.accum.fluoroMin.toFixed(1) + "</b> min · DAP <b>" + (s.accum.dapGycm2 || 0).toFixed(2) + "</b>" + (dapRef ? "/" + dapRef.toFixed(2) : "") + " · contrast <b>" + s.accum.contrastMl.toFixed(0) + "</b>/" + ctx.patient.renal.contrastLimitMl + " mL</div>";
        const dn = selectedItem ? (devById[selectedItem] ? devById[selectedItem].name : selectedItem) : "—";
        equipBox.innerHTML = "<div>🔧 <b>" + dn + "</b></div>" +
          (s.hints ? "<div class='bhint-ct'>💬 hints " + s.hints + "/5</div>" : "");
      }
      function say(html, kind) { const l = el("div", "bline" + (kind ? " " + kind : ""), plain(html)); narr.appendChild(l); narr.scrollTop = narr.scrollHeight; }
      const scroller = () => el("div", "bscroll");
      const backBtn = (fn) => { const b = el("button", "btn ghost", "‹ Back"); b.onclick = fn; return b; };

      // Spec: exactly (1) Actions (2) Bag (3) Ask For Help (4) Leave Procedure.
      // Imaging is NOT a separate command — imaging maneuvers live inside the
      // Actions taxonomy (Imaging category) like every other move.
      function rootMenu() {
        menu.innerHTML = "";
        const g = el("div", "bcmd");
        [["Actions", actionsMenu, "primary"], ["Bag", bagMenu],
         ["Ask For Help", askHelp, "help"], ["Leave Procedure", leaveMenu, "danger ghostd"]].forEach(o => {
          const b = el("button", "btn " + (o[2] || ""), o[0]); b.onclick = o[1]; g.appendChild(b);
        });
        menu.appendChild(g);
      }
      // Ask For Help: attending pops in with a hint. >5 → kicked out, no points (spec).
      function askHelp() {
        const h = engine.hint();
        renderStatus();
        if (h.kicked) {
          showAttending(h.line, { mad: true, stay: true });
          say("👨‍⚕️ " + h.line, "emerg");
          say("You are asked to leave the room. Case over.", "bad");
          finish();
          return;
        }
        const txt = "Hint " + h.n + "/" + h.cap + ": " + h.text + (h.best ? "<br><em>Try: " + h.best + "</em>" : "");
        showAttending(txt, { stay: false });
        say("👨‍⚕️ <em>" + txt + "</em>", "help");
        rootMenu();
      }
      // Leave Procedure: bail at any time — fail + clout loss (spec).
      function leaveMenu() {
        menu.innerHTML = "";
        menu.appendChild(el("p", "bsub", "Leave now and the case fails: no payout, lost clout, and the patient goes back to the ward list."));
        const sc = scroller();
        const yes = el("button", "btn amove danger", "Leave the procedure — accept the failure");
        yes.onclick = () => { engine.leave(); say("You break scrub and walk out.", "bad"); finish(); };
        sc.appendChild(yes);
        menu.appendChild(sc); menu.appendChild(backBtn(rootMenu));
      }
      // ONLY the nested taxonomy — no per-step answer buttons (the player must
      // figure out the next maneuver; Ask For Help costs a hint if they can't).
      function actionsMenu() {
        menu.innerHTML = ""; menu.appendChild(el("p", "bsub", "Find the right maneuver — category, then move."));
        const sc = scroller();
        taxonomy.forEach(cat => { const h = el("button", "btn bcat", cat.name + " ›"); h.onclick = () => subMenu(cat); sc.appendChild(h); });
        if (!taxonomy.length) sc.appendChild(el("div", "bsub", "(no action taxonomy configured)"));
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
        // Physically impossible right now → the attending interrupts (no advance).
        if (r.blocked) {
          showAttending(r.line, { mad: r.strike >= 3, stay: !!r.final });
          say("👨‍⚕️ " + r.line + " <small>(strike " + r.strike + "/5)</small>", r.final ? "emerg" : "help");
          renderStatus();
          if (r.final) { say("The attending scrubs in and takes over. Case over.", "bad"); finish(); return; }
          rootMenu(); return;
        }
        if (r.narrative) say(r.narrative);
        renderStatus();
        if (r.emergency) return renderEmergency(r.emergency);
        if (r.done) return finish();
        rootMenu();
      }
      function renderEmergency(em) {
        say("⚠ " + em.name + (em.note ? " (" + plain(em.note) + ")" : ""), "emerg");
        menu.innerHTML = ""; menu.appendChild(el("div", "bcat-h crit", "EMERGENCY — " + em.name));
        if (em.note) menu.appendChild(el("p", "bsub", plain(em.note))); // no citations in-game
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
        menu.appendChild(cartGrid(inv, devById, (id, d) => { selectedItem = id; engine.selectItem(id); say("Armed <b>" + d.name + "</b>."); renderStatus(); bagMenu(); }, selectedItem));
        menu.appendChild(backBtn(rootMenu));
      }
      function finish() { opts.onFinish(engine.finish()); }

      renderStatus();
      // No warnings about preop violations or venue here — the player has to
      // notice problems themselves; consequences appear in the debrief ledger.
      say("Case start — " + LOC_NAME[location] + ". " + (location === "bedside" ? "You gown up at the bedside." : "The patient is on the table."), "good");
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
      const grade = score.failed ? "F" : score.total >= 90 ? "A" : score.total >= 80 ? "B" : score.total >= 70 ? "C" : score.total >= 60 ? "D" : "F";
      card.appendChild(el("h2", null, score.failed ? "Case Failed" : "Post-op Debrief"));
      if (score.failed) card.appendChild(el("div", "guardrails block", "<strong>" +
        (score.failed === "takeover" ? "👨‍⚕️ Attending takeover." : score.failed === "kicked" ? "📚 Sent out to read." : "🚪 You left the case.") +
        "</strong> " + (score.failNote || "") + (opts.cloutDelta ? " <b>Clout " + opts.cloutDelta + ".</b>" : "")));
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
        ? "DAP " + (tel.dapGycm2 || 0).toFixed(2) + " / " + tel.referenceDapGycm2.toFixed(2) + " Gy·cm² ref"
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
        // no citation spans in the debrief — the reason stands on its own
        led.appendChild(el("div", "ll " + (l.category === "event" ? "emerg" : "bad"),
          "<b>" + (sign ? sign + " " : "") + "</b>" + plain(l.reason)));
      });
      card.appendChild(led);

      if ((score.postopNotes || []).length) {
        const po = el("div", "ledger");
        po.appendChild(el("h4", null, "Post-op course"));
        score.postopNotes.forEach(n => po.appendChild(el("div", "ll emerg", "🏥 " + plain(n))));
        card.appendChild(po);
      }

      const econ = el("div", "econ");
      econ.innerHTML = (score.failed
          ? "Payout: <b>0 funds</b> (failed case)"
          : "Payout: <b>" + opts.payout + " funds</b> (base " + ctx.params.base_payout + " × " + score.total + "% × clout " + opts.cloutMult + "×)") +
        (opts.xpLine ? " · " + opts.xpLine : "") + " · " +
        (opts.saved ? "Progress saved to slot " + opts.slot : "<em>not saved (guest)</em>");
      card.appendChild(econ);

      const row = el("div", "btnrow");
      if (opts.onAgain) {
        const again = el("button", "btn primary", "Another case →");
        again.onclick = () => opts.onAgain();
        row.append(again);
      }
      const hub = el("button", "btn" + (opts.onAgain ? " ghost" : " primary"), "Back to the ward");
      hub.onclick = () => opts.onHub();
      row.append(hub);
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
            "<small>" + dims + "</small>" + // no source citations in-game
            (d.stiffness ? "<small class='scales'>stiffness " + d.stiffness + " · lubricity " + d.lubricity + " · track " + d.trackability + " · support " + d.support + " · vis " + d.visibility + "</small>" : "")));
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
        body.appendChild(el("p", "sub", "Device specifications and bench simulation parameters."));
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
            // spec_source / modeled_basis stay in the data for the dashboard — not shown in-game
            (d.stiffness ? "<h4>Simulation parameters</h4>" +
              "<div class='lab'>Stiffness <b>" + d.stiffness + "</b></div><div class='lab'>Lubricity <b>" + d.lubricity + "</b></div>" +
              "<div class='lab'>Trackability <b>" + d.trackability + "</b></div><div class='lab'>Support <b>" + d.support + "</b></div>" +
              "<div class='lab'>Visibility <b>" + d.visibility + "</b></div>" : "") +
            "</div>";
        };
        selD.onchange = run;
        body.append(selD, out); run();
      };

      // ---- Embolic Playground ----
      const embolic = () => {
        body.innerHTML = "";
        const pd = ctx.config.packing_density || {};
        body.appendChild(el("p", "sub", "Coil packing-density sandbox — volumetric packing calculator."));
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
        pbox.innerHTML = "<h4>Particle size vs occlusion level</h4>" +
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
      [["Level", p.level ? "Lv " + p.level.level + " — " + p.level.title + " (XP " + (s.xp || 0) + (p.level.next ? "/" + p.level.next.xp : "") + ")" : "Lv 1"],
       ["Funds", s.funds || 0], ["Academic Clout", (s.clout || 0) + " — " + tier.name],
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

  // --- Character creator --------------------------------------------------
  // First-play look builder (also the floor-6 wardrobe mirror). Mockup layout:
  // option controls on the left; live body + portrait preview and Start on the
  // right. Renders with the SAME appearance ops the in-world sprite uses, so
  // what you build is what you play.
  const CharCreator = {
    show(opts) {
      opts = opts || {};
      const A = root.IRAppearance;
      let app = A.normalize(opts.appearance);

      const card = el("div", "card charcreate");
      card.appendChild(el("h2", null, opts.title || "Create your resident"));
      card.appendChild(el("p", "sub", opts.subtitle ||
        "This is you for the rest of training — tweak the look, then head to the wards. You can change it any time at the mirror in your call room."));

      const cols = el("div", "cc-cols");
      const left = el("div", "cc-left");
      const right = el("div", "cc-right");
      cols.append(left, right);

      // option rows (segmented chips; skin tone shows colour swatches)
      const OPT = A.OPTIONS;
      const ROWS = [
        ["sex", "Resident", OPT.sex, false],
        ["skin", "Skin tone", OPT.skin, true],
        ["hair", "Hair colour", OPT.hair, false],
        ["beard", "Beard", OPT.beard, false],
        ["glasses", "Glasses", OPT.glasses, false],
        ["outfit", "Outfit", OPT.outfit, false],
      ];
      const segs = {};
      const idxOf = (key) => (key === "glasses" || key === "beard") ? (app[key] ? 1 : 0) : app[key];
      ROWS.forEach(function (r) {
        const key = r[0], label = r[1], choices = r[2], isColor = r[3];
        const row = el("div", "cc-opt");
        row.appendChild(el("label", null, label));
        const seg = el("div", "cc-seg");
        choices.forEach(function (c, i) {
          const b = el("button", "cc-chip" + (isColor ? " cc-swatch" : ""));
          if (isColor) { b.style.background = c; b.title = "Tone " + (i + 1); }
          else b.textContent = c;
          b.onclick = function () { if (key === "glasses" || key === "beard") app[key] = (i === 1); else app[key] = i; render(); };
          seg.appendChild(b);
        });
        segs[key] = seg;
        row.appendChild(seg);
        left.appendChild(row);
      });

      // name + randomise
      const namebox = el("div", "cc-namebox");
      namebox.appendChild(el("label", null, "Name"));
      const nameInput = el("input"); nameInput.type = "text"; nameInput.maxLength = 24;
      nameInput.value = opts.name || app.name || "";
      nameInput.placeholder = "Scrubby Resident";
      const bRand = el("button", "btn ghost cc-rand", "🎲 Surprise me");
      bRand.onclick = function () {
        const ri = (n) => Math.floor(Math.random() * n);
        app = A.normalize({ name: nameInput.value, sex: ri(2), skin: ri(A.SKIN.length),
          hair: ri(A.HAIR.length), outfit: ri(A.OUTFITS.length), glasses: Math.random() < 0.5, beard: Math.random() < 0.5 });
        render();
      };
      namebox.append(nameInput, bRand);

      // live preview: full-body sprite + head-and-shoulders portrait
      const preview = el("div", "cc-preview");
      const bodyC = document.createElement("canvas"); bodyC.className = "cc-canv"; bodyC.width = A.BODY_W * 5; bodyC.height = A.BODY_H * 5;
      const faceC = document.createElement("canvas"); faceC.className = "cc-canv cc-face"; faceC.width = A.PORTRAIT_W * 4; faceC.height = A.PORTRAIT_H * 4;
      preview.append(bodyC, faceC);

      const bStart = el("button", "btn primary cc-start", opts.startLabel || "Start ▶");
      bStart.onclick = function () {
        const out = A.normalize(Object.assign({}, app, { name: (nameInput.value || "").trim() }));
        if (opts.onStart) opts.onStart(out);
      };

      right.append(namebox, preview, bStart);
      if (opts.onCancel) {
        const bCancel = el("button", "btn ghost cc-cancel", "Cancel");
        bCancel.onclick = function () { document.removeEventListener("keydown", onKey); opts.onCancel(); };
        right.appendChild(bCancel);
        var onKey = function (e) { if (e.key === "Escape") { document.removeEventListener("keydown", onKey); opts.onCancel(); } };
        document.addEventListener("keydown", onKey);
      }

      card.appendChild(cols);
      show(card);

      function paintCanvas(canvas, ops, scale) {
        let ctx = null;
        try { ctx = canvas.getContext && canvas.getContext("2d"); } catch (e) { ctx = null; }
        if (!ctx) return; // jsdom without node-canvas → preview is a no-op (still testable)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < ops.length; i++) {
          const o = ops[i];
          ctx.globalAlpha = o.a == null ? 1 : o.a;
          ctx.fillStyle = A.hexStr(o.c);
          if (o.shape === "ellipse") { ctx.beginPath(); ctx.ellipse(o.x * scale, o.y * scale, (o.w / 2) * scale, (o.h / 2) * scale, 0, 0, Math.PI * 2); ctx.fill(); }
          else ctx.fillRect(Math.round(o.x * scale), Math.round(o.y * scale), Math.ceil(o.w * scale), Math.ceil(o.h * scale));
        }
        ctx.globalAlpha = 1;
      }
      function render() {
        app = A.normalize(app);
        Object.keys(segs).forEach(function (key) {
          const sel = idxOf(key);
          Array.prototype.forEach.call(segs[key].children, function (b, i) { b.classList.toggle("on", i === sel); });
        });
        paintCanvas(faceC, A.portraitOps(app), 4);
        paintCanvas(bodyC, A.bodyOps(app), 5);
      }
      render();
      return { render: render, card: card, get: function () { return A.normalize(Object.assign({}, app, { name: (nameInput.value || "").trim() })); } };
    },
  };

  root.IRUI = { overlay, clear, toast, Auth, EMR, Preop, LocationPick, Angio, Debrief, Shop, SimLab, CampusMap, Elevator, Conference, CasePick, CallRoom, Lounge, Bag, CharCreator };
})(window);
