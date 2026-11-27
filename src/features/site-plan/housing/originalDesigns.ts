import { WEST_HEIMAN_DESIGNS } from './westHeimanDesigns';
import { MIDDLE_TENNESSEE_DESIGNS } from './middleTennesseeDesigns';

// Original Middle Tennessee feasibility designs. Coordinates are outside-to-outside feet.
// The front is y=0, x increases to the right and y runs towards the rear yard.
export type Point = [number, number];
export type Rect = [number, number, number, number]; // left, front, width, depth
export type Face = 'front' | 'right' | 'back' | 'left';
export type Finish = 'lap' | 'brick' | 'board' | 'limewash' | 'stone' | 'cedar';
export interface Room {
  name: string;
  rect: Rect;
}
export interface Level {
  name: string;
  rooms: Room[];
  links: string[];
}
export interface Volume {
  rect: Rect;
  first: number;
  count: number;
  ridge: 'depth' | 'width' | 'shed' | 'flat';
  pitch: number;
  finish: Finish;
}
export interface Door {
  room: string;
  face: Face;
  at: number;
  width: number;
  kind: 'entry' | 'garage' | 'garden';
}
export interface Porch {
  rect: Rect;
  level?: number;
  finish: 'metal' | 'shingle';
}
export interface SideWindow {
  level: number;
  face: 'left' | 'right';
  at: number;
  width: number;
  sill: number;
  head: number;
}
export interface HomeDesign {
  id: string;
  name: string;
  setting: string;
  description: string;
  access: string;
  palette: [string, string, string];
  levels: Level[];
  heights: number[];
  volumes: Volume[];
  doors: Door[];
  porches: Porch[];
  parking: 'pad' | 'front' | 'rear' | 'side';
  cars: number;
  attached?: boolean;
  /** This drawn detached rear-load study needs separate mapped front and rear approaches. */
  rearLoadPrecedent?: { source: string };
  /** Exterior garage treatment when verified by the model's elevation. */
  garageDoor?: 'solid-sectional';
  /** Photo-informed finish study for the known front wall. Does not assign an
   * as-built elevation or change the source roof, openings, or plan. */
  frontFinishStudy?: 'recessed-balcony' | 'contrasting-trim' | 'quiet-trim';
  sideWindows?: SideWindow[];
  balconyScreen?: { level: number; width: number; openingAt: number; openingWidth: number };
  roofBulkhead?: { rect: Rect; heightFt: number };
}
const room = (name: string, x: number, y: number, w: number, d: number): Room => ({ name, rect: [x, y, w, d] });
const level = (name: string, rooms: Room[], links: string): Level => ({ name, rooms, links: links.split(';') });
const vol = (
  rect: Rect,
  first: number,
  count: number,
  ridge: Volume['ridge'],
  pitch: number,
  finish: Finish,
): Volume => ({ rect, first, count, ridge, pitch, finish });
const opening = (room: string, face: Face, at: number, width: number, kind: Door['kind']): Door => ({
  room,
  face,
  at,
  width,
  kind,
});
// '|' is a swing door, '~' a wide cased opening. Room names are local to a level.
export const HOME_DESIGNS: HomeDesign[] = [
  {
    id: 'tn-court-cottage-v1',
    name: 'Court Cottage',
    setting: 'Compact detached',
    parking: 'pad',
    cars: 1,
    description:
      'A one-story cottage with a deep front porch. The living and dining room opens to an eat-in kitchen. A central hall keeps all three bedrooms private.',
    access: 'One 9 × 18 ft surface space. The front walk reaches the porch independently of the parking space.',
    palette: ['#98a9a1', '#ece5d5', '#655344'],
    heights: [9.5],
    volumes: [vol([0, 0, 38, 28], 0, 1, 'width', 6, 'lap')],
    porches: [{ rect: [0, -6, 17, 6], finish: 'metal' }],
    doors: [opening('Living / dining', 'front', 7.5, 3, 'entry'), opening('Kitchen', 'back', 8, 3, 'garden')],
    levels: [
      level(
        'Ground',
        [
          room('Living / dining', 0, 0, 15, 16),
          room('Kitchen', 0, 16, 15, 12),
          room('Bedroom 2', 15, 0, 11, 12),
          room('Hall', 15, 12, 16, 4),
          room('Bedroom 3', 15, 16, 11, 12),
          room('Primary bedroom', 26, 0, 12, 12),
          room('Closet', 31, 12, 4, 4),
          room('Mech / HVAC', 35, 12, 3, 4),
          room('Laundry', 26, 16, 6, 5),
          room('Bath', 26, 21, 6, 7),
          room('Primary bath', 32, 16, 6, 12),
        ],
        'Living / dining~Kitchen;Living / dining~Hall;Hall|Bedroom 2;Hall|Bedroom 3;Hall|Primary bedroom;Hall|Laundry;Laundry|Bath;Primary bedroom|Closet;Closet|Primary bath;Closet|Mech / HVAC',
      ),
    ],
  },
  {
    id: 'tn-pocket-cottage-v1',
    name: 'Pocket Cottage',
    setting: 'Compact detached',
    parking: 'pad',
    cars: 1,
    description:
      'A shorter one-story cottage for tight Mid-Tennessee lots. Living opens to the kitchen; two bedrooms and a primary suite share a compact hall.',
    access: 'One 9 × 18 ft surface space beside the porch. The front walk reaches the porch independently of the parking space.',
    palette: ['#a8b0a4', '#f0e8d8', '#5a4a3c'],
    heights: [9.5],
    volumes: [vol([0, 0, 36, 26], 0, 1, 'width', 6, 'board')],
    porches: [{ rect: [0, -5, 14, 5], finish: 'metal' }],
    doors: [opening('Living', 'front', 6, 3, 'entry'), opening('Kitchen', 'back', 7, 3, 'garden')],
    levels: [
      level(
        'Ground',
        [
          room('Living', 0, 0, 18, 16),
          room('Kitchen', 0, 16, 18, 10),
          room('Bedroom 2', 18, 0, 8, 12),
          room('Hall', 18, 12, 8, 4),
          room('Bath', 18, 16, 8, 6),
          room('Laundry', 18, 22, 5, 4),
          room('Mech / HVAC', 23, 22, 3, 4),
          room('Primary bedroom', 26, 0, 10, 16),
          room('Primary bath', 26, 16, 10, 6),
          room('Closet', 26, 22, 10, 4),
        ],
        'Living~Kitchen;Living~Hall;Hall|Bedroom 2;Hall|Bath;Hall|Primary bedroom;Kitchen|Laundry;Laundry|Mech / HVAC;Primary bedroom|Primary bath;Primary bath|Closet',
      ),
    ],
  },
  {
    id: 'tn-lantern-narrow-v1',
    name: 'Lantern House',
    setting: 'Narrow urban detached',
    parking: 'front',
    cars: 1,
    description:
      'A brick garage and a sheltered front door share the narrow street face. The stair stacks against the same side on all three floors. A projecting upper bay brings daylight into the living room.',
    access:
      'A 9 ft single garage door and separate entry stoop face the street. A ground-floor guest room has a garden door.',
    palette: ['#b6afa0', '#f1ece1', '#4b5953'],
    heights: [10, 10, 9.5],
    volumes: [vol([0, 0, 21, 40], 0, 1, 'flat', 0, 'brick'), vol([0, -2, 21, 42], 1, 2, 'depth', 8, 'lap')],
    porches: [{ rect: [13, -4, 8, 4], finish: 'metal' }],
    doors: [
      opening('Garage', 'front', 6.5, 9, 'garage'),
      opening('Entry', 'front', 17, 3, 'entry'),
      opening('Guest room', 'back', 6, 3, 'garden'),
    ],
    levels: [
      level(
        'Entry',
        [
          room('Garage', 0, 0, 13, 21),
          room('Entry', 13, 0, 8, 8),
          room('Stair hall', 13, 8, 8, 14),
          room('Mud hall', 0, 21, 8, 5),
          room('Mech / HVAC', 8, 21, 5, 5),
          room('Landing', 13, 22, 8, 5),
          room('Guest room', 0, 26, 13, 14),
          room('Laundry', 13, 27, 8, 6),
          room('Shower bath', 13, 33, 8, 7),
        ],
        'Entry~Stair hall;Stair hall~Landing;Landing~Mech / HVAC;Garage|Mud hall;Mud hall|Mech / HVAC;Mud hall|Guest room;Landing|Laundry;Guest room|Shower bath',
      ),
      level(
        'Living',
        [
          room('Living room', 0, -2, 21, 10),
          room('Dining', 0, 8, 13, 14),
          room('Stair hall', 13, 8, 8, 14),
          room('Kitchen', 0, 22, 14, 18),
          room('Pantry', 14, 22, 7, 9),
          room('Powder', 14, 31, 7, 9),
        ],
        'Living room~Dining;Living room~Stair hall;Dining~Kitchen;Kitchen|Pantry;Kitchen|Powder',
      ),
      level(
        'Bedroom',
        [
          room('Bedroom 2', 0, -2, 13, 16),
          room('Bath', 13, -2, 8, 10),
          room('Stair hall', 13, 8, 8, 14),
          room('Upper hall', 0, 14, 13, 8),
          room('Primary bedroom', 0, 22, 13, 18),
          room('Dressing', 13, 22, 8, 8),
          room('Primary bath', 13, 30, 8, 10),
        ],
        'Stair hall~Upper hall;Upper hall|Bedroom 2;Stair hall|Bath;Upper hall|Primary bedroom;Primary bedroom|Dressing;Dressing|Primary bath',
      ),
    ],
  },
  {
    id: 'tn-meadow-ranch-v1',
    name: 'Meadow Ranch',
    setting: 'Suburban single-story',
    parking: 'front',
    cars: 2,
    description:
      'A low cross-gabled ranch with two bedroom wings around a central family room. A recessed entry keeps the two-car garage from dominating the porch.',
    access: 'A 16 ft garage door faces the drive. Groceries come through a mudroom beside the kitchen.',
    palette: ['#e1d6be', '#f4ebdc', '#697261'],
    heights: [10],
    volumes: [
      vol([0, 0, 22, 24], 0, 1, 'depth', 5, 'brick'),
      vol([0, 24, 22, 22], 0, 1, 'width', 5, 'lap'),
      vol([22, 4, 30, 42], 0, 1, 'depth', 6, 'lap'),
    ],
    porches: [{ rect: [22, -2, 18, 6], finish: 'metal' }],
    doors: [
      opening('Garage', 'front', 11, 16, 'garage'),
      opening('Living room', 'front', 29, 3.5, 'entry'),
      opening('Dining', 'back', 29, 6, 'garden'),
    ],
    levels: [
      level(
        'Ground',
        [
          room('Garage', 0, 0, 22, 24),
          room('Living room', 22, 4, 18, 18),
          room('Bedroom 2', 40, 4, 12, 14),
          room('Hall', 40, 18, 12, 4),
          room('Mudroom', 0, 24, 10, 8),
          room('Kitchen', 10, 24, 12, 12),
          room('Family room', 22, 22, 18, 14),
          room('Bath', 40, 22, 7, 10),
          room('Laundry', 47, 22, 5, 6),
          room('Mech / HVAC', 47, 28, 5, 4),
          room('Primary bath', 0, 32, 10, 14),
          room('Primary bedroom', 10, 36, 12, 10),
          room('Dining', 22, 36, 18, 10),
          room('Bedroom 3', 40, 32, 12, 14),
        ],
        'Garage|Mudroom;Mudroom~Kitchen;Kitchen~Family room;Living room~Family room;Living room~Hall;Hall|Bedroom 2;Hall|Bath;Bath|Laundry;Laundry|Mech / HVAC;Family room|Bedroom 3;Family room~Dining;Dining|Primary bedroom;Primary bedroom|Primary bath',
      ),
    ],
  },
  {
    id: 'tn-crossfield-v1',
    name: 'Crossfield House',
    setting: 'Suburban two-story',
    parking: 'front',
    cars: 2,
    description:
      'A two-story family house beside a lower brick garage wing. An entry stair separates the front study from the great room. All four bedrooms share the upper floor.',
    access:
      'A 16 ft garage door leads through a mudroom. The entry porch and garden doors give the house two usable outdoor rooms.',
    palette: ['#d9d5c6', '#f3efdf', '#4d5e64'],
    heights: [10, 9.5],
    volumes: [vol([0, 2, 22, 28], 0, 1, 'depth', 6, 'brick'), vol([22, 0, 28, 42], 0, 2, 'width', 7, 'lap')],
    porches: [{ rect: [23, -6, 18, 6], finish: 'metal' }],
    doors: [
      opening('Garage', 'front', 11, 16, 'garage'),
      opening('Foyer', 'front', 26, 3.5, 'entry'),
      opening('Dining', 'back', 43, 6, 'garden'),
    ],
    levels: [
      level(
        'Ground',
        [
          room('Garage', 0, 2, 22, 21),
          room('Laundry', 0, 23, 10, 7),
          room('Mudroom', 10, 23, 12, 7),
          room('Foyer', 22, 0, 8, 12),
          room('Study', 30, 0, 20, 10),
          room('Powder', 30, 10, 7, 6),
          room('Coats', 37, 10, 8, 6),
          room('Mech / HVAC', 45, 10, 5, 6),
          room('Stair hall', 22, 12, 8, 14),
          room('Great room', 30, 16, 20, 14),
          room('Kitchen', 22, 26, 8, 16),
          room('Dining', 30, 30, 20, 12),
        ],
        'Garage|Mudroom;Mudroom|Laundry;Mudroom|Kitchen;Foyer~Stair hall;Foyer|Study;Stair hall|Powder;Great room|Coats;Coats|Mech / HVAC;Stair hall~Great room;Great room~Dining;Kitchen~Dining',
      ),
      level(
        'Upper',
        [
          room('Bedroom 2', 22, 0, 11, 12),
          room('Bedroom 3', 33, 0, 17, 12),
          room('Stair hall', 22, 12, 8, 14),
          room('Landing', 30, 12, 7, 18),
          room('Bath', 37, 12, 8, 8),
          room('Linen', 45, 12, 5, 8),
          room('Bedroom 4', 37, 20, 13, 10),
          room('Primary bedroom', 22, 30, 13, 12),
          room('Primary bath', 35, 30, 9, 12),
          room('Dressing', 44, 30, 6, 12),
          room('Closet', 22, 26, 8, 4),
        ],
        'Stair hall~Landing;Stair hall|Bedroom 2;Landing|Bedroom 3;Landing|Bath;Bath|Linen;Landing|Bedroom 4;Landing|Primary bedroom;Primary bedroom|Primary bath;Primary bath|Dressing;Stair hall|Closet',
      ),
    ],
  },
  {
    id: 'tn-alley-row-v1',
    name: 'Alley Row',
    setting: 'Rear-loaded attached',
    parking: 'rear',
    cars: 1,
    attached: true,
    description:
      'A three-level brick row house places its front door on the shared walk and its garage on the alley. Living spaces face both ends. The middle unit needs no side windows.',
    access:
      'The 9 ft rear garage door and the pedestrian entrance are on opposite ends. Side windows can be shown on an exposed end wall.',
    palette: ['#a88670', '#ded3c0', '#41574e'],
    heights: [10, 10, 9],
    volumes: [vol([0, 0, 20, 40], 0, 3, 'flat', 0, 'brick')],
    porches: [{ rect: [1, -3, 7, 3], finish: 'metal' }],
    doors: [opening('Entry', 'front', 5, 3, 'entry'), opening('Garage', 'back', 10, 9, 'garage')],
    levels: [
      level(
        'Entry',
        [
          room('Entry', 0, 0, 8, 7),
          room('Flex room', 8, 0, 12, 13),
          room('Stair hall', 0, 7, 8, 14),
          room('Shower bath', 8, 13, 7, 8),
          room('Mech / HVAC', 15, 13, 5, 8),
          room('Garage', 0, 21, 20, 19),
        ],
        'Entry~Stair hall;Entry|Flex room;Stair hall|Shower bath;Garage|Stair hall;Garage|Mech / HVAC',
      ),
      level(
        'Living',
        [
          room('Living room', 0, 0, 20, 7),
          room('Stair hall', 0, 7, 8, 14),
          room('Dining', 8, 7, 12, 14),
          room('Kitchen', 0, 21, 14, 19),
          room('Pantry', 14, 21, 6, 11),
          room('Powder', 14, 32, 6, 8),
        ],
        'Living room~Dining;Stair hall~Living room;Dining~Kitchen;Kitchen|Pantry;Kitchen|Powder',
      ),
      level(
        'Bedroom',
        [
          room('Bath', 0, 0, 8, 7),
          room('Bedroom 2', 8, 0, 12, 14),
          room('Stair hall', 0, 7, 8, 14),
          room('Landing', 8, 14, 6, 11),
          room('Laundry', 14, 14, 6, 11),
          room('Dressing', 0, 21, 8, 4),
          room('Primary bedroom', 0, 25, 20, 15),
        ],
        'Stair hall|Bath;Stair hall~Landing;Landing|Bedroom 2;Landing|Laundry;Landing|Primary bedroom;Primary bedroom|Dressing',
      ),
    ],
  },
  {
    id: 'tn-corner-porch-v1',
    name: 'Corner Porch House',
    setting: 'Corner or alley infill',
    parking: 'rear',
    cars: 1,
    description:
      'A corner porch opens to the sidewalk, while the garage addresses the rear lane. A main-floor primary suite and a smaller upper wing break up the side elevation.',
    access: 'Rear alley access is required. The front and side streets remain pedestrian faces.',
    palette: ['#9aafa8', '#f1e9d7', '#7e5344'],
    heights: [10, 9.5],
    volumes: [
      vol([0, 0, 18, 36], 0, 2, 'depth', 8, 'lap'),
      vol([18, 6, 14, 42], 0, 1, 'depth', 6, 'board'),
      vol([0, 36, 18, 12], 0, 1, 'width', 5, 'lap'),
    ],
    porches: [
      { rect: [0, -6, 18, 6], finish: 'metal' },
      { rect: [18, 0, 9, 6], finish: 'metal' },
    ],
    doors: [
      opening('Living room', 'front', 7, 3.5, 'entry'),
      opening('Garage', 'back', 25, 9, 'garage'),
      opening('Dining', 'left', 28, 3, 'garden'),
    ],
    levels: [
      level(
        'Ground',
        [
          room('Living room', 0, 0, 18, 12),
          room('Stair hall', 0, 12, 8, 14),
          room('Kitchen', 8, 12, 10, 14),
          room('Dining', 0, 26, 18, 10),
          room('Primary bedroom', 18, 6, 14, 15),
          room('Primary bath', 18, 21, 8, 7),
          room('Laundry', 26, 21, 6, 4),
          room('Mech / HVAC', 26, 25, 6, 3),
          room('Garage', 18, 28, 14, 20),
          room('Mudroom', 10, 36, 8, 12),
          room('Study', 0, 36, 10, 12),
        ],
        'Living room~Kitchen;Living room~Stair hall;Living room|Primary bedroom;Primary bedroom|Primary bath;Garage|Mech / HVAC;Laundry|Mech / HVAC;Kitchen~Dining;Dining~Mudroom;Mudroom|Garage;Dining|Study',
      ),
      level(
        'Upper',
        [
          room('Bedroom 2', 0, 0, 18, 12),
          room('Stair hall', 0, 12, 8, 14),
          room('Bath', 8, 12, 10, 8),
          room('Landing', 8, 20, 10, 6),
          room('Bedroom 3', 0, 26, 18, 10),
        ],
        'Bedroom 2|Stair hall;Stair hall~Landing;Landing|Bath;Landing|Bedroom 3',
      ),
    ],
  },
  {
    id: 'tn-garden-infill-v1',
    name: 'Walled Garden House',
    setting: 'Luxury urban infill',
    parking: 'rear',
    cars: 2,
    description:
      'A narrow street gable, a lower gallery and a detached carriage house frame a garden between the house and the alley. The primary suite faces the garden at ground level.',
    access:
      'Guests enter from the street. Two cars arrive at the carriage house from the alley, with a separate garden entrance to the main house.',
    palette: ['#c4bbab', '#efe7d7', '#5c655a'],
    heights: [11, 9.5],
    volumes: [
      vol([0, 0, 27, 36], 0, 2, 'depth', 9, 'limewash'),
      vol([0, 36, 27, 16], 0, 1, 'width', 6, 'cedar'),
      vol([2, 70, 23, 24], 0, 1, 'depth', 8, 'brick'),
    ],
    porches: [
      { rect: [0, -5, 12, 5], finish: 'metal' },
      { rect: [0, 52, 14, 6], finish: 'metal' },
    ],
    doors: [
      opening('Foyer', 'front', 5, 3.5, 'entry'),
      opening('Garage', 'back', 13.5, 16, 'garage'),
      opening('Gallery', 'back', 5, 4, 'garden'),
      opening('Garage', 'front', 6, 3, 'garden'),
    ],
    levels: [
      level(
        'Ground',
        [
          room('Foyer', 0, 0, 10, 12),
          room('Parlor', 10, 0, 17, 12),
          room('Stair hall', 0, 12, 8, 14),
          room('Dining', 8, 12, 19, 14),
          room('Powder', 8, 26, 6, 6),
          room('Mech / HVAC', 8, 32, 6, 4),
          room('Kitchen', 14, 26, 13, 10),
          room('Gallery', 0, 26, 8, 26),
          room('Primary bedroom', 8, 36, 12, 16),
          room('Primary bath', 20, 36, 7, 16),
          room('Garage', 2, 70, 23, 24),
        ],
        'Foyer~Parlor;Foyer~Stair hall;Parlor~Dining;Stair hall~Dining;Stair hall~Gallery;Gallery|Powder;Dining~Kitchen;Kitchen|Mech / HVAC;Gallery|Primary bedroom;Primary bedroom|Primary bath',
      ),
      level(
        'Upper',
        [
          room('Bedroom 2', 0, 0, 14, 12),
          room('Bedroom 3', 14, 0, 13, 12),
          room('Stair hall', 0, 12, 8, 14),
          room('Landing', 8, 12, 19, 6),
          room('Bath', 8, 18, 8, 8),
          room('Laundry', 16, 18, 5, 8),
          room('Hall', 21, 18, 6, 8),
          room('Bedroom 4', 0, 26, 16, 10),
          room('Library', 16, 26, 11, 10),
        ],
        'Stair hall~Landing;Landing|Bedroom 2;Landing|Bedroom 3;Landing|Bath;Landing|Laundry;Stair hall|Bedroom 4;Landing~Hall;Hall~Library',
      ),
    ],
  },
  {
    id: 'tn-motor-court-v1',
    name: 'Motor Court House',
    setting: 'Estate / wide lot',
    parking: 'side',
    cars: 3,
    description:
      'A two-story center hall anchors a broad, stepped house. A one-story primary wing and a side-loaded three-car garage flank the main gable. The motor court needs its own turning space.',
    access:
      'Allow a 28 ft clear maneuvering court beside the garage. The covered front porch has its own pedestrian approach.',
    palette: ['#d7cdb9', '#f2e7d2', '#635345'],
    heights: [11, 10],
    volumes: [
      vol([0, 10, 20, 32], 0, 1, 'depth', 7, 'stone'),
      vol([20, 0, 32, 46], 0, 2, 'depth', 9, 'limewash'),
      vol([52, 7, 12, 35], 0, 1, 'depth', 6, 'cedar'),
      vol([64, 5, 24, 36], 0, 1, 'width', 7, 'stone'),
    ],
    porches: [{ rect: [22, -7, 22, 7], finish: 'metal' }],
    doors: [
      opening('Foyer', 'front', 30, 4, 'entry'),
      opening('Garage', 'right', 15, 9, 'garage'),
      opening('Garage', 'right', 30, 16, 'garage'),
      opening('Great room', 'back', 38, 7, 'garden'),
    ],
    levels: [
      level(
        'Ground',
        [
          room('Primary bedroom', 0, 10, 20, 16),
          room('Primary bath', 0, 26, 10, 16),
          room('Dressing', 10, 26, 10, 16),
          room('Foyer', 20, 0, 16, 12),
          room('Library', 36, 0, 16, 12),
          room('Stair hall', 20, 12, 8, 16),
          room('Dining', 28, 12, 15, 16),
          room('Kitchen', 43, 12, 9, 16),
          room('Gallery', 20, 28, 8, 14),
          room('Great room', 28, 28, 24, 18),
          room('Powder', 20, 42, 8, 4),
          room('Mudroom', 52, 7, 12, 14),
          room('Pantry', 52, 21, 12, 5),
          room('Mech / HVAC', 52, 26, 12, 4),
          room('Laundry', 52, 30, 12, 12),
          room('Garage', 64, 5, 24, 36),
        ],
        'Foyer~Library;Foyer~Stair hall;Foyer~Dining;Dining~Kitchen;Dressing|Gallery;Primary bedroom|Primary bath;Primary bedroom|Dressing;Gallery~Great room;Gallery|Powder;Dining~Great room;Kitchen~Mudroom;Mudroom|Garage;Kitchen|Pantry;Pantry|Mech / HVAC;Great room|Laundry',
      ),
      level(
        'Upper',
        [
          room('Bedroom 2', 20, 0, 16, 12),
          room('Bedroom 3', 36, 0, 16, 12),
          room('Stair hall', 20, 12, 8, 16),
          room('Front landing', 28, 12, 24, 5),
          room('Upper hall', 28, 17, 6, 11),
          room('Bath', 34, 17, 9, 11),
          room('Shower bath', 43, 17, 9, 11),
          room('Rear landing', 20, 28, 32, 5),
          room('Bedroom 4', 20, 33, 16, 13),
          room('Loft', 36, 33, 16, 13),
        ],
        'Bedroom 2|Front landing;Bedroom 3|Front landing;Stair hall~Rear landing;Front landing~Upper hall;Front landing|Bath;Upper hall~Rear landing;Shower bath|Rear landing;Rear landing|Bedroom 4;Rear landing~Loft',
      ),
    ],
  },
  ...MIDDLE_TENNESSEE_DESIGNS,
  ...WEST_HEIMAN_DESIGNS,
];

export const findHome = (id: unknown) => HOME_DESIGNS.find((h) => h.id === id);
