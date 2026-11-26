/**
 * Stock house plans on this scheme, lot by lot (audit 2026-11-26).
 *
 * The sidebar used to list every catalogue plan as a button that stamped it
 * on all lots before checking that it fit any. It now reads the shared
 * eligibility result: how many plans fit each lot, why a lot takes none, and
 * the plans that fit somewhere with the lots they fit. Changing a home
 * happens on one lot, in the home studio, from this summary or from the
 * drawing.
 */
import type { HouseLotEligibility } from '../housing/eligibility';
import type { HomeRow, DesignTotal } from '../housing/schedule';
import { designsWithLots } from '../housing/eligibility';

export function HousingDesignPicker({
  parcelId,
  rows,
  onOpen,
  schedule,
}: {
  parcelId: string;
  rows: HouseLotEligibility[];
  onOpen: (() => void) | null;
  /** the homes on the plan, by lot and by design (housing/schedule.ts) */
  schedule?: { rows: HomeRow[]; totals: DesignTotal[] } | null;
}) {
  if (!rows.length) return null;
  const union = designsWithLots(rows);
  const lotsWithChoice = rows.filter(r => r.eligible.length > 0).length;
  return (
    <section
      data-testid="housing-design-picker"
      data-parcel={parcelId}
      className="mt-3 rounded border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Buildable stock plans</h3>
        <span data-testid="housing-fit-summary" className="text-slate-500">
          {lotsWithChoice} of {rows.length} lot{rows.length === 1 ? '' : 's'} can change
        </span>
      </header>
      <ul className="mt-2 space-y-1" data-testid="housing-lot-counts">
        {rows.map(r => (
          <li key={r.houseId} data-lot={r.lotId ?? ''} data-eligible={r.eligible.length}>
            <span className="font-medium text-slate-900">{r.lotLabel}</span>
            {': '}
            {r.eligible.length > 0
              ? `${r.eligible.length} plan${r.eligible.length === 1 ? '' : 's'} fit`
              : <span className="text-amber-800">none fit — {r.lotProblem ?? r.rejected[0]?.reason ?? 'not checked'}</span>}
          </li>
        ))}
      </ul>
      {union.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-slate-600">{union.length} plan{union.length === 1 ? '' : 's'} fit at least one lot</summary>
          <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
            {union.map(u => (
              <li key={u.design.id}>
                {u.design.planNumber} · {u.design.beds} bed · {u.design.heatedSf.toLocaleString()} sf — {u.lots.join(', ')}
              </li>
            ))}
          </ul>
        </details>
      )}
      {schedule && schedule.rows.length > 0 && (
        <div className="mt-2 border-t border-slate-200 pt-2" data-testid="homes-schedule">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Homes on this plan</h4>
          <table className="mt-1 w-full text-[11px] tabular-nums">
            <tbody>
              {schedule.totals.map(t => (
                <tr key={t.design} data-kind={t.kind}>
                  <td className="py-0.5 pr-2">{t.design}</td>
                  <td className="text-right">{t.homes}</td>
                  <td className="pl-2 text-slate-500">{t.lots.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {onOpen && lotsWithChoice > 0 && (
        <button
          type="button"
          data-testid="housing-change-home"
          onClick={onOpen}
          className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 hover:border-slate-500"
        >
          Change a home…
        </button>
      )}
    </section>
  );
}
