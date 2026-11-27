import type { CarSpot } from './cars';

export interface ParkedSpot extends CarSpot {
  pitch: number;
  roll: number;
}

export function vehicleWheelPoints(spot: CarSpot): Array<[number, number]> {
  const c = Math.cos(spot.heading), s = Math.sin(spot.heading);
  const axle = spot.length * 0.30, track = spot.width * 0.42;
  return [[axle, track], [axle, -track], [-axle, track], [-axle, -track]].map(([forward = 0, side = 0]) =>
    [spot.x + c * forward - s * side, spot.y + s * forward + c * side]);
}

/** Seat the axles along the same grade the model uses for the pavement. */
export function seatVehicle(spot: CarSpot, groundAt: (x: number, y: number) => number): ParkedSpot {
  const [fl = 0, fr = 0, bl = 0, br = 0] = vehicleWheelPoints(spot).map(([x, y]) => groundAt(x, y));
  // Keep the wheelbase on the nominal plane, but don't pretend a car is draped
  // on a severe break. Such a spot is handled by the vehicle placement gate.
  const slope = (delta: number, run: number) => delta / run;
  return {
    ...spot,
    z: spot.z + (fl + fr + bl + br) / 4,
    pitch: slope((fl + fr - bl - br) / 2, spot.length * 0.60),
    roll: slope((fl + bl - fr - br) / 2, spot.width * 0.84),
  };
}

/** Visual density, not the number of stalls. Use the same order across tiers. */
export function foregroundVehicles<T extends CarSpot>(spots: T[], x: number, y: number, limit = 36): T[] {
  const d = (p: T) => (p.x - x) ** 2 + (p.y - y) ** 2;
  return spots.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => d(a) - d(b) || a.seed - b.seed).slice(0, limit);
}
