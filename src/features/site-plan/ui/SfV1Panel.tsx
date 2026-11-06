/**
 * By-right subdivision panel (sf_v1, 2026-10-27): what the generator drew
 * from the district's own standards, graded by its own tests. The tests, the
 * fails and the notes are the honesty of the answer and are shown verbatim.
 * An override — a lot module, the floodway-only fill scenario — is a second
 * answer the user asks for here, and the result is labelled as one.
 */
import { useState } from 'react';
import type { HoleOverlap, SfV1AutoBest, SfV1Options, SfV1Summary, SfV1Test } from '../api/sfV1Plan';
import { FILL_BANDS, autoBestSentence, isOverride, passesOverLimit, privateDriveSentence, steepGroundNote } from '../api/sfV1Plan';
import { SfV1CompetitionBlock, type SfV1CompetitionState } from './SfV1Competition';

function testLabel(id: string): string {
  return id.replace(/\./g, ' · ').replace(/_/g, ' ');
}

/** The open pieces grouped by kind with their count and acres — nineteen
 *  pieces on Martingale Dr read as one line per kind, not a wall of text. */
export function openSpaceByKind(pieces: Array<{ kind: string; acres: number | null }>): string {
  const groups = new Map<string, { n: number; acres: number; known: boolean }>();
  for (const p of pieces) {
    const g = groups.get(p.kind) ?? { n: 0, acres: 0, known: false };
    g.n += 1;
    if (p.acres != null) { g.acres += p.acres; g.known = true; }
    groups.set(p.kind, g);
  }
  return [...groups.entries()]
    .map(([kind, g]) => `${kind}${g.n > 1 ? ` × ${g.n}` : ''}${g.known ? ` · ${Math.round(g.acres * 100) / 100} ac` : ''}`)
    .join(' · ');
}

function fmtVal(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : (Math.round(v * 100) / 100).toLocaleString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fmtCy(v: unknown): string {
  return typeof v === 'number' ? `${Math.round(v).toLocaleString()} cy` : fmtVal(v);
}

const TEST_META = new Set(['id', 'pass', 'ok', 'test', 'name', 'note', 'rule']);

/** Every figure a test carries, in its own words: `value 26.8 · limit 10 · ft over limit 440`,
 *  `acres 0.23`, `area sf 6,848 · needed sf 6,013`, `pad fill ft: min 3.5, median 9.8, max 16`. */
export function testDetails(t: SfV1Test): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(t)) {
    if (TEST_META.has(k) || v == null) continue;
    const key = k.replace(/_/g, ' ');
    // the drive section switches a test off with a 1e9 limit (block.length on a shared private drive)
    if (k === 'limit' && typeof v === 'number' && v >= 1e8) { parts.push('no limit here'); continue; }
    if (typeof v === 'object' && !Array.isArray(v)) {
      const inner = Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x != null)
        .map(([kk, x]) => `${kk.replace(/_/g, ' ')} ${fmtVal(x)}`)
        .join(', ');
      parts.push(`${key}: ${inner}`);
    } else {
      parts.push(`${key} ${fmtVal(v)}`);
    }
  }
  return parts.join(' · ');
}

/** yield.vs_arithmetic is a ratio, not a verdict: "7 lots; a 62% net-to-gross estimate would say 16 (ratio 0.44)". */
function yieldSentence(t: SfV1Test): string | null {
  if (t.id !== 'yield.vs_arithmetic') return null;
  const lots = typeof t.lots === 'number' ? t.lots : null;
  const ar = typeof t.arithmetic_at_62pct === 'number' ? t.arithmetic_at_62pct : null;
  if (lots == null || ar == null) return null;
  const ratio = typeof t.ratio === 'number' ? ` (ratio ${Math.round(t.ratio * 100) / 100})` : '';
  return `${lots} lot${lots === 1 ? '' : 's'}; a 62% net-to-gross estimate would say ${ar}${ratio}`;
}

function TestRow({ t }: { t: SfV1Test }) {
  const failed = t.pass === false;
  const details = yieldSentence(t) ?? testDetails(t);
  const note = typeof t.rule === 'string' ? t.rule : typeof t.note === 'string' ? t.note : null;
  // A pass with the value over the limit (street.grade_max 12% against 10%,
  // 100 ft over): the engine allows some length over the limit. A plain tick
  // beside a number over the limit reads as a test passing on its own failure.
  const allowance = passesOverLimit(t);
  return (
    <li
      data-testid={`sfv1-test-${t.id}`}
      data-pass={t.pass == null ? 'unknown' : String(t.pass)}
      data-over-limit={allowance ? 'true' : undefined}
      className={'flex items-start gap-1.5 ' + (failed ? 'text-red-700' : allowance ? 'text-amber-800' : t.pass ? 'text-slate-700' : 'text-slate-500')}
    >
      <span aria-hidden className={'mt-px shrink-0 font-bold ' + (failed ? 'text-red-600' : allowance ? 'text-amber-600' : t.pass ? 'text-emerald-600' : 'text-slate-400')}>
        {failed ? '✗' : allowance ? '!' : t.pass ? '✓' : '·'}
      </span>
      <span className="leading-snug">
        <span className="font-medium">{testLabel(t.id)}</span>
        {details && <span className="text-slate-500"> · {details}</span>}
        {note ? <span className="text-slate-500"> — {note}</span> : null}
        {allowance && (
          <span className="text-amber-800">
            {' '}— passes over the limit{allowance.ftOver != null && allowance.ftOver > 0 ? ` for ${Math.round(allowance.ftOver).toLocaleString()} ft` : ''}, within the engine's allowance
          </span>
        )}
      </span>
    </li>
  );
}

export function SfV1Panel({
  summary, override, onOverride, busy, onDrawHouse, houseDrawn, houseError,
  competition, shownRequested, onViewCandidate, onRetryCompetition, terrain, site,
  autoBest, holeOverlap, frontageLandlocked,
}: {
  summary: SfV1Summary;
  override: SfV1Options;
  /** absent on multifamily land (the layout choice): the overrides re-run the by-right lot fit, which routes there to the townhome engine */
  onOverride?: ((opt: SfV1Options) => void) | undefined;
  busy?: boolean;
  /** 0 new lots (or skipped): the parcel is itself a lot — draw the one house it carries (the single-family seed) */
  onDrawHouse?: () => void;
  houseDrawn?: boolean;
  /** the seed was asked and could not draw the house: say why, in place, and stop offering the button */
  houseError?: string | null;
  /** the pattern competition (fn_sf_v1_candidates) */
  competition?: SfV1CompetitionState | null;
  /** the grammar whose plan is on the sheet */
  shownRequested?: string | null;
  onViewCandidate?: (requested: string) => void;
  onRetryCompetition?: () => void;
  /** the parcel's ground from its DEM, for an answer that drew nothing */
  terrain?: { meanSlopePct: number | null; maxSlopePct: number | null; fallFt: number | null } | null;
  /** the site the generator worked on: what the flood hold took out, and the mapped parcel */
  site?: { heldAcres: number | null; siteAcres: number | null; parcelAcres?: number | null } | null;
  /** the competition's best is on the sheet in place of the default answer, and why */
  autoBest?: SfV1AutoBest | null;
  /** drawn lots lying in the parcel's holes — other owners' lots inside it */
  holeOverlap?: HoleOverlap | null;
  /** the frontage layer finds no street on the parcel */
  frontageLandlocked?: boolean;
}) {
  const [lotW, setLotW] = useState<string>(override.lot_w_ft != null ? String(override.lot_w_ft) : '');
  const [lotD, setLotD] = useState<string>(override.lot_d_ft != null ? String(override.lot_d_ft) : '');
  const [minSf, setMinSf] = useState<string>(override.min_lot_sf != null ? String(override.min_lot_sf) : '');
  const overridden = isOverride(override);
  const fillScenario = override.flood === 'floodway';
  const ew = summary.earthwork;
  const fillByComponent = ew && ew.fill_cy && typeof ew.fill_cy === 'object' ? Object.entries(ew.fill_cy) : null;
  const noNewLots = summary.status === 'skipped' || summary.lots === 0;
  const landlocked = summary.status === 'skipped' && /landlocked/i.test(summary.reason ?? '');
  // "floodplain leaves no buildable piece" (0 Temple Rd, 0 River Landing Way):
  // the one skip a control can answer — the fill scenario holds out only the
  // regulatory floodway (River Landing Way: 10 lots, with the fill it costs).
  const floodSkip = summary.status === 'skipped' && /flood/i.test(summary.reason ?? '');
  // The engine's steep-ground caveat leads the panel: it measures terrain but
  // does not lay out by it yet, so the lot module is not the whole story.
  const steep = steepGroundNote(summary.notes);
  const otherNotes = steep ? summary.notes.filter(n => n !== steep) : summary.notes;
  // An answer that drew nothing on steep ground the engine did not remark on
  // (930 Morton Mill Rd: 28.5% mean slope, "no lot of 20000 sf fits"): the
  // DEM's figures, so the lot module is not blamed alone.
  const steepFromDem = !steep && noNewLots && summary.status !== 'skipped' && terrain?.meanSlopePct != null && terrain.meanSlopePct > 15;
  // Engine g13: land steeper than 25% is held out as hillside before the
  // layout (0 Dry Fork Rd: 25 of 31 ac), so "does not lay out by terrain" is
  // no longer the whole truth; streets are still not laid out by grade.
  const hillsideHeld = summary.notes.some(n => /held out as hillside/i.test(n));
  // Nothing held for flood and no BFE: the fill scenario cannot change the answer.
  const heldAcres = summary.heldAcres ?? site?.heldAcres ?? null;
  const noFloodLand = heldAcres === 0 && ew?.bfe_ft == null && !summary.hasFlood;
  // The generator does not always use the module it is given (0 Harding Pl:
  // 100 × 400 came back as 135 × 300) — say so instead of labelling the old
  // module an override.
  const askedW = override.lot_w_ft ?? null;
  const askedD = override.lot_d_ft ?? null;
  const moduleIgnored =
    askedW != null && askedD != null && summary.lotWFt != null && summary.lotDFt != null &&
    (Math.round(askedW) !== Math.round(summary.lotWFt) || Math.round(askedD) !== Math.round(summary.lotDFt));

  const applyModule = () => {
    const next: SfV1Options = { ...override };
    const w = Number(lotW); const d = Number(lotD); const s = Number(minSf);
    if (lotW && Number.isFinite(w) && w > 0) next.lot_w_ft = w; else delete next.lot_w_ft;
    if (lotD && Number.isFinite(d) && d > 0) next.lot_d_ft = d; else delete next.lot_d_ft;
    if (minSf && Number.isFinite(s) && s > 0) next.min_lot_sf = s; else delete next.min_lot_sf;
    onOverride?.(next);
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
            {summary.lots} lot{summary.lots === 1 ? '' : 's'}
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
        <>
          <p data-testid="sfv1-skipped" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 leading-snug text-amber-800">
            Skipped — {summary.reason ?? 'no reason given'}
          </p>
          {site && site.heldAcres != null && site.heldAcres > 0 && (
            // engine g13: the hold comes back with the skip (0 Hickory Bend Dr: 5.24 ac, all of it)
            <p data-testid="sfv1-held" className="mt-1 leading-snug text-slate-600">
              The flood hold takes {site.heldAcres} ac out
              {site.siteAcres === 0 ? ', the whole site' : site.siteAcres != null ? `; ${site.siteAcres} ac are left` : ''} (hatched blue on the sheet).
            </p>
          )}
        </>
      ) : (
        <>
          <p data-testid="sfv1-summary" className="mt-1 leading-snug text-slate-600">{summary.basisLine}</p>
          {autoBest && (
            // 1019 Hitt Ln: "0 lots by right" while the grid drew 19 — the
            // sheet now leads with the plan, and says it is the competition's.
            // Engine g13: also at equal lots (a better plan) and at more lots (buildable).
            <p data-testid="sfv1-auto-best" data-why={autoBest.why} className="mt-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 leading-snug text-indigo-900">
              {autoBestSentence(autoBest)}{' '}
              {onViewCandidate && (
                <button type="button" data-testid="sfv1-auto-best-back" disabled={busy} onClick={() => onViewCandidate('loop')}
                  className="font-semibold underline disabled:opacity-60">
                  Show the default answer ({autoBest.defaultLots} lot{autoBest.defaultLots === 1 ? '' : 's'})
                </button>
              )}
            </p>
          )}
          {summary.privateDrive && summary.lots > 0 && (
            // engine g13, the estate grammar's first form: no public street
            <p data-testid="sfv1-private-drive" className="mt-1 leading-snug text-slate-600">
              {privateDriveSentence(summary.privateDrive)}
            </p>
          )}
          {holeOverlap && holeOverlap.lotsOnHoles > 0 && (
            // 0 Longwood Pl: a cooperative's land around 31 house lots of
            // other owners; the generator planned on the outer ring.
            <p data-testid="sfv1-holes" className="mt-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 leading-snug text-red-800">
              ✗ {holeOverlap.lotsOnHoles} of {holeOverlap.lots} lots lie partly on land that is not this parcel ({holeOverlap.overlapSf.toLocaleString()} SF). The parcel has {holeOverlap.holes} hole{holeOverlap.holes === 1 ? '' : 's'} ({holeOverlap.holesAcres} ac: other owners' lots inside it), and the generator planned on its outer boundary. This plan cannot be built as drawn.
            </p>
          )}
          {frontageLandlocked && summary.lots > 0 && /^frontage lots/i.test(summary.pattern ?? '') && (
            // 7963 Charlotte Pike: twelve "frontage lots" on a parcel no street
            // touches — the nearest road 1,159 ft away; they front a neighbour.
            <p data-testid="sfv1-frontage-landlocked" className="mt-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 leading-snug text-red-800">
              ✗ These are drawn as frontage lots with no new street, but the frontage layer finds no street on this parcel: the lots front a property line. Each would need an access easement across a neighbour.
            </p>
          )}
          {steep && (
            <p data-testid="sfv1-steep" className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 leading-snug text-amber-900">
              ⚠ {steep}
            </p>
          )}
          {steepFromDem && terrain && (
            <p data-testid="sfv1-steep" className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 leading-snug text-amber-900">
              ⚠ The ground averages {Math.round(terrain.meanSlopePct ?? 0)}% slope
              {terrain.maxSlopePct != null ? ` (max ${Math.round(terrain.maxSlopePct)}%)` : ''}
              {terrain.fallFt != null ? ` with ${Math.round(terrain.fallFt)} ft of fall` : ''} (USGS 3DEP).{' '}
              {hillsideHeld
                ? 'The engine holds the land steeper than 25% out as hillside and finds no lot on the rest; it does not yet lay streets out by grade.'
                : 'The engine measures terrain but does not lay out by it yet, so the lot module may not be what stops this plan.'}
            </p>
          )}
          {noNewLots && summary.status !== 'skipped' && site?.parcelAcres != null && summary.minLotSf != null && site.parcelAcres * 43560 < summary.minLotSf && (
            // 0 Couchville Pike (RS80, 1.43 ac): the reason said "no lot of
            // 80000 sf fits" — the parcel itself is smaller than one lot.
            <p data-testid="sfv1-undersized" className="mt-1 leading-snug text-slate-600">
              The parcel ({Math.round(site.parcelAcres * 43560).toLocaleString()} SF) is smaller than the district's minimum lot ({summary.minLotSf.toLocaleString()} SF): no new lot can be made. As a lot of record it may still carry one house.
            </p>
          )}
          {noNewLots && site && site.heldAcres != null && site.heldAcres > 0 && (
            <p data-testid="sfv1-held" className="mt-1 leading-snug text-slate-600">
              The flood hold takes {site.heldAcres} ac out{site.siteAcres != null ? ` before the layout; ${site.siteAcres} ac are left to plan` : ''} (hatched blue on the sheet).
            </p>
          )}
          {moduleIgnored && (
            <p data-testid="sfv1-module-ignored" className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 leading-snug text-amber-800">
              You asked for {askedW} × {askedD} ft lots; the generator used {summary.lotWFt} × {summary.lotDFt} ft.
            </p>
          )}
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
                summary.rowPct != null ? `${summary.rowPct}% ${summary.privateDrive ? 'easement' : 'ROW'}` : null,
                summary.lotPct != null ? `${summary.lotPct}% lots` : null,
                summary.openPct != null ? `${summary.openPct}% open` : null,
                summary.imperviousPct != null ? `${summary.imperviousPct}% impervious` : null,
              ].filter(Boolean).join(' · ') || '—'}
            </dd>
            <dt className="text-slate-500">{summary.privateDrive ? 'Private drive' : 'Street'}</dt>
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
                <dd data-testid="sfv1-open-space">{openSpaceByKind(summary.openPieces)}</dd>
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
      {otherNotes.length > 0 && (
        <ul data-testid="sfv1-notes" className="mt-2 space-y-0.5 text-[11px] text-amber-800">
          {otherNotes.map((n, i) => <li key={i}>⚠ {n}</li>)}
        </ul>
      )}

      {competition && (
        <SfV1CompetitionBlock
          competition={competition}
          shownRequested={shownRequested ?? null}
          {...(onViewCandidate ? { onView: onViewCandidate } : {})}
          {...(onRetryCompetition ? { onRetry: onRetryCompetition } : {})}
          busy={busy ?? false}
        />
      )}

      {/* 0 new lots is not "nothing can be built": the parcel is itself a lot
          of record (0 Harding Pl, R40, 2.9 ac: the sheet was empty). */}
      {noNewLots && onDrawHouse && (
        <div data-testid="sfv1-one-house" className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] leading-snug text-sky-900">
          {houseDrawn ? (
            <span>No new lots by right. The parcel itself is one lot: the house it carries is drawn (single-family seed).</span>
          ) : houseError ? (
            // 1083 B Lakewalk Dr (2026-11-04): the seed answered with no footprint;
            // the click drew nothing and only a flag counter moved.
            <span data-testid="sfv1-house-error" className="text-amber-900">
              No new lots by right, and the single-family seed could not place the house: {houseError}
            </span>
          ) : (
            <>
              <span>No new lots by right — but the parcel itself is one lot. </span>
              <button
                type="button"
                data-testid="sfv1-draw-house"
                disabled={busy}
                onClick={onDrawHouse}
                className="font-semibold text-sky-800 underline hover:text-sky-950 disabled:opacity-60"
              >
                Draw the one house it carries
              </button>
            </>
          )}
          {landlocked && !houseError && (
            <div data-testid="sfv1-house-access" className="mt-1 text-sky-900/80">
              No street touches this parcel: a house here assumes an access easement across a neighbour, which is not by right.
            </div>
          )}
          {floodSkip && !houseError && (
            <div data-testid="sfv1-house-flood" className="mt-1 text-sky-900/80">
              The flood hazard area leaves no buildable piece: a house here stands in the floodplain, on fill to the base flood elevation and with a floodplain permit.
            </div>
          )}
        </div>
      )}

      {ew && (summary.streetGrade || summary.hasFlood || ew.ground_min_ft != null) && (
        <div data-testid="sfv1-earthwork" data-flood={String(summary.hasFlood)} className="mt-2 rounded-md border border-orange-200 bg-orange-50 p-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-orange-800">Earthwork</h4>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            {ew.ground_min_ft != null && ew.ground_max_ft != null && (
              <>
                <dt className="text-orange-700">Ground</dt>
                <dd>{fmtVal(ew.ground_min_ft)}–{fmtVal(ew.ground_max_ft)} ft · {fmtVal((ew.ground_max_ft ?? 0) - (ew.ground_min_ft ?? 0))} ft of fall</dd>
              </>
            )}
            {summary.streetGrade && (
              <>
                <dt className="text-orange-700">Street grade</dt>
                <dd
                  data-testid="sfv1-street-grade"
                  className={summary.streetGrade.maxPct != null && summary.streetGrade.limitPct != null && summary.streetGrade.maxPct > summary.streetGrade.limitPct ? 'font-medium text-red-700' : ''}
                >
                  {summary.streetGrade.maxPct != null ? `max ${fmtVal(summary.streetGrade.maxPct)}%` : '—'}
                  {summary.streetGrade.limitPct != null ? ` · limit ${fmtVal(summary.streetGrade.limitPct)}%` : ''}
                  {summary.streetGrade.ftOverLimit != null && summary.streetGrade.ftOverLimit > 0 ? ` · ${fmtVal(summary.streetGrade.ftOverLimit)} ft of street over the limit` : ''}
                </dd>
              </>
            )}
            {summary.hasFlood && (
              <>
                {(ew.sfha_ac != null || ew.lots_in_sfha != null) && (
                  <>
                    <dt className="text-orange-700">Flood hazard area</dt>
                    <dd>
                      {ew.sfha_ac != null ? `${fmtVal(ew.sfha_ac)} ac` : ''}
                      {ew.lots_in_sfha != null ? `${ew.sfha_ac != null ? ' · ' : ''}${ew.lots_in_sfha} lots in it` : ''}
                    </dd>
                  </>
                )}
                {ew.bfe_ft != null && (
                  <>
                    <dt className="text-orange-700">BFE</dt>
                    <dd>
                      {fmtVal(ew.bfe_ft)} ft
                      {ew.freeboard_ft != null ? ` + ${fmtVal(ew.freeboard_ft)} ft freeboard` : ''}
                      {ew.pad_target_ft != null ? ` → pads at ${fmtVal(ew.pad_target_ft)} ft` : ''}
                    </dd>
                  </>
                )}
                {fillByComponent && fillByComponent.some(([, v]) => typeof v === 'number' && v > 0) && (
                  <>
                    <dt className="text-orange-700">Fill</dt>
                    <dd>{fillByComponent.filter(([, v]) => typeof v === 'number' && v > 0).map(([k, v]) => `${k.replace(/_/g, ' ')} ${fmtCy(v)}`).join(' · ')}</dd>
                  </>
                )}
                {typeof ew.fill_cy === 'number' && ew.fill_cy > 0 && (<><dt className="text-orange-700">Fill</dt><dd>{fmtCy(ew.fill_cy)}</dd></>)}
                {ew.pad_fill_ft && (ew.pad_fill_ft.min != null || ew.pad_fill_ft.median != null || ew.pad_fill_ft.max != null) && (
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
                {ew.cut && (ew.cut.required_cy ?? 0) > 0 && (
                  <>
                    <dt className="text-orange-700">Cut</dt>
                    <dd className={ew.cut.closes_on_site === false ? 'font-medium text-red-700' : ''}>
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
              </>
            )}
          </dl>
          {summary.hasFlood && !summary.fillView && (ew?.lots_in_sfha ?? 0) === 0 ? (
            // 0 Neelys Bend Rd: 20 cy of fill for a street crossing the flood
            // hazard area, no lot in it — a pad-fill legend there is noise.
            <p data-testid="sfv1-street-only-fill" className="mt-1 text-[10px] text-orange-900/80">No lot stands in the flood hazard area: the fill is for the street that crosses it.</p>
          ) : summary.hasFlood ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-orange-900">
              <span className="font-semibold">Pads by fill:</span>
              {summary.fillView ? FILL_BANDS.map(b => (
                <span key={b.key} className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm border border-orange-900/30" style={{ backgroundColor: b.color }} />
                  {b.label}
                </span>
              )) : <span className="italic">per-pad fill unavailable — pads keep their plan colour</span>}
            </div>
          ) : noFloodLand ? (
            <p className="mt-1 text-[10px] text-orange-900/80">No FEMA flood hazard area on the site: nothing held out, no fill, no compensating cut.</p>
          ) : (
            <p className="mt-1 text-[10px] text-orange-900/80">The plan stays out of the flood hazard area: no fill to a base flood elevation, no compensating cut.</p>
          )}
        </div>
      )}

      {/* A skipped parcel (landlocked) is not fixed by a lot module or a fill
          scenario: no controls that cannot help, only the way back. */}
      {!onOverride ? null : summary.status === 'skipped' ? ((overridden || floodSkip) ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
          {floodSkip && !fillScenario && (
            <button
              type="button"
              data-testid="sfv1-override-floodway"
              aria-pressed={false}
              disabled={busy}
              title="Fill scenario: hold out only the regulatory floodway and fill the rest of the floodplain to the pad target"
              onClick={() => onOverride?.({ ...override, flood: 'floodway' })}
              className="rounded-md border border-amber-500 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60"
            >
              Try the fill scenario (floodway only) — an override
            </button>
          )}
          {overridden && (
            <button
              type="button"
              data-testid="sfv1-override-reset"
              disabled={busy}
              onClick={() => { setLotW(''); setLotD(''); setMinSf(''); onOverride?.({}); }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              By right
            </button>
          )}
        </div>
      ) : null) : (
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
          {/* Nothing held for flood, no BFE (3736 Old Clarksville Pike, 0 Sullivan
              Hollow Rd): the fill scenario would return the same plan — no control
              that cannot change the answer. */}
          {noFloodLand && !fillScenario ? (
            <span data-testid="sfv1-no-fill-scenario" className="self-center text-[10px] text-slate-500">No flood land held out — no fill scenario to run.</span>
          ) : (
          <button
            type="button"
            data-testid="sfv1-override-floodway"
            aria-pressed={fillScenario}
            disabled={busy}
            title="Fill scenario: hold out only the regulatory floodway and fill the rest of the floodplain to the pad target"
            onClick={() => {
              const next: SfV1Options = { ...override };
              if (fillScenario) delete next.flood; else next.flood = 'floodway';
              onOverride?.(next);
            }}
            className={
              'rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-60 ' +
              (fillScenario ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
            }
          >
            Fill scenario (floodway only)
          </button>
          )}
          <button
            type="button"
            data-testid="sfv1-override-reset"
            disabled={busy || !overridden}
            onClick={() => { setLotW(''); setLotD(''); setMinSf(''); onOverride?.({}); }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            By right
          </button>
        </div>
      </div>
      )}
    </section>
  );
}
