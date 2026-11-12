import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Element } from '../../../engine/types';
import type { EdgeClassification } from '../../../engine/setbacks';
import type { DrawingScene } from '../scene/types';
import { buildMassingData } from '../ui/massingData';
import { sunPosition, SUN_DATES } from '../ui/sunPosition';
import { SceneInspector } from '../ui/SceneInspector';
import { buildSiteModel, type SiteModel } from './siteScene';
import { createStage, type Stage } from './stage';
import { canvasToJpeg, describeScene, requestPhotoreal } from './photoreal';
import { useArchStyle } from '../ui/archStyle';
import { ArchStylePicker } from '../ui/ArchStylePicker';

export interface RenderViewProps {
  elements: Element[];
  /** The parcel outline, EPSG:3857. */
  parcelRing?: number[][] | undefined;
  neighbors?: import('../api/neighbors').PlannerNeighbors | null | undefined;
  edgeClassifications?: EdgeClassification[] | undefined;
  scene: DrawingScene;
  selectedId?: string | null | undefined;
  onSelect?: ((id: string | null) => void) | undefined;
  /** Called when this device cannot draw the view, so the caller can fall back. */
  onFail: (err: Error) => void;
}

type Shot = 'iso' | 'top' | 'street';

interface Rig {
  stage: Stage;
  model: SiteModel;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  request: () => void;
  highlight: THREE.Mesh | null;
}

/**
 * The plan as a rendering: textured buildings on a planted site under a
 * physical sky, with soft shadows and ambient occlusion. Footprints, heights
 * and ids are the drawing scene's; the facades, the planting and the cars are
 * illustration, and the view says so.
 */
export const RenderView: React.FC<RenderViewProps> = ({ elements, parcelRing, neighbors, edgeClassifications, scene, selectedId, onSelect, onFail }) => {
  const archStyle = useArchStyle();
  const data = useMemo(
    () =>
      buildMassingData(elements, {
        ...(parcelRing ? { parcelRing } : {}),
        ...(neighbors?.buildings ? { contextBuildings: neighbors.buildings } : {}),
        ...(neighbors?.parcels ? { contextParcels: neighbors.parcels } : {}),
        ...(neighbors?.roads ? { contextRoads: neighbors.roads } : {}),
        frontEdges: (edgeClassifications ?? []).filter(e => e.type === 'front' && e.edge.length >= 2).map(e => [e.edge[0], e.edge[1]] as never),
        treePoints: scene.landscape.trees.map(t => ({ at: scene.frame.fromFeet(t.at), radiusM: t.radiusFt * 0.3048 })),
        style: archStyle,
      }),
    [elements, parcelRing, neighbors, edgeClassifications, scene, archStyle],
  );

  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rig = useRef<Rig | null>(null);
  const [ready, setReady] = useState(false);
  // counts the models built: a new one needs its sun and its selection set again
  const [built, setBuilt] = useState(0);
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (!present) return;
    // on the way down, and stopped there: Escape leaves Present, not the workspace
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPresent(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [present]);
  const [sunKey, setSunKey] = useState('mar21');
  const [sunHour, setSunHour] = useState(16.5);
  const fail = useRef(onFail);
  fail.current = onFail;
  // where the camera stood, so a change of style redraws the same view of the same plan
  const revision = useRef(scene.identity.revision);
  revision.current = scene.identity.revision;
  const stood = useRef<{ revision: string; position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  const sun = useMemo(() => {
    const day = SUN_DATES.find(d => d.key === sunKey)?.dayOfYear ?? 80;
    return sunPosition(day, sunHour, data.origin.latDeg);
  }, [sunKey, sunHour, data.origin.latDeg]);

  // the aerial looks from the diagonal the neighbours block least
  const aerial = useRef(-38);
  aerial.current = data.aerialAzimuth;
  const frame = useCallback((shot: Shot | 'fit') => {
    const r = rig.current;
    if (!r) return;
    const E = r.model.extent;
    const t = r.controls.target;
    if (shot === 'fit') {
      const dir = r.camera.position.clone().sub(t).normalize();
      t.set(0, E * 0.05, 0);
      r.camera.position.copy(t).addScaledVector(dir, E * 3.3);
    } else {
      const [el, az, dist, lift] = shot === 'top' ? [89.2, 0, 3.4, 0] : shot === 'street' ? [5, aerial.current - 14, 1.75, 0.12] : [18, aerial.current, 2.5, 0.46];
      const e = (el * Math.PI) / 180, a = (az * Math.PI) / 180;
      t.set(0, E * lift, 0);
      r.camera.position.set(t.x + E * dist * Math.cos(e) * Math.sin(a), t.y + E * dist * Math.sin(e), t.z + E * dist * Math.cos(e) * Math.cos(a));
    }
    r.controls.update();
    r.request();
  }, []);

  const turn = useCallback((deg: number) => {
    const r = rig.current;
    if (!r) return;
    const off = r.camera.position.clone().sub(r.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
    r.camera.position.copy(r.controls.target).add(off);
    r.controls.update();
    r.request();
  }, []);

  // build the model and the stage when the plan changes
  useEffect(() => {
    const el = host.current, cv = canvas.current;
    if (!el || !cv) return;
    let model: SiteModel, stage: Stage;
    try {
      model = buildSiteModel(data);
      stage = createStage(cv, model, { width: Math.max(2, el.clientWidth), height: Math.max(2, el.clientHeight), preserve: true });
    } catch (err) {
      fail.current(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const E = model.extent;
    const camera = new THREE.PerspectiveCamera(30, Math.max(0.1, el.clientWidth / Math.max(1, el.clientHeight)), 1.5, E * 40);
    const controls = new OrbitControls(camera, cv);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 8;
    controls.maxDistance = E * 12;
    let raf = 0;
    const draw = () => {
      raf = 0;
      controls.update();
      try {
        stage.render(camera);
      } catch (err) {
        fail.current(err instanceof Error ? err : new Error(String(err)));
      }
    };
    const request = () => { if (!raf) raf = requestAnimationFrame(draw); };
    controls.addEventListener('change', request);
    const ro = new ResizeObserver(() => {
      const w = Math.max(2, el.clientWidth), h = Math.max(2, el.clientHeight);
      stage.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      request();
    });
    ro.observe(el);
    // a click that is not a drag picks a building
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !select.current) return;
      const b = cv.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(model.pick, false)[0];
      select.current((hit?.object.userData.id as string | undefined) ?? null);
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointerup', onUp);
    rig.current = { stage, model, camera, controls, request, highlight: null };
    const was = stood.current;
    if (was && was.revision === revision.current) {
      camera.position.copy(was.position);
      controls.target.copy(was.target);
      controls.update();
    } else {
      frame('iso');
    }
    setReady(true);
    setBuilt(n => n + 1);
    // leaf and bark textures arrive a moment after the model: draw again when they have
    const later = [250, 800, 2000, 4000].map(ms => window.setTimeout(request, ms));
    void model.ready.then(request);
    return () => {
      later.forEach(t => window.clearTimeout(t));
      stood.current = { revision: revision.current, position: camera.position.clone(), target: controls.target.clone() };
      setReady(false);
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointerup', onUp);
      controls.dispose();
      stage.dispose();
      model.dispose();
      rig.current = null;
    };
  }, [data, frame]);

  useEffect(() => {
    const r = rig.current;
    if (!r || !ready) return;
    const [dx, dy, dz] = sun.direction;
    // below the horizon the view keeps a low sun rather than going dark
    r.stage.setSun(sun.altitudeDeg > 4 ? [-dx, -dy, -dz] : [-dx, -dy, 0.08]);
    r.request();
  }, [sun, ready, built]);

  // the selected building: a warm tint over its solid
  useEffect(() => {
    const r = rig.current;
    if (!r || !ready) return;
    if (r.highlight) {
      r.highlight.removeFromParent();
      (r.highlight.material as THREE.Material).dispose();
      r.highlight = null;
    }
    const target = selectedId ? r.model.pick.find(m => m.userData.id === selectedId) : undefined;
    if (target) {
      const mesh = new THREE.Mesh(target.geometry, new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      mesh.scale.setScalar(1.003);
      r.model.root.add(mesh);
      r.highlight = mesh;
    }
    r.request();
  }, [selectedId, ready, built]);

  const snapshot = useCallback(() => {
    const r = rig.current, cv = canvas.current;
    if (!r || !cv) return;
    // twice the screen's pixels for the saved picture, then back
    const before = r.stage.renderer.getPixelRatio();
    r.stage.renderer.setPixelRatio(Math.min(3, before * 2));
    r.stage.setSize(cv.clientWidth, cv.clientHeight);
    r.stage.render(r.camera);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = 'rendering.png';
    a.click();
    r.stage.renderer.setPixelRatio(before);
    r.stage.setSize(cv.clientWidth, cv.clientHeight);
    r.request();
  }, []);

  // The photoreal pass: this view, repainted as a photograph by an image
  // model. The picture is sent to the app's own function; nothing else is.
  const [photo, setPhoto] = useState<{ status: 'idle' | 'working' | 'done' | 'error'; image?: string; model?: string; error?: string }>({ status: 'idle' });
  const makePhotoreal = useCallback(async () => {
    const r = rig.current, cv = canvas.current;
    if (!r || !cv) return;
    r.stage.render(r.camera);
    const image = canvasToJpeg(cv);
    // a camera within 10 degrees of the ground is a street view
    const off = r.camera.position.clone().sub(r.controls.target);
    const view = Math.asin(Math.max(-1, Math.min(1, off.y / Math.max(1e-6, off.length())))) < (10 * Math.PI) / 180 ? 'street' : 'aerial';
    setPhoto({ status: 'working' });
    try {
      const out = await requestPhotoreal({ image, view, style: archStyle, ...describeScene(scene) });
      setPhoto({ status: 'done', image: out.image, model: out.model });
    } catch (err) {
      setPhoto({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }, [scene, archStyle]);
  // a new plan, or the same plan in another style, is a new picture
  useEffect(() => { setPhoto({ status: 'idle' }); }, [scene.identity.revision, archStyle]);

  const tagged = scene.buildings.filter(b => b.tagOnPlan);
  const selected = selectedId ? scene.buildings.find(b => b.id === selectedId) ?? null : null;
  const btn = 'px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-700';

  return (
    <div ref={host} data-testid="massing-3d" data-rendered="pbr" data-ready={ready ? 'true' : 'false'} data-scene-key={scene.identity.key} data-present={present ? 'true' : 'false'} className={present ? 'fixed inset-0 z-50 bg-[#dfe7ee]' : 'relative w-full h-full rounded-lg overflow-hidden border border-gray-200 bg-[#dfe7ee]'}>
      <canvas ref={canvas} className="block w-full h-full touch-none" aria-label="Rendering of the site plan" />
      <div className="absolute top-2 left-2 flex items-center gap-2 bg-white/90 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 shadow-sm">
        <select value={sunKey} onChange={e => setSunKey(e.target.value)} className="border border-gray-200 rounded px-1 py-0.5 bg-white" data-testid="sun-date" aria-label="Date of the sun study">
          {SUN_DATES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <input type="range" min={6} max={19} step={0.5} value={sunHour} onChange={e => setSunHour(Number(e.target.value))} className="w-24" data-testid="sun-hour" aria-label="Hour of the sun study" />
        <span className="tabular-nums w-20">{String(Math.floor(sunHour)).padStart(2, '0')}:{sunHour % 1 ? '30' : '00'} · {Math.round(sun.altitudeDeg)}°</span>
        <span className="w-px h-4 bg-gray-200" aria-hidden="true" />
        <ArchStylePicker />
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 rounded-lg px-1.5 py-1 text-[11px] shadow-sm">
        <button className={btn} onClick={() => frame('iso')} data-testid="camera-iso">Aerial</button>
        <button className={btn} onClick={() => frame('top')} data-testid="camera-top">Top</button>
        <button className={btn} onClick={() => frame('street')} data-testid="camera-street">Street</button>
        <button className={btn} onClick={() => frame('fit')} data-testid="camera-fit" title="Bring the whole site back into view, keeping the angle">Fit site</button>
        <button className={btn} onClick={() => turn(-45)} data-testid="camera-turn-left" aria-label="Turn left 45 degrees" title="Turn left 45°">⟲</button>
        <button className={btn} onClick={() => turn(45)} data-testid="camera-turn-right" aria-label="Turn right 45 degrees" title="Turn right 45°">⟳</button>
        <button
          className="px-1.5 py-0.5 rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
          onClick={makePhotoreal}
          disabled={photo.status === 'working'}
          data-testid="render-photoreal"
          title="Repaint this view as a photograph. Sends this picture, and only this picture, to an image model."
        >
          {photo.status === 'working' ? 'Painting…' : 'Photoreal'}
        </button>
        <button className={btn} onClick={() => setPresent(p => !p)} data-testid="render-present" aria-pressed={present} title={present ? 'Back to the workspace (Esc)' : 'Fill the window with the rendering'}>{present ? 'Exit' : 'Present'}</button>
        <button onClick={snapshot} className="px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700" title="Save this view as a picture, at twice the screen's resolution" data-testid="massing-snapshot">PNG</button>
      </div>
      {onSelect && tagged.length > 0 && (
        <div className="absolute top-11 right-2 flex flex-wrap justify-end items-center gap-1 max-w-[50%] bg-white/90 rounded-lg px-1.5 py-1 text-[11px] shadow-sm" role="group" aria-label="Buildings">
          <span className="text-gray-500 px-0.5">Buildings</span>
          {tagged.slice(0, 16).map(b => (
            <button
              key={b.id}
              type="button"
              aria-pressed={b.id === selectedId}
              title={b.display.oneLine}
              onClick={() => onSelect(b.id === selectedId ? null : b.id)}
              data-testid={`scene-select-${b.tag}`}
              className={`h-5 min-w-5 px-1 rounded-full border text-[11px] font-bold ${b.id === selectedId ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-900 border-gray-400 hover:border-gray-900'}`}
            >
              {b.tag}
            </button>
          ))}
        </div>
      )}
      <div className="absolute bottom-2 left-2 text-[11px] text-gray-600 bg-white/85 rounded px-2 py-1 pointer-events-none">
        Drag to orbit · scroll to zoom{onSelect && tagged.length > 0 ? ' · click a building' : ''} · facades, planting and cars are illustrative
      </div>
      {selected && photo.status !== 'done' && <SceneInspector building={selected} onClose={onSelect ? () => onSelect(null) : undefined} className="absolute right-2 bottom-2" />}
      {photo.status === 'working' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/35 text-white text-sm" role="status" data-testid="photoreal-working">
          <span className="bg-slate-900/80 rounded-lg px-4 py-2">Painting the photoreal picture. This takes about a minute.</span>
        </div>
      )}
      {photo.status === 'error' && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-10 max-w-[80%] bg-white rounded-lg shadow-md border border-amber-300 px-3 py-2 text-xs text-amber-900 flex items-center gap-3" role="alert" data-testid="photoreal-error">
          <span>{photo.error}</span>
          <button className="text-gray-500 hover:text-gray-900" onClick={() => setPhoto({ status: 'idle' })} aria-label="Dismiss">×</button>
        </div>
      )}
      {photo.status === 'done' && photo.image && (
        <div className="absolute inset-0 bg-black flex items-center justify-center" data-testid="photoreal-view">
          <img src={photo.image} alt="Photoreal impression of this view" className="max-w-full max-h-full object-contain" data-testid="photoreal-image" />
          <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-3">
            <p className="text-[11px] leading-snug text-white bg-black/60 rounded px-2 py-1 max-w-[70%]" data-testid="photoreal-note">
              An AI impression of this view. The layout is the plan's. Materials, planting, sky and surroundings are invented by the image model, and a detail may differ from the plan. Not a design.
            </p>
            <div className="flex items-center gap-1 text-[11px]">
              <a href={photo.image} download="photoreal.jpg" className="px-2 py-1 rounded bg-white text-gray-900 hover:bg-gray-100" data-testid="photoreal-download">Download</a>
              <button className="px-2 py-1 rounded bg-white text-gray-900 hover:bg-gray-100" onClick={makePhotoreal} data-testid="photoreal-again">Try again</button>
              <button className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={() => setPhoto({ status: 'idle' })} data-testid="photoreal-back">Back to model</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RenderView;
