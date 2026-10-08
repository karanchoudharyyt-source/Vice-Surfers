import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { curveMaterial } from './curve.js';

// The base character is a bare body in a T-pose (arms along x, facing +z, 1.81m tall).
// Clothes are drawn per pixel from rest-pose coordinates, with a little inflation so the
// silhouette reads as fabric rather than skin.
const DRESS_GLSL = /* glsl */`
uniform vec4 uDress;      // x: shirt hem y, y: sleeve end |x|, z: shoe top y, w: neckline y
uniform sampler2D uShirt;
uniform vec3 uShirtTint;  // multiplies the print (white = untouched)
uniform float uShirtSolid;// 1 = solid colour shirt (cop uniform)
uniform vec3 uShirtColor;
uniform vec3 uPants;
uniform vec3 uShoes;
uniform vec3 uStripe;
vec3 dressMasks( vec3 p ) {
  float ax = abs( p.x );
  float aa = 0.005;
  float shoes = 1.0 - smoothstep( uDress.z - aa, uDress.z + aa, p.y );
  // collar hugs the neck; away from the neck the shirt covers the shoulders completely
  float neckY = mix( uDress.w, uDress.w + 0.2, smoothstep( 0.068, 0.09, ax ) );
  float vdepth = p.z > 0.02 ? 0.12 * ( 1.0 - smoothstep( 0.0, 0.085, ax ) ) : 0.0;
  float belowNeck = 1.0 - smoothstep( neckY - vdepth - aa, neckY - vdepth + aa, p.y );
  float aboveHem = smoothstep( uDress.x - aa, uDress.x + aa, p.y );
  float inSleeve = 1.0 - smoothstep( uDress.y - aa, uDress.y + aa, ax );
  float shirt = belowNeck * aboveHem * inSleeve;
  float pants = ( 1.0 - aboveHem ) * ( 1.0 - shoes );
  return vec3( shirt, pants, shoes );
}
float dHash( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
`;

function dressPatch(mat, uniforms) {
  return (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;\nvarying vec3 vBindN;\n' + DRESS_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBind = position; vBindN = normal;
        vec3 dmv = dressMasks( position );
        transformed += normal * ( dmv.x * 0.024 + dmv.y * 0.02 + dmv.z * 0.026 );`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;\nvarying vec3 vBindN;\n' + DRESS_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 dm = dressMasks( vBind );
        float cloth = clamp( dm.x + dm.y + dm.z, 0.0, 1.0 );
        vec3 bn = pow( abs( normalize( vBindN ) ), vec3( 4.0 ) ); bn /= ( bn.x + bn.y + bn.z );
        vec3 pp = vBind * 2.7;
        vec3 print = texture2D( uShirt, pp.zy ).rgb * bn.x + texture2D( uShirt, pp.xz ).rgb * bn.y + texture2D( uShirt, pp.xy ).rgb * bn.z;
        vec3 shirtCol = mix( print * uShirtTint, uShirtColor, uShirtSolid );
        // stitched hem and sleeve edges
        float edge = smoothstep( 0.0, 0.014, vBind.y - uDress.x ) * smoothstep( 0.0, 0.012, uDress.y - abs( vBind.x ) );
        shirtCol *= mix( 0.62, 1.0, edge );
        float tw = dHash( floor( vBind * vec3( 900.0, 300.0, 900.0 ) ) );
        vec3 pantsCol = uPants * ( 0.86 + 0.24 * tw ) * ( 0.9 + 0.25 * smoothstep( 0.35, 0.6, vBind.y ) * smoothstep( 0.0, 0.06, vBind.z ) );
        vec3 shoeCol = uShoes;
        shoeCol = mix( shoeCol, vec3( 0.55 ), 1.0 - smoothstep( 0.022, 0.03, vBind.y ) );
        shoeCol = mix( shoeCol, uStripe, step( 0.042, vBind.y ) * step( vBind.y, 0.06 ) * step( 0.04, abs( vBind.x ) ) );
        vec3 clothCol = shirtCol * dm.x + pantsCol * dm.y + shoeCol * dm.z;
        diffuseColor.rgb = mix( diffuseColor.rgb, clothCol / max( cloth, 1e-3 ), cloth );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.82 - dm.z * 0.4, cloth );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize( mix( normal, nonPerturbedNormal, cloth * 0.92 ) );`);
  };
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

export async function loadHeroAssets(base, onProgress) {
  const files = ['hero.glb', 'hair.glb', 'anim1.glb', 'anim2.glb'];
  let done = 0;
  const res = await Promise.all(files.map((f) => loader.loadAsync(base + f).then((g) => { onProgress && onProgress(++done / files.length); return g; })));
  const [hero, hair, a1, a2] = res;
  const clips = {};
  for (const c of [...a1.animations, ...a2.animations]) {
    // Keep rotations everywhere, translation only on the hips: other bones keep the hero's own proportions.
    c.tracks = c.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'pelvis.position');
    clips[c.name] = c;
  }
  // untouched copy for the cop, taken before the hero's materials and accessories are changed
  const pristine = SkeletonUtils.clone(hero.scene);
  return { hero, pristine, hair, clips };
}

function makeSunglasses() {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.6 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x1a0d20, roughness: 0.03, metalness: 0.9, envMapIntensity: 2.5 });
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.021, 20), lens); l.scale.set(1.25, 0.85, 1); l.position.set(s * 0.032, 0, 0.004); g.add(l);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0025, 6, 24), frame); ring.scale.set(1.25, 0.85, 1); ring.position.copy(l.position); g.add(ring);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.1), frame); arm.position.set(s * 0.06, 0.003, -0.045); g.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.003), frame); bridge.position.set(0, 0.006, 0.004); g.add(bridge);
  return g;
}

function makeCap() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x141c3a, roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.098, 0.07, 20), navy); top.position.y = 0.035; g.add(top);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.105, 0.035, 20), navy); crown.position.set(0, 0.085, 0.01); g.add(crown);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2, metalness: 0.3 }));
  brim.position.set(0, 0.005, 0.07); brim.rotation.x = 0.25; g.add(brim);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.018, 6), new THREE.MeshStandardMaterial({ color: 0xffd34a, metalness: 1, roughness: 0.25 }));
  badge.position.set(0, 0.06, 0.104); g.add(badge);
  return g;
}

// Attach an object authored in rest-pose model space to a bone.
function attachToBone(obj, bone, root, pos) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
  const m = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).premultiply(root.matrixWorld);
  m.premultiply(inv);
  m.decompose(obj.position, obj.quaternion, obj.scale);
  bone.add(obj);
}

export class Runner {
  constructor(assets, shirtTex, opts = {}) {
    const cop = !!opts.cop;
    this.root = new THREE.Group();
    this.model = cop ? SkeletonUtils.clone(assets.pristine) : assets.hero.scene;
    this.root.add(this.model);
    const bones = {};
    this.model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    this.bones = bones;
    let body = null;
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material.clone();
      m.userData = {};
      if (m.name.includes('Superhero')) {
        body = o;
        const u = {
          uDress: { value: new THREE.Vector4(0.93, cop ? 0.47 : 0.36, 0.115, 1.535) },
          uShirt: { value: shirtTex },
          uShirtTint: { value: new THREE.Color(1, 1, 1) },
          uShirtSolid: { value: cop ? 1 : 0 },
          uShirtColor: { value: new THREE.Color(cop ? '#27407a' : '#ffffff') },
          uPants: { value: new THREE.Color(cop ? '#141b33' : '#33558f') },
          uShoes: { value: new THREE.Color(cop ? '#0b0b0b' : '#f4f4f4') },
          uStripe: { value: new THREE.Color(cop ? '#0b0b0b' : '#ff3f8e') },
        };
        this.dress = u;
        curveMaterial(m, dressPatch(m, u), cop ? 'cop' : 'dress');
      } else {
        if (m.name.includes('Hair')) m.color.set(cop ? '#1a120c' : '#2a1a10');
        curveMaterial(m);
      }
      o.material = m;
    });
    // hair: rebind the separately-rigged mesh to this skeleton
    const hairSrc = assets.hair.scene.clone(true);
    let hairMesh = null; hairSrc.traverse((o) => { if (o.isSkinnedMesh) hairMesh = o; });
    if (hairMesh && body && !cop) {
      const sk = hairMesh.skeleton;
      const nb = sk.bones.map((b) => bones[b.name] || b);
      hairMesh.material = hairMesh.material.clone(); hairMesh.material.userData = {}; hairMesh.material.color.set('#2a1a10'); curveMaterial(hairMesh.material);
      hairMesh.castShadow = true; hairMesh.frustumCulled = false;
      body.parent.add(hairMesh);
      hairMesh.bind(new THREE.Skeleton(nb, sk.boneInverses), hairMesh.bindMatrix);
    }
    // accessories authored in rest pose, so put the skeleton in its bind pose first
    if (body) body.skeleton.pose();
    const head = bones.Head;
    if (head) {
      if (cop) { const cap = makeCap(); cap.traverse((o) => { if (o.material) { curveMaterial(o.material); o.castShadow = true; } }); attachToBone(cap, head, this.model, new THREE.Vector3(0, 1.755, -0.01)); }
      else { const sg = makeSunglasses(); sg.traverse((o) => { if (o.material) curveMaterial(o.material); }); attachToBone(sg, head, this.model, new THREE.Vector3(0, 1.703, 0.093)); }
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = assets.clips;
    this.actions = {};
    this.current = null;
    this.model.rotation.y = Math.PI; // face down the road (-z)
  }

  action(name) {
    if (!this.actions[name]) this.actions[name] = this.mixer.clipAction(this.clips[name]);
    return this.actions[name];
  }

  play(name, { fade = 0.12, loop = true, speed = 1, from = 0 } = {}) {
    const a = this.action(name);
    if (this.current === a && loop) { a.timeScale = speed; return a; }
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = speed;
    a.time = from * a.getClip().duration;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    this.currentName = name;
    return a;
  }

  update(dt) { this.mixer.update(dt); }
}
