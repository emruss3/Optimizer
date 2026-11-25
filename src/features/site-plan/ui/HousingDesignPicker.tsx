/**
 * Short housing design picker for the Delk cottage slice.
 * Shows plan identity, heated area, stories, beds/baths, parking, source, fit reason.
 */
import type { DesignFitResult, HousingDesignRecord } from '../housing/types';

function bathsLabel(baths: number | null): string {
  return baths == null ? 'baths unknown' : `${baths} ba`;
}

function parkingLabel(p: HousingDesignRecord['parking']): string {
  switch (p) {
    case 'attached-garage': return 'attached garage';
    case 'detached-garage': return 'detached garage';
    case 'pad': return 'parking pad (no garage)';
    case 'street': return 'street parking';
    case 'alley': return 'alley parking';
    case 'none': return 'no on-lot parking';
    default: return 'parking unknown';
  }
}

export function HousingDesignPicker({
  parcelId,
  designs,
  selectedId,
  fits,
  onSelect,
}: {
  parcelId: string;
  designs: HousingDesignRecord[];
  selectedId: string | null;
  fits: DesignFitResult[] | null;
  onSelect: (designId: string) => void;
}) {
  if (!designs.length) return null;
  const placed = fits?.filter(f => f.status === 'placed').length ?? null;
  const unplaced = fits?.filter(f => f.status !== 'placed') ?? [];

  return (
    <section
      data-testid="housing-design-picker"
      data-parcel={parcelId}
      className="mt-3 rounded border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Buildable stock plans</h3>
        {placed != null && (
          <span data-testid="housing-fit-summary" className="text-slate-500">
            {placed} placed{unplaced.length ? ` · ${unplaced.length} open` : ''}
          </span>
        )}
      </header>
      <ul className="mt-2 space-y-2">
        {designs.map(d => {
          const selected = selectedId === d.id;
          return (
            <li key={d.id}>
              <button
                type="button"
                data-testid={`housing-design-${d.planNumber}`}
                data-selected={selected ? 'true' : 'false'}
                onClick={() => onSelect(d.id)}
                className={
                  'w-full rounded border px-2.5 py-2 text-left transition ' +
                  (selected
                    ? 'border-slate-700 bg-white shadow-sm'
                    : 'border-slate-200 bg-white/70 hover:border-slate-400')
                }
              >
                <div className="font-medium text-slate-900">{d.name}</div>
                <div className="mt-0.5 text-slate-600">
                  {d.heatedSf > 0 ? `${d.heatedSf.toLocaleString()} sf heated` : 'area unknown'}
                  {' · '}
                  {d.stories} stor{d.stories === 1 ? 'y' : 'ies'}
                  {' · '}
                  {d.beds} bed · {bathsLabel(d.baths)}
                </div>
                <div className="mt-0.5 text-slate-600">{parkingLabel(d.parking)}</div>
                <div className="mt-1 text-[11px] leading-snug text-slate-500">{d.source.citation}</div>
                {selected && fits && fits[0] && (
                  <div data-testid="housing-fit-reason" className="mt-1.5 text-[11px] leading-snug text-slate-600">
                    {fits.filter(f => f.status === 'placed').slice(0, 1).map(f => f.reason).join('') || fits[0].reason}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {unplaced.length > 0 && selectedId && (
        <ul data-testid="housing-unplaced" className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-[11px] text-amber-800">
          {unplaced.map((f, i) => (
            <li key={`${f.reason}-${i}`}>Lot decision: {f.reason}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
