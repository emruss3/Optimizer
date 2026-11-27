// Scene dimensions below are approximate photo-study coordinates in feet.
// They are not read from a surveyed The Lanes phase, and never enter the solver.
import type { MassingData } from '../../src/features/site-plan/ui/massingData';
import type { RGBA, Surface } from '../../src/features/site-plan/ui/renderModel';
import { createGroundFrame } from '../../src/features/site-plan/scene/frame';
import { buildDrawingScene } from '../../src/features/site-plan/scene/buildScene';
import { elements as streetElements } from './fixture';

const ground = createGroundFrame(-9679825, 4334090);
const position = (x: number, y: number) => ground.fromFeet([x, y]);
const ring = (x: number, y: number, w: number, d: number) => [
  position(x,y), position(x+w,y), position(x+w,y+d), position(x,y+d), position(x,y),
];
export const courtBoundary = ring(-28, -118, 154, 224);
export const courtElements = streetElements.filter(e => e.id === 'walk-n' ||
  /^(lot|pad)-[012](?:$|-)/.test(e.id));
export const courtScene = buildDrawingScene({
  parcelId: 'lanes-court-reference-study',
  schemeId: 'photo-study-court',
  elements: courtElements,
  parcelGeometry: { type: 'Polygon', coordinates: [courtBoundary] },
});

const M = 0.3048;
const brick: RGBA = [188, 182, 168, 255];
const roof: RGBA = [53, 57, 60, 255];
const wood: RGBA = [172, 130, 79, 255];
const paving: RGBA = [193, 188, 177, 255];
const mulch: RGBA = [74, 59, 43, 255];
const iron: RGBA = [55, 56, 53, 255];

export function withReferenceCourt(data: MassingData): MassingData {
  const slabs = [...data.slabs], roofs = [...data.roofs], windows = [...data.windows];
  const shrubs = [...data.shrubs];
  const pt = (x: number, y: number, z: number) => [...data.toLocal(position(x, y)).slice(0, 2), z * M];
  const box = (id: string, x: number, y: number, w: number, d: number, z: number, h: number, color: RGBA, surface: Surface, part: 'body' | 'detail' = 'detail') => {
    slabs.push({ id, building: true, label: 'Illustrative court', polygon: [[pt(x,y,z),pt(x+w,y,z),pt(x+w,y+d,z),pt(x,y+d,z)]], elevation: h * M, color, surface, part });
  };
  const face = (id: string, points: number[][], color: RGBA, surface: Surface) => {
    roofs.push({ id, polygon: points.map(p => pt(p[0]!, p[1]!, p[2]!)), color, surface });
  };

  // Roofs and walls are geometry. A low metal roof wraps a taller masonry volume.
  // The front wall is segmented around actual recessed glazing bays.
  const house = 'study-amenity-house';
  box(house, 42,-45,45,27,0,0.28,paving,'concrete','body');
  box(house, 42,-45,45,1.2,0.28,10,brick,'brick','body');
  for (const x of [42,85.8]) box(house,x,-45,1.2,27,0.28,10,brick,'brick','body');
  box(house,42,-19.2,45,1.2,0.28,2.2,brick,'brick','body');
  box(house,42,-19.2,45,1.2,8.5,1.78,brick,'brick','body');
  for (const [a,b] of [[42,47],[53,55],[61,63],[69,71],[77,79],[85,87]])
    box(house,a!,-19.2,b!-a!,1.2,2.48,6.02,brick,'brick','body');
  for (const x of [47,55,63,71,79]) {
    windows.push({ id:house, polygon:[pt(x,-19,2.5),pt(x+6,-19,2.5),pt(x+6,-19,8.4),pt(x,-19,8.4)], color:[83,103,101,255], clear:true });
    box(house,x+2.91,-19.15,.18,1.2,2.5,5.9,iron,'metalwork');
    box(house,x,-19.1,6,.85,5.55,.13,iron,'metalwork');
  }
  // The two hip planes and their end returns read differently from the tall cap.
  const e = 10.28, ridge = 15.65;
  face(house, [[40,-47,e],[89,-47,e],[79,-31.5,ridge],[50,-31.5,ridge]], roof,'metal');
  face(house, [[40,-16,e],[50,-31.5,ridge],[79,-31.5,ridge],[89,-16,e]], roof,'metal');
  face(house, [[40,-47,e],[50,-31.5,ridge],[40,-16,e]], roof,'metal');
  face(house, [[89,-16,e],[79,-31.5,ridge],[89,-47,e]], roof,'metal');
  box(house,54,-39,21,14,12.8,6.1,brick,'brick','body');
  face(house, [[53,-40,19],[76,-40,19],[76,-32,20.6],[53,-32,20.6]], roof,'metal');
  face(house, [[53,-32,20.6],[76,-32,20.6],[76,-24,19],[53,-24,19]], roof,'metal');

  // Court pads, paths and planting stay independent of the modelled timber.
  box('entry-connector',50,-18,7,20,0.025,0.18,paving,'concrete');
  box('pergola-court',8,-61,30,29,0.03,0.2,paving,'concrete');
  box('pergola-walk',20,-32,6,34,0.03,0.2,paving,'concrete');
  for (const x of [9,21.5,34]) for (const y of [-59,-39])
    box('pergola',x,y,.65,.65,.2,8.7,wood,'wood');
  for (const y of [-59,-39]) box('pergola',7,y,30,.72,8.5,.75,wood,'wood');
  for (let x = 7.25; x <= 36; x += 1.24)
    box('pergola',x,-60.4,.26,23,9.21,.68,wood,'wood');

  // Pool: actual water plane, clear coping edge, deck and an open metal fence.
  const px=63, py=-87, pw=34, pd=20;
  box('pool-deck',57,-94,47,6,0.03,.22,paving,'concrete');
  box('pool-deck',57,-66,47,8,0.03,.22,paving,'concrete');
  box('pool-deck',57,-88,5,22,0.03,.22,paving,'concrete');
  box('pool-deck',98,-88,6,22,0.03,.22,paving,'concrete');
  face('pool-water', [[px,py,.12],[px+pw,py,.12],[px+pw,py+pd,.12],[px,py+pd,.12]],[96,191,205,255],'water');
  for (const y of [-88,-67]) box('coping',62,y,36,1,.08,.28,[220,216,203,255],'concrete');
  for (const x of [62,97]) box('coping',x,-87,1,20,.08,.28,[220,216,203,255],'concrete');
  for (const y of [-94,-58]) {
    for (let x=57;x<=104;x+=0.56) box('pool-fence',x,y,.075,.075,.24,3.6,iron,'metalwork');
    for (const z of [.55,3.73]) box('pool-fence',57,y,47,.105,z,.09,iron,'metalwork');
  }
  for (const x of [57,104]) {
    for (let y=-94;y<=-58;y+=0.56) box('pool-fence',x,y,.075,.075,.24,3.6,iron,'metalwork');
    for (const z of [.55,3.73]) box('pool-fence',x,-94,.105,36,z,.09,iron,'metalwork');
  }
  for (const [x, y, width, depth] of [[4,-32,13,28],[30,-29,15,28],[2,-66,39,4],[58,-98,46,3]] as const) {
    box('mulch-bed',x,y,width,depth,0.01,0.045,mulch,'plain');
    for (let i=0;i<Math.floor(Math.max(width, depth)/3);i++) {
      const t=(i+0.5)/Math.floor(Math.max(width,depth)/3);
      const [a,b]=pt(x + (width > depth ? t*width : width*(.32+.3*(i%2))), y + (width < depth ? t*depth : depth*.5),0);
      shrubs.push([a!,b!,0.26+(i%4)*0.055]);
    }
  }
  return { ...data, slabs, roofs, windows, shrubs };
}

export const courtViews = [
  { label:'Court reference angle', position:position(-14,-30), target:position(54,-25), eyeFt:20, targetFt:7, fov:46 },
  { label:'Walk the courtyard', position:position(7,-4), target:position(54,-13), eyeFt:5.5, targetFt:5, fov:43 },
  { label:'Pool and clubhouse', position:position(113,-98), target:position(68,-37), eyeFt:12, targetFt:8, fov:44 },
] as const;
