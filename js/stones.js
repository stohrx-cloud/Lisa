/* LUMEA: the 3D stones, shared by the home page (mode "circle") and every chakra page (mode "single").

   circle  Seven quartz points on the points of a heptagram carved into a rough stone, which sits on a
           paved stone floor, seen from 45 degrees in a warm drifting mist. Every stone glows softly and floats and turns on its
           own. Hover one: it rises, spinning fast on the way up and slowly once it is up, and a title near the
           top names the chakra and the page it opens. Leave it: it settles. Click it: that page. Touch: first tap raises, second tap opens the page.
   single  One stone floating over its carved seat in the same floor, turning slowly.

   Loaded as a classic script so it also runs from file://; three.js comes in through the page's
   import map (dynamic import works from classic scripts). Everything is generated in code: rock,
   floor, gold sacred-geometry inlay (seed of life, lotus, sunbursts), quartz surface, mist, motes of light. Pages read window.LUMEA before this runs. */
(async () => {
"use strict";
const L = window.LUMEA;
if (!L) return;
const { CHAKRAS, hero, reduce } = L;
const SINGLE = L.mode === "single";
const canvas = document.getElementById("gl");
const COUNT = CHAKRAS.length;

let THREE, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, mergeVertices, RGBELoader;
try {
  THREE = await import("three");
  [{ RoomEnvironment }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { mergeVertices }, { RGBELoader }] = await Promise.all([
    import("three/addons/environments/RoomEnvironment.js"),
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
    import("three/addons/utils/BufferGeometryUtils.js"),
    import("three/addons/loaders/RGBELoader.js"),
  ]);
} catch (e) { hero.classList.add("no-gl"); console.warn("[Lumea] 3D unavailable:", e); return; }

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" }); }
catch (e) { hero.classList.add("no-gl"); return; }
window.__lumeaGL = true;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.NeutralToneMapping;   // keeps a bright, warm scene bright and true to colour
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
// the crystals reflect a real photographed studio (Poly Haven, CC0): proper highlights and soft windows in
// the glass. Only the crystals use it, so the floor and rock keep their warm light. Offline: studio light.
let crystalEnv = null;
const envWaiting = [];
new RGBELoader().load("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr", hdr => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  crystalEnv = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose();
  envWaiting.forEach(m => { m.envMap = crystalEnv; m.needsUpdate = true; });
}, undefined, () => {});
const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

// The output pass tone-maps everything, background included: solve for the linear value that comes out
// as the page's dawn ivory (#fbf7f0), so the canvas melts into the sections around it.
function neutral([r, g, b]) {
  const x = Math.min(r, g, b), off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= off; g -= off; b -= off;
  const peak = Math.max(r, g, b), S = 0.76, d = 1 - S;
  if (peak < S) return [r, g, b];
  const np = 1 - (d * d) / (peak + d - S), k = np / peak, q = 1 - 1 / (0.15 * (peak - np) + 1);
  return [r * k + (np - r * k) * q, g * k + (np - g * k) * q, b * k + (np - b * k) * q];
}
function preTone(c) {
  const t = [c.r, c.g, c.b], v = t.slice();
  for (let n = 0; n < 60; n++) { const o = neutral(v); for (let i = 0; i < 3; i++) v[i] = Math.max(0, v[i] + (t[i] - o[i]) * 1.5); }
  return new THREE.Vector3(...v);
}
const DAWN = new THREE.Color("#fbf7f0");
const BG = preTone(DAWN);

/* ---- sizes (world units) ---- */
const RING_R = 0.95;       // the stones stand on the points of the star
const ROCK_R = 1.75;       // widest point of the rock, for framing
const TOP = 1.5;           // half-size of the rock's top texture
const LIFT_H = 1.1;
const STONE = 1.6;
const FLOOR_R = 6;
const FLOOR_Y = SINGLE ? 0 : -0.55;
const FLOAT_Y = 0.42;      // single mode: how high the stone floats over its seat
const ELEV = THREE.MathUtils.degToRad(SINGLE ? 24 : 45);
const seatAngle = i => (i / COUNT) * Math.PI * 2 + Math.PI / COUNT;

/* ---- noise ---- */
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const PERM = (() => { const r = rng(1234), p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return Uint8Array.from([...p, ...p]); })();
const h3 = (x, y, z) => PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)] / 255;
function n3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
function fbm(x, y, z, o = 5) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * n3(x, y, z); n += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s / n; }
const mkCanvas = (w, h = w) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
function noiseGrid(N, scale, z, o) { const g = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g[y * N + x] = fbm(x / scale, y / scale, z, o); return g; }
function greyCanvas(grid, N, lo, hi) {
  const c = mkCanvas(N), x = c.getContext("2d"), d = x.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const v = lo + grid[i] * (hi - lo); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
  x.putImageData(d, 0, 0); return c;
}
// erode white line-art on a canvas by a wear grid
function wearAway(ctx, W, wear, N, lo, span) {
  const pd = ctx.getImageData(0, 0, W, W), r = rng(5), sh = Math.log2(W / N);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (!pd.data[i + 3]) continue;
    const w = wear[(y >> sh) * N + (x >> sh)];
    pd.data[i + 3] *= Math.min(1, Math.max(0, (w - lo) / span)) * (0.7 + r() * 0.3);
  }
  ctx.putImageData(pd, 0, 0);
}
function tinted(src, W, fill) { const c = mkCanvas(W), x = c.getContext("2d"); x.drawImage(src, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = fill; x.fillRect(0, 0, W, W); return c; }
function grain(ctx, W, amt, seed) {
  const d = ctx.getImageData(0, 0, W, W), r = rng(seed);
  for (let i = 0; i < W * W; i++) { const g = (r() - 0.5) * amt; d.data[i * 4] += g; d.data[i * 4 + 1] += g; d.data[i * 4 + 2] += g; }
  ctx.putImageData(d, 0, 0);
}

/* ---- sacred-geometry helpers (gold inlay line-art) ---- */
function petal(ctx, pt, a, r0, r1, w) {   // an almond petal pointing outward along angle a
  const m = (r0 + r1) / 2, [x0, y0] = pt(a, r0), [x1, y1] = pt(a, r1), [ax, ay] = pt(a - w, m), [bx, by] = pt(a + w, m);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(ax, ay, x1, y1); ctx.quadraticCurveTo(bx, by, x0, y0); ctx.stroke();
}
function seedOfLife(ctx, cx, cy, r) {     // seven circles: one for each chakra
  const ring = (x, y, rad) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke(); };
  ring(cx, cy, r);
  for (let j = 0; j < 6; j++) ring(cx + Math.cos(j * Math.PI / 3) * r, cy + Math.sin(j * Math.PI / 3) * r, r);
  ring(cx, cy, r * 2);
}

/* ---- the paved floor: rings of pale limestone, a gold sunburst round the rock, a lotus border ---- */
function floorTextures() {
  const N = 512, W = 2048, k = W / (2 * FLOOR_R), C = W / 2;
  const grid = noiseGrid(N, 40, 7.7, 6), wear = noiseGrid(N, 18, 1.1, 4);
  const r = rng(321), slabs = [];
  slabs.push([0, 1.8, 0, Math.PI * 2, 0.5]);
  for (const [r0, r1] of [[1.85, 2.45], [2.5, 3.2], [3.25, 4.05], [4.1, 5.0], [5.05, 6.0]]) {
    const mid = (r0 + r1) / 2, n = Math.round((Math.PI * 2 * mid) / 0.85), off = r() * Math.PI * 2, step = (Math.PI * 2) / n, gap = 0.02 / mid;
    const cuts = []; for (let j = 0; j <= n; j++) cuts.push(off + (j + (j === n ? 0 : (r() - 0.5) * 0.3)) * step);
    cuts[n] = cuts[0] + Math.PI * 2;
    for (let j = 0; j < n; j++) slabs.push([r0 + 0.01, r1 - 0.01, cuts[j] + gap, cuts[j + 1] - gap, r()]);
  }
  const drawSlabs = (ctx, shadeFn) => {
    for (const [r0, r1, a0, a1, t] of slabs) {
      ctx.fillStyle = shadeFn(t); ctx.beginPath();
      if (r0 === 0) ctx.arc(C, C, r1 * k, 0, Math.PI * 2);
      else { ctx.arc(C, C, r1 * k, a0, a1); ctx.arc(C, C, r0 * k, a1, a0, true); ctx.closePath(); }
      ctx.fill();
    }
  };
  const col = mkCanvas(W), cx = col.getContext("2d");
  cx.fillStyle = "#b9a68b"; cx.fillRect(0, 0, W, W);
  drawSlabs(cx, t => { const s = 196 + t * 30; return `rgb(${s | 0},${(s * 0.95) | 0},${(s * 0.885) | 0})`; });
  cx.globalCompositeOperation = "multiply"; cx.imageSmoothingQuality = "high";
  cx.drawImage(greyCanvas(grid, N, 208, 255), 0, 0, W, W);
  cx.globalCompositeOperation = "source-over";
  grain(cx, W, 10, 41);

  const pat = mkCanvas(W), px = pat.getContext("2d");
  px.strokeStyle = px.fillStyle = "#fff"; px.lineCap = "round"; px.lineJoin = "round";
  const pt = (a, rad) => [C + Math.sin(a) * rad * k, C + Math.cos(a) * rad * k];
  const circle = (rad, lw) => { px.lineWidth = lw * k; px.beginPath(); px.arc(C, C, rad * k, 0, Math.PI * 2); px.stroke(); };
  // sunburst around the rock: the long rays line up with the seven stones
  for (let i = 0; i < 56; i++) {
    const a = seatAngle(0) + (i / 56) * Math.PI * 2, long = i % 8 === 0, [x1, y1] = pt(a, 1.95), [x2, y2] = pt(a, long ? 3.4 : i % 2 ? 2.55 : 2.9);
    px.lineWidth = (long ? 0.02 : 0.011) * k; px.beginPath(); px.moveTo(x1, y1); px.lineTo(x2, y2); px.stroke();
  }
  for (let i = 0; i < COUNT; i++) {
    const [x, y] = pt(seatAngle(i), 3.62);
    px.lineWidth = 0.014 * k; px.beginPath(); px.arc(x, y, 0.09 * k, 0, Math.PI * 2); px.stroke();
    px.beginPath(); px.arc(x, y, 0.025 * k, 0, Math.PI * 2); px.fill();
  }
  // lotus border
  circle(4.18, 0.014); circle(4.98, 0.014);
  px.lineWidth = 0.013 * k;
  for (let i = 0; i < 36; i++) petal(px, pt, (i / 36) * Math.PI * 2, 4.2, 4.82, (Math.PI / 36) * 0.95);
  if (SINGLE) { // the stone's seat: seed of life inside a seven-petal lotus
    px.lineWidth = 0.014 * k; seedOfLife(px, C, C, 0.13 * k);
    circle(0.3, 0.012);
    px.lineWidth = 0.016 * k; for (let i = 0; i < COUNT; i++) petal(px, pt, seatAngle(i), 0.31, 1.0, 0.32);
    px.lineWidth = 0.011 * k; for (let i = 0; i < COUNT; i++) petal(px, pt, seatAngle(i) + Math.PI / COUNT, 0.31, 0.72, 0.28);
    circle(1.12, 0.012);
    for (let i = 0; i < 42; i++) { const [x, y] = pt((i / 42) * Math.PI * 2, 1.22); px.beginPath(); px.arc(x, y, 0.014 * k, 0, Math.PI * 2); px.fill(); }
  }
  wearAway(px, W, wear, N, 0.3, 0.2);
  cx.drawImage(tinted(pat, W, "rgba(160,110,36,.95)"), 0, 0);

  const bump = mkCanvas(W), bx = bump.getContext("2d");
  bx.fillStyle = "#000"; bx.fillRect(0, 0, W, W);
  drawSlabs(bx, t => `rgb(${150 + t * 30 | 0},${150 + t * 30 | 0},${150 + t * 30 | 0})`);
  bx.globalCompositeOperation = "multiply"; bx.drawImage(greyCanvas(grid, N, 160, 255), 0, 0, W, W);
  bx.globalCompositeOperation = "source-over"; bx.globalAlpha = 0.45; bx.drawImage(tinted(pat, W, "#000"), 0, 0);

  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(bump); bumpMap.anisotropy = 8;
  return { map, bumpMap };
}

/* ---- the rock (circle mode): a fractured sandstone slab. Fine geometry instead of facets, layered strata
   down the sides, darker crevices, and colour that varies through the stone in 3D (vertex colours), so
   nothing streaks. The worked top is nearly flat and carries the gold inlay. ---- */
function rockGeometry() {
  let g = new THREE.IcosahedronGeometry(1, 56);
  g.deleteAttribute("normal"); g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3);
  const light = new THREE.Color("#c9b498"), mid = new THREE.Color("#a99273"), dark = new THREE.Color("#6f5d49"), rust = new THREE.Color("#a5754d");
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ridge = 1 - Math.abs(fbm(x * 3.2 + 9, y * 3.2, z * 3.2, 3) * 2 - 1);
    const chips = fbm(x * 7 + 2, y * 7, z * 7, 3);
    const r = 1 + 0.17 * (fbm(x * 1.4 + 3, y * 1.4, z * 1.4, 4) - 0.5) * 2 - 0.1 * ridge * ridge - 0.05 * Math.max(0, chips - 0.5);
    x *= r * 1.55; z *= r * 1.55;
    let yy = y * r * 0.52 - 0.24;
    // strata: soft steps down the sides, the way sandstone weathers in layers
    if (yy < -0.02) { const step = 0.07, k = yy / step, f = k - Math.floor(k); yy = (Math.floor(k) + f * f * (3 - 2 * f) * 0.6 + 0.2) * step; }
    if (yy > 0) yy = yy * 0.03 + (fbm(x * 9, 1, z * 9, 3) - 0.5) * 0.008;
    p.setXYZ(i, x, yy, z);
    uv[i * 2] = x / (2 * TOP) + 0.5; uv[i * 2 + 1] = 0.5 - z / (2 * TOP);
    // colour: sandstone tones from 3D noise, layered bands, iron staining, darker in the crevices
    const n = fbm(x * 1.8 + 5, yy * 1.8, z * 1.8, 5), band = 0.5 + 0.5 * Math.sin(yy * 70 + fbm(x * 2, 0, z * 2, 3) * 6);
    c.copy(mid).lerp(light, Math.min(1, Math.max(0, (n - 0.35) / 0.35)));
    if (yy < -0.02) c.lerp(dark, 0.18 * band);
    c.lerp(rust, Math.max(0, fbm(x * 3 + 11, yy * 3, z * 3, 4) - 0.55) * 1.6);
    const crevice = Math.min(1, ridge * ridge * 0.9 + Math.max(0, chips - 0.55) * 1.5);
    c.lerp(dark, crevice * (yy < -0.02 ? 0.55 : 0.2));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function rockTextures() {
  // the stone colour lives in the vertex colours; this map only adds fine grain and the gold inlay on top
  const N = 512, W = 2048, k = W / (2 * TOP), C = W / 2;
  const grid = noiseGrid(N, 30, 0.5, 6), wear = noiseGrid(N, 22, 3.3, 4);
  const col = mkCanvas(W), cx = col.getContext("2d");
  cx.drawImage(greyCanvas(grid, N, 214, 255), 0, 0, W, W);
  grain(cx, W, 26, 77);

  const pat = mkCanvas(W), px = pat.getContext("2d");
  px.strokeStyle = px.fillStyle = "#fff"; px.lineCap = "round"; px.lineJoin = "round";
  const pt = (a, rad) => [C + Math.sin(a) * rad * k, C + Math.cos(a) * rad * k];
  const circle = (rad, lw) => { px.lineWidth = lw * k; px.beginPath(); px.arc(C, C, rad * k, 0, Math.PI * 2); px.stroke(); };
  px.lineWidth = 0.009 * k; seedOfLife(px, C, C, 0.1 * k);
  circle(0.25, 0.008);
  px.lineWidth = 0.012 * k; for (let i = 0; i < COUNT; i++) petal(px, pt, seatAngle(i), 0.26, 0.78, 0.3);
  px.lineWidth = 0.008 * k; for (let i = 0; i < COUNT; i++) petal(px, pt, seatAngle(i) + Math.PI / COUNT, 0.26, 0.56, 0.26);
  for (let i = 0; i < COUNT; i++) {
    const [x, y] = pt(seatAngle(i), RING_R);
    px.lineWidth = 0.01 * k; px.beginPath(); px.arc(x, y, 0.15 * k, 0, Math.PI * 2); px.stroke();
    px.lineWidth = 0.006 * k;
    for (let t = 0; t < 12; t++) {
      const b = (t / 12) * Math.PI * 2, r1 = 0.18 * k, r2 = (t % 2 ? 0.215 : 0.235) * k;
      px.beginPath(); px.moveTo(x + Math.cos(b) * r1, y + Math.sin(b) * r1); px.lineTo(x + Math.cos(b) * r2, y + Math.sin(b) * r2); px.stroke();
    }
  }
  circle(1.22, 0.01); circle(1.33, 0.006);
  for (let i = 0; i < 49; i++) { const [x, y] = pt((i / 49) * Math.PI * 2, 1.275); px.beginPath(); px.arc(x, y, 0.011 * k, 0, Math.PI * 2); px.fill(); }
  wearAway(px, W, wear, N, 0.32, 0.2);
  cx.drawImage(tinted(pat, W, "rgb(236,186,92)"), 0, 0);

  const bump = mkCanvas(W), bx = bump.getContext("2d");
  bx.drawImage(greyCanvas(grid, N, 120, 200), 0, 0, W, W);
  grain(bx, W, 40, 12);
  bx.globalAlpha = 0.6; bx.drawImage(tinted(pat, W, "#000"), 0, 0);
  // the inlay is real metal: green = roughness, blue = metalness (stone: rough, not metal; gold: polished metal)
  const mr = mkCanvas(W), mx = mr.getContext("2d");
  mx.fillStyle = "rgb(0,242,0)"; mx.fillRect(0, 0, W, W);
  mx.drawImage(tinted(pat, W, "rgb(0,72,255)"), 0, 0);
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(bump); bumpMap.anisotropy = 8;
  const metalRough = new THREE.CanvasTexture(mr); metalRough.anisotropy = 8;
  return { map, bumpMap, metalRough };
}

/* ---- quartz surface: striations + pits (normal), frosted milky base clearing upward (roughness) ---- */
function quartzMaps() {
  const W = 128, H = 512, h = new Float32Array(W * H), r = rng(31);
  for (let k = 0; k < 90; k++) { const y0 = r() * H, w = 0.6 + r() * 2.4, d = 0.3 + r() * 0.8; for (let y = 0; y < H; y++) { const t = Math.abs(y - y0); if (t < w) for (let x = 0; x < W; x++) h[y * W + x] += d * (1 - t / w); } }
  for (let k = 0; k < 140; k++) { const cx = r() * W, cy = r() * H, rad = 1 + r() * 3.5, d = 0.6 + r(); for (let y = Math.max(0, cy - rad | 0); y < Math.min(H, cy + rad + 1); y++) for (let x = Math.max(0, cx - rad | 0); x < Math.min(W, cx + rad + 1); x++) { const q = Math.hypot(x - cx, y - cy) / rad; if (q < 1) h[y * W + x] -= d * (1 - q * q); } }
  const nc = mkCanvas(W, H), nx = nc.getContext("2d"), nd = nx.createImageData(W, H);
  const rc = mkCanvas(W, H), rx = rc.getContext("2d"), rd = rx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, ddx = (h[y * W + (x + 1) % W] - h[i]) * 1.2, ddy = (h[((y + 1) % H) * W + x] - h[i]) * 1.2, l = Math.hypot(ddx, ddy, 1);
    nd.data[i * 4] = (-ddx / l * 0.5 + 0.5) * 255; nd.data[i * 4 + 1] = (ddy / l * 0.5 + 0.5) * 255; nd.data[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i * 4 + 3] = 255;
    const v = 1 - y / H, frost = fbm(x / 18, y / 18, 2, 4);
    const rough = 0.06 + 0.22 * (1 - Math.min(1, Math.max(0, v / 0.22))) + (frost > 0.6 ? (frost - 0.6) * 1.4 : 0);
    rd.data[i * 4] = rd.data[i * 4 + 2] = 0; rd.data[i * 4 + 1] = Math.min(255, rough * 255); rd.data[i * 4 + 3] = 255;
  }
  nx.putImageData(nd, 0, 0); rx.putImageData(rd, 0, 0);
  const normalMap = new THREE.CanvasTexture(nc); normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  const roughnessMap = new THREE.CanvasTexture(rc); roughnessMap.wrapS = THREE.RepeatWrapping; roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  return { normalMap, roughnessMap };
}

/* ---- a double-terminated quartz, built the way they grow: six uneven prism faces with narrow bevelled
   edges between them (they catch the light), a point at each end where large and small faces meet
   off-centre (the lower one a little shorter), a slight lean, and colour zoning (milky low, deepest
   toward the top). The lower point sits at y = 0, so the stone hovers on its tip above the seat. ---- */
function quartz(seed, tint) {
  const r = rng(seed * 7919 + 13);
  const N = 6, R = 0.085 * (0.9 + r() * 0.25), H = 0.2 + r() * 0.1, TIP = 0.15 + r() * 0.05;
  const BOT = TIP * (0.72 + r() * 0.2);                             // the lower point
  const lean = [(r() - 0.5) * 0.05, (r() - 0.5) * 0.05];          // a slight natural lean
  const ring = [];                                                  // 12 points: each corner split into a bevel
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.24, rad = R * (0.82 + r() * 0.34), bev = 0.07 + r() * 0.05;
    const by = BOT + (i % 2 ? -0.02 : 0.02) + (r() - 0.5) * 0.02, ty = BOT + H + (i % 2 ? 0.03 : -0.02) + (r() - 0.5) * 0.025;
    for (const s of [-1, 1]) ring.push({ a: a + s * bev, rad: rad * 0.985, by: by + (r() - 0.5) * 0.006, ty: ty + (r() - 0.5) * 0.01 });
  }
  const M = ring.length;
  const B = i => { const p = ring[i]; return [Math.cos(p.a) * p.rad, p.by, Math.sin(p.a) * p.rad]; };
  const T = i => { const p = ring[i]; return [Math.cos(p.a) * p.rad * 0.92 + lean[0] * p.ty, p.ty, Math.sin(p.a) * p.rad * 0.92 + lean[1] * p.ty]; };
  const TALL = BOT + H + TIP;
  const apex = [(r() - 0.5) * 0.04 + lean[0] * TALL, TALL, (r() - 0.5) * 0.04 + lean[1] * TALL];
  const foot = [(r() - 0.5) * 0.035, 0, (r() - 0.5) * 0.035];
  const per = []; let acc = 0;
  for (let i = 0; i <= M; i++) { per.push(acc); const a = B(i % M), b = B((i + 1) % M); acc += Math.hypot(a[0] - b[0], a[2] - b[2]); }
  const pos = [], uv = [], mid = [0, TALL / 2, 0], V = 1 / TALL;
  function tri(a, b, c, ua, ub, uc) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const cx = (a[0] + b[0] + c[0]) / 3 - mid[0], cy = (a[1] + b[1] + c[1]) / 3 - mid[1], cz = (a[2] + b[2] + c[2]) / 3 - mid[2];
    if (n[0] * cx + n[1] * cy + n[2] * cz < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc);
  }
  const tipUV = p => [(p[0] + 0.3) * 4, Math.min(0.99, p[1] * V)];
  for (let i = 0; i < M; i++) {
    const j = (i + 1) % M, u0 = per[i] * 6, u1 = per[i + 1] * 6;
    tri(B(i), B(j), T(j), [u0, ring[i].by * V], [u1, ring[j].by * V], [u1, ring[j].ty * V]);
    tri(B(i), T(j), T(i), [u0, ring[i].by * V], [u1, ring[j].ty * V], [u0, ring[i].ty * V]);
    tri(T(i), T(j), apex, tipUV(T(i)), tipUV(T(j)), tipUV(apex));
    tri(B(j), B(i), foot, tipUV(B(j)), tipUV(B(i)), tipUV(foot));
  }
  const light = tint.clone().lerp(new THREE.Color(1, 1, 1), 0.06);
  const pale = tint.clone().lerp(new THREE.Color(0.97, 0.96, 0.94), 0.55), cols = [];
  for (let i = 1; i < pos.length; i += 3) { const t = Math.min(1, Math.max(0, 0.35 + (pos[i] * V) * 0.9)); const c = pale.clone().lerp(light, t * t * (3 - 2 * t)); cols.push(c.r, c.g, c.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return { g, height: TALL, R };
}

/* a soft milky veil inside each stone (the clouds and phantoms real quartz carries) */
function veilTexture() {
  const N = 128, c = mkCanvas(N), x = c.getContext("2d"), d = x.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let i = 0; i < N; i++) {
    const n = fbm(i / 14, y / 14, 4.2, 5), v = Math.max(0, Math.min(1, (n - 0.42) / 0.3));
    const o = (y * N + i) * 4; d.data[o] = d.data[o + 1] = d.data[o + 2] = 255; d.data[o + 3] = v * 255;
  }
  x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/* ---- smoke: domain-warped noise, one layer behind everything (it is the background), one thin layer in front ---- */
const SMOKE_GLSL = `
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v+=a*vnoise(p); p=m*p; a*=.5; } return v; }
float smoke(vec2 p, float t){
  vec2 q=vec2(fbm(p+vec2(0.,t*.025)), fbm(p+vec2(5.2,1.3)-t*.02));
  vec2 r=vec2(fbm(p+2.6*q+vec2(1.7,9.2)+t*.015), fbm(p+2.6*q+vec2(8.3,2.8)-t*.012));
  return fbm(p+2.2*r+vec2(0.,-t*.04));
}`;
const QUAD_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const smokeUniforms = { uTime: { value: 0 }, uAspect: { value: 1 }, uBg: { value: BG } };
const smokeBack = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: smokeUniforms, vertexShader: QUAD_VS, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform float uTime, uAspect; uniform vec3 uBg; ${SMOKE_GLSL}
  void main(){
    vec2 p=vec2(vUv.x*uAspect,vUv.y)*1.5;
    float s=smoothstep(.5,.9,smoke(p,uTime));
    gl_FragColor=vec4(mix(uBg,uBg*vec3(1.,.9,.76),s*.42*(.6+.4*(1.-vUv.y))),1.);
  }`,
}));
smokeBack.renderOrder = -10; smokeBack.frustumCulled = false;
const smokeFront = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: smokeUniforms, vertexShader: QUAD_VS, depthTest: false, depthWrite: false, transparent: true,
  fragmentShader: `varying vec2 vUv; uniform float uTime, uAspect; ${SMOKE_GLSL}
  void main(){
    vec2 c=vUv-.5; c.x*=uAspect;
    float edge=mix(.28,1.,smoothstep(.12,.7,length(c)));
    float s=smoothstep(.56,.95,smoke(vec2(vUv.x*uAspect,vUv.y)*2.6+11.,uTime));
    gl_FragColor=vec4(vec3(1.,.975,.93),s*.16*edge);
  }`,
}));
smokeFront.renderOrder = 10; smokeFront.frustumCulled = false;
scene.add(smokeBack, smokeFront);

/* ---- intro (home): the screen opens under a full bank of cloud that parts from the centre outward,
   drifting toward you as it thins. The CSS cover (#introCover) holds the screen until the first frame. ---- */
const INTRO_HOLD = 0.15, INTRO_DUR = 2;
const introOn = !SINGLE && !reduce;
let introStart = -1, introSent = false;
const introCloud = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { uTime: smokeUniforms.uTime, uAspect: smokeUniforms.uAspect, uIntro: { value: introOn ? 1 : 0 } },
  vertexShader: QUAD_VS, depthTest: false, depthWrite: false, transparent: true,
  fragmentShader: `varying vec2 vUv; uniform float uTime, uAspect, uIntro; ${SMOKE_GLSL}
  void main(){
    float pr=1.-uIntro;
    vec2 c=vUv-.5; c.x*=uAspect;
    float n=smoke(c*mix(2.3,1.05,pr)+vec2(3.7,1.9), uTime*2.);
    float edge=pr*2.25-.45-length(c)*1.1+(n-.5)*.9;   // centre opens first, edges dissolve last
    float a=1.-smoothstep(0.,.45,edge);
    vec3 col=mix(vec3(.85,.83,.81),vec3(1.06,1.045,1.02),smoothstep(.2,.8,n));
    gl_FragColor=vec4(col,a);
  }`,
}));
introCloud.renderOrder = 20; introCloud.frustumCulled = false; introCloud.visible = introOn;
scene.add(introCloud);
function finishIntro() {
  if (introSent) return;
  introSent = true;
  introCloud.visible = false;
  const cover = document.getElementById("introCover");
  if (cover) cover.classList.add("gone");
  dispatchEvent(new Event("lumea:intro-done"));
}
function stepIntro() {
  if (SINGLE || introSent) return;
  if (!introOn) { finishIntro(); return; }
  if (introStart < 0) {   // first frame: the 3D clouds are on screen, let the CSS cover go
    introStart = time;
    const cover = document.getElementById("introCover");
    if (cover) cover.classList.add("gone");
  }
  const t = Math.min(1, Math.max(0, (time - introStart - INTRO_HOLD) / INTRO_DUR));
  const e = 1 - Math.pow(1 - t, 1.6);   // opens at once, settles gently
  introCloud.material.uniforms.uIntro.value = 1 - e;
  if (t >= 1) finishIntro();
}

/* ---- motes of light drifting upward ---- */
const motes = (() => {
  const M = 90, r = rng(99), pos = new Float32Array(M * 3), w = new Float32Array(M);
  for (let i = 0; i < M; i++) { pos[i * 3] = r(); pos[i * 3 + 1] = r(); pos[i * 3 + 2] = r(); w[i] = r(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aW", new THREE.BufferAttribute(w, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTime: smokeUniforms.uTime, uPx: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float aW; uniform float uTime, uPx; varying float vA;
    void main(){
      float span=3.4, y=mod(position.y*span+uTime*(.04+aW*.05),span)-.6;
      float ang=position.x*6.2832+uTime*.02*(aW-.5), rad=.6+position.z*3.;
      vec4 mv=modelViewMatrix*vec4(cos(ang)*rad,y,sin(ang)*rad,1.);
      gl_Position=projectionMatrix*mv; gl_PointSize=uPx*(.6+aW)/-mv.z;
      float tw=.5+.5*sin(uTime*(.6+aW*1.4)+position.x*40.);
      vA=smoothstep(-.6,.1,y)*smoothstep(span-.6,span-1.5,y)*(.35+.65*tw);
    }`,
    fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(.86,.64,.3),smoothstep(.5,.08,d)*vA*.8); }`,
  }));
  pts.frustumCulled = false; pts.renderOrder = 5;
  scene.add(pts);
  return pts;
})();

/* ---- low white fog lying on the floor, drifting slowly across it ---- */
const FOG_R = SINGLE ? 3.6 : 4.8;
const fogLayers = [[0.02, 0.7], [0.07, 0.6], [0.13, 0.48], [0.2, 0.34], [0.28, 0.2]].map(([dy, alpha], k) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(FOG_R * 2, FOG_R * 2), new THREE.ShaderMaterial({
    uniforms: { uTime: smokeUniforms.uTime, uSeed: { value: k * 1.37 }, uR: { value: FOG_R }, uA: { value: alpha } },
    transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vW; uniform float uTime, uSeed, uR, uA; ${SMOKE_GLSL}
    void main(){
      float t=uTime*(.55+uSeed*.08);
      vec2 p=vW.xz*.6+vec2(uSeed*7.1,uSeed*3.3);
      vec2 q=vec2(fbm(p+vec2(t*.06,0.)), fbm(p+vec2(3.1,1.7)-vec2(t*.04,t*.01)));
      float n=fbm(p*1.25+2.2*q+vec2(-t*.09,t*.02));
      float a=smoothstep(.34,.72,n)*smoothstep(uR,uR*.35,length(vW.xz));
      gl_FragColor=vec4(vec3(1.,.995,.985)*1.05,a*uA);
    }`,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = FLOOR_Y + dy;
  m.renderOrder = 4;
  scene.add(m);
  return m;
});

/* ---- floor, fading into the light ---- */
const FT = floorTextures();
const floorMat = new THREE.MeshStandardMaterial({ map: FT.map, bumpMap: FT.bumpMap, bumpScale: 2, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 });
const FADE = SINGLE ? [1.3, 4.3] : [2.6, 5.6];
floorMat.onBeforeCompile = sh => {
  sh.uniforms.uBg = { value: BG };
  sh.vertexShader = sh.vertexShader.replace("void main() {", "varying vec3 vFloorPos;\nvoid main() {")
    .replace("#include <project_vertex>", "#include <project_vertex>\n  vFloorPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  sh.fragmentShader = sh.fragmentShader.replace("void main() {", "varying vec3 vFloorPos;\nuniform vec3 uBg;\nvoid main() {")
    .replace("#include <dithering_fragment>", `#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uBg, smoothstep(${FADE[0].toFixed(2)}, ${FADE[1].toFixed(2)}, length(vFloorPos.xz)));`);
};
const floor = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_R, 160), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = FLOOR_Y;
floor.receiveShadow = true;
scene.add(floor);

/* ---- rock (circle mode) ---- */
if (!SINGLE) {
  const RT = rockTextures();
  const rockMat = new THREE.MeshStandardMaterial({
    map: RT.map, vertexColors: true, bumpMap: RT.bumpMap, bumpScale: 1.4,
    roughness: 1, roughnessMap: RT.metalRough, metalness: 1, metalnessMap: RT.metalRough, envMapIntensity: 0.5,
  });
  if (crystalEnv) rockMat.envMap = crystalEnv; else envWaiting.push(rockMat);   // the gold reflects the studio
  const rock = new THREE.Mesh(rockGeometry(), rockMat);
  rock.receiveShadow = true; rock.castShadow = true;
  scene.add(rock);

  // a polished gold ring set into the stone under each crystal
  const goldMat = new THREE.MeshStandardMaterial({ color: "#d9ad55", metalness: 1, roughness: 0.22, envMapIntensity: 1.3 });
  if (crystalEnv) goldMat.envMap = crystalEnv; else envWaiting.push(goldMat);
  const ringGeo = new THREE.TorusGeometry(0.13, 0.011, 16, 72);
  for (let i = 0; i < COUNT; i++) {
    const a = seatAngle(i), ring = new THREE.Mesh(ringGeo, goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(Math.sin(a) * RING_R, 0.006, Math.cos(a) * RING_R);
    ring.castShadow = true;
    scene.add(ring);
  }
}

/* ---- light ---- */
scene.add(new THREE.HemisphereLight(0xfff8ee, 0xd9c8b0, 0.55));
const spot = new THREE.SpotLight(0xfff0d8, 95, 16, 0.55, 1, 2);
spot.position.set(0.7, 5.2, 1.6);
spot.castShadow = true;
spot.shadow.mapSize.set(2048, 2048);
spot.shadow.radius = 4;
spot.shadow.bias = -0.0004;
spot.shadow.intensity = 0.4;
scene.add(spot, spot.target);
const rim = new THREE.DirectionalLight(0xffe6c2, 0.7);
rim.position.set(-3, 2.2, -4);
scene.add(rim);

/* ---- stones ---- */
const QM = quartzMaps();
function haloTex() {
  const N = 128, c = mkCanvas(N), x = c.getContext("2d"), g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  for (let k = 0; k <= 10; k++) { const t = k / 10; g.addColorStop(t, `rgba(255,255,255,${(Math.exp(-t * t * 9) * (1 - t)).toFixed(3)})`); }
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return new THREE.CanvasTexture(c);
}
const HALO = haloTex();
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const REST_GLOW = 0.1;
const IDLE_LIGHT = 0.26;   // a faint inner light at rest; the real glow is saved for the stone you choose
// the stones' own mineral colours (garnet, carnelian, citrine, aventurine, aquamarine, lapis, amethyst),
// truer than pure chakra hues and still each chakra's colour
// bright, light versions of each chakra colour: rose-red, apricot, lemon, mint, sky, periwinkle, lilac
const MINERAL = ["#d63a41", "#ec7a30", "#eab21f", "#2fae62", "#2a98cf", "#4458cf", "#9452d6"];
const VEIL = veilTexture();
const which = SINGLE ? [L.index] : CHAKRAS.map((_, i) => i);
/* ---- light from above: a soft shaft of the stone's colour, and a coloured spot that follows the chosen stone ---- */
const BEAM_TOP = 4.6;
const beamGeo = new THREE.ConeGeometry(1, 1, 40, 1, true).translate(0, 0.5, 0);   // base at y 0, apex at y 1
function makeBeam(col) {
  const m = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col.clone() }, uA: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying float vY; varying vec3 vN, vV;
      void main(){ vY=position.y; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vY; varying vec3 vN, vV; uniform vec3 uColor; uniform float uA;
      void main(){
        vec3 n=vN+vec3(1e-5), v=vV+vec3(1e-5);                              // the apex normal can be zero: never divide by it
        float core=pow(clamp(abs(dot(normalize(n),normalize(v))),0.,1.),0.9);  // brightest down the middle
        float a=uA*core*(0.25+0.75*pow(clamp(1.-vY,0.,1.),1.6))*smoothstep(0.,.04,vY);   // strongest where it lands, fading up into the air
        gl_FragColor=vec4(uColor,clamp(a,0.,1.));
      }`,
  }));
  m.renderOrder = 6; m.frustumCulled = false; m.visible = false;
  scene.add(m);
  return m;
}
const hoverSpot = new THREE.SpotLight(0xffffff, 0, 8, 0.2, 0.8, 1.2);
hoverSpot.position.set(0, BEAM_TOP + 1, 0);
scene.add(hoverSpot, hoverSpot.target);

const stones = which.map((ci, n) => {
  const col = new THREE.Color(MINERAL[ci] || CHAKRAS[ci].hex);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, transmission: 1, thickness: 0.14, ior: 1.544,
    roughness: 1, roughnessMap: QM.roughnessMap, normalMap: QM.normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
    // reflections are soft and tinted with the stone's own colour rather than bright white glare
    dispersion: 2.4, attenuationColor: col, attenuationDistance: 0.2,
    specularIntensity: 0.22, specularColor: col.clone().lerp(new THREE.Color(1, 1, 1), 0.1), envMapIntensity: 0.4,
    emissive: col, emissiveIntensity: REST_GLOW,
  });
  if (crystalEnv) mat.envMap = crystalEnv; else envWaiting.push(mat);
  // faces that point downward would mirror the bright studio at a glancing angle and flash white;
  // fade their reflections so the lower point keeps the crystal's own colour
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>
      {
        float up = smoothstep(-0.55, 0.25, inverseTransformDirection(geometryNormal, viewMatrix).y);
        #if defined( RE_IndirectSpecular )
          radiance *= mix(0.08, 1.0, up);
        #endif
        #ifdef USE_ENVMAP
          iblIrradiance *= mix(0.35, 1.0, up);
        #endif
      }`);
  };
  const { g, height, R } = quartz(ci + 3, col);
  const mesh = new THREE.Mesh(g, mat);
  mesh.scale.setScalar(STONE);
  mesh.castShadow = true;
  // milky cloud inside, offset per stone so no two veils match
  const veil = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.7, height * 0.62, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.35), alphaMap: VEIL, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  veil.material.alphaMap = VEIL.clone(); veil.material.alphaMap.offset.set(ci * 0.37, ci * 0.21); veil.material.alphaMap.needsUpdate = true;
  veil.position.y = height * 0.52; veil.rotation.y = ci;
  mesh.add(veil);
  const h = height * STONE;
  const glow = new THREE.PointLight(col, 0, 1.2, 2); glow.position.y = h * 0.5;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, color: col.clone(), depthWrite: false, transparent: true, opacity: 0 }));
  halo.scale.setScalar(1.4); halo.position.y = h * 0.55;
  const spin = new THREE.Group(); spin.add(mesh); spin.rotation.y = ci * 1.7;
  const holder = new THREE.Group(); holder.add(spin, glow, halo);
  scene.add(holder);
  const s = { ci, holder, spin, glow, halo, col, mat, h, lift: 0, liftV: 0, light: 0, spinV: 0, beam: SINGLE ? null : makeBeam(col) };
  if (SINGLE) { holder.position.set(0, FLOAT_Y, 0); s.light = 0.38; }
  else {
    const a = seatAngle(ci);
    holder.position.set(Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R);
    // hover area = the crystal itself, wherever it is now. A unit-tall cylinder standing on the seat,
    // stretched each frame from the seat to the stone's current tip: at rest it is just the stone; while
    // raised it also covers the gap below, so a still cursor doesn't drop the stone it just lifted.
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1, 10).translate(0, 0.5, 0), hitMat);
    hit.position.set(holder.position.x, -0.02, holder.position.z);
    hit.scale.y = h + 0.04;
    hit.userData.i = n;
    scene.add(hit);
    s.hit = hit;
  }
  return s;
});

/* ---- post ---- */
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0, 1.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---- framing ---- */
function fit() {
  const w = hero.clientWidth, h = hero.clientHeight, wide = w > 760;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  camera.aspect = w / h;
  smokeUniforms.uAspect.value = camera.aspect;
  motes.material.uniforms.uPx.value = h * Math.min(devicePixelRatio || 1, 2) * 0.018;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
  let target, d;
  if (SINGLE) {
    target = new THREE.Vector3(0, FLOAT_Y + stones[0].h * 0.45, 0);
    d = stones[0].h / ((wide ? 0.28 : 0.2) * 2 * tanV);
  } else {
    target = new THREE.Vector3(0, LIFT_H * 0.12, 0);
    const fracW = wide ? 0.12 : 0.36;     // rock radius as a share of the width
    d = Math.max(ROCK_R / (fracW * 2 * tanH), (ROCK_R * Math.sin(ELEV) + LIFT_H * Math.cos(ELEV) + 0.3) / (0.8 * tanV));
  }
  camera.position.set(0, target.y + Math.sin(ELEV) * d, Math.cos(ELEV) * d);
  camera.lookAt(target);
  // single mode: the stone sits right of the copy on wide screens, above it on phones
  // single: the stone sits right of the copy on wide screens, above it on phones; circle: a touch low, under the title
  if (SINGLE) camera.setViewOffset(w, h, wide ? -0.2 * w : 0, wide ? 0 : 0.2 * h, w, h);
  else camera.setViewOffset(w, h, 0, -(wide ? 0.05 : 0.03) * h, w, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(fit).observe(hero);
fit();

/* ---- input (circle mode): hover raises, leaving lowers, click opens the chakra's page ---- */
const lifted = L.lifted, setLift = L.setLift;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let pointer = null, hovered = -1, down = null, leaving = false, titleFor = -2, titleTimer = 0;
const titleEl = L.title || null;
const hits = SINGLE ? [] : stones.map(s => s.hit);
function pickAt(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(hits, false)[0];
  return h ? h.object.userData.i : -1;
}
function go(i) {
  if (leaving) return;
  leaving = true;
  stones[i].light = 1.4;
  document.documentElement.classList.add("leaving");
  setTimeout(() => { location.href = CHAKRAS[i].href; }, 420);
}
if (!SINGLE) {
  canvas.addEventListener("pointermove", e => { if (e.pointerType !== "touch") pointer = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("pointerleave", () => { pointer = null; });
  canvas.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, type: e.pointerType }; });
  canvas.addEventListener("pointerup", e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return; }
    const type = down.type; down = null;
    const i = pickAt(e.clientX, e.clientY);
    if (type !== "touch") { if (i >= 0) go(i); return; }
    // touch: first tap raises, a second tap on the raised stone opens its page, a tap elsewhere sets it down
    if (i >= 0 && lifted[i]) { go(i); return; }
    for (let k = 0; k < COUNT; k++) setLift(k, k === i);
  });
  addEventListener("pageshow", e => {
    if (!e.persisted) return;
    leaving = false;
    document.documentElement.classList.remove("leaving");
    for (let k = 0; k < COUNT; k++) setLift(k, false);
  });
}
function updateHover() {
  if (!introSent) return;   // nothing to hover until the clouds have parted
  if (!pointer && hovered < 0) return;
  const h = pointer ? pickAt(pointer.x, pointer.y) : -1;
  if (h === hovered) return;
  if (hovered >= 0) setLift(hovered, false);
  hovered = h;
  if (h >= 0) setLift(h, true);
  hero.classList.toggle("hover-stone", h >= 0);
}
// the title near the top of the screen: which chakra, and which part of the site it opens
const coarse = matchMedia("(pointer:coarse)").matches;
function showTitle() {
  if (!titleEl) return;
  let i = hovered;
  if (i < 0) for (let k = 0; k < COUNT; k++) if (lifted[k]) { i = k; break; }
  if (i === titleFor) return;
  titleFor = i;
  clearTimeout(titleTimer);
  if (i < 0) { titleEl.classList.remove("on"); return; }
  const fill = () => {
    const c = CHAKRAS[i];
    titleEl.style.setProperty("--c", c.hex);
    titleEl.querySelector(".eyebrow span").textContent = c.skt;
    titleEl.querySelector("h2").textContent = c.chakra;
    titleEl.querySelector(".tag").textContent = c.theme.toLowerCase();
    titleEl.querySelector(".go").textContent = `${c.page} \u2192`;
    titleEl.classList.add("on");
  };
  // swapping from one stone to another: let the old title fade before the new one rises
  if (titleEl.classList.contains("on")) { titleEl.classList.remove("on"); titleTimer = setTimeout(fill, 450); }
  else fill();
}

/* ---- loop ---- */
let visible = true, raf = 0, last = performance.now(), time = 0;
new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(hero);
document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }

function applyLight(s) {
  const g = s.light * s.light;
  s.mat.emissiveIntensity = REST_GLOW + g * 0.45;   // lit, but never washed out
  s.glow.intensity = g * 2.6;
  s.halo.material.opacity = Math.min(0.75, g * 0.75);   // aura grows with the light; barely there at rest
}
// a slow breath of light and a gentle float, different for every stone
const breathe = (s, i) => 0.06 * Math.sin(time * 0.9 + i * 1.7);
const float = (s, i) => 0.035 + 0.03 * Math.sin(time * 0.75 + i * 1.3);
function step(dt) {
  time += dt;
  smokeUniforms.uTime.value = reduce ? 20 : time + 20;
  stepIntro();
  if (SINGLE) {
    const s = stones[0];
    s.spin.rotation.y += (reduce ? 0 : 0.3) * dt;
    if (!reduce) s.holder.position.y = FLOAT_Y + 0.05 * Math.sin(time * 0.75);
    s.light = 0.38 + (reduce ? 0 : breathe(s, 0));
    applyLight(s);
    return;
  }
  updateHover();
  stones.forEach((s, i) => {
    const up = lifted[i];
    const k = up ? 14 : 11, zeta = 1;   // slow, unhurried rise and fall, like a breath
    s.liftV += (k * ((up ? 1 : 0) - s.lift) - 2 * zeta * Math.sqrt(k) * s.liftV) * dt;
    s.lift += s.liftV * dt;
    const rising = up ? Math.min(1, Math.max(0, s.liftV * 0.9)) : 0;
    const want = leaving ? s.light : Math.max(up ? 1 : 0, rising, IDLE_LIGHT + (reduce ? 0 : breathe(s, i)));   // raised from the stone or the legend: full light
    s.light += (want - s.light) * (1 - Math.exp(-dt * (want > s.light ? 6 : 2.5)));
    applyLight(s);
    // fast turn while it is being raised, easing to a slow turn once it is up
    const climbing = Math.min(1, Math.max(0, s.liftV / 1.1));
    const spinT = reduce ? 0 : up ? 0.3 + 4.5 * climbing : 0.15;   // a quicker turn on the way up, then barely moving
    s.spinV += (spinT - s.spinV) * (1 - Math.exp(-dt * (spinT > s.spinV ? 12 : 2.2)));
    s.spin.rotation.y += s.spinV * dt;
    s.holder.position.y = Math.max(0, s.lift) * LIFT_H + (reduce ? 0.03 : float(s, i));
    s.hit.scale.y = s.holder.position.y + s.h + 0.04;
    s.hit.updateMatrixWorld();
    // a column of the stone's own light, from high above down to its seat; the stone floats inside it
    const shine = Math.min(1, Math.max(0, (s.light - 0.55) / 0.45));
    s.shine = shine;
    s.beam.visible = shine > 0.01;
    s.beam.position.set(s.holder.position.x, 0.005, s.holder.position.z);
    s.beam.scale.set(0.3, BEAM_TOP, 0.3);
    s.beam.material.uniforms.uA.value = shine * 0.55;
  });
  // one coloured spot follows the brightest chosen stone and pools its colour on the rock
  let best = null;
  for (const s of stones) if (!best || s.shine > best.shine) best = s;
  hoverSpot.intensity = best ? best.shine * 60 : 0;
  if (best && best.shine > 0.01) {
    hoverSpot.color.copy(best.col);
    hoverSpot.position.set(best.holder.position.x, BEAM_TOP + 1, best.holder.position.z);
    hoverSpot.target.position.set(best.holder.position.x, 0, best.holder.position.z);
    hoverSpot.target.updateMatrixWorld();
  }
  showTitle();
}
function loop(now) {
  raf = 0;
  if (!visible || document.hidden) return;
  const dt = Math.min(1 / 20, (now - last) / 1000); last = now;
  step(dt);
  composer.render();
  raf = requestAnimationFrame(loop);
}
window.__lumea = {
  stones, camera, lifted, setLift, go,
  project: i => { const v = stones[i].holder.position.clone(); v.y += 0.25; v.project(camera); const r = canvas.getBoundingClientRect(); return [(v.x * 0.5 + 0.5) * r.width, (0.5 - v.y * 0.5) * r.height]; },
};
kick();
})();
