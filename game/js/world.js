/* IR RPG — UMass Chan Medical School, University Campus (Worcester, MA).
   World layout stylized from the May 2025 Facilities site plan onto a rigid
   32px tile grid. 3/4 top-down: every building shows its roof AND its south
   wall face (WALL = 2 tiles tall). Layout data + validation are pure and
   Node-testable; texture painters take a Phaser scene (browser only).
   Exposes window.IRWorld / module.exports. */
(function (root) {
  "use strict";
  const TILE = 32, COLS = 80, ROWS = 100, WALL = 2;
  const WPX = COLS * TILE, HPX = ROWS * TILE;
  // tile indices in the generated tileset
  const T = { GRASS: 0, GRASS2: 1, ROAD: 2, DASH_H: 3, DASH_V: 4, SIDE: 5, PARK: 6, WATER: 7 };

  // ----- streets (tile rects) — stylized from the site plan ---------------
  const roads = [
    { id: "plantation", name: "Plantation Street",     x: 8,  y: 0,  w: 3,  h: 100 },
    { id: "lakeave",    name: "Lake Avenue North",     x: 72, y: 0,  w: 3,  h: 100 },
    { id: "belmont",    name: "Belmont Street (Rte 9)", x: 0, y: 92, w: 80, h: 3 },
    { id: "north",      name: "North Road",            x: 11, y: 27, w: 61, h: 3 },
    { id: "south",      name: "South Road",            x: 11, y: 64, w: 61, h: 3 },
    { id: "innovation", name: "Innovation Drive",      x: 11, y: 13, w: 20, h: 2 },
    { id: "firstrd",    name: "First Road",            x: 38, y: 30, w: 2,  h: 34 },
    { id: "dropoff",    name: "Drop-off Zone",         x: 56, y: 30, w: 2,  h: 14 },
    { id: "research",   name: "Research Drive",        x: 11, y: 78, w: 41, h: 2 },
    { id: "univdr",     name: "Campus Entrance",       x: 50, y: 67, w: 2,  h: 25 },
  ];
  const water = [{ x: 77, y: 0, w: 3, h: 100, name: "Lake Quinsigamond" }];
  const lots = [
    { x: 64, y: 16, w: 6, h: 4, name: "Facilities Lot" },
    { x: 65, y: 42, w: 6, h: 5, name: "HP Lot" },
    { x: 65, y: 50, w: 6, h: 5, name: "MD Cross Campus Lot" },
    { x: 13, y: 70, w: 5, h: 4, name: "Lower Pine Tree Lot" },
  ];
  const helipad = { x: 66, y: 57, w: 5, h: 5 };

  // ----- buildings ---------------------------------------------------------
  // kind → base wall color (roof/trim derived by shading)
  const P = { biotech: 0x3f4f80, research: 0x37477a, edu: 0x4a548c, hospital: 0x8c4a52,
    clinical: 0x2f6d7d, house: 0x6d5a44, garage: 0x565c66, plant: 0x62584a, gov: 0x50705c };
  const lob = (blurb, pois) => ({ blurb, pois });
  const GARAGE_MSG = "Parking garage — you walked to work today.";

  const buildings = [
    // ---- north campus / biotech park ----
    { id: "biotech2", name: "Biotech Two", x: 14, y: 4, w: 6, h: 5, kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech Two — leased industry lab space. Badge readers on every door.",
        [{ label: "Device rep booth", msg: "A rep demos a microcatheter torque device. Vendor trials — coming in a later phase." }]) },
    { id: "biotech1", name: "Biotech One", x: 24, y: 4, w: 6, h: 5, kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech One — startups and a lot of liquid nitrogen deliveries.",
        [{ label: "Incubator suites", msg: "Locked. A whiteboard inside reads 'IPO or bust'." }]) },
    { id: "garage_plantation", name: "Plantation St. Garage", x: 34, y: 4, w: 9, h: 4, kind: "garage", enter: null, lockedMsg: GARAGE_MSG },
    { id: "biotech5", name: "Biotech Five", x: 14, y: 15, w: 7, h: 5, kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech Five — contract research organization. Smells faintly of agar.",
        [{ label: "CRO front desk", msg: "\"Trial enrollment portal is down again.\" Research collaborations — later phase." }]) },
    { id: "biotech4", name: "Biotech Four", x: 24, y: 15, w: 7, h: 5, kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech Four — imaging core and small-animal MRI.",
        [{ label: "Imaging core", msg: "The 9.4T magnet hums behind glass. No ferromagnetic objects past this point." }]) },
    { id: "biotech3", name: "Biotech Three", x: 34, y: 15, w: 6, h: 5, kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech Three — catheter prototyping shop on the second floor.",
        [{ label: "Prototyping shop", msg: "3D printers whir. Custom device arc — coming in a later phase." }]) },
    { id: "anderson", name: "Anderson House", x: 44, y: 16, w: 5, h: 4, kind: "house", enter: "Lobby",
      lobby: lob("Anderson House — a creaky historic house the campus grew around.",
        [{ label: "Guest book", msg: "Someone signed it 'Dr. Seldinger, 1953'. Surely not." }]) },
    { id: "pavilion", name: "North Pavilion", x: 52, y: 15, w: 8, h: 6, kind: "clinical", enter: "Lobby",
      lobby: lob("North Pavilion — UMass Memorial outpatient services.",
        [{ label: "Phlebotomy queue", msg: "Now serving ticket 47. You are holding ticket 112." }]) },
    // ---- core campus (between North Rd & South Rd) ----
    { id: "sherman", name: "Albert Sherman Center", x: 20, y: 32, w: 10, h: 7, kind: "research", enter: "Lobby", doorOffset: 8, major: true, short: "SHERMAN",
      lobby: lob("Albert Sherman Center — 11 floors of research and education. The cafe espresso machine is, as always, broken.",
        [{ label: "Auditorium", msg: "Dark and empty. Academic conference sim — coming in P3." },
         { label: "Cafe", msg: "You buy a coffee. It is somehow both burnt and weak. Morale +1 anyway." }]) },
    { id: "msb", name: "Medical School Building", x: 40, y: 32, w: 14, h: 8, kind: "edu", enter: "Lobby", major: true, short: "MED SCHOOL",
      lobby: lob("Medical School Building — lecture halls, the library, and a brutalist amount of concrete.",
        [{ label: "Lecture hall A", msg: "A pharm lecture echoes. Didactics module — coming in a later phase." },
         { label: "Library", msg: "The stacks smell like 1978. A first-year is asleep on a copy of Kandarpa." }]) },
    { id: "powerplant", name: "Power Plant", x: 62, y: 32, w: 8, h: 6, kind: "plant", enter: null, lockedMsg: "Power Plant — authorized personnel only. The turbines drone on." },
    { id: "garage_west", name: "West Garage", x: 20, y: 44, w: 7, h: 6, kind: "garage", enter: null, lockedMsg: GARAGE_MSG },
    { id: "dimare", name: "Paul J. DiMare Center", x: 33, y: 45, w: 5, h: 5, kind: "edu", enter: "Lobby", doorOffset: 4,
      lobby: lob("Paul J. DiMare Center — advancement and education offices.",
        [{ label: "Donor wall", msg: "Polished granite, many names. Your grant is not yet among them." }]) },
    { id: "ummmc", name: "UMass Memorial Medical Center", x: 48, y: 44, w: 16, h: 10, kind: "hospital", enter: "Hospital", major: true, short: "UMASS MEMORIAL",
      lobby: null },
    { id: "lazare", name: "Lazare Research Building", x: 30, y: 54, w: 7, h: 6, kind: "research", enter: "Lobby", major: true, short: "LAZARE",
      lobby: lob("Lazare Research Building — wet labs and the vivarium you don't ask about.",
        [{ label: "PI's office", msg: "\"Got preliminary data?\" Research arc & grant funding — coming in a later phase." }]) },
    { id: "benedict", name: "Benedict Building", x: 42, y: 56, w: 5, h: 4, kind: "edu", enter: "Lobby",
      lobby: lob("Benedict Building — administration. The air is 60% carpet.",
        [{ label: "Dean's office", msg: "The dean is in a meeting. The dean is always in a meeting." }]) },
    // ---- south campus ----
    { id: "leahy", name: "Paul T. Leahy Center", x: 20, y: 70, w: 8, h: 5, kind: "gov", enter: "Lobby",
      lobby: lob("Paul T. Leahy Center — quiet offices and long corridors.",
        [{ label: "Empty conference room", msg: "A projector fan spins for nobody. You feel seen." }]) },
    { id: "acc", name: "Ambulatory Care Center", x: 42, y: 68, w: 8, h: 8, kind: "clinical", enter: "Lobby", major: true, short: "ACC",
      lobby: lob("Ambulatory Care Center — outpatient procedures and clinics.",
        [{ label: "IR clinic", msg: "Outpatient IR clinic — consult and follow-up cases coming in a later phase." },
         { label: "Check-in kiosk", msg: "\"Please update your insurance information.\" You decline. It asks again." }]) },
    { id: "garage_south", name: "South Garage", x: 54, y: 70, w: 9, h: 6, kind: "garage", enter: null, lockedMsg: "South Garage — patients & visitors. Level 3 is, as ever, full." },
    { id: "va", name: "VA Building", x: 63, y: 70, w: 6, h: 5, kind: "gov", enter: "Lobby", doorOffset: 1,
      lobby: lob("VA outpatient building — coffee is free and the veterans have better stories than you.",
        [{ label: "Waiting room", msg: "A Korea vet tells you about 'real winters'. VA rotation — coming later." }]) },
    { id: "army", name: "U.S. Army Reserve", x: 68, y: 77, w: 4, h: 3, kind: "gov", enter: null, lockedMsg: "U.S. Army Reserve — restricted." },
    { id: "shaw", name: "Shaw Building", x: 66, y: 84, w: 5, h: 4, kind: "house", enter: "Lobby",
      lobby: lob("Shaw Building — nobody is entirely sure what happens in the Shaw Building.",
        [{ label: "Directory board", msg: "Half the slots are blank. The other half are out of date." }]) },
  ];

  // quads / green labels (flavor only)
  const greens = [
    { x: 44, y: 42, name: "Quad 1" }, { x: 44, y: 60, name: "Quad 2" },
    { x: 34, y: 72, name: "Quad 3" }, { x: 32, y: 86, name: "Quad 4" },
    { x: 75, y: 30, name: "Quinsigamond\nState Park" },
  ];
  const signs = [
    { x: 4,  y: 90.5, t: "← Downtown Worcester" },
    { x: 66, y: 90.5, t: "Shrewsbury →" },
    { x: 12.5, y: 1, t: "↑ to I-290" },
  ];

  // ----- geometry helpers ---------------------------------------------------
  const doorCol = (b) => b.x + (b.doorOffset != null ? b.doorOffset : Math.floor(b.w / 2));
  const baseRow = (b) => b.y + b.h + WALL;               // first row BELOW the wall face
  const footprint = (b) => ({ x: b.x, y: b.y, w: b.w, h: b.h + WALL });
  const doorFor = (b) => ({ x: (doorCol(b) + 0.5) * TILE, y: (baseRow(b) + 0.5) * TILE + 6 });
  const byId = (id) => buildings.find(b => b.id === id);
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const isRoadIdx = (v) => v === T.ROAD || v === T.DASH_H || v === T.DASH_V;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ----- tile grid + auto-sidewalks ----------------------------------------
  function buildGrid() {
    const errors = [];
    const g = [], occ = [];
    for (let r = 0; r < ROWS; r++) {
      g.push(new Array(COLS)); occ.push(new Array(COLS).fill(0));
      for (let c = 0; c < COLS; c++) g[r][c] = ((c * 7 + r * 13 + ((c * c + r * 3) % 5)) % 7) < 3 ? T.GRASS2 : T.GRASS;
    }
    const fill = (rc, v) => { for (let r = rc.y; r < rc.y + rc.h; r++) for (let c = rc.x; c < rc.x + rc.w; c++) if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = v; };
    lots.forEach(l => fill(l, T.PARK));
    roads.forEach(rd => fill(rd, T.ROAD));
    roads.forEach(rd => { // center dashes on 3-wide roads
      if (rd.h >= 3 && rd.w > rd.h) { const r = rd.y + Math.floor(rd.h / 2); for (let c = rd.x; c < rd.x + rd.w; c++) g[r][c] = T.DASH_H; }
      else if (rd.w >= 3 && rd.h > rd.w) { const c = rd.x + Math.floor(rd.w / 2); for (let r = rd.y; r < rd.y + rd.h; r++) g[r][c] = T.DASH_V; }
    });
    water.forEach(w => fill(w, T.WATER));
    buildings.forEach(b => { const f = footprint(b); for (let r = f.y; r < f.y + f.h; r++) for (let c = f.x; c < f.x + f.w; c++) occ[r][c] = 1; });

    // auto-sidewalk: stoop under the door, then straight south to the first road
    buildings.filter(b => b.enter).forEach(b => {
      const col = doorCol(b), base = baseRow(b);
      for (let c = col - 1; c <= col + 1; c++) if (c >= 0 && c < COLS && !occ[base][c] && !isRoadIdx(g[base][c]) && g[base][c] !== T.WATER) g[base][c] = T.SIDE;
      let r = base;
      while (r < ROWS && !isRoadIdx(g[r][col])) {
        if (occ[r][col]) { errors.push(b.id + ": door path blocked by a building at row " + r); break; }
        if (g[r][col] === T.WATER) { errors.push(b.id + ": door path runs into the lake"); break; }
        if (g[r][col] !== T.PARK) g[r][col] = T.SIDE;
        r++;
      }
      if (r >= ROWS) errors.push(b.id + ": door path never reaches a road");
    });
    return { grid: g, occ, errors };
  }

  // deterministic tree scatter on open grass
  function treeList(grid, occ) {
    const rnd = mulberry32(20260703), out = [];
    let tries = 0;
    while (out.length < 95 && tries++ < 2000) {
      const c = 1 + Math.floor(rnd() * (COLS - 2)), r = 1 + Math.floor(rnd() * (ROWS - 2));
      let ok = true;
      for (let dr = -1; dr <= 1 && ok; dr++) for (let dc = -1; dc <= 1 && ok; dc++) {
        const v = grid[r + dr][c + dc];
        if (occ[r + dr][c + dc] || (v !== T.GRASS && v !== T.GRASS2)) ok = false;
      }
      if (ok && !out.some(t => Math.abs(t.c - c) + Math.abs(t.r - r) < 3)) out.push({ c, r, v: rnd() < 0.5 ? 0 : 1 });
    }
    // lakeside row
    for (let r = 4; r < 92; r += 7) if (grid[r][75] <= T.GRASS2 && !occ[r][75]) out.push({ c: 75, r, v: r % 2 });
    return out;
  }

  // ----- validation (Node-testable) ----------------------------------------
  function validate() {
    const errors = [];
    const rects = buildings.map(b => Object.assign({ id: b.id }, footprint(b)));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++)
      if (overlap(rects[i], rects[j])) errors.push("buildings overlap: " + rects[i].id + " / " + rects[j].id);
    const solidTerrain = roads.concat(water);
    rects.forEach(rc => solidTerrain.forEach(t => { if (overlap(rc, t)) errors.push(rc.id + " overlaps " + (t.name || "road/water")); }));
    rects.forEach(rc => lots.forEach(l => { if (overlap(rc, l)) errors.push(rc.id + " overlaps lot " + l.name); }));
    buildings.forEach(b => {
      const f = footprint(b);
      if (f.x < 0 || f.y < 0 || f.x + f.w > COLS || f.y + f.h > ROWS) errors.push(b.id + " out of bounds");
      if (b.enter === "Lobby" && !b.lobby) errors.push(b.id + " enterable but has no lobby content");
      if (b.enter) { const d = doorFor(b); if (d.x < 0 || d.x > WPX || d.y < 0 || d.y > HPX) errors.push(b.id + " door out of bounds"); }
    });
    errors.push.apply(errors, buildGrid().errors);
    return errors;
  }

  // ==========================================================================
  //  PROCEDURAL PIXEL-ART TEXTURES (browser only — needs a Phaser scene)
  // ==========================================================================
  const shade = (c, f) => {
    const r = Math.min(255, ((c >> 16) & 255) * f) | 0, g2 = Math.min(255, ((c >> 8) & 255) * f) | 0, b = Math.min(255, (c & 255) * f) | 0;
    return (r << 16) | (g2 << 8) | b;
  };

  function paintTileset(scene) {
    const g = scene.make.graphics({ add: false });
    const rnd = mulberry32(7);
    const speck = (ox, n, cols) => { for (let i = 0; i < n; i++) { g.fillStyle(cols[Math.floor(rnd() * cols.length)], 1); g.fillRect(ox + Math.floor(rnd() * 31), Math.floor(rnd() * 31), 1 + (rnd() < .3 ? 1 : 0), 1); } };
    const grassTile = (ox, base) => {
      g.fillStyle(base, 1); g.fillRect(ox, 0, 32, 32);
      speck(ox, 26, [shade(base, 0.85), shade(base, 1.18), shade(base, 0.72)]);
      for (let i = 0; i < 4; i++) { g.fillStyle(shade(base, 1.28), 1); g.fillRect(ox + Math.floor(rnd() * 30), Math.floor(rnd() * 28), 1, 3); }
      if (rnd() < 0.35) { g.fillStyle(0xd8d06a, 1); g.fillRect(ox + Math.floor(rnd() * 28) + 2, Math.floor(rnd() * 28) + 2, 2, 2); }
    };
    const roadTile = (ox) => { g.fillStyle(0x353a42, 1); g.fillRect(ox, 0, 32, 32); speck(ox, 22, [0x2e333a, 0x3d434c, 0x30353d]); };
    grassTile(0, 0x3f6b41);          // GRASS
    grassTile(32, 0x396239);         // GRASS2
    roadTile(64);                    // ROAD
    roadTile(96); g.fillStyle(0xd8d4b8, 0.95); g.fillRect(96 + 3, 15, 9, 2); g.fillRect(96 + 19, 15, 9, 2);  // DASH_H
    roadTile(128); g.fillStyle(0xd8d4b8, 0.95); g.fillRect(128 + 15, 3, 2, 9); g.fillRect(128 + 15, 19, 2, 9); // DASH_V
    g.fillStyle(0x9ba1a9, 1); g.fillRect(160, 0, 32, 32); g.fillStyle(0x84898f, 1); g.fillRect(160, 0, 32, 1); g.fillRect(160, 0, 1, 32); // SIDE + joints
    speck(160, 10, [0x8f959c, 0xa8aeb5]); g.fillStyle(0xc6ccd2, 0.6); g.fillRect(160 + 6, 6, 3, 1); g.fillRect(160 + 20, 22, 3, 1);       // sheen
    roadTile(192); g.fillStyle(0x40454e, 1); g.fillRect(192, 0, 32, 32 * 0); g.fillStyle(0xcfd3d8, 0.85); g.fillRect(192, 2, 2, 13);      // PARK stall line
    g.fillStyle(0x24486b, 1); g.fillRect(224, 0, 32, 32); speck(224, 8, [0x1f3f5e, 0x2b537a]);                                            // WATER
    g.fillStyle(0x35638f, 0.9); g.fillRect(224 + 4, 8, 8, 1); g.fillRect(224 + 18, 20, 9, 1); g.fillRect(224 + 10, 27, 6, 1);
    g.generateTexture("tileset", 256, 32); g.destroy();
  }

  function paintBuilding(scene, b) {
    const key = "bld_" + b.id;
    if (scene.textures.exists(key)) return key;
    const w = b.w * TILE, roofH = b.h * TILE, wallH = WALL * TILE, H = roofH + wallH;
    const wall = P[b.kind] || 0x555f73, roof = shade(wall, 0.58);
    const g = scene.make.graphics({ add: false });
    const rnd = mulberry32(b.x * 31 + b.y * 7);
    // roof + gravel + parapet
    g.fillStyle(roof, 1); g.fillRect(0, 0, w, roofH);
    for (let i = 0; i < w * b.h / 14; i++) { g.fillStyle(rnd() < .5 ? shade(roof, 0.85) : shade(roof, 1.2), 1); g.fillRect(Math.floor(rnd() * (w - 2)), Math.floor(rnd() * (roofH - 4)) + 2, 2, 1); }
    g.fillStyle(shade(roof, 1.45), 1); g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, roofH);
    g.fillStyle(shade(roof, 0.55), 1); g.fillRect(0, roofH - 4, w, 4); g.fillRect(w - 3, 0, 3, roofH);
    // rooftop clutter: AC units (or stacks for the plant, helipad for the hospital)
    if (b.kind === "plant") {
      for (let i = 0; i < 2; i++) { const cx = w * (0.3 + 0.4 * i), cy = roofH * 0.4; g.fillStyle(0x3c3833, 1); g.fillCircle(cx, cy, 9); g.fillStyle(0x1d1b18, 1); g.fillCircle(cx, cy, 6); }
    } else {
      const n = Math.max(1, Math.floor(b.w * b.h / 22));
      for (let i = 0; i < n; i++) { const ax = 8 + Math.floor(rnd() * (w - 26)), ay = 7 + Math.floor(rnd() * (roofH - 22)); g.fillStyle(0x000000, 0.25); g.fillRect(ax + 2, ay + 8, 12, 3); g.fillStyle(0x8b9199, 1); g.fillRect(ax, ay, 12, 8); g.fillStyle(0x6f757d, 1); g.fillRect(ax + 2, ay + 2, 8, 4); }
    }
    if (b.kind === "hospital") { const cx = w - 58, cy = 40; g.lineStyle(3, 0xcfd3d8, 0.9); g.strokeCircle(cx, cy, 22); g.fillStyle(0xcfd3d8, 0.9); g.fillRect(cx - 8, cy - 10, 4, 20); g.fillRect(cx + 4, cy - 10, 4, 20); g.fillRect(cx - 6, cy - 2, 12, 4); }
    // south wall face
    g.fillStyle(wall, 1); g.fillRect(0, roofH, w, wallH);
    g.fillStyle(shade(wall, 1.25), 1); g.fillRect(0, roofH, w, 2);
    g.fillStyle(shade(wall, 0.6), 1); g.fillRect(0, H - 3, w, 3);
    const dx = (doorCol(b) - b.x) * TILE + 16; // door center in texture px
    if (b.kind === "garage") {
      for (let x = 8; x + 26 <= w - 8; x += 34) { g.fillStyle(0x14181e, 1); g.fillRect(x, roofH + 14, 26, 14); g.fillStyle(0x2a3038, 1); g.fillRect(x, roofH + 14, 26, 3); }
    } else {
      for (let x = 7; x + 12 <= w - 7; x += 20) {
        if (b.enter && Math.abs(x + 6 - dx) < 26) continue; // leave room for the door
        g.fillStyle(0x16202e, 1); g.fillRect(x, roofH + 12, 12, 20);
        g.fillStyle(0x9fc4e0, 0.9); g.fillRect(x + 1, roofH + 13, 10, 3); g.fillRect(x + 1, roofH + 17, 3, 6);
        g.fillStyle(shade(wall, 1.3), 1); g.fillRect(x - 1, roofH + 32, 14, 2);
      }
    }
    if (b.enter) { // glass double door + awning
      g.fillStyle(0x20262e, 1); g.fillRect(dx - 17, H - 33, 34, 33);
      g.fillStyle(0x2a4a66, 1); g.fillRect(dx - 14, H - 30, 13, 28); g.fillRect(dx + 1, H - 30, 13, 28);
      g.fillStyle(0x9fc4e0, 0.8); g.fillRect(dx - 12, H - 28, 4, 10); g.fillRect(dx + 3, H - 28, 4, 10);
      g.fillStyle(shade(wall, 1.5), 1); g.fillRect(dx - 21, H - 38, 42, 6);
      g.fillStyle(0x000000, 0.3); g.fillRect(dx - 21, H - 32, 42, 3);
      if (b.kind === "hospital") { g.fillStyle(0xe8e6e0, 1); g.fillRect(dx - 34, roofH + 6, 68, 14); g.fillStyle(0xb03040, 1); g.fillRect(dx - 5, roofH + 8, 10, 4); g.fillRect(dx - 2, roofH + 5, 4, 10); }
    }
    g.generateTexture(key, w, H); g.destroy();
    return key;
  }

  function paintSprites(scene) {
    if (scene.textures.exists("t_player")) return;
    let g = scene.make.graphics({ add: false });
    // player — resident in navy scrubs (20×28, feet at bottom)
    g.fillStyle(0x000000, 0.28); g.fillEllipse(10, 26, 15, 5);
    g.fillStyle(0x2c2620, 1); g.fillRect(5, 0, 10, 5);
    g.fillStyle(0xd9a886, 1); g.fillRect(6, 3, 8, 7); g.fillStyle(0x2c2620, 1); g.fillRect(5, 2, 10, 2);
    g.fillStyle(0x2c4a6e, 1); g.fillRect(4, 10, 12, 9); g.fillRect(2, 11, 2, 6); g.fillRect(16, 11, 2, 6);
    g.fillStyle(0xd9a886, 1); g.fillRect(2, 17, 2, 2); g.fillRect(16, 17, 2, 2);
    g.fillStyle(0xe8e4d8, 1); g.fillRect(12, 12, 2, 3);
    g.fillStyle(0x223a55, 1); g.fillRect(5, 19, 4, 6); g.fillRect(11, 19, 4, 6);
    g.fillStyle(0x1a1a1c, 1); g.fillRect(5, 25, 4, 2); g.fillRect(11, 25, 4, 2);
    g.generateTexture("t_player", 20, 28); g.destroy();
    // trees ×2
    for (let v = 0; v < 2; v++) {
      g = scene.make.graphics({ add: false });
      const c1 = v ? 0x2c5a3a : 0x2f5d33, c2 = v ? 0x3a7449 : 0x3b7440, c3 = v ? 0x4f9260 : 0x4f8f52;
      g.fillStyle(0x000000, 0.25); g.fillEllipse(20, 48, 26, 8);
      g.fillStyle(0x5a4632, 1); g.fillRect(17, 34, 6, 14); g.fillStyle(0x453626, 1); g.fillRect(21, 34, 2, 14);
      g.fillStyle(0x25482a, 1); g.fillCircle(20, 30, 10);
      g.fillStyle(c1, 1); g.fillCircle(20, 23, 15);
      g.fillStyle(c2, 1); g.fillCircle(14, 20, 10); g.fillCircle(27, 22, 9);
      g.fillStyle(c3, 1); g.fillCircle(16, 15, 6); g.fillCircle(25, 17, 5);
      g.generateTexture("tree" + v, 40, 52); g.destroy();
    }
    // helipad
    g = scene.make.graphics({ add: false });
    const hp = helipad.w * TILE;
    g.fillStyle(0x3a3f47, 1); g.fillCircle(hp / 2, hp / 2, hp / 2 - 4);
    g.lineStyle(4, 0xd8d4b8, 1); g.strokeCircle(hp / 2, hp / 2, hp / 2 - 10);
    g.fillStyle(0xd8d4b8, 1); g.fillRect(hp / 2 - 16, hp / 2 - 20, 7, 40); g.fillRect(hp / 2 + 9, hp / 2 - 20, 7, 40); g.fillRect(hp / 2 - 12, hp / 2 - 4, 24, 8);
    g.generateTexture("t_helipad", hp, hp); g.destroy();
  }

  function paintInterior(scene) {
    const tex = (key, w, h, fn) => {
      if (scene.textures.exists(key)) return;
      const g = scene.make.graphics({ add: false });
      fn(g); g.generateTexture(key, w, h); g.destroy();
    };
    tex("t_lino", 32, 32, (g) => {
      const rnd = mulberry32(99);
      g.fillStyle(0xb9bdc3, 1); g.fillRect(0, 0, 32, 32);
      g.fillStyle(0xa4a8ae, 1); g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
      for (let i = 0; i < 8; i++) { g.fillStyle(rnd() < .5 ? 0xaeb2b8 : 0xc4c8ce, 1); g.fillRect(Math.floor(rnd() * 30), Math.floor(rnd() * 30), 2, 1); }
      g.fillStyle(0xdde1e6, 0.55); g.fillRect(6, 4, 10, 2); g.fillRect(18, 20, 8, 2); // linoleum sheen
    });
    tex("t_iwall", 32, 82, (g) => { // interior wall face (tileable strip)
      g.fillStyle(0x3a4150, 1); g.fillRect(0, 0, 32, 12);
      g.fillStyle(0x596273, 1); g.fillRect(0, 12, 32, 60);
      g.fillStyle(0x6e7789, 1); g.fillRect(0, 52, 32, 2);
      g.fillStyle(0x4a5262, 1); g.fillRect(0, 54, 32, 18);
      g.fillStyle(0x2b303c, 1); g.fillRect(0, 72, 32, 6);
      g.fillStyle(0x000000, 0.22); g.fillRect(0, 78, 32, 4);
    });
    tex("t_desk", 128, 62, (g) => { // reception desk (front + top faces)
      g.fillStyle(0x000000, 0.25); g.fillRect(4, 56, 124, 6);
      g.fillStyle(0x9a7a56, 1); g.fillRect(0, 0, 128, 22);
      g.fillStyle(0xb08c62, 1); g.fillRect(0, 0, 128, 3);
      g.fillStyle(0x6d5238, 1); g.fillRect(0, 22, 128, 36);
      for (let x = 6; x < 122; x += 24) { g.fillStyle(0x5d4630, 1); g.fillRect(x, 27, 16, 26); }
      g.fillStyle(0xdfe3e8, 1); g.fillRect(50, 4, 16, 11); g.fillStyle(0x69a7d2, 1); g.fillRect(51, 5, 14, 8); // monitor
    });
    tex("t_plant", 24, 36, (g) => {
      g.fillStyle(0x000000, 0.22); g.fillEllipse(12, 33, 18, 5);
      g.fillStyle(0x7a4a3a, 1); g.fillRect(6, 24, 12, 9); g.fillStyle(0x5d3529, 1); g.fillRect(6, 30, 12, 3);
      g.fillStyle(0x2f5d33, 1); g.fillCircle(12, 15, 9); g.fillStyle(0x3b7440, 1); g.fillCircle(7, 11, 5); g.fillCircle(17, 12, 5); g.fillStyle(0x4f8f52, 1); g.fillCircle(12, 8, 4);
    });
    tex("t_chair", 20, 26, (g) => {
      g.fillStyle(0x000000, 0.2); g.fillEllipse(10, 24, 16, 4);
      g.fillStyle(0x33506e, 1); g.fillRect(2, 2, 16, 8);
      g.fillStyle(0x3f5d7d, 1); g.fillRect(2, 10, 16, 7);
      g.fillStyle(0x22303e, 1); g.fillRect(3, 17, 3, 6); g.fillRect(14, 17, 3, 6);
    });
    tex("t_kiosk", 22, 32, (g) => { // info kiosk (for POIs)
      g.fillStyle(0x000000, 0.22); g.fillEllipse(11, 30, 16, 4);
      g.fillStyle(0x4a5262, 1); g.fillRect(9, 12, 4, 17);
      g.fillStyle(0x2b303c, 1); g.fillRect(1, 0, 20, 14);
      g.fillStyle(0x69d2e7, 1); g.fillRect(3, 2, 16, 10); g.fillStyle(0xffffff, 0.85); g.fillRect(5, 4, 8, 2); g.fillRect(5, 8, 12, 1);
    });
    tex("t_board", 72, 44, (g) => { // notice board
      g.fillStyle(0x5a4632, 1); g.fillRect(0, 0, 72, 44);
      g.fillStyle(0xa8895c, 1); g.fillRect(3, 3, 66, 38);
      const cols = [0xf2efe6, 0xd7e6f2, 0xf2e6b8, 0xe6d2d2];
      const r2 = mulberry32(5);
      for (let i = 0; i < 6; i++) { const x = 6 + Math.floor(r2() * 52), y = 6 + Math.floor(r2() * 24); g.fillStyle(cols[i % 4], 1); g.fillRect(x, y, 9, 11); g.fillStyle(0x9aa0a8, 1); g.fillRect(x + 1, y + 3, 7, 1); g.fillRect(x + 1, y + 6, 5, 1); }
    });
    tex("t_bed", 36, 56, (g) => { // hospital bed (head at top, front face at foot)
      g.fillStyle(0x000000, 0.22); g.fillRect(2, 50, 34, 5);
      g.fillStyle(0x4a5262, 1); g.fillRect(0, 0, 36, 8);           // headboard
      g.fillStyle(0x6e7789, 1); g.fillRect(0, 0, 36, 2);
      g.fillStyle(0xe8eaee, 1); g.fillRect(2, 8, 32, 36);          // mattress
      g.fillStyle(0xf7f8fa, 1); g.fillRect(6, 10, 24, 8);          // pillow
      g.fillStyle(0xc9ccd2, 1); g.fillRect(6, 17, 24, 1);
      g.fillStyle(0x4a8a8c, 1); g.fillRect(2, 22, 32, 22);         // blanket
      g.fillStyle(0x5fa3a5, 1); g.fillRect(2, 22, 32, 3);          // fold
      g.fillStyle(0x3a6f71, 1); g.fillRect(2, 41, 32, 3);
      g.fillStyle(0x4a5262, 1); g.fillRect(0, 44, 36, 8);          // footboard front face
      g.fillStyle(0x2b303c, 1); g.fillRect(0, 50, 36, 2);
    });
    tex("t_carm", 56, 62, (g) => { // C-arm (angio suite flavor)
      g.fillStyle(0x000000, 0.22); g.fillEllipse(28, 57, 40, 7);
      g.fillStyle(0x39404d, 1); g.fillRect(18, 42, 22, 14);        // base
      g.fillStyle(0x4a5262, 1); g.fillRect(18, 42, 22, 3);
      g.fillStyle(0x596273, 1); g.fillRect(25, 28, 8, 16);         // column
      g.lineStyle(6, 0xd3d7dd, 1);
      g.beginPath(); g.arc(28, 22, 16, Math.PI * 0.75, Math.PI * 2.25, false); g.strokePath(); // the C
      g.fillStyle(0x2b303c, 1); g.fillRect(12, 2, 14, 10);         // detector
      g.fillStyle(0x2b303c, 1); g.fillRect(14, 32, 12, 8);         // tube
      g.fillStyle(0x69d2e7, 1); g.fillRect(42, 8, 3, 3);           // status LED
    });
    tex("t_elev", 60, 76, (g) => { // elevator doors (mounted on the wall face)
      g.fillStyle(0x2b303c, 1); g.fillRect(0, 0, 60, 76);
      g.fillStyle(0x6e7789, 1); g.fillRect(2, 2, 56, 72);
      g.fillStyle(0x9ba1a9, 1); g.fillRect(6, 12, 22, 58); g.fillRect(32, 12, 22, 58); // panels
      g.fillStyle(0xc4c9cf, 1); g.fillRect(6, 12, 22, 3); g.fillRect(32, 12, 22, 3);
      g.fillStyle(0x14181e, 1); g.fillRect(28, 12, 4, 58);         // seam
      g.fillStyle(0x14181e, 1); g.fillRect(20, 3, 20, 7);          // floor display
      g.fillStyle(0xe0693a, 1); g.fillRect(27, 5, 6, 3);
    });
    tex("t_stairs", 64, 76, (g) => { // stairwell alcove
      g.fillStyle(0x1c222d, 1); g.fillRect(0, 0, 64, 76);
      const shades = [0x39404d, 0x454d5c, 0x525a6a, 0x5f6879, 0x6c7688];
      shades.forEach((c, i) => { g.fillStyle(c, 1); g.fillRect(6, 66 - i * 13, 52, 13); });
      g.fillStyle(0x8a919b, 1); g.fillRect(6, 10, 52, 3);          // railing
      g.fillStyle(0x8a919b, 1); g.fillRect(6, 10, 3, 60); g.fillRect(55, 10, 3, 60);
    });
  }

  function ensureTextures(scene) {
    if (!scene.textures.exists("tileset")) paintTileset(scene);
    paintSprites(scene);
    buildings.forEach(b => paintBuilding(scene, b));
  }

  const api = {
    TILE, COLS, ROWS, WALL, WPX, HPX, T,
    roads, water, lots, helipad, buildings, greens, signs,
    byId, doorCol, baseRow, footprint, doorFor,
    buildGrid, treeList, validate,
    ensureTextures, paintInterior, shade, mulberry32,
    spawnDefault: { x: 51 * TILE, y: 89 * TILE },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IRWorld = api;
})(typeof window !== "undefined" ? window : globalThis);
