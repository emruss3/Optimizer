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
  const data = useMemo(
    () =>
      buildMassingData(elements, {
        ...(parcelRing ? { parcelRing } : {}),
        ...(neighbors?.buildings ? { contextBuildings: neighbors.buildings } : {}),
        ...(neighbors?.parcels ? { contextParcels: neighbors.parcels } : {}),
        ...(neighbors?.roads ? { contextRoads: neighbors.roads } : {}),
        frontEdges: (edgeClassifications ?? []).filter(e => e.type === 'front' && e.edge.length >= 2).map(e => [e.edge[0], e.edge[1]] as never),
        treePoints: scene.landscape.trees.map(t => ({ at: scene.frame.fromFeet(t.at), radiusM: t.radiusFt * 0.3048 })),
      }),
    [elements, parcelRing, neighbors, edgeClassifications, scene],
  );

  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rig = useRef<Rig | null>(null);
  const [ready, setReady] = useState(false);
  const [sunKey, setSunKey] = useState('mar21');
  const [sunHour, setSunHour] = useState(15.5);
  const fail = useRef(onFail);
  fail.current = onFail;
  const select = useRef(onSelect);
  select.current = onSelect;

  const sun = useMemo(() => {
    const day = SUN_DATES.find(d => d.key === sunKey)?.dayOfYear ?? 80;
    return sunPosition(day, sunHour, data.origin.latDeg);
  }, [sunKey, sunHour, data.origin.latDeg]);

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
      const [el, az, dist, lift] = shot === 'top' ? [89.2, 0, 3.4, 0] : shot === 'street' ? [5, -52, 1.75, 0.12] : [30, -38, 3.2, 0.05];
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
    setReady(true);
    return () => {
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
  }, [data]);

  useEffect(() => { if (ready) frame('iso'); }, [ready, frame]);

  useEffect(() => {
    const r = rig.current;
    if (!r || !ready) return;
    const [dx, dy, dz] = sun.direction;
    // below the horizon the view keeps a low sun rather than going dark
    r.stage.setSun(sun.altitudeDeg > 4 ? [-dx, -dy, -dz] : [-dx, -dy, 0.08]);
    r.request();
  }, [sun, ready]);

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
  }, [selectedId, ready]);

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

  const tagged = scene.buildings.filter(b => b.tagOnPlan);
  const selected = selectedId ? scene.buildings.find(b => b.id === selectedId) ?? null : null;
  const btn = 'px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-700';

  return (
    <div ref={host} data-testid="massing-3d" data-rendered="pbr" data-ready={ready ? 'true' : 'false'} data-scene-key={scene.identity.key} className="relative w-full h-full rounded-lg overflow-hidden border border-gray-200 bg-[#dfe7ee]">
      <canvas ref={canvas} className="block w-full h-full touch-none" aria-label="Rendering of the site plan" />
      <div className="absolute top-2 left-2 flex items-center gap-2 bg-white/90 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 shadow-sm">
        <select value={sunKey} onChange={e => setSunKey(e.target.value)} className="border border-gray-200 rounded px-1 py-0.5 bg-white" data-testid="sun-date" aria-label="Date of the sun study">
          {SUN_DATES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <input type="range" min={6} max={19} step={0.5} value={sunHour} onChange={e => setSunHour(Number(e.target.value))} className="w-24" data-testid="sun-hour" aria-label="Hour of the sun study" />
        <span className="tabular-nums w-20">{String(Math.floor(sunHour)).padStart(2, '0')}:{sunHour % 1 ? '30' : '00'} · {Math.round(sun.altitudeDeg)}°</span>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 rounded-lg px-1.5 py-1 text-[11px] shadow-sm">
        <button className={btn} onClick={() => frame('iso')} data-testid="camera-iso">Aerial</button>
        <button className={btn} onClick={() => frame('top')} data-testid="camera-top">Top</button>
        <button className={btn} onClick={() => frame('street')} data-testid="camera-street">Street</button>
        <button className={btn} onClick={() => frame('fit')} data-testid="camera-fit" title="Bring the whole site back into view, keeping the angle">Fit site</button>
        <button className={btn} onClick={() => turn(-45)} data-testid="camera-turn-left" aria-label="Turn left 45 degrees" title="Turn left 45°">⟲</button>
        <button className={btn} onClick={() => turn(45)} data-testid="camera-turn-right" aria-label="Turn right 45 degrees" title="Turn right 45°">⟳</button>
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
      {selected && <SceneInspector building={selected} onClose={onSelect ? () => onSelect(null) : undefined} className="absolute right-2 bottom-2" />}
    </div>
  );
};

export default RenderView;
