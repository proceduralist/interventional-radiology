/* World-layout invariants for the relationship-based UMass Chan campus
   (Ryan's road/water/building grid). Run: node game/tests/world.test.js */
"use strict";
const assert = require("assert");
const W = require("../js/world.js");
const D = require("../js/world_data.js");
const R = D.roads;
const g = W.geo();
const ROAD = W.T.ROAD, WATER = W.T.WATER;

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };
console.log("world.test.js");

ok("layout validates with no errors", () => {
  const errs = W.validate();
  assert.deepStrictEqual(errs, [], "validation errors:\n  " + errs.join("\n  "));
});

ok("terrain is COLS×ROWS", () => {
  assert.strictEqual(D.terrain.length, W.ROWS);
  assert.ok(D.terrain.every(r => r.length === W.COLS));
});

ok("the campus buildings are present with footprints", () => {
  ["sherman", "msb", "ummmc", "dimare", "lazare", "acc", "powerplant"].forEach(id => {
    const b = W.byId(id);
    assert.ok(b, id + " missing");
    assert.ok(b.mask.flat().filter(Boolean).length >= 4, id + " footprint too small");
  });
});

ok("horizontal roads are 3 TILES WIDE and full width (only Route 9 bridges the lake)", () => {
  const inLake = (c) => R.water.indexOf(c) !== -1;
  [R.north, R.south, R.route9].forEach(y => {
    [y - 1, y, y + 1].forEach(yy => {
      for (let c = 0; c < W.COLS; c++) {
        if (inLake(c) && y !== R.route9) assert.strictEqual(g.grid[yy][c], WATER, "N/S road stops at the lake (y=" + yy + " c=" + c + ")");
        else assert.strictEqual(g.grid[yy][c], ROAD, "road y=" + yy + " c=" + c + " not road");
      }
    });
  });
  assert.strictEqual(R.width, 3, "roads meta declares the 3-tile width");
});

ok("vertical roads are 3 TILES WIDE: Plantation W of the buildings, Lake Ave E, full height", () => {
  [R.plantation, R.lakeAve].forEach(x => {
    [x - 1, x, x + 1].forEach(xx => {
      for (let r = 0; r < W.ROWS; r++) assert.strictEqual(g.grid[r][xx], ROAD, "vroad x=" + xx + " r=" + r);
    });
  });
  assert.ok(R.plantation + 1 < W.byId("sherman").x, "Plantation is west of the buildings");
  assert.ok(R.lakeAve - 1 > W.byId("ummmc").x + W.byId("ummmc").w, "Lake Ave is east of the buildings");
});

ok("no road overlaps any building footprint or its wall face", () => {
  // the only solid a road tile may coincide with is the lake (the N/S roads end there)
  [R.north, R.south, R.route9].forEach(y => {
    [y - 1, y, y + 1].forEach(yy => {
      for (let c = 0; c < W.COLS; c++) assert.ok(!g.solid[yy][c] || g.grid[yy][c] === WATER, "road y=" + yy + " c=" + c + " over a building");
    });
  });
});

ok("water is a full-height column E of Lake Ave; impassable except at the single Route 9 bridge", () => {
  R.water.forEach(x => {
    assert.ok(x > R.lakeAve, "water east of Lake Ave");
    for (let r = 0; r < W.ROWS; r++) {
      const bridge = Math.abs(r - R.route9) <= 1;      // ONLY Route 9 bridges the lake now (Ryan)
      if (bridge) { assert.strictEqual(g.grid[r][x], ROAD, "bridge is road"); assert.ok(!g.solid[r][x], "bridge walkable"); }
      else { assert.strictEqual(g.grid[r][x], WATER, "open water tile"); assert.ok(g.solid[r][x], "open water impassable"); }
    }
  });
});

ok("the lake is widened 2 tiles W (5 columns) with exactly one bridge", () => {
  assert.strictEqual(R.water.length, 5, "lake is 5 columns wide");
  const bridged = [R.north, R.south, R.route9].filter(y => R.water.every(x => g.grid[y][x] === ROAD));
  assert.deepStrictEqual(bridged, [R.route9], "only Route 9 bridges the lake");
});

ok("building relationships hold (Memorial abuts MedSchool SE, Sherman W, ACC S of south road)", () => {
  const msb = W.byId("msb"), um = W.byId("ummmc"), sh = W.byId("sherman"), acc = W.byId("acc");
  assert.strictEqual(um.y, msb.y + msb.h, "Memorial north edge abuts MedSchool south edge");
  assert.ok(um.x >= msb.x && um.x + um.w <= msb.x + msb.w, "Memorial (9) within MedSchool span (20)");
  assert.ok(sh.x + sh.w <= msb.x, "Sherman is west of MedSchool");
  assert.strictEqual(sh.y, msb.y, "Sherman & MedSchool north-aligned");
  assert.strictEqual(acc.y, R.south + 2, "ACC sits 1 tile south of the south road");
  assert.strictEqual(msb.y - R.north, 3, "north road is 2 tiles clear of the buildings");
});

ok("MedSchool SE directly connects to the hospital (contiguous roofs)", () => {
  const msb = W.byId("msb");
  let touch = false;
  msb.mask.forEach((row, i) => row.forEach((v, j) => {
    if (!v) return;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dy, dx]) => {
      const r = msb.y + i + dy, c = msb.x + j + dx;
      if (g.roofOwner[r] && g.roofOwner[r][c] === "ummmc") touch = true;
    });
  }));
  assert.ok(touch, "MedSchool touches the hospital");
});

ok("helipad + power plant sit in the gap between the buildings and Lake Ave", () => {
  const pp = W.byId("powerplant"), um = W.byId("ummmc");
  assert.ok(pp.x >= um.x + um.w && pp.x + pp.w < R.lakeAve, "power plant in the east gap");
  assert.ok(W.helipad.x > um.x + um.w && W.helipad.x + 5 < R.lakeAve, "helipad in the east gap");
});

ok("two skybridges (Sherman↔MedSchool, Sherman↔DiMare) with walkable ground beneath", () => {
  assert.strictEqual(W.skybridges.length, 2);
  W.skybridges.forEach(sb => {
    for (let i = 0; i < (sb.h || 1); i++) for (let j = 0; j < (sb.w || 1); j++)
      assert.ok(!g.solid[sb.y + i][sb.x + j], "skybridge tile over a solid at " + (sb.x + j) + "," + (sb.y + i));
  });
});

ok("hospital routes to Hospital scene; lobbies have content; enterable doors reach a road", () => {
  assert.strictEqual(W.byId("ummmc").enter, "Hospital");
  W.buildings.filter(b => b.enter === "Lobby").forEach(b => assert.ok(b.lobby && b.lobby.pois.length >= 1, b.id + " lobby"));
  W.buildings.filter(b => b.enter || b.lockedMsg).forEach(b => { const [c, r] = b.door; assert.ok(!g.solid[r][c], b.id + " door solid"); });
});

ok("spawn is walkable; trees avoid solids and stay on grass", () => {
  const c = Math.floor(W.spawnDefault.x / W.TILE), r = Math.floor(W.spawnDefault.y / W.TILE);
  assert.ok(!g.solid[r][c], "spawn walkable");
  W.treeList().forEach(t => {
    assert.ok(!g.solid[t.r][t.c], "tree in solid at " + t.c + "," + t.r);
    assert.ok(g.grid[t.r][t.c] <= 1, "tree on non-grass at " + t.c + "," + t.r);
  });
});

console.log("world.test.js — " + n + " passed");
