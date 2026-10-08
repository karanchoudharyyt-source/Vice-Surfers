import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './tex.js';
import { curveMaterial } from './curve.js';

const C = (h) => new THREE.Color(h);

// ---------- geometry helpers ----------
function paint(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.position.count; const a = new Float32Array(n * 3); const c = C(color);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
function box(w, h, d, x, y, z, color, sz = 1) { const g = new THREE.BoxGeometry(w, h, d, 1, 1, sz); g.translate(x, y, z); return paint(g, color); }
function cyl(rt, rb, h, x, y, z, color, seg = 16, open = false, start = 0, len = Math.PI * 2) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, start, len); g.translate(x, y, z); return paint(g, color);
}
function merge(list) { return mergeGeometries(list.map((g) => { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) o.deleteAttribute(k); return o; }), false); }

// ---------- shared materials ----------
export const M = {};
export function initMaterials(env) {
  M.stucco = curveMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.6 }));
  M.trim = curveMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2, envMapIntensity: 1.0 }));
  const wt = T.windowTexture();
  M.window = curveMaterial(new THREE.MeshStandardMaterial({ map: wt, emissiveMap: T.windowEmissive(), emissive: C('#ffffff'), emissiveIntensity: 1.6, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.6 }));
  M.neon = curveMaterial(new THREE.MeshBasicMaterial({ map: T.neonTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  M.neon.color.setScalar(3.2);
  M.neonV = M.neon.clone(); M.neonV.map = T.neonVerticalTexture(); M.neonV.userData = {}; curveMaterial(M.neonV);
  M.awning = curveMaterial(new THREE.MeshStandardMaterial({ map: T.stripeTexture('#ffffff', '#d8d8d8', 6, false), vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
  M.bark = curveMaterial(new THREE.MeshStandardMaterial({ map: T.barkTexture(), roughness: 0.9 }));
  M.frond = curveMaterial(new THREE.MeshStandardMaterial({ map: T.frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, emissive: C('#1a3305'), emissiveIntensity: 0.35 }));
  M.metal = curveMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 }));
  M.lamp = curveMaterial(new THREE.MeshBasicMaterial({ color: C('#ffe2a8').multiplyScalar(3), toneMapped: false }));
  M.glow = new THREE.SpriteMaterial({ map: T.glowTexture(), color: C('#ffb36b'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, toneMapped: false });
  M.stripeRW = curveMaterial(new THREE.MeshStandardMaterial({ map: T.stripeTexture('#e8212b', '#ffffff', 8, true), roughness: 0.5 }));
  M.policeLine = curveMaterial(new THREE.MeshStandardMaterial({ map: policeLineTexture(), roughness: 0.55, side: THREE.DoubleSide }));
  M.amber = curveMaterial(new THREE.MeshBasicMaterial({ color: C('#ffae2a').multiplyScalar(4), toneMapped: false }));
  M.coinRim = curveMaterial(new THREE.MeshStandardMaterial({ color: C('#f2b51f'), metalness: 1, roughness: 0.28, emissive: C('#ff9a00'), emissiveIntensity: 0.18 }));
  M.coinFace = curveMaterial(new THREE.MeshStandardMaterial({ color: C('#ffd34a'), metalness: 1, roughness: 0.2, normalMap: T.coinNormal(), normalScale: new THREE.Vector2(1.4, 1.4), emissive: C('#ff9a00'), emissiveIntensity: 0.22 }));
  M.glass = curveMaterial(new THREE.MeshStandardMaterial({ color: C('#16233d'), roughness: 0.05, metalness: 0.4, envMapIntensity: 2.0 }));
  M.rotor = curveMaterial(new THREE.MeshBasicMaterial({ color: C('#111111'), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  M.beam = curveMaterial(new THREE.MeshBasicMaterial({ map: beamTexture(), color: C('#fff3d6'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, opacity: 0.55 }));
  M.spot = curveMaterial(new THREE.MeshBasicMaterial({ map: T.glowTexture(), color: C('#fff1cc').multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  M.red = curveMaterial(new THREE.MeshBasicMaterial({ color: C('#ff1a2a').multiplyScalar(5), toneMapped: false }));
  M.blue = curveMaterial(new THREE.MeshBasicMaterial({ color: C('#2a5bff').multiplyScalar(5), toneMapped: false }));
}

function policeLineTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#ffd400'; x.fillRect(0, 0, 1024, 128);
  x.fillStyle = '#111'; x.fillRect(0, 0, 1024, 12); x.fillRect(0, 116, 1024, 12);
  x.font = '64px Anton, Rubik, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center';
  x.fillText('POLICE LINE  •  DO NOT CROSS  •', 512, 66);
  return T.toTex(c, { wrap: true });
}
function beamTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 256);
  const h = x.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 256);
  return T.toTex(c, { wrap: false, srgb: false });
}

// ---------- Art Deco hotel ----------
const PASTELS = ['#ffb3c9', '#a9ead2', '#ffd2a8', '#cdb9f0', '#fff1a6', '#f6f2ea', '#9fdcf0', '#ffc2e0', '#bff0e0'];
const ACCENTS = ['#ff4f9a', '#1fb5b0', '#ff8a4c', '#7b5cd6', '#2f8fd8', '#f2c230', '#ffffff'];

// Front face sits at local x=0 facing -x (towards the road); the building extends into +x.
export function makeHotel(rand, index) {
  const L = 16 + Math.floor(rand() * 4) * 3;          // length along the street
  const floors = 3 + Math.floor(rand() * 3);
  const FH = 3.4, GH = 4.2;                           // floor / ground-floor height
  const H = GH + floors * FH + 1.2;
  const D = 14;
  const body = PASTELS[Math.floor(rand() * PASTELS.length)];
  let acc = ACCENTS[Math.floor(rand() * ACCENTS.length)];
  if (acc === body) acc = '#ffffff';
  const ledge = rand() < 0.5 ? '#ffffff' : acc;
  const stucco = [], trim = [], win = [], neon = [], neonV = [], awn = [];

  stucco.push(box(D, H, L, D / 2, H / 2, 0, body, Math.ceil(L / 3)));
  // plinth and ground-floor band
  stucco.push(box(0.5, 0.7, L + 0.2, -0.1, 0.35, 0, acc));
  stucco.push(box(0.3, 0.5, L, -0.1, GH - 0.25, 0, ledge));
  // parapet with stepped cornice
  stucco.push(box(0.35, 1.0, L + 0.3, -0.12, H - 0.5, 0, acc));
  stucco.push(box(0.6, 0.25, L + 0.6, -0.2, H + 0.1, 0, ledge));

  const finZ = (rand() - 0.5) * L * 0.3;
  const finW = 2.2;
  const hasCorner = rand() < 0.65;
  const cornerSide = rand() < 0.5 ? -1 : 1;
  const cornerR = 2.6;

  // eyebrow ledges over each floor's windows
  for (let f = 0; f < floors; f++) {
    const y = GH + (f + 1) * FH - 0.45;
    trim.push(box(0.9, 0.14, L - (hasCorner ? cornerR * 1.2 : 0.4), -0.45, y, hasCorner ? -cornerSide * cornerR * 0.6 : 0, ledge, Math.ceil(L / 4)));
  }
  // vertical fin with stepped crown and neon strip
  const finH = H + 3 + rand() * 4;
  stucco.push(box(1.2, finH, finW, -0.6, finH / 2, finZ, acc));
  stucco.push(box(1.6, 1.2, finW + 0.8, -0.5, finH - 2.2, finZ, ledge));
  stucco.push(box(1.0, 1.4, finW * 0.6, -0.5, finH + 0.7, finZ, acc));
  trim.push(box(0.5, 2.5, 0.25, -0.6, finH + 2.6, finZ, '#e8e8e8'));
  const nc = C(T.NEON_COLORS[Math.floor(rand() * T.NEON_COLORS.length)]);
  // vertical HOTEL sign on the fin (text runs top to bottom)
  const vh = Math.min(9, (finH - GH) * 0.7);
  const vs = new THREE.PlaneGeometry(vh / 5 * 1.0, vh); vs.rotateY(-Math.PI / 2);
  vs.translate(-1.25, GH + 0.8 + vh / 2, finZ); neonV.push(paint(vs, '#' + nc.getHexString()));
  // hotel name across the parapet
  const signW = Math.min(L * 0.42, 8.5);
  const side = finZ > 0 ? -1 : 1;
  const signZ = THREE.MathUtils.clamp(finZ + side * (finW / 2 + signW / 2 + 0.4), -L / 2 + signW / 2 + 0.3, L / 2 - signW / 2 - 0.3);
  const nm = signQuad(index % T.HOTEL_NAMES.length, signW * 2.6, signW * 2.6 / 10.67, C(T.NEON_COLORS[(index + 2) % T.NEON_COLORS.length]), false);
  nm.translate(-0.36, H - 0.5, signZ); neon.push(nm);

  // streamline corner tower
  if (hasCorner) {
    const cz = cornerSide * (L / 2 - cornerR * 0.4);
    stucco.push(cyl(cornerR, cornerR, H + 1.6, cornerR * 0.6, (H + 1.6) / 2, cz, body, 24));
    for (let f = 0; f < floors; f++) trim.push(cyl(cornerR + 0.45, cornerR + 0.45, 0.14, cornerR * 0.6, GH + (f + 1) * FH - 0.45, cz, ledge, 24));
    trim.push(cyl(cornerR + 0.25, cornerR + 0.25, 0.5, cornerR * 0.6, H + 1.6, cz, acc, 24));
    // curved glass band per floor
    for (let f = 0; f < floors; f++) {
      const g = new THREE.CylinderGeometry(cornerR + 0.02, cornerR + 0.02, FH * 0.55, 20, 1, true, Math.PI, Math.PI);
      g.translate(cornerR * 0.6, GH + f * FH + FH * 0.42, cz);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + uv.getX(i) * 0.48, 0.5 + 0.12 + uv.getY(i) * 0.3);
      win.push(g);
    }
  }
  // windows: one quad per bay per floor, picking a cell from the 2x2 atlas
  const style = rand() < 0.5 ? 0 : 1;
  const bayW = 3;
  const bays = Math.floor(L / bayW);
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const z = -L / 2 + bayW / 2 + b * bayW + (L - bays * bayW) / 2;
    if (Math.abs(z - finZ) < finW * 0.9) continue;
    if (hasCorner && Math.abs(z - cornerSide * (L / 2 - cornerR * 0.4)) < cornerR + 0.6) continue;
    const lit = rand() < 0.22 ? 1 : 0;
    const cx = lit ? 1 : style, cy = lit ? 1 : style;
    const q = new THREE.PlaneGeometry(bayW, FH); q.rotateY(-Math.PI / 2);
    q.translate(-0.02, GH + f * FH + FH / 2 - 0.1, z);
    const uv = q.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / 2, (1 - cy + uv.getY(i)) / 2);
    win.push(q);
  }
  // ground floor: storefront glass and striped awnings
  const shops = Math.max(2, Math.floor(L / 5));
  for (let s = 0; s < shops; s++) {
    const z = -L / 2 + (s + 0.5) * (L / shops);
    if (Math.abs(z - finZ) < finW * 0.7) continue;
    const q = new THREE.PlaneGeometry(L / shops - 1.2, 2.6); q.rotateY(-Math.PI / 2); q.translate(-0.03, 1.9, z);
    const uv = q.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + uv.getX(i) * 0.5, 0.05 + uv.getY(i) * 0.4);
    win.push(q);
    awn.push(paint(awning(z, L / shops - 0.8), s % 2 ? acc : ACCENTS[(index + s) % ACCENTS.length]));
  }
  const g = new THREE.Group();
  const add = (list, mat, shadow = true) => { if (!list.length) return; const m = new THREE.Mesh(merge(list), mat); m.castShadow = shadow; m.receiveShadow = true; g.add(m); };
  add(stucco, M.stucco); add(trim, M.trim); add(win, M.window, false); add(awn, M.awning); add(neon, M.neon, false); add(neonV, M.neonV, false);
  g.userData.len = L;
  return g;
}

// Sloped striped awning over a shop front: wall edge at x=0, front edge out over the sidewalk.
function awning(z, w) {
  const y0 = 3.7, y1 = 3.05, out = -1.7, val = 0.35, tile = 2.1;
  const zl = z - w / 2, zr = z + w / 2;
  const v = [0, y0, zl, 0, y0, zr, out, y1, zr, out, y1, zl, out, y1, zl, out, y1, zr, out, y1 - val, zr, out, y1 - val, zl];
  const u = [zl / tile, 1, zr / tile, 1, zr / tile, 0, zl / tile, 0, zl / tile, 1, zr / tile, 1, zr / tile, 0, zl / tile, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]);
  const n = g.toNonIndexed(); n.computeVertexNormals();
  return n;
}

function signQuad(row, w, h, color, vertical) {
  const q = new THREE.PlaneGeometry(vertical ? h : w, vertical ? w : h);
  if (vertical) q.rotateZ(-Math.PI / 2);
  q.rotateY(-Math.PI / 2);
  const uv = q.attributes.uv; const r0 = row / T.NEON_ROWS;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - (r0 + (1 - uv.getY(i)) / T.NEON_ROWS));
  return paint(q, '#' + color.clone().multiplyScalar(1).getHexString());
}

// ---------- palm ----------
export function makePalm(rand) {
  const H = 7 + rand() * 3.5;
  const lean = new THREE.Vector3((rand() - 0.5) * 2.2, 0, (rand() - 0.5) * 1.2);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean.x * 0.2, H * 0.55, lean.z * 0.2), new THREE.Vector3(lean.x, H, lean.z));
  const rings = 18, seg = 9, pos = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings; const p = curve.getPoint(t);
    const r = 0.27 * (1 - t) + 0.15 * t + (t < 0.08 ? (0.08 - t) * 2.2 : 0);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r);
      uv.push(j / seg, t * H / 3);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const trunk = new THREE.BufferGeometry();
  trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); trunk.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); trunk.setIndex(idx);
  trunk.computeVertexNormals();
  const top = curve.getPoint(1);
  const nuts = [];
  for (let i = 0; i < 5; i++) { const a = i * 1.3; const s = new THREE.SphereGeometry(0.17, 8, 6); s.translate(top.x + Math.cos(a) * 0.28, top.y - 0.25 - (i % 2) * 0.12, top.z + Math.sin(a) * 0.28); s.deleteAttribute('uv'); s.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(s.attributes.position.count * 2).fill(0.02), 2)); nuts.push(s); }
  const trunkAll = mergeGeometries([trunk.toNonIndexed(), ...nuts.map((n) => n.toNonIndexed())]);
  // fronds: arching strips
  const fr = [];
  const N = 13 + Math.floor(rand() * 4);
  for (let k = 0; k < N; k++) {
    const az = (k / N) * Math.PI * 2 + rand() * 0.3;
    const len = 3.4 + rand() * 1.4, wid = 1.25;
    const up = 0.55 - rand() * 0.9 - (k % 3 === 0 ? 0.4 : 0);
    const segs = 10; const p = [], u = [], ix = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const r = t * len; const y = Math.sin(up) * r - 1.9 * t * t * len * 0.35;
      const w = wid * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)) * 0.5 + 0.05;
      const droop = -0.25 * t;
      for (const s of [-1, 1]) {
        const lx = Math.cos(up) * r, lz = s * w;
        p.push(top.x + Math.cos(az) * lx - Math.sin(az) * lz, top.y + y + droop * Math.abs(s) * 0.4, top.z + Math.sin(az) * lx + Math.cos(az) * lz);
        u.push(s < 0 ? 0 : 1, 1 - t);
      }
    }
    for (let i = 0; i < segs; i++) { const a = i * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(ix); g.computeVertexNormals();
    fr.push(g.toNonIndexed());
  }
  const fronds = mergeGeometries(fr);
  // bend fronds' normals upwards so the canopy is lit from above rather than by face orientation
  const n = fronds.attributes.normal; for (let i = 0; i < n.count; i++) { n.setXYZ(i, n.getX(i) * 0.3, Math.abs(n.getY(i)) * 0.7 + 0.5, n.getZ(i) * 0.3); }
  const grp = new THREE.Group();
  const t = new THREE.Mesh(trunkAll, M.bark); t.castShadow = true; t.receiveShadow = true;
  const f = new THREE.Mesh(fronds, M.frond); f.castShadow = true; f.receiveShadow = true;
  grp.add(t, f);
  return grp;
}

// ---------- street lamp ----------
export function makeLamp(side) {
  const s = side; // +1 arm points to -x (road on the left of a right-side lamp)
  const parts = [cyl(0.09, 0.13, 5.6, 0, 2.8, 0, '#f4f1ea', 10), cyl(0.22, 0.26, 0.5, 0, 0.25, 0, '#3bb3ad', 10), box(1.4, 0.1, 0.1, -s * 0.65, 5.55, 0, '#f4f1ea')];
  const g = new THREE.Group();
  const m = new THREE.Mesh(merge(parts), M.metal); m.castShadow = true; g.add(m);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), M.lamp); bulb.position.set(-s * 1.3, 5.35, 0); g.add(bulb);
  const glow = new THREE.Sprite(M.glow); glow.scale.set(2.6, 2.6, 1); glow.position.copy(bulb.position); g.add(glow);
  return g;
}

// ---------- beach props ----------
export function makeUmbrella(rand) {
  const cols = [['#ff4f9a', '#ffffff'], ['#1fb5b0', '#fff1a6'], ['#ff8a4c', '#ffffff'], ['#7b5cd6', '#a9ead2']][Math.floor(rand() * 4)];
  const parts = [cyl(0.04, 0.04, 2.3, 0, 1.15, 0, '#eeeeee', 6)];
  for (let i = 0; i < 8; i++) parts.push(cyl(0.05, 1.5, 0.55, 0, 2.35, 0, cols[i % 2], 8, false, (i / 8) * Math.PI * 2, Math.PI * 2 / 8));
  const towel = box(0.9, 0.02, 1.8, 0.9, 0.01, 0.3, cols[0]);
  parts.push(towel);
  const m = new THREE.Mesh(merge(parts), M.stucco); m.castShadow = true; m.receiveShadow = true;
  m.rotation.z = (rand() - 0.5) * 0.25;
  return m;
}

export function makeLifeguard(rand) {
  const cols = [['#ff7ab0', '#fff1a6'], ['#58c7e8', '#ffffff'], ['#ffd34a', '#ff4f9a'], ['#a9ead2', '#7b5cd6']][Math.floor(rand() * 4)];
  const parts = [];
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) parts.push(box(0.18, 2.2, 0.18, x, 1.1, z, '#f2efe8'));
  parts.push(box(3, 0.2, 3, 0, 2.3, 0, '#f2efe8'));
  for (let i = 0; i < 4; i++) parts.push(box(2.6, 0.55, 2.6, 0, 2.7 + i * 0.55, 0, cols[i % 2]));
  parts.push(box(3.4, 0.25, 3.4, 0, 5.0, 0, '#ffffff'));
  parts.push(box(2.0, 0.6, 2.0, 0, 5.4, 0, cols[1]));
  const ramp = new THREE.BoxGeometry(1.1, 0.12, 3.6); ramp.rotateX(0.62); ramp.translate(0, 1.2, -3.0); parts.push(paint(ramp, '#f2efe8'));
  const m = new THREE.Mesh(merge(parts), M.stucco); m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- obstacles ----------
export function makeBarrier() {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.34, 0.08), M.stripeRW); board.position.y = 0.82; board.castShadow = true; g.add(board);
  const board2 = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 0.08), M.stripeRW); board2.position.y = 0.38; board2.castShadow = true; g.add(board2);
  const legs = [];
  for (const x of [-0.95, 0.95]) for (const z of [-0.28, 0.28]) { const l = new THREE.BoxGeometry(0.08, 1.05, 0.08); l.rotateX(z > 0 ? -0.28 : 0.28); l.translate(x, 0.5, z * 0.5); legs.push(paint(l, '#f4f4f4')); }
  const lm = new THREE.Mesh(merge(legs), M.stucco); lm.castShadow = true; g.add(lm);
  for (const x of [-0.85, 0.85]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M.amber); b.position.set(x, 1.06, 0); g.add(b);
    const s = new THREE.Sprite(M.glow.clone()); s.material.color = C('#ffab2e'); s.material.opacity = 0.9; s.scale.set(0.9, 0.9, 1); s.position.copy(b.position); s.userData.isGlow = true; g.add(s);
  }
  g.userData.h = 1.05;
  return g;
}

export function makeOverhead() {
  const g = new THREE.Group();
  const posts = [cyl(0.07, 0.07, 2.5, -1.15, 1.25, 0, '#e6e6e6', 8), cyl(0.07, 0.07, 2.5, 1.15, 1.25, 0, '#e6e6e6', 8), cyl(0.22, 0.26, 0.12, -1.15, 0.06, 0, '#333333', 10), cyl(0.22, 0.26, 0.12, 1.15, 0.06, 0, '#333333', 10)];
  const pm = new THREE.Mesh(merge(posts), M.metal); pm.castShadow = true; g.add(pm);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.06), M.policeLine); tape.position.y = 1.85; tape.castShadow = true; g.add(tape);
  const tape2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.06), M.policeLine); tape2.position.y = 2.35; tape2.castShadow = true; g.add(tape2);
  for (const x of [-1.15, 1.15]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), M.red); b.position.set(x, 2.55, 0); g.add(b); }
  g.userData.low = 1.5;
  return g;
}

export function makeRamp(len, h) {
  // wooden loading ramp leaning on the back of a truck (rises towards -z)
  const g = new THREE.BufferGeometry();
  const w = 2.0;
  const v = [-w / 2, 0, 0, w / 2, 0, 0, w / 2, h, -len, -w / 2, h, -len, -w / 2, 0, -len, w / 2, 0, -len];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 1, 5, 2]);
  const flat = g.toNonIndexed(); flat.computeVertexNormals();
  const parts = [paint(flat, '#c99862')];
  // planks
  const n = Math.floor(len / 0.5);
  for (let i = 1; i < n; i++) { const t = i / n; parts.push(box(w, 0.03, 0.05, 0, h * t + 0.015, -len * t, '#9a7048')); }
  const m = new THREE.Mesh(merge(parts), M.stucco); m.castShadow = true; m.receiveShadow = true;
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

export function makeCoinMesh(count) {
  const g = new THREE.CylinderGeometry(0.4, 0.4, 0.09, 28, 1);
  g.rotateX(Math.PI / 2);
  const im = new THREE.InstancedMesh(g, [M.coinRim, M.coinFace, M.coinFace], count);
  im.castShadow = true;
  im.frustumCulled = false;
  return im;
}

// ---------- police helicopter ----------
export function makeHeli() {
  const g = new THREE.Group();
  const navy = '#16224a', white = '#f2f2f2';
  const body = new THREE.SphereGeometry(1, 20, 14); body.scale(1.15, 1.05, 2.0); body.translate(0, 0, 0);
  const parts = [paint(body, navy)];
  const stripe = new THREE.SphereGeometry(1.01, 20, 4, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.12); stripe.scale(1.15, 1.05, 2.0); parts.push(paint(stripe, white));
  const boom = new THREE.CylinderGeometry(0.16, 0.35, 4.2, 10); boom.rotateX(Math.PI / 2); boom.translate(0, 0.25, 3.6); parts.push(paint(boom, navy));
  parts.push(box(0.12, 1.3, 0.8, 0, 0.9, 5.5, navy));
  parts.push(box(1.6, 0.1, 0.5, 0, 0.35, 5.3, navy));
  for (const x of [-0.8, 0.8]) { parts.push(box(0.1, 0.1, 3.0, x, -1.25, 0.1, '#aaaaaa')); parts.push(box(0.08, 0.5, 0.08, x * 0.9, -0.95, -0.6, '#aaaaaa')); parts.push(box(0.08, 0.5, 0.08, x * 0.9, -0.95, 0.8, '#aaaaaa')); }
  parts.push(cyl(0.14, 0.2, 0.5, 0, 1.25, 0, '#333333', 10));
  const hull = new THREE.Mesh(merge(parts), M.trim); hull.castShadow = true; g.add(hull);
  const glass = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); glass.rotateX(-Math.PI / 2 - 0.25); glass.scale(1.0, 0.85, 1.1); glass.translate(0, 0.1, -1.05);
  g.add(new THREE.Mesh(glass, M.glass));
  const rotor = new THREE.Group(); rotor.position.y = 1.5;
  const blade = new THREE.Mesh(merge([box(9.5, 0.04, 0.32, 0, 0, 0, '#222222'), box(0.32, 0.04, 9.5, 0, 0, 0, '#222222')]), M.trim); rotor.add(blade);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.8, 32), M.rotor); disc.rotation.x = -Math.PI / 2; rotor.add(disc);
  g.add(rotor); g.userData.rotor = rotor;
  const tail = new THREE.Mesh(merge([box(0.05, 1.6, 0.18, 0, 0, 0, '#222222'), box(0.05, 0.18, 1.6, 0, 0, 0, '#222222')]), M.trim); tail.position.set(0.15, 1.0, 5.6); g.add(tail); g.userData.tail = tail;
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.red); red.position.set(0, -1.0, 0.2); g.add(red); g.userData.blink = red;
  const blinkGlow = new THREE.Sprite(M.glow.clone()); blinkGlow.material.color = C('#ff2a2a'); blinkGlow.scale.set(1.5, 1.5, 1); blinkGlow.position.copy(red.position); g.add(blinkGlow); g.userData.blinkGlow = blinkGlow;
  // searchlight cone, pointed by the game towards the player
  const beamGeo = new THREE.ConeGeometry(3.2, 1, 24, 1, true); beamGeo.translate(0, -0.5, 0);
  const beam = new THREE.Mesh(beamGeo, M.beam); beam.renderOrder = 5; g.userData.beam = beam;
  const spot = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), M.spot); spot.rotation.x = -Math.PI / 2; spot.renderOrder = 4; g.userData.spot = spot;
  return g;
}
