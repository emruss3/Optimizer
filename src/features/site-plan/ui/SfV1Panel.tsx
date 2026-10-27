/**
 * By-right subdivision panel (sf_v1, 2026-10-27): what the generator drew
 * from the district's own standards, graded by its own tests. The tests, the
 * fails and the notes are the honesty of the answer and are shown verbatim.
 * An override — a lot module, the floodway-only fill scenario — is a second
 * answer the user asks for here, and the result is labelled as one.
 */
import { useState } from 'react';
import type { SfV1Options, SfV1Summary, SfV1Test } from '../api/sfV1Plan';
import { FILL_BANDS, isOverride } from '../api/sfV1Plan';

function testLabel(id: string): string {
  return id.replace(/\./g, ' · ').replace(/_/g, ' ');
}

function fmtVal(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : (Math.round(v * 10) / 10).toLocaleString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fmtCy(v: unknown): string {
  return typeof v === 'number' ? `${Math.round(v).toLocaleString()} cy` : fmtVal(v);
}

function TestRow({ t }: { t: SfV1Test }) {
  const failed = t.pass === false;
  const value = t.value != null ? fmtVal(t.value) : '';
  const limit = t.limit != null ? fmtVal(t.limit) : '';
  return (
    <li
      data-testid={`sfv1-test-${t.id}`}
      data-pass={t.pass == null ? 'unknown' : String(t.pass)}
      className={'flex items-start gap-1.5 ' + (failed ? 'text-red-700' : t.pass ? 'text-slate-700' : 'text-slate-500')}
    >
      <span aria-hidden className={'mt-px shrink-0 font-bold ' + (failed ? 'text-red-600' : t.pass ? 'text-emerald-600' : 'text-slate-400')}>
        {failed ? '✗' : t.pass ? '✓' : '·'}
      </span>
      <span className="leading-snug">
        <span className="font-medium">{testLabel(t.id)}</span>
        {(value || limit) && (
          <span className="text-slate-500">
            {' '}· {value}{limit ? ` vs ${limit}` : ''}
          </span>
        )}
        {t.note ? <span className="text-slate-500"> — {t.note}</span> : null}
      </span>
    </li>
  );
}

export function SfV1Panel({
  summary, override, onOverride, busy,
}: {
  summary: SfV1Summary;
  override: SfV1Options;
  onOverride: (opt: SfV1Options) => void;
  busy?: boolean;
}) {
  const [lotW, setLotW] = useState<string>(override.lot_w_ft != null ? String(override.lot_w_ft) : '');
  const [lotD, setLotD] = useState<string>(override.lot_d_ft != null ? String(override.lot_d_ft) : '');
  const [minSf, setMinSf] = useState<string>(override.min_lot_sf != null ? String(override.min_lot_sf) : '');
  const overridden = isOverride(override);
  const fillScenario = override.flood === 'floodway';
  const ew = summary.earthwork;
  const fillByComponent = ew && ew.fill_cy && typeof ew.fill_cy === 'object' ? Object.entries(ew.fill_cy) : null;

  const applyModule = () => {
    const next: SfV1Options = { ...override };
    const w = Number(lotW); const d = Number(lotD); const s = Number(minSf);
    if (lotW && Number.isFinite(w) && w > 0) next.lot_w_ft = w; else delete next.lot_w_ft;
    if (lotD && Number.isFinite(d) && d > 0) next.lot_d_ft = d; else delete next.lot_d_ft;
    if (minSf && Number.isFinite(s) && s > 0) next.min_lot_sf = s; else delete next.min_lot_sf;
    onOverride(next);
  };

  return (
    <section
      data-testid="sfv1-panel"
      data-basis={summary.basis}
      className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">By-right subdivision</h3>
        <div className="flex flex-wrap items-center gap-1">
          <span data-testid="sfv1-lots" className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            {summary.lots} lots
          </span>
          <span
            data-testid="sfv1-basis"
            className={
              'rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
              (summary.basis === 'override' ? 'bg-amber-100 text-amber-800' : 'bg-sky-50 text-sky-700')
            }
          >
            {summary.basis === 'override' ? 'Override' : 'By right'}
          </span>
          {summary.floodHold && (
            <span data-testid="sfv1-flood-hold" className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
              flood hold: {summary.floodHold}
            </span>
          )}
        </div>
      </div>

      {summary.status === 'skipped' ? (
        <p data-testid="sfv1-skipped" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 leading-snug text-amber-800">
          Skipped — {summary.reason ?? 'no reason given'}
        </p>
      ) : (
        <>
          <p data-testid="sfv1-summary" className="mt-1 leading-snug text-slate-600">{summary.basisLine}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-slate-500">Pattern</dt>
            <dd data-testid="sfv1-pattern">
              {summary.pattern ?? '—'}
              {[
                summary.counts.rings ? `${summary.counts.rings} ring${summary.counts.rings === 1 ? '' : 's'}` : null,
                summary.counts.crossStreets ? `${summary.counts.crossStreets} cross street${summary.counts.crossStreets === 1 ? '' : 's'}` : null,
                summary.counts.culDeSacs ? `${summary.counts.culDeSacs} cul-de-sac${summary.counts.culDeSacs === 1 ? '' : 's'}` : null,
                summary.counts.connections != null ? `${summary.counts.connections} connection${summary.counts.connections === 1 ? '' : 's'}` : null,
              ].filter(Boolean).map(s => ` · ${s}`).join('')}
            </dd>
            <dt className="text-slate-500">Lot module</dt>
            <dd>
              {summary.lotWFt != null && summary.lotDFt != null ? `${summary.lotWFt} × ${summary.lotDFt} ft` : '—'}
              {summary.minLotSf != null ? ` · min ${summary.minLotSf.toLocaleString()} SF` : ''}
              {summary.avgLotSf != null ? ` · avg ${Math.round(summary.avgLotSf).toLocaleString()} SF` : ''}
            </dd>
            {Object.keys(summary.lotKinds).length > 0 && (
              <>
                <dt className="text-slate-500">Lots by kind</dt>
                <dd>{Object.entries(summary.lotKinds).map(([k, n]) => `${n} ${k}`).join(' · ')}</dd>
              </>
            )}
            <dt className="text-slate-500">Land</dt>
            <dd>
              {[
                summary.rowPct != null ? `${summary.rowPct}% ROW` : null,
                summary.lotPct != null ? `${summary.lotPct}% lots` : null,
                summary.openPct != null ? `${summary.openPct}% open` : null,
                summary.imperviousPct != null ? `${summary.imperviousPct}% impervious` : null,
              ].filter(Boolean).join(' · ') || '—'}
            </dd>
            <dt className="text-slate-500">Street</dt>
            <dd>
              {summary.streetFt != null ? `${Math.round(summary.streetFt).toLocaleString()} ft` : '—'}
              {summary.deadEnds != null ? ` · ${summary.deadEnds} dead end${summary.deadEnds === 1 ? '' : 's'}` : ''}
              {summary.deadEndMaxFt != null && summary.deadEndMaxFt > 0 ? ` (max ${Math.round(summary.deadEndMaxFt)} ft)` : ''}
            </dd>
            {summary.densityDuAc != null && (
              <>
                <dt className="text-slate-500">Density</dt>
                <dd data-testid="sfv1-density">{summary.densityDuAc} du/ac gross</dd>
              </>
            )}
            {(summary.pondSf != null || summary.lowPointFt != null) && (
              <>
                <dt className="text-slate-500">Storm</dt>
                <dd>
                  {summary.pondSf != null ? `pond ${Math.round(summary.pondSf).toLocaleString()} SF` : 'no pond'}
                  {summary.lowPointFt != null ? ` · low point ${summary.lowPointFt} ft` : ''}
                </dd>
              </>
            )}
            {((summary.floodplainBuiltOnAc ?? 0) > 0 || (summary.streetInWetlandFt ?? 0) > 0) && (
              <>
                <dt className="text-slate-500">Hazard</dt>
                <dd className="text-amber-700">
                  {[
                    (summary.floodplainBuiltOnAc ?? 0) > 0 ? `${summary.floodplainBuiltOnAc} ac built in the floodplain` : null,
                    (summary.streetInWetlandFt ?? 0) > 0 ? `${Math.round(summary.streetInWetlandFt ?? 0)} ft of street in wetland` : null,
                  ].filter(Boolean).join(' · ')}
                </dd>
              </>
            )}
            {summary.openPieces.length > 0 && (
              <>
                <dt className="text-slate-500">Open space</dt>
                <dd>{summary.openPieces.map(p => `${p.kind}${p.acres != null ? ` ${p.acres} ac` : ''}`).join(' · ')}</dd>
              </>
            )}
          </dl>
        </>
      )}

      {summary.tests.length > 0 && (
        <div className="mt-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Tests · {summary.fails.length === 0 ? 'all pass' : <span className="text-red-700">{summary.fails.length} fail</span>}
          </h4>
          <ul data-testid="sfv1-tests" className="mt-1 space-y-0.5">
            {summary.tests.map(t => <TestRow key={t.id} t={t} />)}
          </ul>
        </div>
      )}
      {summary.fails.length > 0 && (
        <p data-testid="sfv1-fails" className="mt-1 text-[11px] font-medium text-red-700">
          Fails: {summary.fails.join(', ')}
        </p>
      )}
      {summary.notes.length > 0 && (
        <ul data-testid="sfv1-notes" className="mt-2 space-y-0.5 text-[11px] text-amber-800">
          {summary.notes.map((n, i) => <li key={i}>⚠ {n}</li>)}
        </ul>
      )}

      {ew && (
        <div data-testid="sfv1-earthwork" className="mt-2 rounded-md border border-orange-200 bg-orange-50 p-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-orange-800">Earthwork</h4>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            {ew.bfe_ft != null && (<><dt className="text-orange-700">BFE</dt><dd>{fmtVal(ew.bfe_ft)} ft</dd></>)}
            {ew.pad_target_ft != null && (<><dt className="text-orange-700">Pad target</dt><dd>{fmtVal(ew.pad_target_ft)} ft</dd></>)}
            {fillByComponent && fillByComponent.length > 0 && (
              <>
                <dt className="text-orange-700">Fill</dt>
                <dd>{fillByComponent.map(([k, v]) => `${k.replace(/_/g, ' ')} ${fmtCy(v)}`).join(' · ')}</dd>
              </>
            )}
            {typeof ew.fill_cy === 'number' && (<><dt className="text-orange-700">Fill</dt><dd>{fmtCy(ew.fill_cy)}</dd></>)}
            {ew.pad_fill_ft && (
              <>
                <dt className="text-orange-700">Pad fill</dt>
                <dd>
                  {[
                    ew.pad_fill_ft.min != null ? `min ${fmtVal(ew.pad_fill_ft.min)}` : null,
                    ew.pad_fill_ft.median != null ? `median ${fmtVal(ew.pad_fill_ft.median)}` : null,
                    ew.pad_fill_ft.max != null ? `max ${fmtVal(ew.pad_fill_ft.max)}` : null,
                  ].filter(Boolean).join(' · ')} ft
                  {ew.lots_with_pad_fill_over_10ft != null ? ` · ${ew.lots_with_pad_fill_over_10ft} lots over 10 ft` : ''}
                </dd>
              </>
            )}
            {ew.cut && (
              <>
                <dt className="text-orange-700">Cut</dt>
                <dd>
                  {[
                    ew.cut.required_cy != null ? `needs ${fmtCy(ew.cut.required_cy)}` : null,
                    ew.cut.pond_cy != null ? `pond gives ${fmtCy(ew.cut.pond_cy)}` : null,
                    ew.cut.open_floodplain_ac_available != null ? `${fmtVal(ew.cut.open_floodplain_ac_available)} ac of open floodplain to cut` : null,
                    ew.cut.avg_depth_ft_needed != null ? `avg ${fmtVal(ew.cut.avg_depth_ft_needed)} ft deep` : null,
                    ew.cut.closes_on_site != null ? (ew.cut.closes_on_site ? 'closes on site' : 'does not close on site') : null,
                  ].filter(Boolean).join(' · ')}
                </dd>
              </>
            )}
            {ew.street_grade != null && (<><dt className="text-orange-700">Street grade</dt><dd>{fmtVal(ew.street_grade)}</dd></>)}
          </dl>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-orange-900">
            <span className="font-semibold">Pads by fill:</span>
            {summary.fillView ? FILL_BANDS.map(b => (
              <span key={b.key} className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-orange-900/30" style={{ backgroundColor: b.color }} />
                {b.label}
              </span>
            )) : <span className="italic">per-pad fill not in this response — pads keep their plan colour</span>}
          </div>
        </div>
      )}

      <div className="mt-2 border-t border-slate-100 pt-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Override {overridden ? <span className="text-amber-700">· active</span> : <span className="text-slate-400">· none (by right)</span>}
        </h4>
        <div className="mt-1 flex flex-wrap items-end gap-1.5">
          <label className="flex flex-col text-[10px] text-slate-500">
            lot width ft
            <input data-testid="sfv1-override-lot-w" type="number" min={20} value={lotW} onChange={e => setLotW(e.target.value)} disabled={busy}
              placeholder={summary.lotWFt != null ? String(summary.lotWFt) : ''} className="w-16 rounded border border-slate-300 px-1 py-0.5 text-[11px] text-slate-800" />
          </label>
          <label className="flex flex-col text-[10px] text-slate-500">
            lot depth ft
            <input data-testid="sfv1-override-lot-d" type="number" min={50} value={lotD} onChange={e => setLotD(e.target.value)} disabled={busy}
              placeholder={summary.lotDFt != null ? String(summary.lotDFt) : ''} className="w-16 rounded border border-slate-300 px-1 py-0.5 text-[11px] text-slate-800" />
          </label>
          <label className="flex flex-col text-[10px] text-slate-500">
            min lot SF
            <input data-testid="sfv1-override-min-sf" type="number" min={1000} step={100} value={minSf} onChange={e => setMinSf(e.target.value)} disabled={busy}
              placeholder={summary.minLotSf != null ? String(summary.minLotSf) : ''} className="w-20 rounded border border-slate-300 px-1 py-0.5 text-[11px] text-slate-800" />
          </label>
          <button
            type="button"
            data-testid="sfv1-override-apply"
            disabled={busy}
            onClick={applyModule}
            className="rounded-md border border-amber-500 bg-amber-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-60"
          >
            Re-run with this lot module
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            data-testid="sfv1-override-floodway"
            aria-pressed={fillScenario}
            disabled={busy}
            title="Fill scenario: hold out only the regulatory floodway and fill the rest of the floodplain to the pad target"
            onClick={() => {
              const next: SfV1Options = { ...override };
              if (fillScenario) delete next.flood; else next.flood = 'floodway';
              onOverride(next);
            }}
            className={
              'rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-60 ' +
              (fillScenario ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
            }
          >
            Fill scenario (floodway only)
          </button>
          <button
            type="button"
            data-testid="sfv1-override-reset"
            disabled={busy || !overridden}
            onClick={() => { setLotW(''); setLotD(''); setMinSf(''); onOverride({}); }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            By right
          </button>
        </div>
      </div>
    </section>
  );
}
