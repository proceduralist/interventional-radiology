/* IR RPG — UMass Chan Medical School, University Campus (Worcester, MA).
   Geometry comes from world_data.js, which is GENERATED from the May 2025
   Facilities site plan PDF (color-segmented building footprints on an 80×100
   grid of 32px tiles, roads traced from the plan). This module adds game
   meta (names, kinds, lobbies), computes the 3/4-view geometry (every south
   edge of a footprint grows a 2-tile wall face; roofs + walls are solid),
   paints all procedural pixel-art textures, and renders the overworld
   buildings (Y-sorted wall strips, skybridge, shadows, labels).
   Layout & validation are Node-testable; painters need a Phaser scene. */
(function (root) {
  "use strict";
  const D = (typeof module !== "undefined" && module.exports) ? require("./world_data.js") : root.IRWorldData;
  const TILE = 32, COLS = D.COLS, ROWS = D.ROWS, WALL = 2;
  const WPX = COLS * TILE, HPX = ROWS * TILE;
  const T = { GRASS: 0, GRASS2: 1, ROAD: 2, DASH_H: 3, DASH_V: 4, SIDE: 5, PARK: 6, WATER: 7 };

  // ----- game meta over the extracted footprints ----------------------------
  const P = { biotech: 0x3f4f80, research: 0x37477a, edu: 0x4a548c, hospital: 0x8c4a52,
    clinical: 0x2f6d7d, house: 0x6d5a44, garage: 0x565c66, plant: 0x62584a, gov: 0x50705c };
  const lob = (blurb, pois) => ({ blurb, pois });
  const GARAGE_MSG = "Parking garage — you walked to work today.";
  const META = {
    biotech1: { name: "Biotech One", kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech One — startups and a lot of liquid nitrogen deliveries.",
        [{ label: "Incubator suites", msg: "Locked. A whiteboard inside reads 'IPO or bust'." }]) },
    biotech2: { name: "Biotech Two", kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech Two — leased industry lab space. Badge readers on every door.",
        [{ label: "Device rep booth", msg: "A rep demos a microcatheter torque device. Vendor trials — coming in a later phase." }]) },
    biotech3: { name: "Biotech Three", kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech Three — catheter prototyping shop on the second floor.",
        [{ label: "Prototyping shop", msg: "3D printers whir. Custom device arc — coming in a later phase." }]) },
    biotech4: { name: "Biotech Four", kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech Four — imaging core and small-animal MRI.",
        [{ label: "Imaging core", msg: "The 9.4T magnet hums behind glass. No ferromagnetic objects past this point." }]) },
    biotech5: { name: "Biotech Five", kind: "biotech", enter: "Lobby",
      lobby: lob("Biotech Five — contract research organization. Smells faintly of agar.",
        [{ label: "CRO front desk", msg: "\"Trial enrollment portal is down again.\" Research collaborations — later phase." }]) },
    anderson: { name: "Anderson House", kind: "house", enter: "Lobby",
      lobby: lob("Anderson House — a creaky historic house the campus grew around.",
        [{ label: "Guest book", msg: "Someone signed it 'Dr. Seldinger, 1953'. Surely not." }]) },
    pavilion: { name: "North Pavilion", kind: "clinical", enter: "Lobby",
      lobby: lob("North Pavilion — UMass Memorial outpatient services.",
        [{ label: "Phlebotomy queue", msg: "Now serving ticket 47. You are holding ticket 112." }]) },
    sherman: { name: "Albert Sherman Center", kind: "research", enter: "Lobby", major: true, short: "SHERMAN",
      lobby: lob("Albert Sherman Center — 11 floors of research and education. The skybridge to the Medical School is the fastest indoor route on campus.",
        [{ label: "Auditorium", msg: "Dark and empty. Academic conference sim — coming in P3." },
         { label: "Cafe", msg: "You buy a coffee. It is somehow both burnt and weak. Morale +1 anyway." }]) },
    msb: { name: "Medical School Building", kind: "edu", enter: "Lobby", major: true, short: "MED SCHOOL",
      lobby: lob("Medical School Building — lecture halls, the library, and a brutalist amount of concrete. A corridor connects directly into the hospital.",
        [{ label: "Lecture hall A", msg: "A pharm lecture echoes. Didactics module — coming in a later phase." },
         { label: "Library", msg: "The stacks smell like 1978. A first-year is asleep on a copy of Kandarpa." },
         { label: "Corridor to UMass Memorial", msg: "Through these doors the med school runs straight into the hospital — clinical years in one commute." }]) },
    ummmc: { name: "UMass Memorial Medical Center", kind: "hospital", enter: "Hospital", major: true, short: "UMASS MEMORIAL" },
    powerplant: { name: "Power Plant", kind: "plant", enter: null, lockedMsg: "Power Plant — authorized personnel only. The turbines drone on." },
    garage_plantation: { name: "Plantation St. Garage", kind: "garage", enter: null, lockedMsg: GARAGE_MSG },
    garage_west: { name: "West Garage", kind: "garage", enter: null, lockedMsg: GARAGE_MSG },
    garage_south: { name: "South Garage", kind: "garage", enter: null, lockedMsg: "South Garage — patients & visitors. Level 3 is, as ever, full." },
    garage_bio3: { name: "Bio 3 Parking", kind: "garage", enter: null, lockedMsg: GARAGE_MSG },
    dimare: { name: "Paul J. DiMare Center", kind: "edu", enter: "Lobby",
      lobby: lob("Paul J. DiMare Center — advancement and education offices, front door on Quad 1.",
        [{ label: "Donor wall", msg: "Polished granite, many names. Your grant is not yet among them." }]) },
    lazare: { name: "Lazare Research Building", kind: "research", enter: "Lobby", major: true, short: "LAZARE",
      lobby: lob("Lazare Research Building — wet labs and the vivarium you don't ask about.",
        [{ label: "PI's office", msg: "\"Got preliminary data?\" Research arc & grant funding — coming in a later phase." }]) },
    benedict: { name: "Benedict Building", kind: "edu", enter: "Lobby",
      lobby: lob("Benedict Building — administration. The air is 60% carpet.",
        [{ label: "Dean's office", msg: "The dean is in a meeting. The dean is always in a meeting." }]) },
    leahy: { name: "Paul T. Leahy Center", kind: "gov", enter: "Lobby",
      lobby: lob("Paul T. Leahy Center — quiet offices and long corridors.",
        [{ label: "Empty conference room", msg: "A projector fan spins for nobody. You feel seen." }]) },
    acc: { name: "Ambulatory Care Center", kind: "clinical", enter: "Lobby", major: true, short: "ACC",
      lobby: lob("Ambulatory Care Center — outpatient procedures and clinics.",
        [{ label: "IR clinic", msg: "Outpatient IR clinic — consult and follow-up cases coming in a later phase." },
         { label: "Check-in kiosk", msg: "\"Please update your insurance information.\" You decline. It asks again." }]) },
    va: { name: "VA Building", kind: "gov", enter: "Lobby",
      lobby: lob("VA outpatient building — coffee is free and the veterans have better stories than you.",
        [{ label: "Waiting room", msg: "A Korea vet tells you about 'real winters'. VA rotation — coming later." }]) },
    army: { name: "U.S. Army Reserve", kind: "gov", enter: null, lockedMsg: "U.S. Army Reserve — restricted." },
    shaw: { name: "Shaw Building", kind: "house", enter: "Lobby",
      lobby: lob("Shaw Building — nobody is entirely sure what happens in the Shaw Building.",
        [{ label: "Directory board", msg: "Half the slots are blank. The other half are out of date." }]) },
    mercadante: { name: "Mercadante Funeral Home", kind: "house", enter: null,
      lockedMsg: "Mercadante Funeral Home — professional courtesy: you wave, they wave back. Nobody wants the referral." },
    p367: { name: "367 Plantation St.", kind: "clinical", enter: null, lockedMsg: "367 Plantation St. — leased clinical offices. The elevator smells like 1987." },
  };
  const buildings = Object.keys(D.buildings).map(id => {
    const g = D.buildings[id];
    const meta = META[id] || { name: "Private building", kind: "house", enter: null, lockedMsg: "Not UMass property." };
    return Object.assign({ id }, g, meta, { mask: g.mask.map(row => row.split("").map(ch => ch === "1")) });
  });
  const byId = (id) => buildings.find(b => b.id === id);
  const doorFor = (b) => ({ x: (b.door[0] + 0.5) * TILE, y: (b.door[1] + 0.5) * TILE });

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ----- derived geometry (roofs, wall faces, solids, terrain) --------------
  let _geo = null;
  function geo() {
    if (_geo) return _geo;
    const roofOwner = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    buildings.forEach(b => b.mask.forEach((row, i) => row.forEach((v, j) => { if (v) roofOwner[b.y + i][b.x + j] = b.id; })));
    const roof = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && roofOwner[r][c] !== null;
    // wall faces: up to WALL tiles below every south edge, clipped by gaps
    const wallOwner = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    const wallTop = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    for (let r2 = 0; r2 < ROWS; r2++) for (let c = 0; c < COLS; c++) {
      if (roofOwner[r2][c] && !roof(r2 + 1, c)) {
        for (let d = 1; d <= WALL; d++) {
          if (r2 + d < ROWS && !roof(r2 + d, c)) { wallOwner[r2 + d][c] = roofOwner[r2][c]; if (d === 1) wallTop[r2 + d][c] = true; }
          else break;
        }
      }
    }
    const solid = Array.from({ length: ROWS }, (_, r2) => Array.from({ length: COLS }, (_, c) => roofOwner[r2][c] !== null || wallOwner[r2][c] !== null));
    // terrain indices with grass variation
    const grid = D.terrain.map((row, r2) => row.split("").map((ch, c) => {
      if (ch === "r") return T.ROAD;
      if (ch === "s") return T.SIDE;
      if (ch === "p") return T.PARK;
      return ((c * 7 + r2 * 13 + ((c * c + r2 * 3) % 5)) % 7) < 3 ? T.GRASS2 : T.GRASS;
    }));
    // wall strips per building (contiguous top-wall runs; height 1 or 2)
    const strips = {};
    buildings.forEach(b => strips[b.id] = []);
    for (let r2 = 0; r2 < ROWS; r2++) {
      let c = 0;
      while (c < COLS) {
        if (wallTop[r2][c]) {
          const id = wallOwner[r2][c];
          const hgt = (r2 + 1 < ROWS && wallOwner[r2 + 1][c] === id && !wallTop[r2 + 1][c]) ? 2 : 1;
          let len = 0;
          while (c + len < COLS && wallTop[r2][c + len] && wallOwner[r2][c + len] === id) {
            const h2 = (r2 + 1 < ROWS && wallOwner[r2 + 1][c + len] === id && !wallTop[r2 + 1][c + len]) ? 2 : 1;
            if (h2 !== hgt) break;
            len++;
          }
          strips[id].push({ c, row: r2, len, hgt });
          c += len;
        } else c++;
      }
    }
    // solid horizontal runs (physics bodies)
    const runs = [];
    for (let r2 = 0; r2 < ROWS; r2++) {
      let c = 0;
      while (c < COLS) {
        if (solid[r2][c]) { let len = 0; while (c + len < COLS && solid[r2][c + len]) len++; runs.push({ x: c, y: r2, w: len, h: 1 }); c += len; }
        else c++;
      }
    }
    _geo = { roofOwner, wallOwner, solid, grid, strips, runs };
    return _geo;
  }
  const buildGrid = () => { const g = geo(); return { grid: g.grid, occ: g.solid }; };

  // deterministic tree scatter on open grass (denser in the state-park strip)
  function treeList() {
    const { grid, solid } = { grid: geo().grid, solid: geo().solid };
    const rnd = mulberry32(20260703), out = [];
    let tries = 0;
    const grassy = (r2, c) => grid[r2][c] === T.GRASS || grid[r2][c] === T.GRASS2;
    while (out.length < 110 && tries++ < 2600) {
      const c = 1 + Math.floor(rnd() * (COLS - 2)), r2 = 1 + Math.floor(rnd() * (ROWS - 2));
      let ok = true;
      for (let dr = -1; dr <= 1 && ok; dr++) for (let dc = -1; dc <= 1 && ok; dc++)
        if (solid[r2 + dr][c + dc] || !grassy(r2 + dr, c + dc)) ok = false;
      if (ok && !out.some(t => Math.abs(t.c - c) + Math.abs(t.r - r2) < 3)) out.push({ c, r: r2, v: rnd() < 0.5 ? 0 : 1 });
    }
    for (let r2 = 40; r2 < 92; r2 += 4) for (const c of [76 + (r2 % 3)]) // Quinsigamond State Park edge
      if (c < COLS && grassy(r2, c) && !solid[r2][c]) out.push({ c, r: r2, v: r2 % 2 });
    return out;
  }

  // ----- validation (Node-testable) -----------------------------------------
  function validate() {
    const errors = [];
    const g = geo();
    if (D.terrain.length !== ROWS || D.terrain.some(r2 => r2.length !== COLS)) errors.push("terrain shape");
    buildings.forEach(b => {
      if (b.x < 0 || b.y < 0 || b.x + b.w > COLS || b.y + b.h > ROWS) errors.push(b.id + " out of bounds");
      if (b.enter === "Lobby" && !b.lobby) errors.push(b.id + " enterable without lobby content");
      const [dc, dr] = b.door;
      if ((b.enter || b.lockedMsg) && g.solid[dr][dc]) errors.push(b.id + " door tile is inside a solid");
    });
    // every enterable door must reach a road through non-solid tiles
    buildings.filter(b => b.enter).forEach(b => {
      const [dc, dr] = b.door;
      const seen = new Set([dr + "," + dc]); const q = [[dr, dc]]; let found = false;
      while (q.length && !found) {
        const [y, x] = q.shift();
        if (g.grid[y][x] === T.ROAD) { found = true; break; }
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y + dy, nx = x + dx, k2 = ny + "," + nx;
          if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && !seen.has(k2) && !g.solid[ny][nx]) { seen.add(k2); q.push([ny, nx]); }
        }
      }
      if (!found) errors.push(b.id + " door cannot reach a road");
    });
    // Ryan's structural requirements: MSB touches the hospital; skybridge exists
    const msb = byId("msb"), um = byId("ummmc");
    let touch = false;
    msb.mask.forEach((row, i) => row.forEach((v, j) => {
      if (!v) return;
      const r2 = msb.y + i, c = msb.x + j;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dy, dx]) => { if (g.roofOwner[r2 + dy] && g.roofOwner[r2 + dy][c + dx] === "ummmc") touch = true; });
    }));
    if (!touch) errors.push("msb does not touch ummmc");
    if (!D.skybridge) errors.push("no skybridge between sherman and msb");
    if (um.enter !== "Hospital") errors.push("ummmc must route to the Hospital scene");
    return errors;
  }

  // ==========================================================================
  //  PROCEDURAL PIXEL-ART TEXTURES (browser only)
  // ==========================================================================
  const shade = (c, f) => {
    const r2 = Math.min(255, ((c >> 16) & 255) * f) | 0, g2 = Math.min(255, ((c >> 8) & 255) * f) | 0, b2 = Math.min(255, (c & 255) * f) | 0;
    return (r2 << 16) | (g2 << 8) | b2;
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
    grassTile(0, 0x3f6b41);
    grassTile(32, 0x396239);
    roadTile(64);
    roadTile(96); g.fillStyle(0xd8d4b8, 0.95); g.fillRect(96 + 3, 15, 9, 2); g.fillRect(96 + 19, 15, 9, 2);
    roadTile(128); g.fillStyle(0xd8d4b8, 0.95); g.fillRect(128 + 15, 3, 2, 9); g.fillRect(128 + 15, 19, 2, 9);
    g.fillStyle(0x9ba1a9, 1); g.fillRect(160, 0, 32, 32); g.fillStyle(0x84898f, 1); g.fillRect(160, 0, 32, 1); g.fillRect(160, 0, 1, 32);
    speck(160, 10, [0x8f959c, 0xa8aeb5]); g.fillStyle(0xc6ccd2, 0.6); g.fillRect(160 + 6, 6, 3, 1); g.fillRect(160 + 20, 22, 3, 1);
    roadTile(192); g.fillStyle(0xcfd3d8, 0.85); g.fillRect(192, 2, 2, 13);
    g.fillStyle(0x24486b, 1); g.fillRect(224, 0, 32, 32); speck(224, 8, [0x1f3f5e, 0x2b537a]);
    g.fillStyle(0x35638f, 0.9); g.fillRect(224 + 4, 8, 8, 1); g.fillRect(224 + 18, 20, 9, 1); g.fillRect(224 + 10, 27, 6, 1);
    g.generateTexture("tileset", 256, 32); g.destroy();
  }

  function paintRoof(scene, b) {
    const key = "roof_" + b.id;
    if (scene.textures.exists(key)) return key;
    const wall = P[b.kind] || 0x555f73, roofC = shade(wall, 0.58);
    const g = scene.make.graphics({ add: false });
    const rnd = mulberry32(b.x * 31 + b.y * 7);
    const has = (i, j) => i >= 0 && j >= 0 && i < b.h && j < b.w && b.mask[i][j];
    const interior = [];
    for (let i = 0; i < b.h; i++) for (let j = 0; j < b.w; j++) {
      if (!b.mask[i][j]) continue;
      const x = j * TILE, y = i * TILE;
      g.fillStyle(roofC, 1); g.fillRect(x, y, TILE, TILE);
      for (let s = 0; s < 5; s++) { g.fillStyle(rnd() < .5 ? shade(roofC, 0.85) : shade(roofC, 1.18), 1); g.fillRect(x + Math.floor(rnd() * 30), y + Math.floor(rnd() * 30), 2, 1); }
      if (!has(i - 1, j)) { g.fillStyle(shade(roofC, 1.45), 1); g.fillRect(x, y, TILE, 3); }
      if (!has(i, j - 1)) { g.fillStyle(shade(roofC, 1.3), 1); g.fillRect(x, y, 3, TILE); }
      if (!has(i, j + 1)) { g.fillStyle(shade(roofC, 0.55), 1); g.fillRect(x + TILE - 3, y, 3, TILE); }
      if (!has(i + 1, j)) { g.fillStyle(shade(roofC, 0.5), 1); g.fillRect(x, y + TILE - 4, TILE, 4); }
      if (has(i - 1, j) && has(i + 1, j) && has(i, j - 1) && has(i, j + 1)) interior.push([i, j]);
    }
    // rooftop clutter
    if (b.kind === "plant") {
      interior.slice(0, 2).forEach(([i, j], n) => { const cx = j * TILE + 16, cy = i * TILE + 16; g.fillStyle(0x3c3833, 1); g.fillCircle(cx, cy, 9); g.fillStyle(0x1d1b18, 1); g.fillCircle(cx, cy, 6); });
    } else {
      interior.forEach(([i, j]) => {
        if (rnd() < 0.28) { const ax = j * TILE + 6 + Math.floor(rnd() * 8), ay = i * TILE + 6 + Math.floor(rnd() * 10); g.fillStyle(0x000000, 0.25); g.fillRect(ax + 2, ay + 8, 12, 3); g.fillStyle(0x8b9199, 1); g.fillRect(ax, ay, 12, 8); g.fillStyle(0x6f757d, 1); g.fillRect(ax + 2, ay + 2, 8, 4); }
      });
    }
    if (b.kind === "hospital" && interior.length) {
      let best = interior[0], bd = -1;
      const cx0 = b.w / 2, cy0 = b.h / 2;
      interior.forEach(([i, j]) => { const d = -((i - cy0) ** 2 + (j - cx0) ** 2); if (d > bd) { bd = d; best = [i, j]; } });
      const cx = best[1] * TILE + 16, cy = best[0] * TILE + 16;
      g.lineStyle(3, 0xcfd3d8, 0.9); g.strokeCircle(cx, cy, 20);
      g.fillStyle(0xcfd3d8, 0.9); g.fillRect(cx - 8, cy - 9, 4, 18); g.fillRect(cx + 4, cy - 9, 4, 18); g.fillRect(cx - 6, cy - 2, 12, 4);
    }
    g.generateTexture(key, b.w * TILE, b.h * TILE); g.destroy();
    return key;
  }

  function paintStrip(scene, b, s, n) {
    const key = "wl_" + b.id + "_" + n;
    if (scene.textures.exists(key)) return key;
    const wall = P[b.kind] || 0x555f73;
    const w = s.len * TILE, h = s.hgt * TILE;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(wall, 1); g.fillRect(0, 0, w, h);
    g.fillStyle(shade(wall, 1.25), 1); g.fillRect(0, 0, w, 2);
    g.fillStyle(shade(wall, 0.6), 1); g.fillRect(0, h - 3, w, 3);
    const doorHere = b.side === "s" && s.row === b.door[1] - WALL && b.door[0] >= s.c && b.door[0] < s.c + s.len && s.hgt === 2 && (b.enter || b.lockedMsg);
    const dx = doorHere ? (b.door[0] - s.c) * TILE + 16 : -999;
    for (let cell = 0; cell < s.len; cell++) {
      const x = cell * TILE;
      if (doorHere && Math.abs(x + 16 - dx) < 24) continue;
      if (b.kind === "garage") { g.fillStyle(0x14181e, 1); g.fillRect(x + 4, 10, 24, Math.min(12, h - 16)); g.fillStyle(0x2a3038, 1); g.fillRect(x + 4, 10, 24, 3); }
      else if (s.hgt === 2) {
        g.fillStyle(0x16202e, 1); g.fillRect(x + 10, 10, 12, 20);
        g.fillStyle(0x9fc4e0, 0.9); g.fillRect(x + 11, 11, 10, 3); g.fillRect(x + 11, 15, 3, 6);
        g.fillStyle(shade(wall, 1.3), 1); g.fillRect(x + 9, 30, 14, 2);
      } else { g.fillStyle(0x1a232f, 1); g.fillRect(x + 8, h - 16, 16, 6); }
    }
    if (doorHere) {
      g.fillStyle(0x20262e, 1); g.fillRect(dx - 17, h - 33, 34, 33);
      g.fillStyle(0x2a4a66, 1); g.fillRect(dx - 14, h - 30, 13, 28); g.fillRect(dx + 1, h - 30, 13, 28);
      g.fillStyle(0x9fc4e0, 0.8); g.fillRect(dx - 12, h - 28, 4, 10); g.fillRect(dx + 3, h - 28, 4, 10);
      g.fillStyle(shade(wall, 1.5), 1); g.fillRect(dx - 21, h - 38, 42, 6);
      g.fillStyle(0x000000, 0.3); g.fillRect(dx - 21, h - 32, 42, 3);
      if (b.kind === "hospital") { g.fillStyle(0xe8e6e0, 1); g.fillRect(dx - 30, 4, 60, 13); g.fillStyle(0xb03040, 1); g.fillRect(dx - 4, 6, 9, 4); g.fillRect(dx - 2, 4, 4, 9); }
    }
    g.generateTexture(key, w, h); g.destroy();
    return key;
  }

  function paintSprites(scene) {
    if (scene.textures.exists("t_player")) return;
    let g = scene.make.graphics({ add: false });
    g.fillStyle(0x000000, 0.28); g.fillEllipse(10, 26, 15, 5);
    g.fillStyle(0x2c2620, 1); g.fillRect(5, 0, 10, 5);
    g.fillStyle(0xd9a886, 1); g.fillRect(6, 3, 8, 7); g.fillStyle(0x2c2620, 1); g.fillRect(5, 2, 10, 2);
    g.fillStyle(0x2c4a6e, 1); g.fillRect(4, 10, 12, 9); g.fillRect(2, 11, 2, 6); g.fillRect(16, 11, 2, 6);
    g.fillStyle(0xd9a886, 1); g.fillRect(2, 17, 2, 2); g.fillRect(16, 17, 2, 2);
    g.fillStyle(0xe8e4d8, 1); g.fillRect(12, 12, 2, 3);
    g.fillStyle(0x223a55, 1); g.fillRect(5, 19, 4, 6); g.fillRect(11, 19, 4, 6);
    g.fillStyle(0x1a1a1c, 1); g.fillRect(5, 25, 4, 2); g.fillRect(11, 25, 4, 2);
    g.generateTexture("t_player", 20, 28); g.destroy();
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
    g = scene.make.graphics({ add: false });
    const hp = 5 * TILE;
    g.fillStyle(0x3a3f47, 1); g.fillCircle(hp / 2, hp / 2, hp / 2 - 4);
    g.lineStyle(4, 0xd8d4b8, 1); g.strokeCircle(hp / 2, hp / 2, hp / 2 - 10);
    g.fillStyle(0xd8d4b8, 1); g.fillRect(hp / 2 - 16, hp / 2 - 20, 7, 40); g.fillRect(hp / 2 + 9, hp / 2 - 20, 7, 40); g.fillRect(hp / 2 - 12, hp / 2 - 4, 24, 8);
    g.generateTexture("t_helipad", hp, hp); g.destroy();
    // east-entrance canopy + skybridge
    g = scene.make.graphics({ add: false });
    g.fillStyle(0x000000, 0.3); g.fillRect(2, 24, 24, 4);
    g.fillStyle(0x20262e, 1); g.fillRect(0, 0, 6, 26);
    g.fillStyle(0x2a4a66, 1); g.fillRect(1, 3, 4, 21);
    g.fillStyle(0x8a919b, 1); g.fillRect(4, 0, 22, 6); g.fillStyle(0x6e7789, 1); g.fillRect(4, 6, 22, 2);
    g.generateTexture("t_canopy", 28, 30); g.destroy();
    if (D.skybridge) {
      const sw = Math.max(1, D.skybridge.w) * TILE + 24;
      g = scene.make.graphics({ add: false });
      g.fillStyle(0x39477c, 1); g.fillRect(0, 6, sw, 30);
      g.fillStyle(0x4a5a94, 1); g.fillRect(0, 0, sw, 8);
      g.fillStyle(0x16202e, 1); for (let x = 5; x + 8 < sw; x += 14) g.fillRect(x, 14, 8, 14);
      g.fillStyle(0x9fc4e0, 0.7); for (let x = 5; x + 8 < sw; x += 14) g.fillRect(x + 1, 15, 6, 4);
      g.fillStyle(0x232c4e, 1); g.fillRect(0, 33, sw, 3);
      g.generateTexture("t_skybridge", sw, 36); g.destroy();
    }
  }

  // ----- overworld renderer --------------------------------------------------
  function drawBuildings(scene, solids) {
    const gg = geo();
    const shadows = scene.add.graphics().setDepth(2);
    const portals = [];
    buildings.forEach(b => {
      scene.add.image(b.x * TILE, b.y * TILE, paintRoof(scene, b)).setOrigin(0).setDepth(6);
      gg.strips[b.id].forEach((s, n) => {
        scene.add.image(s.c * TILE, s.row * TILE, paintStrip(scene, b, s, n)).setOrigin(0).setDepth((s.row + s.hgt) * TILE);
        shadows.fillStyle(0x000000, 0.22).fillRect(s.c * TILE + 4, (s.row + s.hgt) * TILE - 2, s.len * TILE, 7);
      });
      const d = doorFor(b);
      if (b.side === "e") scene.add.image(d.x - 22, d.y - 14, "t_canopy").setOrigin(0).setDepth(d.y + 16);
      const nm = scene.add.text(b.x * TILE + b.w * TILE / 2, b.y * TILE - 6, b.name,
        { fontFamily: "monospace", fontSize: (b.major ? 12 : 10) + "px", color: "#dfe6f2", backgroundColor: "#0e142099", padding: { x: 4, y: 2 } })
        .setOrigin(0.5, 1).setAlpha(b.major ? 0.95 : 0.7).setDepth(99998);
      if (b.enter || b.lockedMsg) portals.push({ b, x: d.x, y: d.y, w: 70, h: 44 });
    });
    gg.runs.forEach(r2 => {
      const z = scene.add.zone((r2.x + r2.w / 2) * TILE, (r2.y + 0.5) * TILE, r2.w * TILE, TILE);
      scene.physics.add.existing(z, true); solids.add(z);
    });
    if (D.skybridge) {
      const sb = D.skybridge;
      scene.add.image(sb.x * TILE - 12, sb.row * TILE - 6, "t_skybridge").setOrigin(0).setDepth(200000);
      shadows.fillStyle(0x000000, 0.18).fillRect(sb.x * TILE - 8, sb.row * TILE + 30, sb.w * TILE + 16, 8);
    }
    return portals;
  }

  // ----- campus map SVG (from the same data) ---------------------------------
  function mapSvgInner() {
    const gg = geo();
    const kindFill = (b) => b.enter ? (b.kind === "hospital" ? "#a84a56" : b.kind === "clinical" ? "#3a7a8c" : "#41609f") : "#39404d";
    let s = '<rect x="0" y="0" width="' + COLS + '" height="' + ROWS + '" fill="#152618"/>';
    const tfill = { r: "#313947", s: "#8a9199", p: "#232b38" };
    for (const ch of ["p", "r", "s"]) {
      for (let r2 = 0; r2 < ROWS; r2++) {
        let c = 0;
        while (c < COLS) {
          if (D.terrain[r2][c] === ch) { let len = 0; while (c + len < COLS && D.terrain[r2][c + len] === ch) len++; s += '<rect x="' + c + '" y="' + r2 + '" width="' + len + '" height="1" fill="' + tfill[ch] + '"/>'; c += len; }
          else c++;
        }
      }
    }
    s += '<circle cx="' + (D.helipad.x + 2.5) + '" cy="' + (D.helipad.y + 2.5) + '" r="2" fill="none" stroke="#8a919b" stroke-width="0.4"/>';
    buildings.forEach(b => {
      let cells = "";
      for (let i = 0; i < b.h; i++) {
        let j = 0;
        while (j < b.w) {
          if (b.mask[i][j]) { let len = 0; while (j + len < b.w && b.mask[i][j + len]) len++; cells += '<rect x="' + (b.x + j) + '" y="' + (b.y + i) + '" width="' + len + '" height="1"/>'; j += len; }
          else j++;
        }
      }
      s += '<g fill="' + kindFill(b) + '"' + (b.enter ? ' class="mapb" data-b="' + b.id + '"' : ' opacity="0.8"') + '><title>' + b.name + (b.enter ? " — click to travel" : "") + "</title>" + cells + "</g>";
      if (b.major) s += '<text class="maplbl" x="' + (b.x + b.w / 2) + '" y="' + (b.y - 0.8) + '" text-anchor="middle" font-size="1.9" fill="#cfd8ea">' + (b.short || b.name) + "</text>";
    });
    if (D.skybridge) s += '<rect x="' + (D.skybridge.x - 0.3) + '" y="' + (D.skybridge.row - 0.2) + '" width="' + (D.skybridge.w + 0.6) + '" height="1.4" fill="#4a5a94"/>';
    return s;
  }

  // ----- interiors (unchanged painters) --------------------------------------
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
      g.fillStyle(0xdde1e6, 0.55); g.fillRect(6, 4, 10, 2); g.fillRect(18, 20, 8, 2);
    });
    tex("t_iwall", 32, 82, (g) => {
      g.fillStyle(0x3a4150, 1); g.fillRect(0, 0, 32, 12);
      g.fillStyle(0x596273, 1); g.fillRect(0, 12, 32, 60);
      g.fillStyle(0x6e7789, 1); g.fillRect(0, 52, 32, 2);
      g.fillStyle(0x4a5262, 1); g.fillRect(0, 54, 32, 18);
      g.fillStyle(0x2b303c, 1); g.fillRect(0, 72, 32, 6);
      g.fillStyle(0x000000, 0.22); g.fillRect(0, 78, 32, 4);
    });
    tex("t_desk", 128, 62, (g) => {
      g.fillStyle(0x000000, 0.25); g.fillRect(4, 56, 124, 6);
      g.fillStyle(0x9a7a56, 1); g.fillRect(0, 0, 128, 22);
      g.fillStyle(0xb08c62, 1); g.fillRect(0, 0, 128, 3);
      g.fillStyle(0x6d5238, 1); g.fillRect(0, 22, 128, 36);
      for (let x = 6; x < 122; x += 24) { g.fillStyle(0x5d4630, 1); g.fillRect(x, 27, 16, 26); }
      g.fillStyle(0xdfe3e8, 1); g.fillRect(50, 4, 16, 11); g.fillStyle(0x69a7d2, 1); g.fillRect(51, 5, 14, 8);
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
    tex("t_kiosk", 22, 32, (g) => {
      g.fillStyle(0x000000, 0.22); g.fillEllipse(11, 30, 16, 4);
      g.fillStyle(0x4a5262, 1); g.fillRect(9, 12, 4, 17);
      g.fillStyle(0x2b303c, 1); g.fillRect(1, 0, 20, 14);
      g.fillStyle(0x69d2e7, 1); g.fillRect(3, 2, 16, 10); g.fillStyle(0xffffff, 0.85); g.fillRect(5, 4, 8, 2); g.fillRect(5, 8, 12, 1);
    });
    tex("t_board", 72, 44, (g) => {
      g.fillStyle(0x5a4632, 1); g.fillRect(0, 0, 72, 44);
      g.fillStyle(0xa8895c, 1); g.fillRect(3, 3, 66, 38);
      const cols = [0xf2efe6, 0xd7e6f2, 0xf2e6b8, 0xe6d2d2];
      const r2 = mulberry32(5);
      for (let i = 0; i < 6; i++) { const x = 6 + Math.floor(r2() * 52), y = 6 + Math.floor(r2() * 24); g.fillStyle(cols[i % 4], 1); g.fillRect(x, y, 9, 11); g.fillStyle(0x9aa0a8, 1); g.fillRect(x + 1, y + 3, 7, 1); g.fillRect(x + 1, y + 6, 5, 1); }
    });
    tex("t_bed", 36, 56, (g) => {
      g.fillStyle(0x000000, 0.22); g.fillRect(2, 50, 34, 5);
      g.fillStyle(0x4a5262, 1); g.fillRect(0, 0, 36, 8);
      g.fillStyle(0x6e7789, 1); g.fillRect(0, 0, 36, 2);
      g.fillStyle(0xe8eaee, 1); g.fillRect(2, 8, 32, 36);
      g.fillStyle(0xf7f8fa, 1); g.fillRect(6, 10, 24, 8);
      g.fillStyle(0xc9ccd2, 1); g.fillRect(6, 17, 24, 1);
      g.fillStyle(0x4a8a8c, 1); g.fillRect(2, 22, 32, 22);
      g.fillStyle(0x5fa3a5, 1); g.fillRect(2, 22, 32, 3);
      g.fillStyle(0x3a6f71, 1); g.fillRect(2, 41, 32, 3);
      g.fillStyle(0x4a5262, 1); g.fillRect(0, 44, 36, 8);
      g.fillStyle(0x2b303c, 1); g.fillRect(0, 50, 36, 2);
    });
    tex("t_carm", 56, 62, (g) => {
      g.fillStyle(0x000000, 0.22); g.fillEllipse(28, 57, 40, 7);
      g.fillStyle(0x39404d, 1); g.fillRect(18, 42, 22, 14);
      g.fillStyle(0x4a5262, 1); g.fillRect(18, 42, 22, 3);
      g.fillStyle(0x596273, 1); g.fillRect(25, 28, 8, 16);
      g.lineStyle(6, 0xd3d7dd, 1);
      g.beginPath(); g.arc(28, 22, 16, Math.PI * 0.75, Math.PI * 2.25, false); g.strokePath();
      g.fillStyle(0x2b303c, 1); g.fillRect(12, 2, 14, 10);
      g.fillStyle(0x2b303c, 1); g.fillRect(14, 32, 12, 8);
      g.fillStyle(0x69d2e7, 1); g.fillRect(42, 8, 3, 3);
    });
    tex("t_elev", 60, 76, (g) => {
      g.fillStyle(0x2b303c, 1); g.fillRect(0, 0, 60, 76);
      g.fillStyle(0x6e7789, 1); g.fillRect(2, 2, 56, 72);
      g.fillStyle(0x9ba1a9, 1); g.fillRect(6, 12, 22, 58); g.fillRect(32, 12, 22, 58);
      g.fillStyle(0xc4c9cf, 1); g.fillRect(6, 12, 22, 3); g.fillRect(32, 12, 22, 3);
      g.fillStyle(0x14181e, 1); g.fillRect(28, 12, 4, 58);
      g.fillStyle(0x14181e, 1); g.fillRect(20, 3, 20, 7);
      g.fillStyle(0xe0693a, 1); g.fillRect(27, 5, 6, 3);
    });
    tex("t_stairs", 64, 76, (g) => {
      g.fillStyle(0x1c222d, 1); g.fillRect(0, 0, 64, 76);
      const shades = [0x39404d, 0x454d5c, 0x525a6a, 0x5f6879, 0x6c7688];
      shades.forEach((c, i) => { g.fillStyle(c, 1); g.fillRect(6, 66 - i * 13, 52, 13); });
      g.fillStyle(0x8a919b, 1); g.fillRect(6, 10, 52, 3);
      g.fillStyle(0x8a919b, 1); g.fillRect(6, 10, 3, 60); g.fillRect(55, 10, 3, 60);
    });
  }

  function ensureTextures(scene) {
    if (!scene.textures.exists("tileset")) paintTileset(scene);
    paintSprites(scene);
    // roofs/strips are painted lazily by drawBuildings
  }

  const api = {
    TILE, COLS, ROWS, WALL, WPX, HPX, T,
    buildings, byId, doorFor, buildGrid, treeList, validate, geo,
    labels: D.labels, helipad: D.helipad, skybridge: D.skybridge,
    ensureTextures, drawBuildings, mapSvgInner, paintInterior, shade, mulberry32,
    spawnDefault: { x: (D.spawn.x + 0.5) * TILE, y: (D.spawn.y + 0.5) * TILE },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IRWorld = api;
})(typeof window !== "undefined" ? window : globalThis);
