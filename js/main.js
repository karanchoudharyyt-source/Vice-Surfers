import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CURVE } from './curve.js';
import * as T from './tex.js';
import * as P from './props.js';
import { makeSky, skyEnvironment, FOG_COLOR, SUN_DIR } from './sky.js';
import { World, LANES } from './world.js';
import { Course, loadCars } from './course.js';
import { loadHeroAssets, Runner } from './hero.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const CAPTURE = !!window.__vstep;
const QS = new URLSearchParams(location.search);
const MUSIC_START = 16.0; // seconds into the track where the full beat drops

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ---------- renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let DPR = Math.min(window.devicePixelRatio || 1, 2);
T.setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, 70, 260);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1200);
const sky = makeSky(); scene.add(sky);

const hemi = new THREE.HemisphereLight(0xffc6da, 0x6b3b4c, 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd6a0, 2.8);
sun.castShadow = true;
const SHADOW_RES = QS.has('shadow') ? +QS.get('shadow') : 2048;
sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0xff8fb5, 1.25); scene.add(rim, rim.target);

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uGray: { value: 0 }, uVig: { value: 0.55 }, uFlash: { value: 0 }, uAberr: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uGray, uVig, uFlash, uAberr; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      vec3 c = uAberr > 0.0
        ? vec3( texture2D( tDiffuse, vUv + d * uAberr ).r, texture2D( tDiffuse, vUv ).g, texture2D( tDiffuse, vUv - d * uAberr ).b )
        : texture2D( tDiffuse, vUv ).rgb;
      float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
      c = mix( vec3( l ), c, 1.12 );
      c = mix( c, vec3( l ) * vec3( 1.0, 0.93, 0.93 ), uGray );
      c *= uTint;
      float v = smoothstep( 0.9, 0.28, length( d * vec2( 1.0, 1.2 ) ) );
      c *= mix( 1.0, v, uVig );
      c += uFlash;
      gl_FragColor = vec4( max( c, 0.0 ), 1.0 );
    }`,
};
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: QS.has('msaa') ? +QS.get('msaa') : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.38, 0.45, 1.05);
composer.addPass(bloom);
const grade = new ShaderPass(GradeShader); composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(DPR); renderer.setSize(w, h, false);
  composer.setPixelRatio(DPR); composer.setSize(w, h);
  camera.aspect = w / h;
  baseFov = w / h < 1 ? 62 : 46;
  camera.fov = baseFov; camera.updateProjectionMatrix();
}
let baseFov = 60;
window.addEventListener('resize', resize);

// ---------- game state ----------
let world, course, hero, cop, sound;
let state = 'loading';
const PL = { lane: 1, prevLane: 1, x: 0, y: 0, vy: 0, z: 0, rolling: 0, onGround: true, rollQueued: false, lastStumble: -99, jumpT: 0 };
let runT = 0, speed = 15, dist = 0, score = 0, coins = 0, cash = 0, stars = 1, deathKind = '', deathT = 0, introT = 0;
let best = +(localStorage.getItem('vs_best') || 0);
let timeScale = 1, shake = 0, flash = 0, clock = 0;
let copDist = 30, copTarget = 30, copHold = 0;
const G = 44, JUMP_V = 13.6, ROLL_T = 0.62;
const STAR_T = [0, 14, 30, 48, 66];

const camPos = new THREE.Vector3(1.4, 1.5, 4.6), camLook = new THREE.Vector3(0, 1.2, 0);
const tmpV = new THREE.Vector3();

// sparkles for coin pickups
const sparks = [];
function initSparks() {
  const m = new THREE.SpriteMaterial({ map: T.glowTexture(), color: new THREE.Color('#ffd34a').multiplyScalar(1.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(m.clone()); s.visible = false; scene.add(s); sparks.push({ s, life: 0, v: new THREE.Vector3() }); }
}
let sparkI = 0;
function burst(x, y, z, n = 5, color) {
  for (let i = 0; i < n; i++) {
    const p = sparks[sparkI++ % sparks.length];
    p.s.visible = true; p.life = 0.32; p.s.position.set(x, y, z); p.s.scale.setScalar(0.3);
    if (color) p.s.material.color.copy(color);
    p.v.set((Math.random() - 0.5) * 3, 1.6 + Math.random() * 2.2, (Math.random() - 0.5) * 3 - speed * 0.55);
  }
}
function updateSparks(dt) {
  for (const p of sparks) {
    if (!p.s.visible) continue;
    p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
    p.s.position.addScaledVector(p.v, dt); p.v.y -= 9 * dt;
    p.s.scale.setScalar(0.1 + p.life * 0.5); p.s.material.opacity = Math.min(0.8, p.life * 3.4);
  }
}

// ---------- HUD ----------
const hud = { score: $('score'), dist: $('dist'), mult: $('mult'), cash: $('cash'), stars: [...$('stars').children], banner: $('banner') };
let shown = { score: -1, dist: -1, cash: -1, stars: -1 };
function fmtCash(v) { return '$' + String(v).padStart(8, '0'); }
function banner(text, cls = '') {
  const b = hud.banner; b.className = 'num'; void b.offsetWidth; b.textContent = text; b.className = 'num show ' + cls;
}
function popCash() { const c = hud.cash; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
function updateHud() {
  const s = Math.floor(score), d = Math.floor(dist);
  if (s !== shown.score) { hud.score.textContent = s.toLocaleString('en-US'); shown.score = s; }
  if (d !== shown.dist) { hud.dist.textContent = d + ' m'; shown.dist = d; }
  if (cash !== shown.cash) { hud.cash.textContent = fmtCash(cash); shown.cash = cash; }
  if (stars !== shown.stars) {
    hud.stars.forEach((e, i) => { e.className = i < stars ? 'on' : ''; });
    hud.mult.textContent = '×' + stars;
    shown.stars = stars;
  }
}

// ---------- input ----------
function input(k) {
  sound && sound.unlock();
  if (state !== 'run') return;
  if (k === 'left' || k === 'right') {
    const nl = PL.lane + (k === 'left' ? -1 : 1);
    if (nl < 0 || nl > 2) { stumble(null, true); return; }
    PL.prevLane = PL.lane; PL.lane = nl;
    sound.play('whoosh', { vol: 0.35, rate: 1.15, pan: k === 'left' ? -0.3 : 0.3 });
  } else if (k === 'up') {
    if (PL.onGround) {
      PL.vy = JUMP_V; PL.onGround = false; PL.rolling = 0; PL.jumpT = 0;
      hero.play('Jump_Start', { loop: false, fade: 0.06, speed: 1.9 });
      sound.play('jump', { vol: 0.6 });
    }
  } else if (k === 'down') {
    if (!PL.onGround) { PL.vy = Math.min(PL.vy, -30); PL.rollQueued = true; }
    else startRoll();
  }
}
function startRoll() {
  PL.rolling = ROLL_T; PL.rollQueued = false;
  const a = hero.play('Roll', { loop: false, fade: 0.06 });
  a.timeScale = a.getClip().duration / (ROLL_T + 0.08);
  sound.play('roll', { vol: 0.55 });
}
const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ' ': 'up', ArrowDown: 'down', s: 'down', S: 'down' };
window.addEventListener('keydown', (e) => {
  if (KEYS[e.key]) { e.preventDefault(); if (!e.repeat) input(KEYS[e.key]); }
  else if (e.key === 'Escape' || e.key === 'p') togglePause();
  else if (e.key === 'm' || e.key === 'M') sound && sound.setMuted(!sound.muted);
  else if ((e.key === 'Enter') && (state === 'title' || state === 'over')) startRun();
});
let touch0 = null;
window.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; touch0 = { x: t.clientX, y: t.clientY, used: false }; sound && sound.unlock(); }, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!touch0 || touch0.used) return;
  const t = e.changedTouches[0]; const dx = t.clientX - touch0.x, dy = t.clientY - touch0.y;
  if (Math.hypot(dx, dy) < 26) return;
  touch0.used = true;
  input(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
}, { passive: true });
window.addEventListener('touchend', () => { touch0 = null; }, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'run') togglePause(); });
$('pause').addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
function togglePause() {
  if (state === 'run') { state = 'paused'; $('pause').textContent = '▶'; sound.ctx.suspend && !CAPTURE && sound.ctx.suspend(); }
  else if (state === 'paused') { state = 'run'; $('pause').textContent = 'II'; sound.ctx.resume && sound.ctx.resume(); }
}
$('playBtn').addEventListener('click', () => startRun());
$('again').addEventListener('click', () => startRun());

// ---------- run lifecycle ----------
function toTitle() {
  state = 'title';
  $('title').classList.remove('hidden'); $('hud').classList.add('hidden');
  $('best').textContent = best ? 'BEST ' + best.toLocaleString('en-US') : '';
  PL.x = 0; PL.z = 0; PL.y = 0;
  hero.root.position.set(0, 0, 0); hero.root.rotation.set(0, Math.PI, 0);
  hero.play('Idle_FoldArms_Loop', { fade: 0 });
  cop.root.visible = false;
}

function startRun() {
  if (state === 'run' || state === 'intro') return;
  sound.unlock();
  const seed = QS.get('seed') ? +QS.get('seed') : Math.floor(Math.random() * 1e9);
  course.rand = rng(seed + 1);
  course.reset(); world.reset();
  Object.assign(PL, { lane: 1, prevLane: 1, x: 0, y: 0, vy: 0, z: 0, rolling: 0, onGround: true, rollQueued: false, lastStumble: -99 });
  runT = 0; speed = 15; dist = 0; score = 0; coins = 0; cash = 0; stars = 1; deathKind = ''; timeScale = 1; shake = 0;
  copDist = 7; copTarget = 3.8; copHold = 3.2;
  grade.uniforms.uGray.value = 0; grade.uniforms.uAberr.value = 0;
  $('title').classList.add('hidden'); $('over').classList.add('hidden'); $('dead').classList.add('hidden'); $('dead').classList.remove('up');
  $('hud').classList.remove('hidden');
  shown = { score: -1, dist: -1, cash: -1, stars: -1 };
  updateHud();
  hero.root.position.set(0, 0, 0);
  hero.play('Sprint_Loop', { fade: 0.25 });
  cop.root.visible = true; cop.play('Sprint_Loop', { fade: 0 });
  sound.startMusic(MUSIC_START);
  sound.play('siren', { vol: 0.5, dur: 2.2 });
  state = 'intro'; introT = 0;
  banner('★ WANTED ★', 'wanted');
}

function stumble(o, wall = false) {
  if (runT - PL.lastStumble < 5.5 && copDist < 6) return die('busted');
  PL.lastStumble = runT;
  if (!wall) { PL.lane = PL.prevLane; }
  copTarget = 2.2; copHold = 5;
  shake = Math.max(shake, 0.35); flash = 0.12;
  hero.play('Hit_Chest', { loop: false, fade: 0.05, speed: 1.8 });
  sound.play('thud', { vol: 0.8 });
  if (!wall) sound.play('horn', { vol: 0.5 });
  speed *= 0.85;
}

function die(kind, o) {
  if (state !== 'run') return;
  state = 'dying'; deathKind = kind; deathT = 0;
  if (kind === 'busted') {
    hero.play('Hit_Knockback', { loop: false, fade: 0.1 });
    copTarget = 0.9; copHold = 99;
    sound.play('thud', { vol: 0.9 });
    sound.play('busted', { vol: 0.9, when: 0.15 });
  } else {
    hero.play(o && (o.type === 'car' || o.type === 'truck') ? 'Hit_Knockback' : 'Death01', { loop: false, fade: 0.06, speed: 1.1 });
    sound.play('crash', { vol: 1.0 });
    sound.play('wasted', { vol: 0.95, when: 0.2 });
    copTarget = 5; copHold = 99;
  }
  sound.slowMo();
  shake = 0.9; flash = 0.35;
  timeScale = 0.3;
}

function showOver() {
  state = 'over';
  const s = Math.floor(score);
  const isBest = s > best;
  if (isBest) { best = s; try { localStorage.setItem('vs_best', String(best)); } catch (e) {} }
  $('newBest').classList.toggle('hidden', !isBest);
  $('oScore').textContent = s.toLocaleString('en-US');
  $('oCash').textContent = '$' + cash.toLocaleString('en-US');
  $('oDist').textContent = Math.floor(dist) + ' m';
  $('oStars').textContent = '★'.repeat(stars);
  $('over').classList.remove('hidden');
  $('dead').classList.add('up');
}

// ---------- simulation ----------
function collide() {
  let ground = 0;
  const half = 0.32;
  for (const o of course.obs) {
    const front = o.z + o.len / 2, back = o.z - o.len / 2;
    if (PL.z - half > front + 2 || PL.z + half < back - 2) { o.inZ = false; continue; }
    const inZ = PL.z - half < front && PL.z + half > back;
    const inX = Math.abs(o.x - PL.x) < o.w + 0.3;
    if (inZ && !o.inZ) o.enterX = inX;
    o.inZ = inZ;
    if (!inZ || !inX) continue;
    if (o.type === 'ramp') { ground = Math.max(ground, THREE.MathUtils.clamp((front - PL.z) / o.len, 0, 1) * o.h); continue; }
    if (o.type === 'car' || o.type === 'truck') {
      if (PL.y >= o.h - 0.55) { ground = Math.max(ground, o.h); continue; }
      if (o.enterX) { die('wasted', o); return null; }
      stumble(o); return ground;
    }
    if (o.type === 'barrier') {
      if (PL.y < o.h - 0.2) { if (o.enterX) { die('wasted', o); return null; } stumble(o); }
      continue;
    }
    if (o.type === 'bar') {
      const top = PL.y + (PL.rolling > 0 ? 0.95 : 1.8);
      if (top > o.low && PL.y < o.h) { if (o.enterX) { die('wasted', o); return null; } stumble(o); }
    }
  }
  return ground;
}

function stepRun(dt) {
  runT += dt;
  const target = 15 + 15 * (1 - Math.exp(-runT / 85));
  speed = damp(speed, target, 1.5, dt);
  PL.z -= speed * dt; dist += speed * dt;
  const tx = LANES[PL.lane]; const dx = tx - PL.x;
  PL.vx = Math.sign(dx) * Math.min(Math.abs(dx) / dt, 17);
  PL.x += PL.vx * dt;
  if (!PL.onGround) { PL.vy -= G * dt; PL.y += PL.vy * dt; PL.jumpT += dt; }
  if (PL.rolling > 0) { PL.rolling -= dt; if (PL.rolling <= 0 && PL.onGround) hero.play('Sprint_Loop', { fade: 0.15 }); }
  const ground = collide();
  if (ground === null) return;
  if (PL.y <= ground + 1e-3) {
    if (!PL.onGround) {
      PL.onGround = true;
      if (PL.rollQueued) startRoll();
      else if (state === 'run') hero.play('Sprint_Loop', { fade: 0.14 });
      sound.play('land', { vol: 0.5 });
      if (PL.vy < -8) burst(PL.x, PL.y + 0.1, PL.z, 4, new THREE.Color('#ffd9b0'));
    }
    PL.y = ground; PL.vy = 0;
  } else if (PL.onGround && PL.y > ground + 0.08) {
    PL.onGround = false; PL.vy = 0; PL.jumpT = 0.5;
  }
  if (!PL.onGround && hero.currentName === 'Jump_Start' && PL.jumpT > 0.22) hero.play('Jump_Loop', { fade: 0.12 });
  // cash
  for (const c of course.coinList) {
    if (c.taken) continue;
    if (Math.abs(c.z - PL.z) < 0.9 && Math.abs(c.x - PL.x) < 0.95 && c.y > PL.y - 0.2 && c.y < PL.y + (PL.rolling > 0 ? 1.3 : 2.3)) {
      c.taken = true; coins++; cash += 50 * stars;
      burst(c.x, c.y, c.z, 5);
      sound.play(coins % 2 ? 'coin' : 'coin2', { vol: 0.42, rate: 1 + (coins % 8) * 0.025 });
      popCash();
    }
  }
  // wanted level
  let ns = 1; for (let i = 1; i < STAR_T.length; i++) if (runT >= STAR_T[i]) ns = i + 1;
  if (ns !== stars) {
    stars = ns; banner('WANTED ' + '★'.repeat(stars), 'wanted');
    hud.stars[stars - 1].classList.add('flash');
    setTimeout(() => hud.stars.forEach((e) => e.classList.remove('flash')), 2200);
    sound.play('star', { vol: 0.7 });
  }
  score += speed * dt * (0.5 + stars * 0.5);
  copHold -= dt; if (copHold <= 0) copTarget = 9;
}

function updateCop(dt) {
  copDist = damp(copDist, copTarget, copTarget < copDist ? 1.6 : 0.5, dt);
  cop.root.visible = copDist < 5.4; // any farther back and only his scalp peeks into the frame
  cop.root.position.set(damp(cop.root.position.x, PL.x + 0.55, 4, dt), 0, PL.z + copDist);
  cop.root.rotation.y = 0;
  const a = cop.action('Sprint_Loop'); a.timeScale = THREE.MathUtils.clamp(speed / 16, 0.9, 1.4);
}

function updateCamera(dt, rdt) {
  if (state === 'title') {
    const a = clock * 0.12;
    camPos.set(1.2 + Math.sin(a) * 0.9, 1.45 + Math.sin(a * 0.7) * 0.08, 4.5 + Math.cos(a) * 0.4);
    camLook.set(0, 1.2, 0);
    camera.position.copy(camPos); camera.lookAt(camLook);
    camera.fov = baseFov - 10; camera.updateProjectionMatrix();
    return;
  }
  const tx = PL.x * 0.8, ty = 3.15 + PL.y * 0.6 - (PL.rolling > 0 ? 0.2 : 0), tz = PL.z + 6.3;
  const lx = PL.x * 0.9, ly = 1.25 + PL.y * 0.7, lz = PL.z - 9;
  if (state === 'intro') {
    const k = Math.min(1, introT / 0.9); const e = k * k * (3 - 2 * k);
    camPos.lerpVectors(tmpV.set(1.2, 1.45, PL.z + 4.5), new THREE.Vector3(tx, ty, tz), e);
    camLook.lerpVectors(new THREE.Vector3(0, 1.2, PL.z), new THREE.Vector3(lx, ly, lz), e);
  } else if (state === 'dying' || state === 'over') {
    const k = Math.min(1, deathT / 1.2);
    camPos.set(damp(camPos.x, PL.x + 2.2, 2, rdt), damp(camPos.y, 2.4 + PL.y, 2, rdt), damp(camPos.z, PL.z + 4.6 - k * 0.6, 2, rdt));
    camLook.set(damp(camLook.x, PL.x, 3, rdt), damp(camLook.y, 0.9 + PL.y, 3, rdt), damp(camLook.z, PL.z - 1, 3, rdt));
  } else {
    camPos.x = damp(camPos.x, tx, 7, dt); camPos.y = damp(camPos.y, ty, 5, dt); camPos.z = tz;
    camLook.set(damp(camLook.x, lx, 9, dt), damp(camLook.y, ly, 6, dt), lz);
  }
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.y += (Math.random() - 0.5) * shake * 0.5; shake = Math.max(0, shake - rdt * 2.2); }
  camera.lookAt(camLook);
  const fov = baseFov + (speed - 15) * 0.35;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

function updateLights() {
  const fz = Math.round((PL.z - 12) / 0.05) * 0.05;
  sun.target.position.set(0, 0, fz);
  sun.position.set(16, 30, fz + 16);
  rim.target.position.set(0, 0, fz);
  rim.position.copy(SUN_DIR).multiplyScalar(60).add(rim.target.position);
}

function updateAudio() {
  if (!sound || !sound.ready) return;
  const running = state === 'run' || state === 'intro' || state === 'dying';
  const ns = course.nearestSiren;
  let sv = running && stars >= 3 ? 0.07 : 0;
  let pan = 0;
  if (running && ns && ns.d < 90) { sv = Math.max(sv, (1 - ns.d / 90) * 0.55); pan = (ns.x - PL.x) / 6; }
  sound.setLoop('siren', state === 'dying' ? sv * 0.4 : sv, pan);
  const h = course.heli;
  const hv = h.visible && running ? Math.max(0, 1 - h.position.distanceTo(tmpV.set(PL.x, PL.y, PL.z)) / 90) * 0.6 : 0;
  sound.setLoop('heli', hv, h.visible ? (h.position.x - PL.x) / 15 : 0);
  sound.setLoop('waves', state === 'title' ? 0.35 : 0.12, -0.6);
}

let last = performance.now();
let perfAcc = 0, perfN = 0, perfStage = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const raw = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
  if (state === 'paused') { composer.render(); return; }
  clock += raw;
  const rdt = raw * timeScale;
  if (state === 'intro') {
    introT += raw;
    hero.root.rotation.y = damp(hero.root.rotation.y, 0, 9, raw);
    if (introT > 0.9) { state = 'run'; hero.root.rotation.y = 0; }
  }
  if (state === 'run' || state === 'intro') {
    const n = Math.ceil(rdt / (1 / 120));
    for (let i = 0; i < n && (state === 'run' || state === 'intro'); i++) stepRun(rdt / n);
  }
  if (state === 'dying') {
    deathT += raw;
    if (deathT > 0.12) $('dead').classList.remove('hidden');
    $('dead').classList.toggle('busted', deathKind === 'busted');
    $('dead').firstElementChild.textContent = deathKind === 'busted' ? 'BUSTED' : 'WASTED';
    timeScale = deathT < 1.1 ? 0.3 : damp(timeScale, 1, 3, raw);
    grade.uniforms.uGray.value = Math.min(1, deathT / 0.6);
    // the hero is thrown back a little and slides to a stop
    if (deathKind !== 'busted') { PL.z += rdt * Math.max(0, 6 - deathT * 6); if (PL.y > 0) PL.y = Math.max(0, PL.y - rdt * 6); }
    if (deathT > 2.5) showOver();
  }
  if (state === 'over') { deathT += raw; grade.uniforms.uGray.value = 1; }
  if (state !== 'title') {
    hero.root.position.set(PL.x, PL.y, PL.z);
    if (state === 'run') { hero.root.rotation.z = damp(hero.root.rotation.z, -(PL.vx || 0) * 0.012, 10, rdt); hero.root.rotation.y = damp(hero.root.rotation.y, -(PL.vx || 0) * 0.02, 10, rdt); }
    const sa = hero.actions.Sprint_Loop; if (sa) sa.timeScale = THREE.MathUtils.clamp(speed / 16, 0.95, 1.45);
    updateCop(rdt); cop.update(rdt);
    course.update(state === 'run' || state === 'intro' ? rdt : rdt * 0.6, PL.z, speed, stars, clock, camera);
    course.updateHeli(rdt, stars >= 4 && state !== 'over', tmpV.set(PL.x, PL.y, PL.z).clone(), clock);
    CURVE.value.x = Math.sin(runT * 0.045) * 0.0005;
  }
  hero.update(rdt);
  updateSparks(rdt);
  updateCamera(raw, rdt);
  updateLights();
  world.update(camera.position.z, clock);
  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = clock;
  flash = Math.max(0, flash - raw * 1.8); grade.uniforms.uFlash.value = flash;
  grade.uniforms.uAberr.value = state === 'dying' ? 0.012 * Math.max(0, 1 - deathT) : (shake > 0.2 ? shake * 0.01 : 0);
  updateAudio();
  if (state === 'run' || state === 'dying' || state === 'intro') updateHud();
  composer.render();
  // phones: drop resolution if frames are slow
  if (!CAPTURE && state === 'run' && perfStage < 3) {
    perfAcc += raw; perfN++;
    if (perfN === 90) {
      const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
      if (avg > 0.024) {
        perfStage++;
        if (DPR > 1.01) { DPR = Math.max(1, DPR * 0.75); resize(); }
        else if (bloom.enabled) { bloom.enabled = false; }
        else { sun.shadow.mapSize.set(1024, 1024); sun.shadow.map && sun.shadow.map.dispose(); sun.shadow.map = null; }
      } else perfStage = 3;
    }
  }
}

// ---------- boot ----------
async function boot() {
  const bar = $('bar').firstElementChild;
  const prog = { hero: 0, cars: 0, audio: 0 };
  const upd = () => { bar.style.width = Math.round((prog.hero * 0.5 + prog.cars * 0.25 + prog.audio * 0.25) * 92) + '%'; };
  resize();
  await Promise.all([document.fonts.load('40px Anton'), document.fonts.load('900 40px Rubik'), document.fonts.load('40px "Mr Dafoe"')]).catch(() => {});
  scene.environment = skyEnvironment(renderer);
  P.initMaterials();
  const shirt = await new THREE.TextureLoader().loadAsync('assets/tex/aloha.webp');
  shirt.colorSpace = THREE.SRGBColorSpace; shirt.wrapS = shirt.wrapT = THREE.RepeatWrapping; shirt.anisotropy = 8;
  sound = new Sound('assets/audio/');
  const [heroA, cars] = await Promise.all([
    loadHeroAssets('assets/', (p) => { prog.hero = p; upd(); }),
    loadCars('assets/', (p) => { prog.cars = p; upd(); }),
    sound.load((p) => { prog.audio = p; upd(); }),
  ]);
  world = new World(scene, rng(7));
  course = new Course(scene, cars, rng(1));
  hero = new Runner(heroA, shirt); scene.add(hero.root);
  cop = new Runner(heroA, shirt, { cop: true }); scene.add(cop.root);
  initSparks();
  toTitle();
  world.update(camPos.z, 0);
  updateCamera(0, 0); updateLights();
  bar.style.width = '100%';
  renderer.compile(scene, camera);
  composer.render();
  $('loading').classList.add('hidden');
  last = performance.now();
  requestAnimationFrame(loop);
  window.VS = {
    get state() { return state; }, PL, get speed() { return speed; }, get stars() { return stars; }, get course() { return course; },
    get dist() { return dist; }, get coins() { return coins; }, get cash() { return cash; }, get score() { return Math.floor(score); },
    get deathKind() { return deathKind; }, get runT() { return runT; }, input, get copDist() { return copDist; },
  };
}
boot().catch((e) => { console.error(e); $('loadTxt').textContent = 'ERROR: ' + e.message; });
