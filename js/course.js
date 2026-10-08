import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as P from './props.js';
import { LANES } from './world.js';
import { curveMaterial } from './curve.js';

const CIVIL = ['sedan', 'taxi', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'van'];
const TRUCKS = ['truck', 'delivery', 'garbage-truck'];
const ALL = [...CIVIL, ...TRUCKS, 'police', 'ambulance'];

export async function loadCars(base, onProgress) {
  const loader = new GLTFLoader();
  const out = {}; let done = 0;
  await Promise.all(ALL.map(async (n) => {
    const g = await loader.loadAsync(`${base}cars/${n}.glb`);
    out[n] = g.scene; onProgress && onProgress(++done / ALL.length);
  }));
  return out;
}

// Normalise a Kenney vehicle: glossy clear-coated paint, real-world size, facing +z (towards the runner).
function prepVehicle(src, width) {
  const o = src.clone(true);
  let paint = null;
  o.traverse((c) => {
    if (!c.isMesh) return;
    c.castShadow = true; c.receiveShadow = true;
    if (!paint) {
      paint = new THREE.MeshPhysicalMaterial({ map: c.material.map, roughness: 0.38, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.25 });
      curveMaterial(paint);
    }
    c.material = paint;
  });
  const b = new THREE.Box3().setFromObject(o); const s = b.getSize(new THREE.Vector3());
  const k = width / s.x; o.scale.setScalar(k);
  const wrap = new THREE.Group(); wrap.add(o);
  o.position.set(-(b.min.x + b.max.x) / 2 * k, -b.min.y * k, -(b.min.z + b.max.z) / 2 * k);
  wrap.userData.len = s.z * k; wrap.userData.h = s.y * k; wrap.userData.w = width;
  return wrap;
}

function addHeadlights(v, glowMat) {
  const L = v.userData.len, w = v.userData.w;
  for (const s of [-1, 1]) {
    const sp = new THREE.Sprite(glowMat); sp.scale.set(1.3, 1.3, 1); sp.position.set(s * w * 0.32, 0.62, L / 2 + 0.05); v.add(sp);
  }
}

function addLightbar(v) {
  const h = v.userData.h;
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.24), P.M.red); red.position.set(-0.25, h + 0.02, 0.05);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.24), P.M.blue); blue.position.set(0.25, h + 0.02, 0.05);
  const gr = new THREE.Sprite(P.M.glow.clone()); gr.material.color.set('#ff2030'); gr.material.opacity = 1; gr.scale.set(3.2, 3.2, 1); gr.position.copy(red.position);
  const gb = new THREE.Sprite(P.M.glow.clone()); gb.material.color.set('#2a60ff'); gb.material.opacity = 1; gb.scale.set(3.2, 3.2, 1); gb.position.copy(blue.position);
  v.add(red, blue, gr, gb);
  v.userData.siren = { red, blue, gr, gb };
}

export class Course {
  constructor(scene, cars, rand) {
    this.scene = scene; this.rand = rand;
    this.group = new THREE.Group(); scene.add(this.group);
    this.headGlow = P.M.glow.clone(); this.headGlow.color.set('#fff2d0'); this.headGlow.opacity = 0.9;
    this.lib = {};
    for (const n of CIVIL) this.lib[n] = prepVehicle(cars[n], 2.0);
    for (const n of TRUCKS) this.lib[n] = prepVehicle(cars[n], 2.25);
    this.lib.police = prepVehicle(cars.police, 2.05);
    this.lib.ambulance = prepVehicle(cars.ambulance, 2.2);
    this.barrierLib = P.makeBarrier();
    this.barLib = P.makeOverhead();
    this.coins = P.makeCoinMesh(220); this.coins.count = 0; this.group.add(this.coins);
    this.coinList = [];
    this.heli = P.makeHeli(); this.heli.visible = false; scene.add(this.heli);
    scene.add(this.heli.userData.beam, this.heli.userData.spot);
    this.heli.userData.beam.visible = this.heli.userData.spot.visible = false;
    // flashing red/blue scene lights that follow the nearest police car (always present so shaders never recompile)
    this.sirenR = new THREE.PointLight(0xff2030, 0, 18, 1.6); this.sirenB = new THREE.PointLight(0x3060ff, 0, 18, 1.6);
    scene.add(this.sirenR, this.sirenB);
    this.reset();
  }

  reset() {
    if (this.obs) for (const o of this.obs) this.group.remove(o.mesh);
    this.obs = [];
    this.coinList.length = 0;
    this.nextRow = -70;
    this.rowIndex = 0;
    this.laneFree = [0, 0, 0];   // z of the farthest (most negative) obstacle end per lane
    this.reserve = null;
    this.heli.visible = false; this.heli.userData.beam.visible = this.heli.userData.spot.visible = false;
    this.heliT = 0;
  }

  spawnVehicle(name, lane, z, vz = 0, siren = false) {
    const v = this.lib[name].clone();
    if (vz > 0 || name === 'police') addHeadlights(v, this.headGlow);
    if (siren) addLightbar(v);
    v.position.set(LANES[lane], 0, z);
    this.group.add(v);
    const o = { type: TRUCKS.includes(name) ? 'truck' : 'car', name, lane, x: LANES[lane], z, len: v.userData.len, h: v.userData.h, w: 1.0, vz, mesh: v, siren, police: name === 'police' };
    this.obs.push(o);
    return o;
  }

  spawnBarrier(lane, z) {
    const m = this.barrierLib.clone(); m.position.set(LANES[lane], 0, z); this.group.add(m);
    const o = { type: 'barrier', lane, x: LANES[lane], z, len: 0.6, h: 1.05, w: 1.15, vz: 0, mesh: m };
    m.traverse((c) => { if (c.userData.isGlow) o.glows = (o.glows || []).concat([c]); });
    this.obs.push(o); return o;
  }

  spawnBar(lane, z) {
    const m = this.barLib.clone(); m.position.set(LANES[lane], 0, z); this.group.add(m);
    const o = { type: 'bar', lane, x: LANES[lane], z, len: 0.4, low: 1.5, h: 2.6, w: 1.15, vz: 0, mesh: m };
    this.obs.push(o); return o;
  }

  spawnRampTruck(lane, z) {
    const t = this.spawnVehicle(TRUCKS[Math.floor(this.rand() * TRUCKS.length)], lane, z);
    t.mesh.rotation.y = Math.PI; // parked facing away, ramp on its tail towards the runner
    const rl = 5.5;
    const ramp = P.makeRamp(rl, t.h);
    const front = z + t.len / 2;
    ramp.position.set(LANES[lane], 0, front + rl);
    this.group.add(ramp);
    const r = { type: 'ramp', lane, x: LANES[lane], z: front + rl / 2, len: rl, h: t.h, w: 1.0, vz: 0, mesh: ramp, truck: t };
    this.obs.push(r);
    return t;
  }

  coinLine(lane, z0, n, yFn) {
    for (let i = 0; i < n; i++) {
      const z = z0 - i * 2.4;
      this.coinList.push({ x: LANES[lane], z, y: yFn ? yFn(i, n) : 1.0, taken: false, lane });
    }
  }

  laneClear(lane, zFront, zBack) {
    return !this.obs.some((o) => o.lane === lane && o.z - o.len / 2 < zFront + 3 && o.z + o.len / 2 > zBack - 3);
  }

  // One "row" of obstacles. Every row leaves at least one lane that can be run through,
  // jumped or rolled, and lane reservations keep oncoming traffic from driving through parked cars.
  genRow(z, stars, speed) {
    const r = this.rand;
    const lanes = [0, 1, 2];
    const res = this.reserve;
    const blocked = res && res.rows > 0 ? res.lane : -1;
    const avail = lanes.filter((l) => l !== blocked);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const roll = r();
    let coinsDone = false;
    const civil = () => pick(CIVIL);

    if (res && res.rows === 0) {
      // the reserved lane gets its oncoming car now
      const police = res.police;
      const o = this.spawnVehicle(police ? 'police' : civil(), res.lane, z - 4, police ? 13 : 9, police);
      this.reserve = null;
      const other = lanes.filter((l) => l !== res.lane);
      if (r() < 0.6) this.spawnVehicle(civil(), pick(other), z);
      this.coinLine(pick(other.filter((l) => this.laneClear(l, z + 6, z - 14))) ?? other[0], z + 4, 6);
      return;
    }
    if (res) res.rows--;

    if (stars >= 2 && !this.reserve && this.rowIndex > 3 && r() < (stars >= 4 ? 0.45 : 0.28)) {
      // plan an oncoming car two rows from now; keep its lane empty until then
      const lane = pick(lanes);
      this.reserve = { lane, rows: 2, police: stars >= 4 && r() < 0.65 };
    }
    const bl = this.reserve ? this.reserve.lane : -1;
    const free = lanes.filter((l) => l !== bl);

    if (stars >= 3 && roll < 0.16 && free.length === 3) {
      // police roadblock: two cruisers nose to nose, a barricade to jump in the gap
      const sh = shuffle([0, 1, 2]);
      for (const l of sh.slice(0, 2)) { const o = this.spawnVehicle('police', l, z, 0, true); o.mesh.rotation.y = (l === 0 ? -1 : l === 2 ? 1 : (sh[0] === 0 || sh[1] === 0 ? 1 : -1)) * 0.5; }
      this.spawnBarrier(sh[2], z + 1);
      this.coinLine(sh[2], z + 8, 7, (i, n) => 1.0 + 1.3 * Math.sin(Math.PI * i / (n - 1)));
      return;
    }
    if (roll < 0.3) {
      // two parked/stopped cars, one gap
      const sh = shuffle(free.slice());
      const gap = sh.pop();
      for (const l of sh.slice(0, Math.min(2, sh.length))) this.spawnVehicle(r() < 0.12 ? 'ambulance' : civil(), l, z - r() * 6);
      this.coinLine(gap, z + 6, 7); coinsDone = true;
    } else if (roll < 0.47) {
      // barricades across lanes: jump
      const n = r() < 0.5 ? free.length : Math.max(1, free.length - 1);
      const sh = shuffle(free.slice()).slice(0, n);
      for (const l of sh) this.spawnBarrier(l, z);
      const cl = sh[0];
      this.coinLine(cl, z + 7, 7, (i, n2) => 1.0 + 1.3 * Math.sin(Math.PI * i / (n2 - 1))); coinsDone = true;
      if (free.length > n && r() < 0.5) this.spawnVehicle(civil(), free.find((l) => !sh.includes(l)), z - 3);
    } else if (roll < 0.62) {
      // police line tape: roll
      const n = r() < 0.4 ? free.length : Math.max(1, free.length - 1);
      const sh = shuffle(free.slice()).slice(0, n);
      for (const l of sh) this.spawnBar(l, z);
      this.coinLine(sh[0], z + 5, 5, () => 0.55); coinsDone = true;
    } else if (roll < 0.8) {
      // ramp truck with cash on the roof; traffic beside it
      const l = pick(free);
      if (this.laneClear(l, z + 8, z - 12)) {
        const t = this.spawnRampTruck(l, z - 4);
        this.coinLine(l, z + 2.5, 7, (i) => Math.min(t.h, (i + 1) * 0.9) + 1.0);
        const others = free.filter((x) => x !== l);
        if (others.length && r() < 0.7) this.spawnVehicle(civil(), pick(others), z - 2);
        coinsDone = true;
      }
    } else {
      // single car + long coin run
      const l = pick(free); this.spawnVehicle(civil(), l, z - r() * 4);
      const c = free.filter((x) => x !== l);
      if (c.length) { this.coinLine(pick(c), z + 8, 9); coinsDone = true; }
    }
    if (!coinsDone && free.length) this.coinLine(pick(free), z + 6, 6);
  }

  update(dt, pz, speed, stars, time, cam) {
    // generate ahead
    const gapBase = THREE.MathUtils.clamp(speed * 1.05, 19, 32);
    while (this.nextRow > pz - 230) {
      if (this.nextRow < -60) this.genRow(this.nextRow, stars, speed);
      this.rowIndex++;
      this.nextRow -= gapBase + this.rand() * 8;
    }
    // move + recycle obstacles
    let nearest = null, nd = 1e9;
    const flash = Math.floor(time * 7) % 2;
    for (let i = this.obs.length - 1; i >= 0; i--) {
      const o = this.obs[i];
      if (o.vz) { o.z += o.vz * dt; o.mesh.position.z = o.z; }
      if (o.type === 'ramp' && o.truck) { o.z = o.truck.z + o.truck.len / 2 + o.len / 2; }
      if (o.glows) for (const g of o.glows) g.material.opacity = 0.35 + 0.65 * ((Math.floor(time * 3 + o.z) % 2));
      if (o.siren) {
        const s = o.mesh.userData.siren;
        s.gr.visible = !!flash; s.red.visible = !!flash; s.gb.visible = !flash; s.blue.visible = !flash;
        const d = Math.abs(o.z - pz);
        if (d < nd) { nd = d; nearest = o; }
      }
      if (o.z - o.len / 2 > pz + 25) { this.group.remove(o.mesh); this.obs.splice(i, 1); }
    }
    this.nearestSiren = nearest ? { d: nd, x: nearest.x, z: nearest.z } : null;
    if (nearest && nd < 45) {
      const k = THREE.MathUtils.clamp(1 - nd / 45, 0, 1);
      this.sirenR.position.set(nearest.x - 0.6, 2.2, nearest.z); this.sirenB.position.set(nearest.x + 0.6, 2.2, nearest.z);
      this.sirenR.intensity = flash ? 60 * k : 4 * k; this.sirenB.intensity = flash ? 4 * k : 60 * k;
    } else { this.sirenR.intensity = 0; this.sirenB.intensity = 0; }
    // coins
    const dummy = this._d || (this._d = new THREE.Object3D());
    let n = 0;
    for (let i = this.coinList.length - 1; i >= 0; i--) {
      const c = this.coinList[i];
      if (c.z > pz + 12) { this.coinList.splice(i, 1); continue; }
      if (c.taken) { c.t = (c.t || 0) + dt; if (c.t > 0.35) { this.coinList.splice(i, 1); continue; } }
      if (n >= this.coins.count) continue;
      const lift = c.taken ? c.t * 9 : 0;
      dummy.position.set(c.x, c.y + lift + Math.sin(time * 3 + c.z * 0.3) * 0.06, c.z);
      dummy.rotation.set(0, time * 3.2 + c.z * 0.15, 0);
      const sc = c.taken ? Math.max(0.01, 1 - c.t * 2.6) : 1;
      dummy.scale.setScalar(sc);
      dummy.updateMatrix(); this.coins.setMatrixAt(n++, dummy.matrix);
    }
    this.coins.count = n; this.coins.instanceMatrix.needsUpdate = true;
  }

  updateHeli(dt, active, player, time) {
    const h = this.heli, u = h.userData;
    if (active && !h.visible) { h.visible = true; this.heliT = 0; h.position.set(player.x + 25, 30, player.z + 40); }
    if (!h.visible) return;
    this.heliT += dt;
    const target = new THREE.Vector3(player.x + Math.sin(time * 0.35) * 7 - 3, 17 + Math.sin(time * 0.6) * 1.2, player.z - 30);
    if (!active) target.set(player.x + 60, 40, player.z - 80);
    h.position.lerp(target, 1 - Math.exp(-dt * (active ? 1.2 : 0.6)));
    h.rotation.set(-0.22, Math.sin(time * 0.35) * 0.25 + 0.1, Math.sin(time * 0.5) * 0.08);
    u.rotor.rotation.y += dt * 38; u.tail.rotation.x += dt * 50;
    const blink = Math.floor(time * 2.5) % 2 === 0;
    u.blink.visible = blink; u.blinkGlow.visible = blink;
    // searchlight onto the road just ahead of the runner
    const spotP = new THREE.Vector3(player.x + Math.sin(time * 1.3) * 0.8, 0.03, player.z - 2.5 + Math.sin(time * 0.9) * 1.5);
    const from = h.position.clone().add(new THREE.Vector3(0, -1.2, -1.2));
    const dir = spotP.clone().sub(from); const L = dir.length();
    u.beam.visible = u.spot.visible = active && this.heliT > 1.5;
    u.beam.position.copy(from);
    u.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    u.beam.scale.set(1, L, 1);
    u.spot.position.copy(spotP);
    if (!active && h.position.distanceTo(player) > 140) h.visible = false;
  }
}
