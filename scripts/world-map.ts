// ============================================================
//  WORLD MAP GENERATOR - bun scripts/world-map.ts
// ------------------------------------------------------------
//  Builds "World Map.html": an interactive top-down map of the
//  ENTIRE world, generated from the real game code - the same
//  getTerrainHeight / road spline / jump / bank / playground data
//  the game itself runs on, so the map can never drift from the
//  world. Click anything on the map and the panel explains what
//  it is AND which file makes it - it doubles as a guided tour
//  of the codebase for Josh.
//
//  Re-run after any world change (new corner, new jump, new
//  playground toy) and commit the refreshed HTML.
// ============================================================

import {
  BANKS,
  JUMPS,
  PLAYGROUNDS,
  ROAD_DENSE,
  ROAD_RIBBON_HALF,
  START_LINE_T,
  WORLD_SIZE,
  getSpawn,
  getTerrainHeight,
  nearestRoadPoint,
  roadSpline,
} from '../src/core/terrain'

// ---------- terrain height grid (browser renders it to canvas) ----------

const RES = 512
const heights = new Float32Array(RES * RES)
let hMin = Infinity
let hMax = -Infinity
for (let iz = 0; iz < RES; iz++) {
  const z = (iz / (RES - 1)) * WORLD_SIZE - WORLD_SIZE / 2
  for (let ix = 0; ix < RES; ix++) {
    const x = (ix / (RES - 1)) * WORLD_SIZE - WORLD_SIZE / 2
    const h = getTerrainHeight(x, z)
    heights[ix + iz * RES] = h
    if (h < hMin) hMin = h
    if (h > hMax) hMax = h
  }
}
const u16 = new Uint16Array(RES * RES)
for (let i = 0; i < u16.length; i++) {
  u16[i] = Math.round(((heights[i] - hMin) / (hMax - hMin)) * 65535)
}
const heightsB64 = Buffer.from(u16.buffer).toString('base64')

// ---------- road ribbon polyline (decimated, with width + bank) ----------

const D = ROAD_DENSE
const STEP = 8 // every 8th dense sample: ~7.6 m apart, plenty for a map
const road: number[][] = []
for (let i = 0; i < D.count; i += STEP) {
  road.push([
    +D.x[i].toFixed(1),
    +D.z[i].toFixed(1),
    +(ROAD_RIBBON_HALF + D.flare[i]).toFixed(2),
    +Math.hypot(D.bx[i], D.bz[i]).toFixed(3),
  ])
}

// ---------- named places + the code that makes them ----------

interface Marker {
  x: number
  z: number
  icon: string
  cls: string
  title: string
  what: string
  code: string
  tryThis?: string
}

const markers: Marker[] = []

const spawn = getSpawn()
markers.push({
  x: spawn.position.x,
  z: spawn.position.z,
  icon: '🚗',
  cls: 'start',
  title: 'Where you start',
  what: 'The car spawns here, on the start line, pointing down the south straight.',
  code: 'src/core/terrain.ts -> getSpawn() reads START_LINE_T, which is anchored to a world position on the straight.',
  tryThis: 'In multiplayer everyone spawns here, scattered sideways so nobody lands on anyone.',
})

const sl = roadSpline.getPointAt(START_LINE_T)
markers.push({
  x: sl.x,
  z: sl.z,
  icon: '🏁',
  cls: 'start',
  title: 'Start / finish line',
  what: 'Laps are timed from here, all the way round, back to here. Miss a checkpoint (by cutting across the grass) and the lap is void.',
  code: 'src/core/terrain.ts -> START_LINE_T places it; src/vehicle/lapTracker.ts does the timing and the anti-cheat; src/world/StartLine.tsx paints it.',
})

for (const [ji, j] of JUMPS.entries()) {
  markers.push({
    x: j.anchor[0],
    z: j.anchor[1],
    icon: '⛰️',
    cls: 'jump',
    title: `Crest jump ${ji + 1}`,
    what: `A ${j.rise} m rise built into the road itself - hit it flat out and both wheels leave the ground. A dip ${j.dropAt} m later means you land on a downslope instead of slamming.`,
    code: 'src/core/terrain.ts -> JUMPS. Each jump is just numbers: rise, width (sigma), and where the landing dip sits.',
    tryThis: `Change rise: ${j.rise} to something bigger in JUMPS and the whole hill grows - road, physics, everything.`,
  })
}

const bankNames = ['The hairpin', 'The sweep after the hairpin', 'Last corner onto the south straight']
for (const [bi, b] of BANKS.entries()) {
  markers.push({
    x: b.anchor[0],
    z: b.anchor[1],
    icon: '🌀',
    cls: 'bank',
    title: `Banked corner - ${bankNames[bi] ?? 'corner'}`,
    what: `The road here tilts like a velodrome: the outside edge is raised (slope ${b.slope}, so about ${(b.slope * 10).toFixed(1)} m per 10 m of road width), held for ${b.holdM} m of corner. The tilt pushes the car into the turn so you can carry real speed.`,
    code: 'src/core/terrain.ts -> BANKS. One line per corner; the code works out which way the corner turns by itself. The collider, terrain and drawn road all inherit the tilt from getTerrainHeight().',
    tryThis: `Change slope: ${b.slope} - 0.1 is gentle, 0.25 is a wall of death. Save and drive it.`,
  })
}

const pgIcon: Record<string, string> = {
  kicker: '📐',
  double: '🐫',
  bowl: '🥣',
  table: '🛬',
  ramp: '📐',
  bigair: '🪂',
}
for (const p of PLAYGROUNDS) {
  markers.push({
    x: p.x,
    z: p.z,
    icon: pgIcon[p.kind] ?? '⭐',
    cls: 'play',
    title: `${p.kind.toUpperCase()} - playground landform`,
    what: p.what,
    code: 'src/core/terrain.ts -> PLAYGROUNDS. Each toy is a position, a heading and a kind; playgroundHeight() sculpts the actual hill out of smooth bumps (gaussians).',
    tryThis: 'Add your own line to PLAYGROUNDS - pick an empty spot on this map, choose a kind, and a new hill appears in the world.',
  })
}

// Sun shards - mirror of buildShards() in src/world/Delights.tsx (kept tiny and
// in sync by hand; the map shows where to LOOK, the game owns the truth).
{
  const wrap = (t: number) => ((t % 1) + 1) % 1
  const along = (m: number) => m / roadSpline.getLength()
  const lateral = (t: number, m: number) => {
    const tan = roadSpline.getTangentAt(wrap(t))
    const l = Math.hypot(tan.x, tan.z) || 1
    return [(tan.z / l) * m, (-tan.x / l) * m]
  }
  const at = (t: number, lat: number): [number, number] => {
    const p = roadSpline.getPointAt(wrap(t))
    const [ox, oz] = lateral(t, lat)
    return [p.x + ox, p.z + oz]
  }
  const jump1 = nearestRoadPoint(70, -412).t
  const jump2 = nearestRoadPoint(150, 472).t
  const hairpin = nearestRoadPoint(8, 168).t
  const switchbackIn = nearestRoadPoint(190, 172).t
  const shardDefs: [t: number, lat: number, where: string, hidden: boolean][] = [
    [0.03, 0, 'south straight, first one you meet', false],
    [jump1 + along(30), 0, 'in the AIR over crest jump 1 - you have to jump for it', false],
    [0.15, -3.2, 'turn 1 entry, on the racing line', false],
    [0.255, 3.4, 'east sweeper, outside line', false],
    [0.395, 0, 'switchback inbound leg', false],
    [hairpin + along(6), 24, 'HIDDEN behind the hairpin', true],
    [0.53, -2.8, 'hairpin exit, inside line', false],
    [jump2 + along(30), 0, 'in the AIR over crest jump 2', false],
    [0.815, 3.0, 'west sweeper', false],
    [switchbackIn, -42, 'HIDDEN on the ridge between the switchback legs', true],
  ]
  for (const [t, lat, where, hidden] of shardDefs) {
    const [x, z] = at(t, lat)
    markers.push({
      x,
      z,
      icon: '✦',
      cls: hidden ? 'shardHidden' : 'shard',
      title: hidden ? 'Sun shard (hidden!)' : 'Sun shard',
      what: `One of the 10 collectables: ${where}.`,
      code: 'src/world/Delights.tsx -> buildShards(). Every shard is placed by road position (a number from 0 to 1 around the lap), so if the track is ever redrawn the shards move with it.',
    })
  }
}

// Things that have no fixed spot on purpose
markers.push({
  x: -80,
  z: 320,
  icon: '🌾',
  cls: 'note',
  title: 'Hay bales, crate towers, barrel rings',
  what: 'The smashables scatter to NEW random open spots every time you reset (every multiplayer race deals a fresh shared layout). That is why they are not pinned on this map - no two rounds match.',
  code: 'src/world/CrashProps.tsx -> scatterAll(round). The round number seeds the randomness, so a round is repeatable but each one is different.',
})
markers.push({
  x: -180,
  z: -230,
  icon: '🌳',
  cls: 'note',
  title: '1,342 trees (and the rocks, and the grass)',
  what: 'Scattered by seeded randomness across the bowl - never on the road, never on a playground. Hit a tree above the smash speed and it bursts away; below it, solid crunch.',
  code: 'src/world/Trees.tsx + scatter.ts place them; treeSmash.ts decides crunch vs smash; CONFIG.treeSmashKmh in src/core/config.ts is the knob.',
  tryThis: 'Josh: set treeSmashKmh: 1 in config.ts and become the forestry industry.',
})

// area labels - just names painted on the map, taken from the circuit comments
const labels = [
  { x: -100, z: -440, text: 'SOUTH STRAIGHT' },
  { x: 470, z: -270, text: 'TURN 1' },
  { x: 530, z: -60, text: 'EAST SWEEPER' },
  { x: 300, z: 130, text: 'SWITCHBACK' },
  { x: -60, z: 190, text: 'HAIRPIN' },
  { x: 150, z: 510, text: 'NORTH STRAIGHT' },
  { x: -480, z: 160, text: 'WEST SWEEPER' },
  { x: -470, z: -350, text: 'LAST CORNER' },
  { x: 0, z: -80, text: 'THE INFIELD' },
]

// ---------- emit ----------

const data = {
  world: WORLD_SIZE,
  res: RES,
  hMin: +hMin.toFixed(2),
  hMax: +hMax.toFixed(2),
  heights: heightsB64,
  road,
  markers: markers.map((m) => ({ ...m, x: +m.x.toFixed(1), z: +m.z.toFixed(1) })),
  labels,
  built: new Date().toISOString().slice(0, 10),
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sundown Run - World Map</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --cream: #F2E8D5; --amber: #FFB35C; --panel: #241B14; --edge: rgba(255,179,92,.25);
  }
  * { box-sizing: border-box; margin: 0; }
  body { display: flex; height: 100vh; background: #1A1410; color: var(--cream);
         font-family: system-ui, sans-serif; overflow: hidden; }
  #map { flex: 1; position: relative; cursor: grab; }
  #map.dragging { cursor: grabbing; }
  #map svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  #side { width: 400px; padding: 22px 24px; background: var(--panel); border-left: 1px solid var(--edge);
          overflow-y: auto; }
  h1 { font-size: 19px; letter-spacing: .12em; color: var(--amber); }
  .sub { font-size: 12px; opacity: .6; margin: 4px 0 16px; }
  #info h2 { font-size: 16px; color: var(--amber); margin: 0 0 8px; }
  #info p { font-size: 13.5px; line-height: 1.55; margin-bottom: 10px; }
  .codebox { background: #17110C; border: 1px solid var(--edge); border-radius: 8px;
             padding: 10px 12px; font: 12px/1.5 ui-monospace, monospace; color: #E8C99A;
             margin-bottom: 10px; word-break: break-word; }
  .try { border-left: 3px solid var(--amber); padding: 6px 10px; font-size: 13px;
         background: rgba(255,179,92,.07); border-radius: 0 6px 6px 0; }
  .hint { font-size: 12.5px; opacity: .65; line-height: 1.5; }
  .legend { display: grid; grid-template-columns: 22px 1fr; gap: 4px 8px; font-size: 12.5px;
            margin: 14px 0; align-items: center; }
  .pipeline { margin-top: 18px; border-top: 1px solid var(--edge); padding-top: 14px; }
  .pipeline h3 { font-size: 13px; letter-spacing: .1em; color: var(--amber); margin-bottom: 8px; }
  .pipeline ol { padding-left: 18px; font-size: 12.5px; line-height: 1.7; }
  .pipeline code { color: #E8C99A; font-size: 11.5px; }
  .mk { cursor: pointer; }
  .mk text.ic { font-size: 15px; text-anchor: middle; dominant-baseline: central;
                paint-order: stroke; stroke: rgba(20,14,9,.65); stroke-width: 2.5px; }
  .mk.sel circle { stroke: #fff; stroke-width: 2; }
  .arealabel { font-size: 15px; letter-spacing: .3em; fill: rgba(242,232,213,.5);
               text-anchor: middle; font-weight: 600; pointer-events: none; }
  #zoomhint { position: absolute; left: 12px; bottom: 10px; font-size: 11.5px; opacity: .45; }
</style>
</head>
<body>
<div id="map">
  <svg id="svg"><g id="view"></g></svg>
  <div id="zoomhint">scroll to zoom &middot; drag to pan &middot; click a marker</div>
</div>
<aside id="side">
  <h1>SUNDOWN RUN &mdash; WORLD MAP</h1>
  <div class="sub">Drawn from the real game code &middot; ${data.built} &middot; regenerate: <b>bun scripts/world-map.ts</b></div>
  <div id="info">
    <p class="hint">This whole 2 km &times; 2 km world is <b>grown from code</b> - there is no
    hand-drawn level file. A few hundred lines in <b>src/core/terrain.ts</b> decide where the
    hills, the road, the jumps and the banked corners go, and everything else (physics,
    grass, trees, shadows) reads from that one source of truth.</p>
    <p class="hint">Click any marker to see what it is <i>and which bit of code makes it</i>.</p>
    <div class="legend">
      <span>🏁</span><span>start / finish + spawn</span>
      <span>⛰️</span><span>crest jumps (built into the road)</span>
      <span>🌀</span><span>banked corners</span>
      <span>🪂</span><span>playground landforms (16 of them)</span>
      <span>✦</span><span>sun shards (gold = easy, violet = hidden)</span>
      <span>🌾</span><span>notes - things with no fixed spot</span>
    </div>
    <div class="pipeline">
      <h3>HOW THE WORLD GETS MADE (in order)</h3>
      <ol>
        <li>Rolling hills from layered noise - <code>getBaseHeight()</code></li>
        <li>A mountain rim traps the valley - <code>rimHeightAt()</code></li>
        <li>The road is drawn as 44 points, smoothed into a 3.9 km loop - <code>CIRCUIT</code></li>
        <li>The ground is carved flat along it - <code>getTerrainHeight()</code></li>
        <li>Jumps rise out of the road itself - <code>JUMPS</code></li>
        <li>Three corners get tilted like velodromes - <code>BANKS</code></li>
        <li>Playground toys are sculpted from smooth bumps - <code>PLAYGROUNDS</code></li>
        <li>Trees, rocks, grass, props and shards scatter on top - <code>src/world/</code></li>
      </ol>
      <p class="hint" style="margin-top:8px">The physics collider samples the exact same
      heights the meshes are drawn from - the car lands on what you see.</p>
    </div>
  </div>
</aside>
<script>
const DATA = ${JSON.stringify(data)};

// ---------- decode heights ----------
const RES = DATA.res, W = DATA.world;
const raw = atob(DATA.heights);
const u16 = new Uint16Array(RES * RES);
for (let i = 0; i < u16.length; i++) u16[i] = raw.charCodeAt(2*i) | (raw.charCodeAt(2*i+1) << 8);
const hAt = (ix, iz) => DATA.hMin + (u16[Math.min(RES-1,ix) + Math.min(RES-1,iz)*RES] / 65535) * (DATA.hMax - DATA.hMin);

// ---------- render terrain to a canvas, hillshaded, game palette ----------
const cv = document.createElement('canvas');
cv.width = RES; cv.height = RES;
const ctx = cv.getContext('2d');
const img = ctx.createImageData(RES, RES);
const px = W / RES; // metres per pixel
const mix = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
const GOLD = [201,168,92], OLIVE = [122,139,79], ROCK = [110,98,80], HAZE = [152,160,188], DARK = [82,74,61];
for (let iz = 0; iz < RES; iz++) {
  for (let ix = 0; ix < RES; ix++) {
    const h = hAt(ix, iz);
    const dhx = (hAt(ix+1, iz) - hAt(Math.max(0,ix-1), iz)) / (2*px);
    const dhz = (hAt(ix, iz+1) - hAt(ix, Math.max(0,iz-1))) / (2*px);
    const slope = Math.hypot(dhx, dhz);
    let r, g, b;
    // valley floor gold -> olive on the slopes, rock on the steeps, haze up the rim
    const t1 = mix(0, 1, slope * 2.2);
    r = mix(GOLD[0], OLIVE[0], t1); g = mix(GOLD[1], OLIVE[1], t1); b = mix(GOLD[2], OLIVE[2], t1);
    const t2 = mix(0, 1, (slope - 0.30) * 4);
    r = mix(r, ROCK[0], t2); g = mix(g, ROCK[1], t2); b = mix(b, ROCK[2], t2);
    const t3 = mix(0, 1, (h - 45) / 90);
    r = mix(r, HAZE[0], t3 * 0.55); g = mix(g, HAZE[1], t3 * 0.55); b = mix(b, HAZE[2], t3 * 0.55);
    const t4 = mix(0, 1, (slope - 0.55) * 3);
    r = mix(r, DARK[0], t4); g = mix(g, DARK[1], t4); b = mix(b, DARK[2], t4);
    // golden-hour hillshade from the west
    const shade = 0.82 + 0.5 * (-dhx * 0.8 + dhz * 0.25) / (1 + slope);
    const k = Math.min(1.25, Math.max(0.55, shade));
    const o = (ix + iz * RES) * 4;
    img.data[o] = r * k; img.data[o+1] = g * k; img.data[o+2] = b * k; img.data[o+3] = 255;
  }
}
ctx.putImageData(img, 0, 0);

// ---------- build the SVG scene (world coords: x right, z down) ----------
const view = document.getElementById('view');
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  (parent || view).appendChild(e);
  return e;
};
el('image', { href: cv.toDataURL(), x: -W/2, y: -W/2, width: W, height: W, preserveAspectRatio: 'none' });

// the road: left/right edge polygon from centre + per-point width
const pts = DATA.road, n = pts.length;
let leftPts = [], rightPts = [], dashD = '';
for (let i = 0; i < n; i++) {
  const [x, z, w] = pts[i];
  const [x2, z2] = pts[(i+1) % n];
  const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
  const nx = dz / l, nz = -dx / l;
  leftPts.push((x + nx*w).toFixed(1) + ',' + (z + nz*w).toFixed(1));
  rightPts.push((x - nx*w).toFixed(1) + ',' + (z - nz*w).toFixed(1));
  dashD += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + z.toFixed(1);
}
el('polygon', { points: leftPts.join(' ') + ' ' + rightPts.reverse().join(' '),
  fill: '#3E3A38', stroke: '#57504B', 'stroke-width': 2 });
// banked sections glow
for (let i = 0; i < n; i++) {
  const [x, z, w, bk] = pts[i];
  if (bk > 0.02) {
    const [x2, z2] = pts[(i+1) % n];
    el('line', { x1: x, y1: z, x2: x2, y2: z2, stroke: '#FFB35C',
      'stroke-width': w * 2 + 6, 'stroke-opacity': Math.min(0.35, bk * 1.6), 'stroke-linecap': 'round' });
  }
}
el('path', { d: dashD + 'Z', fill: 'none', stroke: '#CFC7B8', 'stroke-width': 1.2,
  'stroke-dasharray': '10 14', 'stroke-opacity': 0.85 });
// driving direction arrows
for (let i = 0; i < n; i += Math.floor(n / 14)) {
  const [x, z] = pts[i];
  const [x2, z2] = pts[(i+2) % n];
  const a = Math.atan2(z2 - z, x2 - x) * 180 / Math.PI;
  el('path', { d: 'M-7,-5 L7,0 L-7,5 Z', fill: '#FFE7B0', 'fill-opacity': .8,
    transform: 'translate(' + x + ',' + z + ') rotate(' + a + ')' });
}

// area labels
for (const L of DATA.labels) {
  el('text', { x: L.x, y: L.z, class: 'arealabel' }).textContent = L.text;
}

// markers
const info = document.getElementById('info');
const defaultInfo = info.innerHTML;
let selected = null;
const colors = { start: '#FFE7B0', jump: '#9FD1FF', bank: '#FFB35C', play: '#B7E88F',
  shard: '#FFD9A8', shardHidden: '#C9A2FF', note: '#E0C9A8' };
const mkGroups = [];
for (const m of DATA.markers) {
  const g = el('g', { class: 'mk' });
  g.__pos = [m.x, m.z];
  mkGroups.push(g);
  el('circle', { r: 13, fill: 'rgba(20,14,9,.55)', stroke: colors[m.cls] || '#fff', 'stroke-width': 1.4 }, g);
  el('text', { class: 'ic' }, g).textContent = m.icon;
  g.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (selected) selected.classList.remove('sel');
    selected = g; g.classList.add('sel');
    info.innerHTML =
      '<h2>' + m.icon + ' ' + m.title + '</h2>' +
      '<p>' + m.what + '</p>' +
      '<div class="codebox">' + m.code + '</div>' +
      (m.tryThis ? '<div class="try">' + m.tryThis + '</div>' : '') +
      '<p class="hint" style="margin-top:14px">click the map background to go back</p>';
  });
}
document.getElementById('svg').addEventListener('click', () => {
  if (selected) selected.classList.remove('sel');
  selected = null;
  info.innerHTML = defaultInfo;
});

// ---------- pan / zoom ----------
const svg = document.getElementById('svg');
const mapDiv = document.getElementById('map');
let scale, tx, ty;
function fit() {
  const r = mapDiv.getBoundingClientRect();
  scale = Math.min(r.width, r.height) / (W * 1.04);
  tx = r.width / 2; ty = r.height / 2;
  apply();
}
function apply() {
  view.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
  // markers hold a constant SCREEN size, like proper map pins
  const k = Math.min(3.2, 1 / scale);
  for (const g of mkGroups) {
    g.setAttribute('transform', 'translate(' + g.__pos[0] + ',' + g.__pos[1] + ') scale(' + k + ')');
  }
}
mapDiv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = mapDiv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const k = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const ns = Math.min(6, Math.max(0.2, scale * k));
  tx = mx - ((mx - tx) / scale) * ns; ty = my - ((my - ty) / scale) * ns;
  scale = ns;
  apply();
}, { passive: false });
let drag = null;
mapDiv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX - tx, y: e.clientY - ty }; mapDiv.classList.add('dragging'); });
window.addEventListener('pointermove', (e) => { if (drag) { tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); } });
window.addEventListener('pointerup', () => { drag = null; mapDiv.classList.remove('dragging'); });
window.addEventListener('resize', fit);
fit();
</script>
</body>
</html>
`

await Bun.write(new URL('../World Map.html', import.meta.url), html)
console.log(`World Map.html written - ${(html.length / 1024).toFixed(0)} KB, ${markers.length} markers, terrain ${RES}x${RES}`)
