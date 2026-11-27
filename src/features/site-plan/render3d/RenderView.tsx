import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Element } from '../../../engine/types';
import type { EdgeClassification } from '../../../engine/setbacks';
import type { DrawingScene } from '../scene/types';
import { buildMassingData } from '../ui/massingData';
import { sunPosition, SUN_DATES } from '../ui/sunPosition';
import { SceneInspector } from '../ui/SceneInspector';
import { buildSiteModel, loadTreeKit, treeKitLoaded, type SiteModel } from './siteScene';
import { createStage, type Stage } from './stage';
import { canvasToJpeg, describeScene, requestPhotoreal } from './photoreal';
import { useArchStyle } from '../ui/archStyle';
import { recall3D, remember3D } from '../../../lib/viewMemory';
import { aerialShot, aimedSubject, approachShot, prominentSubject, shotUnavailableReason, sightReport, streetShot, AERIAL_FOV, DEFAULT_RENDER_SUN, FT } from './shots';
import { renderQuality } from './quality';
import { ArchStylePicker } from '../ui/ArchStylePicker';
import { Render4kPanel } from './Render4kPanel';
import type { RenderCameraId } from './exportJob';
import { mark, markOnce } from '../../../lib/timeline';

const RENDER_SERVICE = Boolean((import.meta.env.VITE_RENDER_SERVICE_URL as string | undefined)?.trim());

export interface RenderViewProps {
  elements: Element[];
  /** The parcel outline, EPSG:3857. */
  parcelRing?: number[][] | undefined;
  neighbors?: import('../api/neighbors').PlannerNeighbors | null | undefined;
  edgeClassifications?: EdgeClassification[] | undefined;
  scene: DrawingScene;
  /** The buildable envelope, EPSG:3857: drawn on the ground in the review view. */
  envelopeRing?: number[][] | undefined;
  selectedId?: string | null | undefined;
  onSelect?: ((id: string | null) => void) | undefined;
  /** The parcel's surveyed elevations: the scene stands on them. */
  topo?: import('../api/parcelTopo').ParcelTopo | null | undefined;
  grossSf?: number | null | undefined;
  savedPlanId?: string | undefined;
  accessBreak?: { from: number[]; to: number[] } | null | undefined;
  /** Home-design study: frame this building when focusHomeToken changes. */
  focusHomeId?: string | null | undefined;
  focusHomeToken?: number | undefined;
  /** Called when this device cannot draw the view, so the caller can fall back. */
  onFail: (err: Error) => void;
}

type Shot = 'iso' | 'top' | 'street' | 'approach' | 'garage';
// a camera moved by hand after a preset: the label says so instead of naming the preset (navigation audit 11-27)
const MANUAL = 'custom';

interface Rig {
  /** Set once the sun has been placed for this model: nothing is drawn before it. */
  lit: boolean;
  /** The model is the review view's. */
  review: boolean;
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
export const RenderView: React.FC<RenderViewProps> = ({ elements, parcelRing, envelopeRing, neighbors, edgeClassifications, scene, selectedId, onSelect, topo, grossSf, savedPlanId, accessBreak, focusHomeId, focusHomeToken, onFail }) => {
  // Two ways to see the plan. Review, the default, is for reading it: the proposal stands out, the
  // parcel, the envelope and the access are marked. Rendering is for showing it, and Present uses it.
  // The look 3D opens on: the user's explicit choice this session, else the default (handoff 11-27).
  const [look, setLookState] = useState<'review' | 'rendering'>(initialLook);
  const setLook = useCallback((k: 'review' | 'rendering') => { rememberLook(k); setLookState(k); }, []);
  // the feasibility badge asks for Review: the finding is read there, with its object marked (handoff 11-27)
  useEffect(() => {
    const toReview = () => { setLookState('review'); setPresent(false); };
    window.addEventListener(LOOK_REVIEW_EVENT, toReview);
    return () => window.removeEventListener(LOOK_REVIEW_EVENT, toReview);
  }, []);
  const archStyle = useArchStyle();
  const quality = useMemo(() => renderQuality(), []);
  const data = useMemo(
    () =>
      buildMassingData(elements, {
        ...(parcelRing ? { parcelRing } : {}),
        ...(envelopeRing ? { envelopeRing } : {}),
        ...(accessBreak ? { accessBreak } : {}),
        ...(neighbors?.buildings ? { contextBuildings: neighbors.buildings } : {}),
        ...(neighbors?.parcels ? { contextParcels: neighbors.parcels } : {}),
        ...(neighbors?.roads ? { contextRoads: neighbors.roads } : {}),
        frontEdges: (edgeClassifications ?? []).filter(e => e.type === 'front' && e.edge.length >= 2).map(e => [e.edge[0], e.edge[1]] as never),
        treePoints: scene.landscape.trees.map(t => ({ at: scene.frame.fromFeet(t.at), radiusM: t.radiusFt * 0.3048 })),
        style: archStyle,
        ...(topo ? { topo } : {}),
      }),
    [elements, parcelRing, envelopeRing, accessBreak, neighbors, edgeClassifications, scene, archStyle, topo],
  );

  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rig = useRef<Rig | null>(null);
  const [ready, setReady] = useState(false);
  // true when the model stands on surveyed ground that was graded for the picture: the view says so
  const [graded, setGraded] = useState(false);
  const [ground, setGround] = useState<Record<string, unknown>>({ kind: 'flat' });
  // counts the models built: a new one needs its sun and its selection set again
  const [built, setBuilt] = useState(0);
  const [present, setPresent] = useState(false);
  // the tree grower is fetched the first time the model is planted (Rendering or Present), not before
  const [treesHere, setTreesHere] = useState(treeKitLoaded());
  const planted = look === 'rendering' || present;
  useEffect(() => {
    if (!planted || treesHere) return;
    let live = true;
    loadTreeKit().then(() => { if (live) setTreesHere(true); });
    return () => { live = false; };
  }, [planted, treesHere]);
  useEffect(() => {
    if (!present) return;
    // on the way down, and stopped there: Escape leaves Present, not the workspace
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPresent(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [present]);
  const [sunKey, setSunKey] = useState<string>(DEFAULT_RENDER_SUN.key);
  const [sunHour, setSunHour] = useState<number>(DEFAULT_RENDER_SUN.hour);
  const [renderCamera, setRenderCamera] = useState<RenderCameraId | null>(null);
  const fail = useRef(onFail);
  fail.current = onFail;
  // where the camera stood, so a change of style redraws the same view of the same plan
  const revision = useRef(scene.identity.revision);
  revision.current = scene.identity.revision;
  const previewHouse = useRef<string | undefined>(undefined);
  previewHouse.current = useMemo(() => elements.find(el => Array.isArray(el.properties.homeOrigin))?.id, [elements]);
  // the building selected on the plan: Street and Entry frame it first (handoff 11-27)
  const selectedRef = useRef<string | null | undefined>(selectedId);
  selectedRef.current = selectedId;
  const stood = useRef<{ revision: string; review: boolean; position: THREE.Vector3; target: THREE.Vector3; fov: number } | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  const sun = useMemo(() => {
    const day = SUN_DATES.find(d => d.key === sunKey)?.dayOfYear ?? 80;
    return sunPosition(day, sunHour, data.origin.latDeg);
  }, [sunKey, sunHour, data.origin.latDeg]);

  // the aerial looks from the diagonal the neighbours block least
  const aerial = useRef(-38);
  aerial.current = data.aerialAzimuth;
  // the last preset the camera was put on, so a capture can be regenerated from it
  const lastShot = useRef<{ shot: string; basis: string; position: number[]; target: number[]; fovDeg: number; lift?: number } | null>(null);
  // the label follows the camera: once it is moved by hand it is a custom view, named from the preset it left
  const adjusted = useCallback((how: string) => {
    const r = rig.current, was = lastShot.current;
    if (!r || !was) return;
    const from = was.shot === MANUAL ? was.basis.replace(/^Custom view · /, '').replace(/ · .*$/, '') : was.basis.split(/[,;(]/)[0]!.trim();
    lastShot.current = {
      ...was, shot: MANUAL,
      position: [r.camera.position.x, -r.camera.position.z, r.camera.position.y],
      target: [r.controls.target.x, -r.controls.target.z, r.controls.target.y],
      fovDeg: r.camera.fov,
      basis: `Custom view · from ${from} · ${how}`,
    };
    setShotStamp(n => n + 1);
  }, []);
  const adjustedRef = useRef(adjusted);
  adjustedRef.current = adjusted;
  // camera moves the user asked for, to step back through; separate from the plan's undo (navigation audit 11-27)
  const previous = useRef<Array<{ position: THREE.Vector3; target: THREE.Vector3; fov: number; lift: number; shot: typeof lastShot.current }>>([]);
  const [previousCount, setPreviousCount] = useState(0);
  const pushPose = useCallback(() => {
    const r = rig.current;
    if (!r) return;
    previous.current = [...previous.current.slice(-9), { position: r.camera.position.clone(), target: r.controls.target.clone(), fov: r.camera.fov, lift: lift.current, shot: lastShot.current }];
    setPreviousCount(previous.current.length);
  }, []);
  const backToPrevious = useCallback(() => {
    const r = rig.current, p = previous.current.pop();
    setPreviousCount(previous.current.length);
    if (!r || !p) return;
    r.camera.position.copy(p.position);
    r.controls.target.copy(p.target);
    r.camera.fov = p.fov;
    lift.current = p.lift;
    const cv = canvas.current;
    if (cv) lens(r.camera, cv.clientWidth, cv.clientHeight);
    r.controls.update();
    lastShot.current = p.shot;
    setShotNote(null);
    setSightNote(null);
    setShotStamp(n => n + 1);
    r.request();
  }, []);
  const [shotNote, setShotNote] = useState<string | null>(null);
  // the camera was kept across a look change and this look's planting stands in its way: say so, and offer a clear view
  const [sightNote, setSightNote] = useState<{ trees: number; clearPct: number; shot: Shot } | null>(null);
  const [shotStamp, setShotStamp] = useState(0);
  // lens shift of the street view (render3d/shots): 1 is none
  const lift = useRef(1);
  const lens = useCallback((camera: THREE.PerspectiveCamera, w: number, h: number) => {
    if (lift.current > 1) {
      camera.aspect = w / (h * lift.current);
      camera.setViewOffset(w, h * lift.current, 0, 0, w, h);
    } else {
      camera.clearViewOffset();
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
  }, []);
  const frame = useCallback((shot: Shot | 'fit', opts: { record?: boolean } = {}) => {
    const r = rig.current;
    if (!r) return;
    if (opts.record !== false) pushPose();
    // the level a camera centres on: the main building's pad, or the ground at the middle of the parcel
    const padOf = (c: { x: number; y: number }) => prominentSubject(r.model.ground.subjects)?.base ?? r.model.groundAt(c.x, c.y);
    const t = r.controls.target;
    if (shot === 'fit') {
      // Fit site, the rescue (navigation audit 11-27): always an elevated view that holds the whole
      // parcel and what is built on it, from the direction the camera faces now. From an eye-level
      // street camera that means rising to the aerial; the label says Fit site, not the shot before.
      const dx = r.camera.position.x - t.x, dy = t.z - r.camera.position.z;
      const az = Math.hypot(dx, dy) > 1e-3 ? (Math.atan2(dx, -dy) * 180) / Math.PI : aerial.current;
      lift.current = 1;
      r.camera.fov = AERIAL_FOV;
      const cvFit = canvas.current;
      if (cvFit) lens(r.camera, cvFit.clientWidth, cvFit.clientHeight);
      r.controls.minDistance = 8;
      r.controls.maxPolarAngle = Math.PI / 2;
      const camera = aerialShot(r.model.focus, az, r.camera.aspect, padOf(r.model.focus), r.review ? 32 : 28);
      t.set(camera.target[0], camera.target[2], -camera.target[1]);
      r.camera.position.set(camera.position[0], camera.position[2], -camera.position[1]);
      lastShot.current = { shot: 'fit', ...camera, basis: 'Fit site: the whole parcel, from the current direction' };
      setShotNote(null);
      setSightNote(null);
    } else {
      const review = r.review;
      // Street arrival: a person's eye on the approach, with a clear line to the building
      // (render3d/shots). Where no such place is found the view says so and keeps the aerial.
      const cv = canvas.current;
      const picture = cv ? cv.clientWidth / Math.max(1, cv.clientHeight) : r.camera.aspect;
      const { subjects, obstacles, roads, trees, approaches, foreground } = r.model.ground;
      const chosen = selectedRef.current;
      const house = chosen && subjects.some(s => s.id === chosen) ? chosen : previewHouse.current;
      const entranceWalks = house ? approaches.filter(a => a.building === house) : approaches;
      const arrival = shot === 'approach' ? approachShot(entranceWalks, subjects, obstacles, trees, r.model.groundAt, foreground, picture)
        : shot === 'garage' ? approachShot(entranceWalks, subjects, obstacles, trees, r.model.groundAt, foreground, picture, 'apron')
        : shot === 'street' ? streetShot(subjects, obstacles, roads, picture, trees, r.model.groundAt, foreground, house) : null;
      const close = shot === 'approach' || shot === 'garage';
      r.controls.minDistance = arrival && close ? 0.55 : 8;
      r.controls.maxPolarAngle = arrival && close ? 2.05 : Math.PI / 2;
      const asked = shot === 'street' ? 'Street view' : shot === 'garage' ? 'Garage view' : 'Front entry view';
      setSightNote(null);
      setShotNote((shot === 'street' || close) && !arrival
        ? `${asked} requested · showing the aerial instead: ${shotUnavailableReason(shot, subjects, roads, entranceWalks)}.`
        : null);
      if (arrival) {
        // the frame is taller than the picture and the picture is its top part: a level camera, upright walls
        lift.current = arrival.lift;
        r.camera.fov = (2 * Math.atan(Math.tan((arrival.fovDeg * Math.PI) / 360) * arrival.lift) * 180) / Math.PI;
        if (cv) lens(r.camera, cv.clientWidth, cv.clientHeight);
        t.set(arrival.target[0], arrival.target[2], -arrival.target[1]);
        r.camera.position.set(arrival.position[0], arrival.position[2], -arrival.position[1]);
        lastShot.current = { shot, ...arrival };
      } else {
        lift.current = 1;
        r.camera.fov = AERIAL_FOV;
        if (cv) lens(r.camera, cv.clientWidth, cv.clientHeight);
        // the drone view of a rendering centres on what is built; review centres on the parcel
        const c = shot === 'top' || review ? r.model.focus : r.model.built;
        const camera = aerialShot(c, shot === 'top' ? 0 : aerial.current, r.camera.aspect, padOf(c), shot === 'top' ? 89.2 : review ? 32 : 28);
        t.set(camera.target[0], camera.target[2], -camera.target[1]);
        r.camera.position.set(camera.position[0], camera.position[2], -camera.position[1]);
        lastShot.current = { shot: shot === 'top' ? 'top' : 'iso', ...camera, ...(shot === 'top' ? { basis: 'Straight down on the parcel' } : {}) };
      }
    }
    setShotStamp(s => s + 1);
    mark('camera', { requested: shot, shown: lastShot.current?.shot ?? null, revision: scene.identity.revision });
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
    adjusted(`turned ${deg > 0 ? 'right' : 'left'} ${Math.abs(deg)}°`);
  }, []);

  // Focus selection: the selected building framed, the orbit turning around it, from the direction the
  // camera faces now; the view before is kept for Previous view (navigation audit 11-27)
  const focusSelected = useCallback(() => {
    const r = rig.current, id = selectedRef.current;
    const pick = id ? r?.model.pick.find(m => m.userData.id === id) : undefined;
    if (!r || !pick) return;
    pushPose();
    const box = new THREE.Box3().setFromObject(pick);
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(4, box.getSize(new THREE.Vector3()).length() / 2);
    const dir = r.camera.position.clone().sub(r.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 1);
    dir.normalize();
    // never below the eaves: a focus from an eye-level camera lifts to look down on the building
    if (dir.y < 0.35) { dir.y = 0.35; dir.normalize(); }
    const distance = (radius * 1.25) / Math.sin((r.camera.fov * Math.PI) / 360 * Math.min(1, r.camera.aspect));
    r.controls.target.copy(centre);
    r.camera.position.copy(centre).addScaledVector(dir, distance);
    r.controls.minDistance = 2;
    r.controls.update();
    const label = scene.buildings.find(b => b.id === id)?.label ?? 'the selected building';
    lastShot.current = { shot: 'focus', basis: `Focused on ${label}: the orbit turns around it`, position: [r.camera.position.x, -r.camera.position.z, r.camera.position.y], target: [centre.x, -centre.z, centre.y], fovDeg: r.camera.fov };
    setShotNote(null);
    setSightNote(null);
    setShotStamp(n => n + 1);
    r.request();
  }, [pushPose, scene]);

  // build the model and the stage when the plan changes
  useEffect(() => {
    const el = host.current, cv = canvas.current;
    if (!el || !cv) return;
    // A planted model draws at once with the lobed crowns, and again with the grown trees once their
    // grower arrives (the camera is kept): the first usable frame does not wait on optional assets.
    let model: SiteModel, stage: Stage;
    const light = quality === 'light';
    const reviewLook = look === 'review' && !present;
    try {
      const review = look === 'review' && !present;
      model = buildSiteModel(data, { light, review });
      stage = createStage(cv, model, { width: Math.max(2, el.clientWidth), height: Math.max(2, el.clientHeight), preserve: true, light, studio: review });
    } catch (err) {
      fail.current(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const E = model.extent;
    const camera = new THREE.PerspectiveCamera(AERIAL_FOV, Math.max(0.1, el.clientWidth / Math.max(1, el.clientHeight)), 0.305, Math.max(609.6, E * 80));
    const controls = new OrbitControls(camera, cv);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minDistance = 8;
    controls.maxDistance = E * 12;
    let raf = 0;
    let frames = 0;
    let moving = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const draw = () => {
      raf = 0;
      // a frame before the sun is placed would be drawn in the dark and thrown away
      if (!rig.current?.lit) return;
      controls.update();
      try {
        const t = performance.now();
        stage.render(camera, moving);
        // the first frame actually painted, not the moment the model was handed over (audit cf4f0e8)
        if (frames === 0) markOnce(`3d|${scene.identity.revision}`, '3d-interactive', { revision: scene.identity.revision, buildings: scene.buildings.length, look: reviewLook ? 'review' : 'rendering' });
        if (frames++ < 3 && (window as unknown as { __renderDebug?: boolean }).__renderDebug) console.info(`[time] frame ${frames}: ${Math.round(performance.now() - t)} ms`);
      } catch (err) {
        fail.current(err instanceof Error ? err : new Error(String(err)));
      }
    };
    const request = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const startMoving = () => { clearTimeout(settle); moving = true; };
    const stopMoving = () => {
      clearTimeout(settle);
      settle = setTimeout(() => { moving = false; request(); }, 160);
    };
    controls.addEventListener('change', request);
    controls.addEventListener('start', startMoving);
    controls.addEventListener('end', stopMoving);
    // a hand move after a preset makes it a custom view (the label follows the camera)
    let startPose = '';
    const poseKey = () => [...camera.position.toArray(), ...controls.target.toArray()].map(v => v.toFixed(2)).join(',');
    controls.addEventListener('start', () => { startPose = poseKey(); });
    controls.addEventListener('end', () => { if (poseKey() !== startPose) adjustedRef.current('moved by hand'); });
    // zoom toward the point under the cursor; Space+drag pans, as right-drag does (navigation audit 11-27)
    controls.zoomToCursor = true;
    const ORBIT_BUTTONS = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    const PAN_BUTTONS = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.mouseButtons = { ...ORBIT_BUTTONS };
    const typingIn = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
    const spaceDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || typingIn(e.target) || !el.matches(':hover')) return;
      e.preventDefault();
      controls.mouseButtons = { ...PAN_BUTTONS };
      el.style.cursor = 'grab';
    };
    const spaceUp = (e: KeyboardEvent) => { if (e.code === 'Space') { controls.mouseButtons = { ...ORBIT_BUTTONS }; el.style.cursor = ''; } };
    const spaceReset = () => { controls.mouseButtons = { ...ORBIT_BUTTONS }; el.style.cursor = ''; };
    window.addEventListener('keydown', spaceDown);
    window.addEventListener('keyup', spaceUp);
    window.addEventListener('blur', spaceReset);
    const ro = new ResizeObserver(() => {
      const w = Math.max(2, el.clientWidth), h = Math.max(2, el.clientHeight);
      stage.setSize(w, h);
      // keeps the street view's lens shift when the window changes size
      lens(camera, w, h);
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
    rig.current = { lit: false, review: look === 'review' && !present, stage, model, camera, controls, request, highlight: null };
    setGraded(!!model.grade?.grading);
    // what ground this model stands on, for a reader of the page and for the regression runner
    setGround(model.grade ? { kind: model.grade.grading ? 'graded' : 'survey', ...(model.grade.grading ?? {}), pads: model.grade.padList.length } : { kind: 'flat' });
    const modelRevision = revision.current;
    // back from 2D: the camera the user left on this parcel (navigation audit 11-27)
    if (!stood.current) {
      const kept = recall3D(scene.identity.parcelId);
      if (kept) {
        stood.current = { revision: kept.revision, review: kept.review, position: new THREE.Vector3(...kept.position), target: new THREE.Vector3(...kept.target), fov: kept.fov };
        if (kept.shot && kept.basis && !lastShot.current) lastShot.current = { shot: kept.shot, basis: kept.basis, position: [], target: [], fovDeg: kept.fov };
      }
    }
    const was = stood.current;
    const reviewNow = look === 'review' && !present;
    const placed = lastShot.current?.shot;
    if (was && was.revision === modelRevision) {
      if (lastShot.current?.shot === 'approach' || lastShot.current?.shot === 'garage') {
        controls.minDistance = 0.55;
        controls.maxPolarAngle = 2.05;
      }
      camera.position.copy(was.position);
      controls.target.copy(was.target);
      camera.fov = was.fov;
      lens(camera, Math.max(2, el.clientWidth), Math.max(2, el.clientHeight));
      controls.update();
      // A look change keeps the camera, as the user left it (handoff 11-27). What it now sees is
      // measured against this model: Review plants no trees, Rendering does. The stated basis says
      // so, and a clear view is offered rather than taken.
      if (was.review !== reviewNow && (placed === 'street' || placed === 'approach' || placed === 'garage') && lastShot.current) {
        const eye: [number, number] = [camera.position.x, -camera.position.z];
        const aim = aimedSubject([controls.target.x, -controls.target.z], model.ground.subjects);
        const seen = aim ? sightReport(eye, aim, model.ground.trees) : { trees: 0, clearShare: 1 };
        const clearPct = Math.round(seen.clearShare * 100);
        const kept = lastShot.current.basis.replace(/; \d+ trees? in the line of sight$/, '').replace(/, clear line of sight/, '');
        lastShot.current = { ...lastShot.current, basis: `${kept}; kept from ${reviewNow ? 'Rendering' : 'Review'}: ${seen.trees} tree${seen.trees === 1 ? '' : 's'} in the line of sight in this look, ${clearPct}% of the building's sight lines clear` };
        setSightNote(seen.trees > 0 ? { trees: seen.trees, clearPct, shot: placed } : null);
      }
    } else {
      frame('iso', { record: false });
    }
    setReady(true);
    setBuilt(n => n + 1);
    let active = true;
    const refresh = () => { if (active) request(); };
    void model.ready.then(() => {
      if (!active) return;
      stage.invalidateShadows();
      request();
      // the planted model with its pictures arrived: the first full Rendering frame (Review is marked above)
      if (look !== 'review' || present) markOnce(`render|${scene.identity.revision}|${quality}`, 'rendering-frame', { revision: scene.identity.revision, quality, present });
      // the grown trees and their pictures are in: the full Rendering, separate from its first frame
      if ((look !== 'review' || present) && treesHere) markOnce(`render-full|${scene.identity.revision}|${quality}`, 'rendering-textures-ready', { revision: scene.identity.revision, quality });
    });
    void stage.ready.then(refresh);
    return () => {
      active = false;
      clearTimeout(settle);
      stood.current = { revision: modelRevision, review: look === 'review' && !present, position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
      remember3D(scene.identity.parcelId, {
        revision: modelRevision, review: stood.current.review,
        position: camera.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number], fov: camera.fov,
        ...(lastShot.current ? { shot: lastShot.current.shot, basis: lastShot.current.basis } : {}),
      });
      setReady(false);
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointerup', onUp);
      controls.dispose();
      window.removeEventListener('keydown', spaceDown);
      window.removeEventListener('keyup', spaceUp);
      window.removeEventListener('blur', spaceReset);
      stage.dispose();
      model.dispose();
      rig.current = null;
    };
  }, [data, frame, lens, quality, look, present, planted, treesHere]);

  // Home designs → 3D: frame the previewed house once per token after the model includes it.
  // Do not re-frame on later rebuilds of the same token (avoids fighting the user).
  const framedHomeToken = useRef(0);
  useEffect(() => {
    if (!ready || !focusHomeToken || !focusHomeId) return;
    if (previewHouse.current !== focusHomeId) return;
    if (framedHomeToken.current === focusHomeToken) return;
    const r = rig.current;
    if (!r?.model.ground.subjects.some((s) => s.id === focusHomeId)) return;
    frame('street');
    framedHomeToken.current = focusHomeToken;
  }, [ready, built, focusHomeToken, focusHomeId, frame]);

  useEffect(() => {
    const r = rig.current;
    if (!r || !ready) return;
    const [dx, dy, dz] = sun.direction;
    // below the horizon the view keeps a low sun rather than going dark
    r.stage.setSun(sun.altitudeDeg > 4 ? [-dx, -dy, -dz] : [-dx, -dy, 0.08]);
    r.lit = true;
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
      mesh.position.copy(target.position);
      r.model.root.add(mesh);
      r.highlight = mesh;
    }
    r.request();
  }, [selectedId, ready, built]);

  const snapshot = useCallback((fileName?: string) => {
    const r = rig.current, cv = canvas.current;
    if (!r || !cv) return;
    // twice the screen's pixels for the saved picture, then back
    const before = r.stage.renderer.getPixelRatio();
    r.stage.renderer.setPixelRatio(Math.min(3, before * 2));
    r.stage.setSize(cv.clientWidth, cv.clientHeight);
    r.stage.render(r.camera);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = fileName || 'rendering.png';
    a.click();
    r.stage.renderer.setPixelRatio(before);
    r.stage.setSize(cv.clientWidth, cv.clientHeight);
    r.request();
  }, []);
  // The Export menu asks for the view as it is turned now.
  useEffect(() => {
    const save = (e: Event) => snapshot((e as CustomEvent<{ fileName?: string }>).detail?.fileName);
    window.addEventListener('pp:save-3d-image', save);
    return () => window.removeEventListener('pp:save-3d-image', save);
  }, [snapshot]);

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
  const btn = 'px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed';
  // light, style and photoreal are for showing the plan, not for reading it
  const showy = look === 'rendering' || present;
  // the look on screen: Present always shows the rendering, whatever the toggle was left on
  const shownLook: 'review' | 'rendering' = showy ? 'rendering' : 'review';
  const hazards = new Set(data.polygons.map(p => p.hazard));

  return (
    <div ref={host} data-testid="massing-3d" data-rendered="pbr" data-ready={ready ? 'true' : 'false'} data-scene-key={scene.identity.key} data-present={present ? 'true' : 'false'} data-quality={quality} data-look={look === 'review' && !present ? 'review' : 'rendering'} data-buildings={scene.buildings.length} data-ground={JSON.stringify(ground)} data-shot={lastShot.current ? JSON.stringify({ ...lastShot.current, units: 'ft', frame: 'local east, north, up', position: lastShot.current.position.map(v => Math.round((v / FT) * 100) / 100), target: lastShot.current.target.map(v => Math.round((v / FT) * 100) / 100), revision: scene.identity.revision, style: archStyle, sunKey, sunHour }) : undefined} className={present ? 'fixed inset-0 z-50 bg-[#dfe7ee]' : 'relative w-full h-full rounded-lg overflow-hidden border border-gray-200 bg-[#dfe7ee]'}>
      <canvas ref={canvas} className="block w-full h-full touch-none" aria-label="Rendering of the site plan" />
      {/* Review reads the site data; light, style and photoreal belong to showing it */}
      {!showy && (
        <div className="absolute top-2 left-2 bg-white/90 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 shadow-sm" data-testid="look-note">
          Review · the plan's footprints, parcel, envelope and access
        </div>
      )}
      {showy && (
      <div className="absolute top-2 left-2 flex items-center gap-2 bg-white/90 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 shadow-sm">
        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-medium" data-testid="look-illustration" title="Materials, planting, light and the surroundings are illustration, not site data">{present ? 'Illustration · Present' : 'Illustration'}</span>
        <select value={sunKey} onChange={e => setSunKey(e.target.value)} className="border border-gray-200 rounded px-1 py-0.5 bg-white" data-testid="sun-date" aria-label="Date of the sun study">
          {SUN_DATES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <input type="range" min={6} max={19} step={0.5} value={sunHour} onChange={e => setSunHour(Number(e.target.value))} className="w-24" data-testid="sun-hour" aria-label="Hour of the sun study" />
        <span className="tabular-nums w-20">{String(Math.floor(sunHour)).padStart(2, '0')}:{sunHour % 1 ? '30' : '00'} · {Math.round(sun.altitudeDeg)}°</span>
        <span className="w-px h-4 bg-gray-200" aria-hidden="true" />
        <ArchStylePicker />
      </div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 rounded-lg px-1.5 py-1 text-[11px] shadow-sm">
        <div className="inline-flex rounded border border-gray-200 overflow-hidden mr-1" role="group" aria-label="View">
          {(['review', 'rendering'] as const).map(k => (
            <button key={k} type="button" aria-pressed={shownLook === k} onClick={() => { setLook(k); if (k === 'review') setPresent(false); }} data-testid={`look-${k}`}
              title={k === 'review' ? (present ? 'Leave Present and read the plan: the proposal stands out; the parcel, the envelope and the access are marked' : 'For reading the plan: the proposal stands out; the parcel, the envelope and the access are marked') : 'For showing the plan: materials, planting and the neighbourhood'}
              className={`px-1.5 py-0.5 ${shownLook === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              {k === 'review' ? 'Review' : 'Rendering'}
            </button>
          ))}
        </div>
        <button className={btn} onClick={() => frame('iso')} data-testid="camera-iso">Aerial</button>
        <button className={btn} onClick={() => frame('top')} data-testid="camera-top">Top</button>
        <button className={btn} onClick={() => frame('street')} data-testid="camera-street">Street</button>
        {showy && data.slabs.some(s => s.approach?.kind === 'walk') && <button className={btn} onClick={() => frame('approach')} data-testid="camera-approach" title="Eye level on the front walk, at the door">Front entry</button>}
        {/* a rear-load home: the garage approach is its own camera, never stood in for by the front or the aerial */}
        {showy && data.slabs.some(s => s.approach?.kind === 'apron') && <button className={btn} onClick={() => frame('garage')} data-testid="camera-garage" title="Eye level on the drive, at the garage">Garage</button>}
        <button className={btn} onClick={() => frame('fit')} data-testid="camera-fit" title="The whole parcel and what is built on it, from above, facing the way you face now">Fit site</button>
        <button className={btn} onClick={focusSelected} disabled={!selectedId} data-testid="camera-focus" title={selectedId ? 'Frame the selected building and orbit around it' : 'Select a building to focus on it'}>Focus</button>
        <button className={btn} onClick={backToPrevious} disabled={previousCount === 0} data-testid="camera-previous" title="Back to the view before the last camera move (the plan's undo is separate)" aria-label="Previous view">↶ View</button>
        <button className={btn} onClick={() => turn(-45)} data-testid="camera-turn-left" aria-label="Turn left 45 degrees" title="Turn left 45°">⟲</button>
        <button className={btn} onClick={() => turn(45)} data-testid="camera-turn-right" aria-label="Turn right 45 degrees" title="Turn right 45°">⟳</button>
        {showy && <button
          className="px-1.5 py-0.5 rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
          onClick={makePhotoreal}
          disabled={photo.status === 'working'}
          data-testid="render-photoreal"
          title="Repaint this view as a photograph. Sends this picture, and only this picture, to an image model."
        >
          {photo.status === 'working' ? 'Painting…' : 'AI impression'}
        </button>}
        {showy && ready && scene.buildings.length > 0 && (
          <button type="button" className={btn} data-testid="render-4k" aria-expanded={renderCamera !== null}
            onClick={() => setRenderCamera(previous => previous ? null : lastShot.current?.shot === 'street' ? 'street' : lastShot.current?.shot === 'approach' ? 'approach' : 'drone')}
            // without a render service there is no finished image to give: the label says what you get (PR 221 audit)
            title={RENDER_SERVICE ? 'Render a 3840 × 2160 image of this revision' : 'Export this revision\'s scene and cameras for an offline 4K render in Blender — no finished image is produced here'}>
            {RENDER_SERVICE ? 'Render 4K' : '4K scene pack'}
          </button>
        )}
        <button className={btn} onClick={() => setPresent(p => !p)} data-testid="render-present" aria-pressed={present} title={present ? 'Back to the workspace (Esc)' : 'Fill the window with the rendering'}>{present ? 'Exit' : 'Present'}</button>
      </div>
      {scene.buildings.length === 0 && (
        <div className="absolute top-11 left-1/2 -translate-x-1/2 bg-white/95 border border-gray-300 text-gray-800 rounded-lg px-3 py-1.5 text-[11px] shadow-sm max-w-md" data-testid="empty-scheme" role="status">
          No building is drawn here: the current plan places none on this parcel. The view shows the land and what surrounds it. The plan's own reason is in the workspace.
        </div>
      )}
      {lastShot.current && scene.buildings.length > 0 && shotStamp > 0 && (
        // the camera as it stands, named, with any fallback kept beside it (PR 221 audit)
        <div className="absolute bottom-8 left-2 max-w-[60%] rounded bg-white/90 border border-gray-300 px-2 py-0.5 text-[10.5px] text-gray-700 shadow-sm" data-testid="camera-label" data-camera={lastShot.current.shot} data-fallback={shotNote ? 'true' : 'false'}>
          Camera: {lastShot.current.basis}{shotNote ? ' · fallback' : ''}
        </div>
      )}
      {sightNote && !shotNote && (
        <div className="absolute top-11 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-1.5 text-[11px] shadow-sm max-w-md" data-testid="sight-note" role="status">
          <span>{sightNote.trees} tree{sightNote.trees === 1 ? '' : 's'} in this look stand{sightNote.trees === 1 ? 's' : ''} in the line of sight · {sightNote.clearPct}% of the building&rsquo;s sight lines clear. The camera is where you left it.</span>
          <button type="button" className="underline font-medium whitespace-nowrap" data-testid="find-clear-view" onClick={() => frame(sightNote.shot)}>Find clear view</button>
        </div>
      )}
      {shotNote && scene.buildings.length > 0 && (
        <div className="absolute top-11 left-1/2 -translate-x-1/2 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-1.5 text-[11px] shadow-sm max-w-md" data-testid="shot-note" role="status">{shotNote}</div>
      )}
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
        Drag to orbit · right-drag or Space+drag to pan · scroll zooms toward the cursor{onSelect && tagged.length > 0 ? ' · click a building' : ''} · facades, planting and cars are illustrative{graded ? ' · ground graded to 4% or less: assumed, not a grading plan' : ''}{quality === 'light' ? ' · drawn simply: this device has no graphics acceleration' : ''}
      </div>
      {look === 'review' && !present && (
        <div className="absolute bottom-9 left-2 flex items-center gap-3 text-[11px] text-gray-700 bg-white/90 rounded px-2 py-1 pointer-events-none" data-testid="review-legend">
          <span className="flex items-center gap-1"><i className="inline-block w-3 h-2 rounded-sm bg-slate-400" />Proposal, in its materials</span>
          <span className="flex items-center gap-1"><i className="inline-block w-3 h-2 rounded-sm bg-white border border-gray-300" />Existing</span>
          <span className="flex items-center gap-1"><i className="inline-block w-4 border-t-2 border-slate-600" />Parcel</span>
          {envelopeRing && <span className="flex items-center gap-1"><i className="inline-block w-4 border-t-2 border-blue-600" />Buildable envelope</span>}
          {data.curbs.length > 0 && <span className="flex items-center gap-1" data-testid="legend-access"><i className="inline-block w-4 border-t-2 border-amber-500" />Access</span>}
          {accessBreak && <span className="flex items-center gap-1 text-red-700" data-testid="legend-access-break"><i className="inline-block w-4 border-t-2 border-dashed border-red-600" />No drawn connection to the street</span>}
          {data.polygons.some(p => p.privateDrive) && <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-slate-700" />Shared private drive</span>}
          {hazards.has('wetland') && <span className="flex items-center gap-1" data-testid="legend-wetland"><i className="inline-block h-2 w-3 bg-teal-200 border border-teal-600" />Wetland / water buffer</span>}
          {(hazards.has('floodplain') || hazards.has('floodway')) && <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 bg-blue-200 border border-blue-600" />Flood hazard area</span>}
          {hazards.has('slope') && <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 bg-amber-200 border border-amber-600" />Hillside</span>}
        </div>
      )}
      {selected && photo.status !== 'done' && <SceneInspector building={selected} onClose={onSelect ? () => onSelect(null) : undefined} className="absolute right-2 bottom-2" />}
      {showy && renderCamera !== null && (
        <Render4kPanel key={JSON.stringify([scene.identity.key, scene.identity.revision, archStyle, sunKey, sunHour, savedPlanId])}
          data={data} scene={scene} style={archStyle} sunKey={sunKey} sunHour={sunHour} camera={renderCamera}
          grossSf={grossSf} savedPlanId={savedPlanId} onClose={() => setRenderCamera(null)} />
      )}
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

// ── the look 3D opens on ─────────────────────────────────────────────────────────────────────────
// Rendering becomes the default once its release gates pass on real devices (handoff 11-27: framing,
// obstruction, first usable frame ≤ 2 s warm, Review not slower by more than 10% at p95). Until then
// Review stays the default; QA turns Rendering on with ?look=rendering or localStorage pp.lookDefault.
// An explicit choice is remembered for the session either way.
export const RENDERING_DEFAULT = false;
/** Dispatched on window to bring the 3D view to Review (the feasibility badge). */
export const LOOK_REVIEW_EVENT = 'pp:look-review';
const LOOK_KEY = 'pp.look';

export function initialLook(): 'review' | 'rendering' {
  try {
    const chosen = sessionStorage.getItem(LOOK_KEY);
    if (chosen === 'review' || chosen === 'rendering') return chosen;
    const q = new URLSearchParams(window.location.search).get('look');
    if (q === 'review' || q === 'rendering') return q;
    const d = localStorage.getItem('pp.lookDefault');
    if (d === 'review' || d === 'rendering') return d;
  } catch { /* storage blocked: the default */ }
  return RENDERING_DEFAULT ? 'rendering' : 'review';
}

function rememberLook(k: 'review' | 'rendering'): void {
  try { sessionStorage.setItem(LOOK_KEY, k); } catch { /* not remembered */ }
}
