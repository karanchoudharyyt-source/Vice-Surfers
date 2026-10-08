import * as THREE from 'three';
import * as T from './tex.js';
import * as P from './props.js';
import { curveMaterial } from './curve.js';

// Cross-section (x): beach + ocean on the left, three lanes in the middle, hotels on the right.
export const LANE_W = 2.4;
export const LANES = [-LANE_W, 0, LANE_W];
const CURB_Y = 0.18;
const SNAP = 24; // treadmill meshes jump by this much so their textures never slide

function strip(w, len, segX, segZ, x, y, mat, repU, repV) {
  const g = new THREE.PlaneGeometry(w, len, segX, segZ);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repU, uv.getY(i) * repV);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, 0); m.receiveShadow = true;
  return m;
}

export class World {
  constructor(scene, rand) {
    this.scene = scene; this.rand = rand;
    this.group = new THREE.Group(); scene.add(this.group);
    this.tread = new THREE.Group(); this.group.add(this.tread);
    const LEN = 420; this.LEN = LEN;
    const road = T.roadTexture();
    const roadMat = curveMaterial(new THREE.MeshStandardMaterial({ map: road, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.55 }));
    this.tread.add(strip(T.ROAD_W, LEN, 1, 105, 0, 0, roadMat, 1, LEN / T.ROAD_PERIOD));
    const sw = T.sidewalkTexture();
    const swMat = curveMaterial(new THREE.MeshStandardMaterial({ map: sw, roughness: 0.85 }));
    this.tread.add(strip(5.4, LEN, 1, 105, 7.5, CURB_Y, swMat, 5.4 / 4, LEN / 4));
    this.tread.add(strip(4.4, LEN, 1, 105, -7.0, CURB_Y, swMat, 4.4 / 4, LEN / 4));
    // curbs
    const curbMat = curveMaterial(new THREE.MeshStandardMaterial({ color: 0xf1ece4, roughness: 0.7 }));
    for (const x of [-4.95, 4.95]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, CURB_Y, LEN, 1, 1, 105), curbMat); c.position.set(x, CURB_Y / 2, 0); c.receiveShadow = true; this.tread.add(c); }
    // Ocean Drive's low seawall
    const wallMat = curveMaterial(new THREE.MeshStandardMaterial({ color: 0xf4cdb8, roughness: 0.8 }));
    const capMat = curveMaterial(new THREE.MeshStandardMaterial({ color: 0x2fb4b0, roughness: 0.5 }));
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, LEN, 1, 1, 105), wallMat); wall.position.set(-9.5, 0.42, 0); wall.castShadow = true; wall.receiveShadow = true; this.tread.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, LEN, 1, 1, 105), capMat); cap.position.set(-9.5, 0.9, 0); this.tread.add(cap);
    // beach
    const sandMat = curveMaterial(new THREE.MeshStandardMaterial({ map: T.sandTexture(), roughness: 0.95, color: 0xffffff }));
    this.tread.add(strip(52, LEN, 6, 105, -35.8, -0.05, sandMat, 52 / 8, LEN / 8));
    // wet sand + foam band, then the ocean
    const wet = strip(6, LEN, 1, 105, -64.8, -0.08, curveMaterial(new THREE.MeshStandardMaterial({ color: 0xc9a27e, roughness: 0.3, metalness: 0.1, envMapIntensity: 1.2 })), 1, 1); this.tread.add(wet);
    this.waterN = T.waterNormal();
    this.waterN.repeat.set(30, 60);
    const waterMat = curveMaterial(new THREE.MeshStandardMaterial({ color: 0x2a7f9e, roughness: 0.08, metalness: 0.15, normalMap: this.waterN, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.25 }));
    const ocean = strip(460, LEN, 12, 105, -297, -0.25, waterMat, 1, 1); ocean.receiveShadow = false; this.tread.add(ocean);
    const foamMat = curveMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: true }));
    this.foam = strip(1.6, LEN, 1, 105, -67.4, -0.2, foamMat, 1, 1); this.tread.add(this.foam);

    // streamed props
    this.hotels = []; this.palms = []; this.lamps = []; this.beach = [];
    this.hotelLib = []; for (let i = 0; i < 10; i++) this.hotelLib.push(P.makeHotel(rand, i));
    this.palmLib = []; for (let i = 0; i < 8; i++) this.palmLib.push(P.makePalm(rand));
    this.lampLib = { '-1': P.makeLamp(-1), '1': P.makeLamp(1) };
    this.umbLib = []; for (let i = 0; i < 6; i++) this.umbLib.push(P.makeUmbrella(rand));
    this.guardLib = []; for (let i = 0; i < 3; i++) this.guardLib.push(P.makeLifeguard(rand));
    this.nextHotelZ = 30; this.nextPalmL = 20; this.nextPalmR = 26; this.nextLamp = 18; this.nextBeach = 10;
    this.hotelIdx = 0;
  }

  reset() {
    for (const list of [this.hotels, this.palms, this.lamps, this.beach]) { for (const o of list) this.group.remove(o); list.length = 0; }
    this.nextHotelZ = 30; this.nextPalmL = 20; this.nextPalmR = 26; this.nextLamp = 18; this.nextBeach = 10; this.hotelIdx = 0;
  }

  // z decreases as the runner moves forward; keep content from (camZ + 20) to (camZ - ahead)
  update(camZ, time) {
    const r = this.rand;
    this.tread.position.z = Math.round(camZ / SNAP) * SNAP - this.LEN / 2 + 40;
    this.waterN.offset.set(time * 0.012, time * 0.02);
    this.foam.material.opacity = 0.35 + 0.25 * Math.sin(time * 1.3);
    this.foam.position.x = -67.4 + Math.sin(time * 0.8) * 0.6;
    const ahead = camZ - 330, behind = camZ + 30;
    while (this.nextHotelZ > ahead) {
      const lib = this.hotelLib[this.hotelIdx++ % this.hotelLib.length];
      const h = lib.clone(); const L = lib.userData.len;
      h.position.set(10.2, CURB_Y, this.nextHotelZ - L / 2);
      this.group.add(h); this.hotels.push(h);
      this.nextHotelZ -= L + (r() < 0.3 ? 2.5 : 0.4);
    }
    while (this.nextPalmL > ahead) {
      const p = this.palmLib[Math.floor(r() * this.palmLib.length)].clone();
      p.position.set(-7.4 + (r() - 0.5) * 0.8, CURB_Y, this.nextPalmL); p.rotation.y = r() * 6.28;
      this.group.add(p); this.palms.push(p);
      this.nextPalmL -= 9 + r() * 5;
    }
    while (this.nextPalmR > ahead) {
      const p = this.palmLib[Math.floor(r() * this.palmLib.length)].clone();
      p.position.set(6.3, CURB_Y, this.nextPalmR); p.rotation.y = r() * 6.28; p.scale.setScalar(0.85);
      this.group.add(p); this.palms.push(p);
      this.nextPalmR -= 22 + r() * 10;
    }
    while (this.nextLamp > ahead) {
      for (const s of [-1, 1]) { const l = this.lampLib[s].clone(); l.position.set(s * 5.5, CURB_Y, this.nextLamp + (s > 0 ? 12 : 0)); this.group.add(l); this.lamps.push(l); }
      this.nextLamp -= 24;
    }
    while (this.nextBeach > ahead) {
      const z = this.nextBeach;
      if (r() < 0.18) { const t = this.guardLib[Math.floor(r() * this.guardLib.length)].clone(); t.position.set(-30 - r() * 14, 0, z); t.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.4; this.group.add(t); this.beach.push(t); }
      else { const u = this.umbLib[Math.floor(r() * this.umbLib.length)].clone(); u.position.set(-16 - r() * 36, 0, z); u.rotation.y = r() * 6.28; this.group.add(u); this.beach.push(u); }
      this.nextBeach -= 7 + r() * 9;
    }
    for (const list of [this.hotels, this.palms, this.lamps, this.beach]) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].position.z > behind + 30) { this.group.remove(list[i]); list.splice(i, 1); }
    }
  }
}
