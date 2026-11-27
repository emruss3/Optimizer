import type { HomeDesign, Level, Room } from './originalDesigns';

const r = (name: string, x: number, y: number, w: number, d: number): Room => ({ name, rect: [x, y, w, d] });
const level = (name: string, rooms: Room[], links: string): Level => ({ name, rooms, links: links.split(';') });

export const MIDDLE_TENNESSEE_IDS = [
  'tn-lockeland-cottage-v1', 'tn-waverly-lane-v1', 'tn-harpeth-ranch-v1',
] as const;

/** Room dimensions and adjacency are recovered from the original Home Designs 02 plan exports. */
export const MIDDLE_TENNESSEE_DESIGNS: HomeDesign[] = [
  {
    id: MIDDLE_TENNESSEE_IDS[0], name: 'Lockeland Cottage', setting: 'Compact infill · one surface space',
    description: 'Two bedrooms off an independent hall, with a full-width living and dining room, a hall bath and separate laundry/HVAC.',
    access: 'One 9 × 18 ft surface space. The front porch has its own walk and the kitchen has a side service door.',
    parking: 'pad', cars: 1, heights: [9.5], palette: ['#a7aba0', '#f4eee1', '#465044'],
    volumes: [{ rect: [0, 0, 30, 30], first: 0, count: 1, ridge: 'width', pitch: 6, finish: 'lap' }],
    porches: [{ rect: [3, -6, 18, 6], finish: 'metal' }],
    doors: [
      { room: 'Living / dining', face: 'front', at: 9, width: 3, kind: 'entry' },
      { room: 'Kitchen', face: 'left', at: 12.6, width: 3, kind: 'garden' },
    ],
    levels: [level('Ground', [
      r('Living / dining', 0, 0, 30, 10), r('Kitchen', 0, 10, 13, 9), r('Hall', 13, 10, 4, 15),
      r('Bath', 17, 10, 6.5, 9), r('Laundry / HVAC', 23.5, 10, 6.5, 9),
      r('Bedroom 2', 17, 19, 13, 11), r('Primary bedroom', 0, 19, 13, 11), r('Dressing', 13, 25, 4, 5),
    ], 'Living / dining~Kitchen;Living / dining~Hall;Living / dining|Laundry / HVAC;Kitchen~Hall;Hall|Bath;Hall|Bedroom 2;Hall|Primary bedroom;Primary bedroom|Dressing')],
  },
  {
    id: MIDDLE_TENNESSEE_IDS[1], name: 'Waverly Lane House', setting: 'Narrow detached · rear alley garage',
    description: 'A ground-level guest suite and utility room below the living floor, with an upstairs primary suite and a separate front stoop.',
    access: 'The 9 ft garage opening faces the mapped rear alley. The front walk reaches the foyer independently.',
    parking: 'rear', cars: 1, heights: [10, 9.5], palette: ['#aeb3a4', '#f5eee2', '#4b4842'],
    rearLoadPrecedent: { source: 'Parcel Proforma · Middle Tennessee Residential Studies · Home Designs 02' },
    volumes: [
      { rect: [0, 0, 22, 44], first: 0, count: 1, ridge: 'flat', pitch: 0, finish: 'brick' },
      { rect: [0, 0, 22, 44], first: 1, count: 1, ridge: 'depth', pitch: 6.5, finish: 'lap' },
    ],
    porches: [{ rect: [0.5, -5, 7, 5], finish: 'metal' }],
    doors: [
      { room: 'Foyer', face: 'front', at: 4, width: 3, kind: 'entry' },
      { room: 'Garage', face: 'back', at: 11, width: 9, kind: 'garage' },
    ],
    levels: [
      level('Entry', [
        r('Foyer', 0, 0, 9, 8), r('Guest room', 9, 0, 13, 14), r('Stair hall', 0, 8, 5, 16),
        r('Mud hall', 5, 8, 4, 16), r('Bath', 9, 14, 13, 5), r('Laundry / HVAC', 9, 19, 13, 5),
        r('Garage', 0, 24, 22, 20),
      ], 'Foyer~Stair hall;Foyer~Mud hall;Foyer|Guest room;Mud hall|Garage;Mud hall|Bath;Mud hall|Laundry / HVAC'),
      level('Living', [
        r('Living room', 0, 0, 22, 8), r('Stair hall', 0, 8, 5, 16), r('Dining', 5, 8, 17, 8),
        r('Kitchen', 5, 16, 17, 8), r('Upper landing', 0, 24, 22, 4),
        r('Primary bedroom', 0, 28, 14, 16), r('Primary bath', 14, 28, 8, 8), r('Dressing', 14, 36, 8, 8),
      ], 'Living room~Dining;Stair hall~Upper landing;Dining~Kitchen;Kitchen~Upper landing;Upper landing|Primary bedroom;Primary bedroom|Primary bath;Primary bedroom|Dressing'),
    ],
  },
  {
    id: MIDDLE_TENNESSEE_IDS[2], name: 'Harpeth Courtyard Ranch', setting: 'Suburban · front garage and separate porch',
    description: 'Three bedrooms on one floor, with a private primary wing, a mudroom connection from the garage and a rear kitchen and family room.',
    access: 'A 16 ft double garage door faces the drive. The front porch has its own walk and the kitchen has a rear patio door.',
    parking: 'front', cars: 2, heights: [10.5], palette: ['#dfd4c0', '#f5ecdb', '#736455'],
    volumes: [{ rect: [0, 0, 46, 48], first: 0, count: 1, ridge: 'depth', pitch: 6, finish: 'lap' }],
    porches: [{ rect: [11, -6, 12, 6], finish: 'metal' }],
    doors: [
      { room: 'Foyer', face: 'front', at: 16, width: 3, kind: 'entry' },
      { room: 'Garage', face: 'front', at: 34.5, width: 16, kind: 'garage' },
      { room: 'Kitchen / family', face: 'back', at: 36, width: 6, kind: 'garden' },
    ],
    levels: [level('Ground', [
      r('Bedroom 2', 0, 0, 11, 12), r('Bedroom 3', 0, 12, 11, 14), r('Foyer', 11, 0, 12, 8),
      r('Hall', 11, 8, 6, 18), r('Bath', 17, 8, 6, 8), r('Mudroom', 17, 16, 6, 10),
      r('Garage', 23, 0, 23, 24), r('Primary bedroom', 0, 26, 16, 14),
      r('Primary bath', 0, 40, 8, 8), r('Dressing', 8, 40, 8, 8),
      r('Dining nook', 16, 26, 7, 7), r('Living room', 16, 33, 7, 15),
      r('Laundry', 23, 24, 6, 7), r('Mech / HVAC', 29, 24, 6, 7), r('Pantry', 35, 24, 11, 7),
      r('Kitchen / family', 23, 31, 23, 17),
    ], 'Bedroom 2|Hall;Bedroom 3|Hall;Foyer~Hall;Hall|Primary bedroom;Hall|Bath;Hall~Mudroom;Mudroom~Dining nook;Mudroom|Garage;Primary bedroom|Primary bath;Primary bedroom|Dressing;Dining nook~Living room;Dining nook|Laundry;Living room~Kitchen / family;Mech / HVAC|Kitchen / family;Pantry|Kitchen / family')],
  },
];
