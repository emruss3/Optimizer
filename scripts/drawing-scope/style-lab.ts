// A bench for the building styles: a short street of houses, a row of homes
// or a pair of apartment buildings, drawn through the same code the app uses
// (massing data, site model, stage), close enough to judge an elevation.
//
//   /scripts/drawing-scope/style-lab.html?style=farmhouse&set=houses&az=20&el=12&dist=60
//
// Served by the dev server only; it is not part of the build.
import * as THREE from 'three';
import type { Element } from '/src/engine/types';
import { buildMassingData } from '/src/features/site-plan/ui/massingData';
import { buildSiteModel } from '/src/features/site-plan/render3d/siteScene';
import { createStage } from '/src/features/site-plan/render3d/stage';
import { createGroundFrame } from '/src/features/site-plan/scene/frame';
import { sunPosition } from '/src/features/site-plan/ui/sunPosition';
import { isArchStyle } from '/src/features/site-plan/ui/architecture';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const style = isArchStyle(q.get('style')) ? (q.get('style') as 'mansard') : 'mansard';
const set = q.get('set') ?? 'houses';
const frame = createGroundFrame(-9660000, 4323000);
const FT = 0.3048;
const at = (x: number, y: number): number[] => frame.fromFeet([x / FT, y / FT]);
const rect = (x0: number, y0: number, x1: number, y1: number): number[][][] => [[at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)]];
const now = new Date(0).toISOString();
const el = (id: string, type: Element['type'], name: string, ring: number[][][], properties: Record<string, unknown> = {}): Element =>
  ({ id, type, name, geometry: { type: 'Polygon', coordinates: ring }, properties, metadata: { createdAt: now, updatedAt: now, source: 'ai-generated' } }) as unknown as Element;

const elements: Element[] = [];
const trees: Array<{ at: number[]; radiusM: number }> = [];
let parcel: number[][] = [];
let look: [number, number, number] = [0, 3, 0];

if (set === 'houses') {
  // a street, houses on the far side facing it, one row behind the camera
  elements.push(el('street', 'circulation', 'Street', rect(-70, -3.6, 70, 3.6)));
  const lots: Array<{ w: number; d: number; floors: number; drive: number }> = [
    { w: 12.2, d: 14, floors: 1, drive: 5.4 }, { w: 12.2, d: 14, floors: 2, drive: 3.2 }, { w: 7.9, d: 12.2, floors: 1, drive: 0 },
    { w: 7.9, d: 12.2, floors: 2, drive: 3.2 }, { w: 15, d: 10.5, floors: 1, drive: 5.4 }, { w: 15, d: 10.5, floors: 2, drive: 0 },
    { w: 11.7, d: 14, floors: 1, drive: 3.2 },
  ];
  let x = -62;
  lots.forEach((l, i) => {
    const x0 = x + 3, y0 = 11;
    elements.push(el(`pad-${i + 1}`, 'building', `House ${i + 1}`, rect(x0, y0, x0 + l.w, y0 + l.d), { floors: l.floors, stories: l.floors, house: true, use: 'residential' }));
    if (l.drive) {
      const dx = i % 2 ? x0 + l.w - l.drive - 0.5 : x0 + 0.5;
      elements.push(el(`drive-${i + 1}`, 'circulation', 'Driveway', rect(dx, 3.6, dx + l.drive, y0), { kind: 'driveway' }));
    }
    trees.push({ at: at(x0 + l.w / 2 + (i % 2 ? -4 : 4), 6.3), radiusM: 2.6 });
    trees.push({ at: at(x0 + l.w * 0.3, y0 + l.d + 6), radiusM: 3.4 });
    x += l.w + 6;
  });
  parcel = [at(-66, -3.6), at(x + 4, -3.6), at(x + 4, 36), at(-66, 36), at(-66, -3.6)];
  look = [num('tx', -20), 3, num('ty', 16)];
} else if (set === 'town') {
  elements.push(el('street', 'circulation', 'Street', rect(-45, -3.6, 45, 3.6)));
  elements.push(el('alley', 'circulation', 'Alley', rect(-45, 24, 45, 29.5)));
  const W = 6.1, D = 12.2, floors = num('floors', 3);
  for (let i = 0; i < 6; i++) {
    const x0 = -30 + i * W;
    elements.push(el(`home-${i + 1}`, 'building', `Townhome ${i + 1}`, rect(x0, 9, x0 + W, 9 + D), { floors, stories: floors, townhome: true, use: 'residential' }));
  }
  for (let i = 0; i < 5; i++) {
    const x0 = 12 + i * W;
    elements.push(el(`home-b${i + 1}`, 'building', `Townhome ${i + 7}`, rect(x0, 9, x0 + W, 9 + D), { floors, stories: floors, townhome: true, use: 'residential' }));
  }
  for (let i = 0; i < 9; i++) trees.push({ at: at(-40 + i * 10, 6), radiusM: 2.6 });
  parcel = [at(-46, -3.6), at(46, -3.6), at(46, 30), at(-46, 30), at(-46, -3.6)];
  look = [num('tx', -12), 4.5, num('ty', 12)];
} else {
  const floors = num('floors', 4);
  elements.push(el('drive', 'circulation', 'Drive', rect(-60, -4, 60, 4)));
  elements.push(el('bar', 'building', 'Building A', rect(-52, 12, 10, 31), { floors, stories: floors, use: 'residential' }));
  // an L
  const L = [[at(22, 12), at(58, 12), at(58, 52), at(40, 52), at(40, 30), at(22, 30), at(22, 12)]];
  elements.push(el('ell', 'building', 'Building B', L, { floors: floors + 1, stories: floors + 1, use: 'residential' }));
  elements.push(el('club', 'building', 'Clubhouse', rect(-30, -26, -12, -14), { floors: 1, stories: 1, use: 'amenity' }));
  elements.push(el('lot', 'parking', 'Parking', rect(-6, -30, 50, -8), { parkingSpaces: 36 }));
  for (let i = 0; i < 11; i++) trees.push({ at: at(-54 + i * 11, 7.6), radiusM: 2.8 });
  parcel = [at(-62, -34), at(64, -34), at(64, 58), at(-62, 58), at(-62, -34)];
  look = [num('tx', -18), 7, num('ty', 16)];
}

const data = buildMassingData(elements, { parcelRing: parcel, treePoints: q.get('trees') === '0' ? [] : trees, style });
const model = buildSiteModel(data, { noContext: true });
const canvas = document.getElementById('lab') as HTMLCanvasElement;
const width = num('w', 1600), height = num('h', 900);
const stage = createStage(canvas, model, { width, height, pixelRatio: 1, preserve: true });
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;
// the camera: `az` degrees round from the south, `el` up, `dist` metres from the point looked at;
// or `cam` and `look` as x,y,z in the lab's own metres (x east, y north, z up)
const az = (num('az', 20) * Math.PI) / 180, elv = (num('el', 12) * Math.PI) / 180, dist = num('dist', 60);
const o = data.toLocal(at(0, 0));
const local = (x: number, y: number, z: number): [number, number, number] => [x + (o[0] ?? 0), z, -(y + (o[1] ?? 0))];
const camera = new THREE.PerspectiveCamera(num('fov', 32), width / height, 0.5, 4000);
const xyz = (k: string): [number, number, number] | null => { const v = (q.get(k) ?? '').split(',').map(Number); return v.length === 3 && v.every(Number.isFinite) ? [v[0] as number, v[1] as number, v[2] as number] : null; };
const target = xyz('look') ?? [look[0], look[2], look[1]];
const eye = xyz('cam') ?? [target[0] + dist * Math.cos(elv) * Math.sin(az), target[1] - dist * Math.cos(elv) * Math.cos(az), target[2] + dist * Math.sin(elv)];
camera.position.set(...local(...eye));
camera.lookAt(...local(...target));
camera.updateProjectionMatrix();
const [dx, dy, dz] = sunPosition(num('day', 172), num('hour', 15.5), frame.latDeg).direction;
stage.setSun([-dx, -dy, -dz]);
const draw = () => stage.render(camera);
draw();
// textures arrive a frame late: draw again, then say so
let n = 0;
const again = () => { draw(); if (++n < 4) setTimeout(again, 250); else (window as unknown as { __labReady: boolean }).__labReady = true; };
// the photographed surfaces and the tree pictures arrive after the model: wait for them, then draw
void model.ready.then(() => setTimeout(again, 250));
