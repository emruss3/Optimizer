// The stage a site model is lit and photographed on: a physical sky, a sun
// that casts soft shadows, light from the sky itself, ambient occlusion where
// things meet, and a film-like tone curve.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// The last touch, after the tone curve: a little more contrast and colour,
// warm lights against cool shadows, and the corners let fall away.
const GRADE = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 1 }, vignette: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; uniform float vignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 g = c.rgb;
      float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
      g = mix(vec3(l), g, 1.0 + 0.06 * amount);                       // saturation
      g = mix(g, g * g * (3.0 - 2.0 * g), 0.28 * amount);             // a soft S curve
      g += (vec3(0.018, 0.008, -0.02) * smoothstep(0.45, 1.0, l) + vec3(-0.012, 0.0, 0.02) * (1.0 - smoothstep(0.0, 0.45, l))) * amount;
      vec2 d = vUv - 0.5;
      g *= 1.0 - vignette * smoothstep(0.25, 0.95, dot(d, d) * 2.2);
      gl_FragColor = vec4(clamp(g, 0.0, 1.0), c.a);
    }`,
};
import type { SiteModel } from './siteScene';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** Point the sun: a unit vector from the ground toward it, model axes (x east, y north, z up). */
  setSun(toSun: [number, number, number]): void;
  setSize(width: number, height: number): void;
  render(camera: THREE.Camera): void;
  dispose(): void;
}

export interface StageOptions {
  width: number;
  height: number;
  pixelRatio?: number;
  /** Keep the drawing buffer, so the canvas can be saved as a picture. */
  preserve?: boolean;
  /** A plain pale ground and sky, for a plan seen from straight above. */
  studio?: boolean;
  /** Ambient occlusion. On unless the device cannot. */
  occlusion?: boolean;
}

export function createStage(canvas: HTMLCanvasElement | undefined, model: SiteModel, opts: StageOptions): Stage {
  const renderer = new THREE.WebGLRenderer({ ...(canvas ? { canvas } : {}), antialias: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
  renderer.setPixelRatio(opts.pixelRatio ?? Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(opts.width, opts.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.studio ? 0.8 : 0.74;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.add(model.root);
  const E = model.extent;

  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms as Record<string, { value: unknown }>;
  (u.turbidity as { value: number }).value = 3.2;
  (u.rayleigh as { value: number }).value = 2.1;
  (u.mieCoefficient as { value: number }).value = 0.003;
  (u.mieDirectionalG as { value: number }).value = 0.8;
  // What the camera sees of the sky: a dome with a blue that deepens overhead,
  // a pale haze at the horizon, a warm glow round the sun and drifting cloud.
  // (The physical sky above only lights the model; shown through the tone
  // curve it burns out to white.)
  const skyUniforms = { sunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3) } };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(E * 36, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 sunDir; varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 zenith = vec3(0.07, 0.22, 0.56), mid = vec3(0.24, 0.46, 0.80), horizon = vec3(0.66, 0.76, 0.84);
          vec3 sky = mix(horizon, mid, smoothstep(0.0, 0.2, h));
          sky = mix(sky, zenith, smoothstep(0.16, 0.85, h));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          sky += vec3(1.0, 0.62, 0.3) * (pow(sd, 5.0) * 0.16 + pow(sd, 48.0) * 0.35);
          vec2 uv = d.xz / (d.y + 0.14);
          float c = fbm(uv * 1.15 + vec2(3.1, 1.7));
          float c2 = fbm(uv * 3.3 - vec2(1.3, 4.2));
          float cover = smoothstep(0.5, 0.74, c * 0.78 + c2 * 0.3) * smoothstep(0.015, 0.11, d.y);
          float under = smoothstep(0.35, 0.85, fbm(uv * 2.1 + 0.4));
          vec3 cloud = mix(vec3(0.92, 0.91, 0.89), vec3(0.5, 0.55, 0.63), under * 0.55);
          cloud += vec3(1.0, 0.72, 0.42) * pow(sd, 3.0) * 0.2;
          vec3 col = mix(sky, cloud, cover * 0.9);
          col = mix(col, horizon, smoothstep(0.09, 0.0, d.y) * 0.8);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  if (!opts.studio) scene.add(dome);
  else scene.background = new THREE.Color(0xe9ebe2);
  if (!opts.studio) scene.fog = new THREE.Fog(new THREE.Color().setRGB(0.66, 0.76, 0.84), E * 3.5, E * 22);

  const hemi = new THREE.HemisphereLight(0xdbe8f7, 0x9a9c86, opts.studio ? 1.0 : 0.85);
  const sun = new THREE.DirectionalLight(0xfff1dd, opts.studio ? 4.2 : 4.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const span = E * 1.9;
  const cam = sun.shadow.camera;
  cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
  cam.near = 1; cam.far = E * 12;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 5;
  sun.shadow.blurSamples = 16;
  scene.add(hemi, sun, sun.target);

  // the sky lights the model too: its own picture, blurred, as the environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  let env: THREE.WebGLRenderTarget | null = null;
  const skyOnly = new THREE.Scene();
  const setSun = (toSun: [number, number, number]) => {
    // model (x east, y north, z up) to stage (x east, y up, z south)
    const d = new THREE.Vector3(toSun[0], toSun[2], -toSun[1]).normalize();
    if (d.y < 0.03) d.y = 0.03;
    (u.sunPosition as { value: THREE.Vector3 }).value.copy(d);
    skyUniforms.sunDir.value.copy(d);
    sun.position.copy(d).multiplyScalar(E * 6);
    sun.target.position.set(0, 0, 0);
    // a low sun is warmer and weaker
    const lift = Math.min(1, d.y / 0.6);
    sun.color.setRGB(1, 0.86 + 0.1 * lift, 0.7 + 0.22 * lift);
    sun.intensity = (opts.studio ? 4.2 : 4.6) * (0.6 + 0.4 * lift);
    env?.dispose();
    skyOnly.add(sky);
    env = pmrem.fromScene(skyOnly, 0.02);
    scene.environment = env.texture;
    scene.environmentIntensity = opts.studio ? 0.55 : 0.7;
  };

  let composer: EffectComposer | null = null;
  let renderPass: RenderPass | null = null;
  let ao: GTAOPass | null = null;
  const sized = () => renderer.getDrawingBufferSize(new THREE.Vector2());
  const build = (camera: THREE.Camera) => {
    if (opts.occlusion === false) return;
    try {
      const px = sized();
      const target = new THREE.WebGLRenderTarget(px.x, px.y, { samples: 4, type: THREE.HalfFloatType });
      composer = new EffectComposer(renderer, target);
      renderPass = new RenderPass(scene, camera);
      ao = new GTAOPass(scene, camera, px.x, px.y);
      ao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.4, thickness: 1.6, scale: 1.5, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      ao.blendIntensity = 1;
      // the pass draws everything as a solid to find where things meet; what is marked as mostly air is left out of that
      const hide = ao.overrideVisibility.bind(ao);
      ao.overrideVisibility = () => { hide(); scene.traverse(o => { if (o.userData.noOcclusion) o.visible = false; }); };
      composer.addPass(renderPass);
      composer.addPass(ao);
      composer.addPass(new OutputPass());
      const grade = new ShaderPass(GRADE);
      (grade.uniforms.vignette as { value: number }).value = opts.studio ? 0 : 0.2;
      (grade.uniforms.amount as { value: number }).value = opts.studio ? 0.7 : 1;
      composer.addPass(grade);
    } catch (err) {
      console.warn('[render] ambient occlusion is not available here; rendering without it.', err);
      composer = null;
    }
  };

  return {
    renderer,
    scene,
    setSun,
    setSize(width, height) {
      renderer.setSize(width, height, false);
      const px = sized();
      composer?.setSize(px.x / renderer.getPixelRatio(), px.y / renderer.getPixelRatio());
    },
    render(camera) {
      if (!composer && opts.occlusion !== false && !renderPass) build(camera);
      if (composer && renderPass && ao) {
        renderPass.camera = camera;
        ao.camera = camera;
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    },
    dispose() {
      env?.dispose();
      pmrem.dispose();
      composer?.dispose();
      dome.geometry.dispose();
      (dome.material as THREE.Material).dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      renderer.dispose();
    },
  };
}
