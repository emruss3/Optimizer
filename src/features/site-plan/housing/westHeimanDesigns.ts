import type { HomeDesign, Level, Rect, Room, SideWindow, Volume } from './originalDesigns';

// Schematic room zones use the Revision 14 plans A2.15/A2.45/A2.55, not permit drawings.
export const WEST_HEIMAN_IDS = [
  'tn-west-heiman-b2-study-v1', 'tn-west-heiman-e2-study-v1', 'tn-west-heiman-f2-study-v1',
] as const;
const feet = (ft: number, inches: number) => ft + inches / 12;
const width = feet(19, 9.25);
const r = (name: string, x: number, y: number, w: number, d: number): Room => ({ name, rect: [x, y, w, d] });
const level = (name: string, rooms: Room[], links: string): Level => ({ name, rooms, links: links.split(';') });
const volume = (rect: Rect, first: number, finish: Volume['finish'], ridge: Volume['ridge'] = 'flat', pitch = 0): Volume =>
  ({ rect, first, count: 1, finish, ridge, pitch });

const b2Windows: SideWindow[] = [
  { level: 0, face: 'right', at: 3.3, width: 3, sill: 2, head: 7 },
  { level: 1, face: 'right', at: 5.4, width: 3, sill: 2.5, head: 8.5 },
  { level: 1, face: 'right', at: 24.8, width: 3, sill: 2.5, head: 8.5 },
  { level: 1, face: 'left', at: 17.7, width: 2.5, sill: 3.5, head: 8.5 },
  { level: 2, face: 'right', at: 23.9, width: 3, sill: 2.5, head: 7 },
  { level: 2, face: 'left', at: 10.2, width: 3, sill: 2, head: 7 },
  { level: 2, face: 'left', at: 19.2, width: 3, sill: 2, head: 7 },
  { level: 2, face: 'left', at: 31.6, width: 2.5, sill: 3.5, head: 7 },
  { level: 2, face: 'left', at: 34.1, width: 2.5, sill: 3.5, head: 7 },
];
const e2Windows: SideWindow[] = [
  { level: 1, face: 'right', at: 8, width: 3, sill: 2.5, head: 8.5 },
  { level: 1, face: 'right', at: 22.5, width: 3, sill: 2.5, head: 8.5 },
  { level: 1, face: 'right', at: 34, width: 2.5, sill: 3.5, head: 8.5 },
  { level: 2, face: 'right', at: 14.8, width: 4, sill: 5, head: 7 },
  { level: 2, face: 'right', at: 18.8, width: 4, sill: 5, head: 7 },
  { level: 1, face: 'left', at: 18.8, width: 2.5, sill: 2.5, head: 8.5 },
  { level: 1, face: 'left', at: 34.8, width: 3, sill: 3, head: 8 },
  { level: 2, face: 'left', at: 18.8, width: 2, sill: 1.75, head: 6.25 },
  { level: 2, face: 'left', at: 34.8, width: 2, sill: 4, head: 7 },
];

function westHeiman(variant: 'B2' | 'E2' | 'F2'): HomeDesign {
  const w = width, e = variant === 'E2', f = variant === 'F2';
  const depth = f ? feet(39, 9.25) : feet(39, 5.375);
  const middleDepth = e ? depth + 2 : depth + 5;
  const upperDepth = e || f ? feet(44, 9.25) : depth + 5;
  const middleFront = depth - middleDepth, upperFront = depth - upperDepth;
  const garageFront = depth - feet(20, 10.375);
  const stairX = w - 4.5;
  const entryRooms = [
    r('Bedroom 3', 0, 0, 10.5, 9), r('Closet 3', 0, 9, 5, 4),
    r('Bedroom hall', 5, 9, 5.5, 4), r('Bath 3', 0, 13, 10.5, garageFront - 13),
    r('Entry', 10.5, 0, stairX - 10.5, garageFront), r('Stair hall', stairX, 0, 4.5, garageFront),
    r('Garage', 0, garageFront, w, depth - garageFront),
  ];
  const entry = level('Entry and garage', e
    ? entryRooms.map(room => { const [x, y, a, d] = room.rect; return r(room.name, w - x - a, y, a, d); })
    : entryRooms,
  'Entry~Stair hall;Entry|Garage;Entry~Bedroom hall;Bedroom hall|Bedroom 3;Bedroom hall|Closet 3;Bedroom hall|Bath 3');
  const kitchenRear = depth - 17;
  const living = e ? level('Living', [
    r('Living room', 6, middleFront, w - 6, 14 - middleFront),
    r('Living alcove', 0, middleFront, 6, 3.4 - middleFront),
    r('Stair hall', 0, 3.4, 6, 18.6), r('Dining', 6, 14, w - 6, 11),
    r('Powder', 0, 22, 6, 6), r('Furnace', 0, 28, 6, 5),
    r('Pantry', 0, 33, 6, depth - 33), r('Kitchen', 6, 25, w - 6, depth - 25),
  ], 'Living room~Living alcove;Living room~Stair hall;Living room~Dining;Dining~Kitchen;Dining|Powder;Kitchen|Furnace;Kitchen|Pantry')
  : f ? level('Living and bedroom', [
    r('Living room', 0, middleFront, w, 12 - middleFront),
    r('Kitchen', 0, 12, 12.2, 15), r('Hallway', 12.2, 12, stairX - 12.2, 9),
    r('Stair hall', stairX, 12, 4.5, 9), r('Upper landing', 12.2, 21, w - 12.2, 3.5),
    r('Mechanical chase', 15.6, 24.5, w - 15.6, 3.5), r('Landing', 12.2, 24.5, 3.4, 7),
    r('Bath 2', 15.6, 28, w - 15.6, 6.2), r('Bedroom 2', 0, 27, 12.2, depth - 27),
    r('Bedroom passage', 12.2, 31.5, 3.4, depth - 31.5), r('Closet 2', 15.6, 34.2, w - 15.6, depth - 34.2),
  ], 'Living room~Kitchen;Living room~Stair hall;Stair hall~Upper landing;Hallway~Kitchen;Hallway~Upper landing;Upper landing~Landing;Landing|Mechanical chase;Landing|Bath 2;Landing|Bedroom 2;Bedroom 2~Bedroom passage;Bedroom passage|Closet 2')
  : level('Living and bedroom', [
    r('Living room', 0, middleFront, w, 12 - middleFront),
    r('Kitchen', 0, 12, 12.1, kitchenRear - 12), r('Hallway', 12.1, 12, stairX - 12.1, kitchenRear - 12),
    r('Stair hall', stairX, 12, 4.5, kitchenRear - 12),
    r('Bath 2', 0, kitchenRear, 10.2, 6.3), r('Landing', 10.2, kitchenRear, w - 10.2, 6.3),
    r('Bedroom 2', 0, kitchenRear + 6.3, 13.2, depth - kitchenRear - 6.3),
    r('Furnace', 13.2, kitchenRear + 6.3, w - 13.2, 4.1),
    r('Closet 2', 13.2, kitchenRear + 10.4, w - 13.2, depth - kitchenRear - 10.4),
  ], 'Living room~Kitchen;Living room~Stair hall;Living room~Hallway;Stair hall~Landing;Landing~Hallway;Landing|Bath 2;Landing|Bedroom 2;Landing|Furnace;Bedroom 2|Closet 2');
  const balconyRear = 7.15, bathFront = balconyRear + 14.5;
  const upper = e ? level('Bedrooms', [
    r('Bedroom 1', 6.4, upperFront, w - 6.4, 10 - upperFront),
    r('Closet 1', 0, upperFront, 6.4, 10 - upperFront), r('Bath 1', 11.3, 10, w - 11.3, 15),
    r('Hallway', 6.4, 10, 4.9, 15), r('Stair hall', 0, 10, 6.4, 14.5),
    r('Laundry', 0, 24.5, 6.4, 5.2), r('Upper landing', 6.4, 25, w - 6.4, 4.7),
    r('Closet 2', 0, 29.7, 6.4, 3.6), r('Bath 2', 0, 33.3, 6.4, depth - 33.3),
    r('Bedroom 2', 6.4, 29.7, w - 6.4, depth - 29.7),
  ], 'Stair hall~Hallway;Hallway|Bedroom 1;Bedroom 1|Closet 1;Hallway|Bath 1;Hallway~Upper landing;Upper landing|Laundry;Upper landing|Bedroom 2;Bedroom 2|Bath 2;Bedroom 2|Closet 2')
  : f ? level('Primary and study', [
    r('Study', 0, upperFront, 11.4, 8.5 - upperFront), r('Entry to study', 11.4, upperFront, w - 11.4, 8.5 - upperFront),
    r('Furnace', 0, 8.5, 4.8, 6.3), r('Laundry', 4.8, 8.5, 6.6, 6.3),
    r('Hallway', 11.4, 8.5, stairX - 11.4, 13), r('Stair hall', stairX, 8.5, 4.5, 13),
    r('Bath 1', 0, 14.8, 11.4, 13.2), r('Upper landing', 11.4, 21.5, w - 11.4, 5),
    r('Suite passage', 11.4, 26.5, w - 11.4, 1.5),
    r('Closet 1', 0, 28, 7.4, depth - 28), r('Bedroom 1', 7.4, 28, w - 7.4, depth - 28),
  ], 'Stair hall~Upper landing;Upper landing~Hallway;Hallway|Laundry;Hallway~Entry to study;Entry to study~Study;Study|Furnace;Upper landing~Suite passage;Suite passage|Bedroom 1;Bedroom 1|Closet 1;Bedroom 1|Bath 1')
  : level('Primary suite', [
    r('Covered balcony', 0, upperFront, w, balconyRear - upperFront),
    r('Bedroom 1', 0, balconyRear, stairX, 14.5), r('Stair hall', stairX, balconyRear, 4.5, 14.5),
    r('Bath 1', 0, bathFront, 12.15, depth - bathFront),
    r('Upper landing', 12.15, bathFront, w - 12.15, 4.7),
    r('Laundry', 12.15, bathFront + 4.7, w - 12.15, 5.7),
    r('Closet 1', 12.15, bathFront + 10.4, w - 12.15, depth - bathFront - 10.4),
  ], 'Stair hall~Upper landing;Upper landing|Laundry;Upper landing|Bedroom 1;Bedroom 1|Bath 1;Bath 1|Closet 1;Bedroom 1|Covered balcony');

  const sheet = e ? 'A2.45/A2.47' : f ? 'A2.55/A2.57' : 'A2.15/A2.17';
  return {
    id: WEST_HEIMAN_IDS[e ? 1 : f ? 2 : 0], name: 'West Heiman ' + variant,
    setting: 'Narrow detached rear-load',
    description: e ? 'Dedicated living floor with the stair on the left and both primary and secondary bedrooms upstairs.'
      : f ? 'Three bedrooms and a front upper study, with a separate roof-access bulkhead.'
        : 'Three bedrooms on three levels, with a recessed covered deck off the primary suite.',
    access: 'A 16 ft rear garage opening serves the mapped alley. The front door has a separate pedestrian approach.',
    palette: e ? ['#b4b5a9', '#ede8dc', '#6d5a49'] : f ? ['#a5aca8', '#efebe2', '#63544a'] : ['#817e70', '#e9e3d6', '#55473a'],
    levels: [entry, living, upper],
    heights: [feet(9, 8), f ? feet(10, 8) : feet(11, 2), feet(8, 1)],
    volumes: [
      volume([0, 0, w, depth], 0, 'brick'),
      volume([0, middleFront, w, middleDepth], 1, 'lap'),
      { ...volume([0, upperFront, w, upperDepth], 2, 'lap', f ? 'flat' : 'depth', f ? 0 : 4), ...(e ? { rearHipRunFt: 11.1 } : {}) },
    ],
    doors: [
      { room: 'Entry', face: 'front', at: e ? 6.75 : w - 6.75, width: 3, kind: 'entry' },
      { room: 'Garage', face: 'back', at: w / 2, width: 16, kind: 'garage' },
    ],
    porches: [], parking: 'rear', cars: 2,
    rearLoadPrecedent: { source: 'The Bradley Projects · West Heiman · ' + sheet + ' · Revision 14 (2026-09-22)' },
    ...(e ? {
      sideWindows: e2Windows, garageDoor: 'solid-sectional' as const, garageOpeningHeightFt: 7,
      // A2.47 rear elevation: (2) 3050 windows at Level 3, none at Level 2.
      // Their stations and sills are approximate sheet reads, not survey coordinates.
      rearWindows: [
        { level: 2, at: 3.66, width: 3, sill: 1.39, head: 6.39 },
        { level: 2, at: 10.15, width: 3, sill: 1.39, head: 6.39 },
      ],
    } : {}),
    ...(f ? { roofBulkhead: { rect: [w - 5.75, 6, 5, 14], heightFt: 7 } as NonNullable<HomeDesign['roofBulkhead']> } : {}),
    ...(variant === 'B2' ? {
      sideWindows: b2Windows,
      balconyScreen: { level: 2, width: 11.65, openingAt: 7.2, openingWidth: 5 },
    } : {}),
  };
}

export const WEST_HEIMAN_DESIGNS = [westHeiman('B2'), westHeiman('E2'), westHeiman('F2')];
