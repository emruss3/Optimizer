// The stage a site model is lit and photographed on: a physical sky, a sun
// that casts soft shadows, light from the sky itself, ambient occlusion where
// things meet, and a film-like tone curve.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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
  // What the camera sees of the sky is a painted dome: a soft blue overhead
  // falling to a pale, warm horizon. The physical sky above only lights the
  // model; shown through the tone curve it burns out to white.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(E * 36, 32, 16), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false }));
  {
    const p = dome.geometry.getAttribute('position') as THREE.BufferAttribute;
    const c = new Float32Array(p.count * 3);
    const zenith = new THREE.Color(0x2f74cf), mid = new THREE.Color(0x86b8ee), horizon = new THREE.Color(0xdcebf5), tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const t = Math.max(0, p.getY(i) / (E * 36));
      if (t < 0.22) tmp.copy(horizon).lerp(mid, t / 0.22); else tmp.copy(mid).lerp(zenith, Math.min(1, (t - 0.22) / 0.6));
      c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
    }
    dome.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (!opts.studio) scene.add(dome);
  else scene.background = new THREE.Color(0xe9ebe2);
  if (!opts.studio) scene.fog = new THREE.Fog(0xdcebf5, E * 7, E * 34);

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
      composer.addPass(renderPass);
      composer.addPass(ao);
      composer.addPass(new OutputPass());
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
