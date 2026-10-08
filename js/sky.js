import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.42, 0.075, -1).normalize();
export const FOG_COLOR = new THREE.Color('#f39a8c');

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 p = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const frag = /* glsl */`
uniform vec3 uSun;
uniform float uTime;
uniform float uGray;
varying vec3 vDir;
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
}
float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i++ ) { s += a * noise( p ); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  float sd = max( dot( d, uSun ), 0.0 );
  // gradient: indigo zenith -> violet -> magenta -> orange -> gold at the horizon
  vec3 zen = vec3( 0.10, 0.06, 0.32 );
  vec3 vio = vec3( 0.42, 0.16, 0.55 );
  vec3 mag = vec3( 0.93, 0.32, 0.52 );
  vec3 ora = vec3( 1.00, 0.55, 0.30 );
  vec3 gol = vec3( 1.00, 0.80, 0.45 );
  vec3 c = mix( ora, gol, smoothstep( 0.6, 1.0, sd ) * smoothstep( 0.25, 0.0, h ) );
  c = mix( c, mag, smoothstep( 0.03, 0.16, h ) );
  c = mix( c, vio, smoothstep( 0.14, 0.38, h ) );
  c = mix( c, zen, smoothstep( 0.35, 0.85, h ) );
  // below the horizon: warm haze (matches the scene fog)
  c = mix( c, vec3( 0.95, 0.60, 0.55 ), smoothstep( 0.0, -0.08, h ) );
  // sun glow and disc
  c += vec3( 1.0, 0.55, 0.25 ) * pow( sd, 12.0 ) * 0.7;
  c += vec3( 1.0, 0.75, 0.45 ) * pow( sd, 90.0 ) * 1.2;
  float disc = smoothstep( 0.99925, 0.99955, sd );
  vec3 sunCol = mix( vec3( 1.0, 0.45, 0.2 ), vec3( 1.0, 0.9, 0.6 ), smoothstep( -0.03, 0.03, dot( d - uSun, vec3( 0, 1, 0 ) ) + 0.02 ) );
  c = mix( c, sunCol * 3.2, disc );
  // streaky sunset clouds
  if ( h > -0.02 ) {
    vec2 uv = d.xz / ( h + 0.12 );
    float n = fbm( uv * vec2( 0.55, 2.2 ) + vec2( uTime * 0.004, 0.0 ) );
    float band = smoothstep( 0.02, 0.1, h ) * smoothstep( 0.5, 0.18, h );
    float cl = smoothstep( 0.52, 0.78, n ) * band;
    vec3 lit = mix( vec3( 1.0, 0.45, 0.55 ), vec3( 1.0, 0.82, 0.55 ), pow( sd, 4.0 ) );
    vec3 dark = vec3( 0.45, 0.22, 0.45 );
    vec3 cc = mix( dark, lit, smoothstep( 0.55, 0.9, n ) * 0.6 + pow( sd, 3.0 ) * 0.6 );
    c = mix( c, cc, cl * 0.85 );
  }
  float g = dot( c, vec3( 0.3, 0.59, 0.11 ) );
  c = mix( c, vec3( g ), uGray );
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR }, uTime: { value: 0 }, uGray: { value: 0 } },
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// Reflections for cars, coins, glass and water come from a blurred copy of this sky.
export function skyEnvironment(renderer) {
  const scene = new THREE.Scene();
  const sky = makeSky();
  sky.material.toneMapped = false;
  scene.add(sky);
  // a warm ground bounce so reflections below the horizon aren't black
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.35, 0.35) }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -5; scene.add(ground);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02, 0.1, 1000);
  pm.dispose();
  return rt.texture;
}
