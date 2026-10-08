import * as THREE from 'three';

// All environment textures are painted on canvases at load time (no image downloads).
let maxAniso = 8;
export function setAniso(n) { maxAniso = n; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

export function toTex(c, { repeat = [1, 1], srgb = true, wrap = true, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = maxAniso;
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}

// Small deterministic hash noise so textures look the same for every seed/run.
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function speckle(ctx, w, h, amt, seed, dark = 0.5) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data; const r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - dark) * amt;
    d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, w, h, n, colorFn, rMin, rMax, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = rMin + r() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, colorFn(r)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

// Road: 9.6m wide (3 lanes of 2.4m + 1.2m gutters), 12m period along z.
export const ROAD_W = 9.6, ROAD_PERIOD = 12;
export function roadTexture() {
  const W = 512, H = 640; const [c, x] = canvas(W, H);
  x.fillStyle = '#4a4550'; x.fillRect(0, 0, W, H);
  blotches(x, W, H, 60, (r) => `rgba(${r() < 0.5 ? '30,28,36' : '95,88,96'},${0.15 + r() * 0.2})`, 20, 90, 3);
  const px = W / ROAD_W; // pixels per metre
  // tyre-polished strips in each lane
  for (let l = 0; l < 3; l++) {
    const cx = (1.2 + 1.2 + l * 2.4) * px;
    for (const o of [-0.55, 0.55]) { x.fillStyle = 'rgba(25,22,30,0.22)'; x.fillRect(cx + o * px - 0.22 * px, 0, 0.44 * px, H); }
  }
  speckle(x, W, H, 38, 7);
  // gutters
  x.fillStyle = 'rgba(40,36,44,0.9)'; x.fillRect(0, 0, 0.5 * px, H); x.fillRect(W - 0.5 * px, 0, 0.5 * px, H);
  // edge lines
  x.fillStyle = '#f2e9dc'; x.fillRect(1.05 * px, 0, 0.14 * px, H); x.fillRect(W - 1.19 * px, 0, 0.14 * px, H);
  // dashed lane lines: 4m dash every 12m (texture is one period tall)
  for (const lx of [3.6, 6.0]) { x.fillStyle = '#f7f1e6'; x.fillRect(lx * px - 0.07 * px, H * 0.1, 0.14 * px, H * (4 / 12)); }
  // worn paint
  x.globalCompositeOperation = 'multiply';
  blotches(x, W, H, 40, (r) => `rgba(120,110,120,${0.25 + r() * 0.3})`, 6, 26, 11);
  x.globalCompositeOperation = 'source-over';
  // tar-sealed cracks
  const r = rng(21); x.strokeStyle = 'rgba(20,18,24,0.55)'; x.lineWidth = 2;
  for (let i = 0; i < 7; i++) { let cx = r() * W, cy = r() * H; x.beginPath(); x.moveTo(cx, cy); for (let k = 0; k < 6; k++) { cx += (r() - 0.5) * 50; cy += (r() - 0.3) * 40; x.lineTo(cx, cy); } x.stroke(); }
  return toTex(c, { repeat: [1, 1] });
}

export function sidewalkTexture() {
  const S = 512; const [c, x] = canvas(S, S);
  x.fillStyle = '#e9b7a6'; x.fillRect(0, 0, S, S);
  blotches(x, S, S, 30, (r) => `rgba(${r() < 0.5 ? '255,220,205' : '200,140,130'},${0.2 + r() * 0.2})`, 30, 100, 5);
  speckle(x, S, S, 26, 9);
  // 4x4 slabs (each slab 1m when repeated at 4m)
  x.strokeStyle = 'rgba(120,70,70,0.55)'; x.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * S / 4, 0); x.lineTo(i * S / 4, S); x.stroke(); x.beginPath(); x.moveTo(0, i * S / 4); x.lineTo(S, i * S / 4); x.stroke(); }
  return toTex(c);
}

export function sandTexture() {
  const S = 512; const [c, x] = canvas(S, S);
  x.fillStyle = '#f2d6ae'; x.fillRect(0, 0, S, S);
  blotches(x, S, S, 50, (r) => `rgba(${r() < 0.5 ? '255,236,205' : '214,178,135'},${0.25 + r() * 0.25})`, 20, 80, 13);
  speckle(x, S, S, 46, 17);
  // wind ripples
  x.strokeStyle = 'rgba(190,150,110,0.18)'; x.lineWidth = 3;
  const r = rng(4);
  for (let i = 0; i < 40; i++) { const y = r() * S; x.beginPath(); x.moveTo(0, y); for (let k = 0; k <= 8; k++) x.lineTo(k * S / 8, y + Math.sin(k + i) * 6); x.stroke(); }
  return toTex(c);
}

export function barkTexture() {
  const W = 128, H = 512; const [c, x] = canvas(W, H);
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#6b4a33'); g.addColorStop(0.5, '#9c7652'); g.addColorStop(1, '#6b4a33');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 16) {
    x.fillStyle = 'rgba(50,32,20,0.55)'; x.fillRect(0, y, W, 4);
    x.fillStyle = 'rgba(200,170,130,0.35)'; x.fillRect(0, y + 5, W, 3);
  }
  speckle(x, W, H, 30, 23);
  return toTex(c);
}

// One palm frond: rib down the middle, leaflets angled out, alpha in the transparent parts.
export function frondTexture() {
  const W = 256, H = 1024; const [c, x] = canvas(W, H);
  x.clearRect(0, 0, W, H);
  const r = rng(31);
  const mid = W / 2;
  for (let i = 0; i < 70; i++) {
    const t = i / 70; const y = H * (0.04 + t * 0.94);
    const len = W * 0.48 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) * (0.85 + r() * 0.15);
    for (const s of [-1, 1]) {
      const ang = (0.55 + t * 0.35) * s;
      const ex = mid + Math.sin(ang) * len, ey = y + Math.cos(Math.abs(ang)) * len * 0.55;
      const gr = x.createLinearGradient(mid, y, ex, ey);
      const hue = 95 + r() * 30, light = 26 + r() * 14;
      gr.addColorStop(0, `hsl(${hue},60%,${light}%)`); gr.addColorStop(1, `hsl(${hue + 10},65%,${light + 16}%)`);
      x.strokeStyle = gr; x.lineWidth = 7 - t * 3; x.lineCap = 'round';
      x.beginPath(); x.moveTo(mid, y); x.quadraticCurveTo(mid + (ex - mid) * 0.5, y + (ey - y) * 0.2, ex, ey); x.stroke();
    }
  }
  x.strokeStyle = '#7a8a3a'; x.lineWidth = 6; x.beginPath(); x.moveTo(mid, 0); x.lineTo(mid, H); x.stroke();
  return toTex(c, { wrap: false });
}

// Window atlas: 2 columns x 2 rows of window styles, each cell one bay x one floor.
export function windowTexture() {
  const S = 512; const [c, x] = canvas(S, S); const h = S / 2;
  for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
    const ox = cx * h, oy = cy * h;
    x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(ox, oy, h, h);
    const pad = cy === 0 ? 0.22 : 0.16;
    const wx = ox + h * pad, wy = oy + h * 0.2, ww = h * (1 - pad * 2), wh = h * 0.6;
    // frame
    x.fillStyle = '#f8f4ee'; x.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
    const g = x.createLinearGradient(0, wy, 0, wy + wh);
    if (cx === 0) { g.addColorStop(0, '#3a4f7a'); g.addColorStop(0.55, '#d07a8a'); g.addColorStop(1, '#ffc28a'); }
    else { g.addColorStop(0, '#2a3a5a'); g.addColorStop(0.6, '#6a6a9a'); g.addColorStop(1, '#e8a0a0'); }
    x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
    // reflection streak
    x.fillStyle = 'rgba(255,255,255,0.22)';
    x.beginPath(); x.moveTo(wx + ww * 0.15, wy + wh); x.lineTo(wx + ww * 0.45, wy); x.lineTo(wx + ww * 0.6, wy); x.lineTo(wx + ww * 0.3, wy + wh); x.fill();
    // mullions
    x.fillStyle = '#f8f4ee';
    if (cy === 0) { x.fillRect(wx + ww / 2 - 3, wy, 6, wh); x.fillRect(wx, wy + wh * 0.35, ww, 5); }
    else { for (let k = 1; k < 3; k++) x.fillRect(wx + ww * k / 3 - 2, wy, 4, wh); }
    // sill shadow
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(wx - 6, wy + wh + 6, ww + 12, 8);
  }
  return toTex(c, { wrap: true });
}

// Emissive mask matching windowTexture: a few panes glow warm (lit rooms at dusk).
export function windowEmissive() {
  const S = 512; const [c, x] = canvas(S, S); const h = S / 2;
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  // cell (1,1) is the "lit" variant
  const ox = h, oy = h, pad = 0.16; const wx = ox + h * pad, wy = oy + h * 0.2, ww = h * (1 - pad * 2), wh = h * 0.6;
  const g = x.createLinearGradient(0, wy, 0, wy + wh); g.addColorStop(0, '#ffb070'); g.addColorStop(1, '#ffdca0');
  x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
  x.fillStyle = '#000'; for (let k = 1; k < 3; k++) x.fillRect(wx + ww * k / 3 - 2, wy, 4, wh);
  return toTex(c, { wrap: true });
}

export const HOTEL_NAMES = ['FLAMINGO', 'OCEAN VIEW', 'MALIBU', 'PINK PALMS', 'THE VICE', 'STARFISH', 'BREAKERS', 'MOONLIGHT', 'CORAL', 'SUNSET', 'PARADISE', 'LUXE'];
export const NEON_COLORS = ['#ff3fa4', '#38f3ff', '#ffe066', '#9b7bff', '#ff6b3d', '#4dff9d'];
// Neon sign atlas: one row per hotel name (white tubes; tinted per sign via vertex color).
export function neonTexture() {
  const W = 1024, rowH = 96, H = rowH * 16; const [c, x] = canvas(W, H);
  x.clearRect(0, 0, W, H);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  HOTEL_NAMES.forEach((n, i) => {
    const y = i * rowH + rowH / 2;
    x.font = `${rowH * 0.62}px Rubik, Arial Black, sans-serif`;
    x.shadowColor = '#fff'; x.shadowBlur = 18; x.fillStyle = '#fff';
    x.fillText(n, W / 2, y);
    x.shadowBlur = 0;
  });
  // row 12: "HOTEL" vertical-friendly, row 13: palm/flamingo-ish glyphs, row 14: "VACANCY"
  x.font = `${rowH * 0.62}px Rubik, Arial Black, sans-serif`;
  x.shadowColor = '#fff'; x.shadowBlur = 18; x.fillStyle = '#fff';
  x.fillText('HOTEL', W / 2, 12 * rowH + rowH / 2);
  x.fillText('VACANCY', W / 2, 13 * rowH + rowH / 2);
  x.fillText('OPEN 24H', W / 2, 14 * rowH + rowH / 2);
  x.fillText('LIQUOR', W / 2, 15 * rowH + rowH / 2);
  return toTex(c, { wrap: false });
}
export const NEON_ROWS = 16;

// Stacked upright letters for the vertical sign on each hotel's fin.
export function neonVerticalTexture() {
  const W = 128, H = 640; const [c, x] = canvas(W, H);
  x.clearRect(0, 0, W, H);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `${H / 5 * 0.78}px Rubik, Arial Black, sans-serif`;
  x.shadowColor = '#fff'; x.shadowBlur = 16; x.fillStyle = '#fff';
  'HOTEL'.split('').forEach((ch, i) => x.fillText(ch, W / 2, (i + 0.5) * H / 5 + 4));
  x.shadowBlur = 0; x.strokeStyle = '#fff'; x.lineWidth = 5; x.strokeRect(8, 4, W - 16, H - 8);
  return toTex(c, { wrap: false });
}

export function stripeTexture(a = '#e8212b', b = '#ffffff', n = 8, diag = true) {
  const S = 256; const [c, x] = canvas(S, S);
  x.fillStyle = b; x.fillRect(0, 0, S, S); x.fillStyle = a;
  const w = S / n;
  for (let i = -n; i < n * 2; i += 2) {
    x.beginPath();
    if (diag) { x.moveTo(i * w, 0); x.lineTo(i * w + w, 0); x.lineTo(i * w + w + S, S); x.lineTo(i * w + S, S); }
    else { x.rect(i * w, 0, w, S); }
    x.fill();
  }
  speckle(x, S, S, 14, 3);
  return toTex(c);
}

// Tileable water normal map from summed waves.
export function waterNormal() {
  const S = 256; const [c, x] = canvas(S, S); const img = x.createImageData(S, S); const d = img.data;
  const waves = []; const r = rng(77);
  for (let i = 0; i < 9; i++) waves.push({ kx: Math.round((r() - 0.5) * 12), ky: Math.round(1 + r() * 10), a: 0.6 / (i + 1.5), p: r() * 6.28 });
  const hgt = (u, v) => waves.reduce((s, w) => s + w.a * Math.sin(6.2832 * (w.kx * u + w.ky * v) + w.p), 0);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S, e = 1 / S;
    const dx = (hgt(u + e, v) - hgt(u - e, v)) * 3, dy = (hgt(u, v + e) - hgt(u, v - e)) * 3;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    const k = (j * S + i) * 4; d[k] = (n.x * 0.5 + 0.5) * 255; d[k + 1] = (n.y * 0.5 + 0.5) * 255; d[k + 2] = (n.z * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return toTex(c, { srgb: false });
}

// Coin face: embossed "$" as a bump-style normal map.
export function coinNormal() {
  const S = 128; const [c, x] = canvas(S, S);
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#fff'; x.lineWidth = 7; x.beginPath(); x.arc(S / 2, S / 2, S * 0.42, 0, 6.283); x.stroke();
  x.fillStyle = '#fff'; x.font = `bold ${S * 0.62}px Rubik, Arial Black, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', S / 2, S / 2 + 4);
  const h = x.getImageData(0, 0, S, S).data; const out = x.createImageData(S, S); const o = out.data;
  const H = (i, j) => h[(((j + S) % S) * S + ((i + S) % S)) * 4] / 255;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) * 2.5, dy = (H(i, j + 1) - H(i, j - 1)) * 2.5;
    const n = new THREE.Vector3(-dx, dy, 1).normalize(); const k = (j * S + i) * 4;
    o[k] = (n.x * 0.5 + 0.5) * 255; o[k + 1] = (n.y * 0.5 + 0.5) * 255; o[k + 2] = (n.z * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  return toTex(c, { srgb: false, wrap: false });
}

export function glowTexture() {
  const S = 128; const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return toTex(c, { wrap: false, srgb: false });
}

export function blobShadowTexture() {
  const S = 128; const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return toTex(c, { wrap: false });
}

export function signTexture(text, bg = '#1d2b6b', fg = '#ffffff', w = 512, h = 128, font = 'Anton, Rubik, sans-serif') {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = fg; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h - 16);
  x.fillStyle = fg; x.font = `${h * 0.56}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 3);
  return toTex(c, { wrap: false });
}
