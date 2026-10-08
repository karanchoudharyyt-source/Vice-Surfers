import * as THREE from 'three';

// Subway Surfers-style bent horizon. Geometry is bent in world space by its distance ahead of
// the camera, so shadows and lighting (which use the unbent world position) stay correct.
// x: sideways bend, y: downward bend, z: distance before bending starts.
export const CURVE = { value: new THREE.Vector3(0, 0.0013, 4) };

const BENT = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 cwp = modelMatrix * mvPosition;
float cdz = max( 0.0, cameraPosition.z - cwp.z - uCurve.z );
cwp.y -= uCurve.y * cdz * cdz;
cwp.x += uCurve.x * cdz * cdz;
mvPosition = viewMatrix * cwp;
gl_Position = projectionMatrix * mvPosition;
`;

export function bendShader(s) {
  s.uniforms.uCurve = CURVE;
  s.vertexShader = 'uniform vec3 uCurve;\n' + s.vertexShader.replace('#include <project_vertex>', BENT);
}

// Wraps a material so it bends. `extra(shader)` runs first for materials with their own patches.
export function curveMaterial(m, extra, key = '') {
  if (m.userData.curved) return m;
  m.userData.curved = true;
  m.onBeforeCompile = (s) => { if (extra) extra(s); bendShader(s); };
  m.customProgramCacheKey = () => 'curve|' + key;
  return m;
}

export function curveObject(o) {
  o.traverse((c) => {
    if (!c.material) return;
    const ms = Array.isArray(c.material) ? c.material : [c.material];
    ms.forEach((m) => curveMaterial(m));
  });
  return o;
}
