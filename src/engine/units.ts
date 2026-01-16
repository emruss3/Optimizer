export const METERS_PER_FOOT = 0.3048;
export const FEET_PER_METER = 3.28084;

export const feetToMeters = (feet: number): number => feet * METERS_PER_FOOT;
export const metersToFeet = (meters: number): number => meters * FEET_PER_METER;
