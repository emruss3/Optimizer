// One counter for "which plan request is the latest".
//
// A plan request that answers late must not replace a plan the reviewer chose
// after it was sent (production audit 2026-11-23: a delayed result from one
// scheme can land on another). Each request takes a ticket when it starts. When
// its answer arrives it asks whether its ticket is still the latest, for the
// same parcel. If not, the answer is dropped and the sheet is left alone.
export interface RequestGeneration {
  /** Start a request for a parcel: returns its ticket and makes every earlier ticket stale. */
  begin(parcel: string | number | null): number;
  /** True while no later request has begun and the parcel has not changed. */
  isCurrent(ticket: number, parcel: string | number | null): boolean;
  /** Make every outstanding ticket stale without starting a request (the parcel changed). */
  invalidate(): void;
}

export function createRequestGeneration(): RequestGeneration {
  let latest = 0;
  let owner: string | null = null;
  const key = (p: string | number | null) => (p == null ? null : String(p));
  return {
    begin(parcel) { owner = key(parcel); return ++latest; },
    isCurrent(ticket, parcel) { return ticket === latest && key(parcel) === owner; },
    invalidate() { latest += 1; owner = null; },
  };
}
