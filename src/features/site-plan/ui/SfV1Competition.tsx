/**
 * The pattern competition on the by-right panel (2026-11-04): the grid, the
 * neighborhood and the loop grammar drawn side by side by
 * fn_sf_v1_candidates. `best` (fewest failed tests, then most lots) and
 * `structured` (the neighborhood plan — the owner's planning principles) can
 * both be put on the sheet; the sentence under the table is the price of the
 * structure, and the owner decides. Rows are named for the pattern each plan
 * DREW; a grid or neighborhood request that fell back says so.
 */
import { useState } from 'react';
import type { SfV1Competition, SfV1CompetitionRow } from '../api/sfV1Plan';
import { codeFails, qualityFlags } from '../api/sfV1Plan';

export interface SfV1CompetitionState {
  /** 'idle' = not run yet: under the fill scenario each of the three runs is the heavy one, so it waits to be asked */
  state: 'idle' | 'loading' | 'done' | 'error';
  data: SfV1Competition | null;
  error: string | null;
}

const fmtFt = (v: number | null) => (v == null ? '—' : `${Math.round(v).toLocaleString()} ft`);
const fmtNum = (v: number | null, d = 1) => (v == null ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString());

function Badges({ row }: { row: SfV1CompetitionRow }) {
  return (
    <>
      {row.isBest && (
        <span data-testid={`sfv1-cand-best-${row.requested}`} title="fewest failed tests, then the most lots"
          className="ml-1 rounded bg-emerald-100 px-1 text-[9px] font-semibold uppercase text-emerald-800">best</span>
      )}
      {row.isStructured && (
        <span data-testid={`sfv1-cand-structured-${row.requested}`} title="the neighborhood plan: the owner's planning principles"
          className="ml-1 rounded bg-indigo-100 px-1 text-[9px] font-semibold uppercase text-indigo-800">structured</span>
      )}
      {row.isTopScore && !row.isBest && (
        <span title="highest scorecard total" className="ml-1 rounded bg-slate-100 px-1 text-[9px] font-semibold uppercase text-slate-700">top score</span>
      )}
    </>
  );
}

export function SfV1CompetitionBlock({
  competition, shownRequested, onView, onRetry, busy, title,
}: {
  competition: SfV1CompetitionState;
  /** the grammar whose plan is on the sheet ('loop' = the default by-right answer) */
  shownRequested: string | null;
  onView?: (requested: string) => void;
  onRetry?: () => void;
  busy?: boolean;
  /** the heading (the layout choice on multifamily land names the block for what it holds) */
  title?: string;
}) {
  const [showScores, setShowScores] = useState(false);
  const data = competition.data;
  return (
    <div
      data-testid="sfv1-competition"
      data-status={competition.state}
      data-best={data?.bestRequested ?? ''}
      data-forgone={data?.forgone ?? ''}
      className="mt-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900">{title ?? 'Patterns · best and structured'}</h4>
        {data?.ms != null && <span className="text-[10px] text-indigo-900/60">{(data.ms / 1000).toFixed(1)} s</span>}
      </div>

      {competition.state === 'idle' && (
        <p data-testid="sfv1-competition-idle" className="mt-1 text-[11px] leading-snug text-indigo-900/80">
          Not run under the fill scenario: each of the three plans is the heavy one here and may not finish inside the 20 s the server allows the app.{' '}
          {onRetry && (
            <button type="button" data-testid="sfv1-competition-run" onClick={onRetry} disabled={busy} className="font-semibold underline disabled:opacity-60">
              Run it anyway
            </button>
          )}
        </p>
      )}

      {competition.state === 'loading' && (
        <p data-testid="sfv1-competition-loading" className="mt-1 text-[11px] italic text-indigo-900/80">
          Drawing the grid, the neighborhood and the loop grammar…
        </p>
      )}

      {competition.state === 'error' && (
        <p data-testid="sfv1-competition-error" className="mt-1 text-[11px] leading-snug text-amber-800">
          Competition unavailable — {competition.error ?? 'no answer'}.{' '}
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={busy} className="font-semibold underline disabled:opacity-60">Try again</button>
          )}
        </p>
      )}

      {competition.state === 'done' && data && (
        <>
          {data.verdict && !data.allZero && (
            // the engine's verdict on its best plan, verbatim (third audit, 2026-11-04)
            <p data-testid="sfv1-competition-verdict" data-buildable={data.bestBuildable == null ? 'unknown' : String(data.bestBuildable)}
              className={'mt-1 rounded px-1.5 py-1 text-[11px] font-medium leading-snug ' + (data.bestBuildable ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800')}>
              Engine verdict: {data.verdict}
              {data.bestCodeFails.length > 0 ? ` (${data.bestCodeFails.join(', ')})` : ''}
            </p>
          )}
          {data.homesAllowedByDensity != null && (
            <p data-testid="sfv1-competition-density" className="mt-0.5 text-[10px] text-slate-600">
              The district's density allows {data.homesAllowedByDensity.toLocaleString()} homes on this parcel{data.attachedPermitted ? '; attached homes are permitted' : ''}.
            </p>
          )}
          {data.allZero || data.rows.length === 0 ? null : (
            // One row per pattern, two lines: the left rail is ~300 px wide and
            // seven columns collided there (4701 Bowfield Dr, 2026-11-04).
            <ul data-testid="sfv1-competition-table" className="mt-1 space-y-1">
              {data.rows.map(row => {
                const onSheet = shownRequested === row.requested;
                return (
                  <li key={row.requested} data-testid={`sfv1-cand-${row.requested}`} data-pattern={row.pattern ?? ''} data-lots={row.lots}
                    className={'rounded border px-1.5 py-1 text-[10.5px] leading-snug ' + (onSheet ? 'border-sky-300 bg-white' : 'border-indigo-100 bg-white/60')}>
                    <div className="flex flex-wrap items-baseline gap-x-1">
                      <span className={onSheet ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}>{row.label}</span>
                      <Badges row={row} />
                      <span className="ml-auto font-semibold text-slate-900">
                        {row.product === 'attached' ? `${row.lots} home${row.lots === 1 ? '' : 's'}` : `${row.lots} lot${row.lots === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    {row.fellBack && <div className="text-[9.5px] italic text-amber-700">fell back from the {row.requested} grammar</div>}
                    {row.error && <div className="text-[9.5px] text-red-700">{row.error}</div>}
                    {row.status === 'done' && (
                      <div className="text-[10px] text-slate-600">
                        {[
                          row.streetFt != null ? `${fmtFt(row.streetFt)} of street` : null,
                          row.lotsPer100Ft != null ? `${fmtNum(row.lotsPer100Ft, 2)} lots / 100 ft` : null,
                          row.openPct != null ? `${fmtNum(row.openPct)}% open` : null,
                          row.score != null ? `score ${fmtNum(row.score)}` : null,
                        ].filter(Boolean).join(' · ')}
                        {' · '}
                        {codeFails(row.fails).length === 0 ? (
                          <span className="text-emerald-700">no code fails</span>
                        ) : (
                          <span className="text-red-700" title="code tests: dead end, access, block, grade, flood, pond, driveways">fails {codeFails(row.fails).join(', ')}</span>
                        )}
                        {qualityFlags(row.fails).length > 0 && (
                          <span className="text-amber-700" title="quality flags: shown, not ranked on"> · flags {qualityFlags(row.fails).join(', ')}</span>
                        )}
                      </div>
                    )}
                    <div className="mt-0.5">
                      {onSheet ? (
                        <span data-testid={`sfv1-cand-onsheet-${row.requested}`} className="text-[9.5px] font-medium text-sky-800">on the sheet</span>
                      ) : row.product === 'attached' && row.engine === 'v3' && row.status === 'done' && row.lots > 0 && onView ? (
                        // the v3 townhome engine's plan is drawn here (fn_generate_th_site_plan_v3_app)
                        <button type="button" data-testid={`sfv1-cand-view-${row.requested}`} disabled={busy} onClick={() => onView(row.requested)}
                          className="text-[9.5px] font-semibold text-indigo-800 underline hover:text-indigo-950 disabled:opacity-60">
                          View this plan
                        </button>
                      ) : row.product === 'attached' ? (
                        // the townhome candidate's plan carries metrics only; its drawing is its own engine's
                        <span data-testid={`sfv1-cand-engine-${row.requested}`} className="text-[9.5px] text-slate-500">
                          drawn by the townhome engine{row.fullPlanCall ? ` (${row.fullPlanCall})` : ''}, not on this sheet
                        </span>
                      ) : row.status === 'done' && (row.lots > 0 || row.requested === 'loop') && onView ? (
                        <button type="button" data-testid={`sfv1-cand-view-${row.requested}`} disabled={busy} onClick={() => onView(row.requested)}
                          className="text-[9.5px] font-semibold text-indigo-800 underline hover:text-indigo-950 disabled:opacity-60">
                          {row.lots > 0 ? 'View this plan' : 'Show the default answer'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p data-testid="sfv1-competition-sentence" className="mt-1 text-[11px] leading-snug text-indigo-950">{data.sentence}</p>
          {data.arithmetic != null && !data.allZero && (
            <p className="text-[10px] text-slate-500">A 62% net-to-gross estimate would say {data.arithmetic} lots.</p>
          )}
          {data.rows.some(r => r.criteria.length > 0) && !data.allZero && (
            <div className="mt-1">
              <button type="button" data-testid="sfv1-competition-scores-toggle" onClick={() => setShowScores(v => !v)}
                className="text-[10px] text-slate-500 underline decoration-dotted hover:text-slate-700">
                {showScores ? 'hide the scorecard' : 'scorecard'}
              </button>
              {showScores && (
                <table data-testid="sfv1-competition-scores" className="mt-1 w-full text-[10px] text-slate-700">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="font-medium">Criterion</th>
                      {data.rows.map(r => <th key={r.requested} className="font-medium">{r.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(new Set(data.rows.flatMap(r => r.criteria.map(c => c.name)))).map(name => (
                      <tr key={name}>
                        <td className="pr-1">{name}</td>
                        {data.rows.map(r => <td key={r.requested}>{fmtNum(r.criteria.find(c => c.name === name)?.score ?? null)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
