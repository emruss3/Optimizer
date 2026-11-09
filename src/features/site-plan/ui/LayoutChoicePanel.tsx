/**
 * The layout choice on multifamily land (the owner, 2026-11-04): "If a
 * traditional multifamily design makes more sense, we should default to that
 * with an option to switch to a neighborhood layout."
 *
 * Two options side by side with the homes each places: the multifamily plan
 * the massing engine drew, and the neighborhood's best plan from the pattern
 * competition (townhomes from the townhome engine, or house lots on a street
 * pattern). The default is the one that places more homes; the sentence says
 * why. Under it, every neighborhood plan of the competition, each one
 * drawable, and the townhome plan's own figures when it is on the sheet.
 */
import { useState } from 'react';
import type { LayoutChoice, LayoutKind } from '../api/layoutChoice';
import { homesPhrase } from '../api/layoutChoice';
import type { ThV3Summary } from '../api/thV3Plan';
import { SfV1CompetitionBlock, type SfV1CompetitionState } from './SfV1Competition';

const fmt = (v: number | null | undefined, d = 0) => (v == null ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString());

function ThV3Facts({ s }: { s: ThV3Summary }) {
  return (
    <div data-testid="layout-thv3" data-homes={s.homes} className="mt-2 rounded-md border border-sky-200 bg-sky-50/60 p-2 text-[11px] leading-snug text-slate-700">
      <div className="font-semibold text-slate-800">
        {homesPhrase(s.homes, true)}{s.pattern ? ` on a ${s.pattern}` : ''} · townhome engine (th_v3), by right
      </div>
      <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5">
        {s.unitWFt != null && s.unitDFt != null && (<><dt className="text-slate-500">Homes</dt><dd>{s.unitWFt} × {s.unitDFt} ft, attached in rows{s.homesPerAcre != null ? ` · ${fmt(s.homesPerAcre, 1)} / ac` : ''}</dd></>)}
        <dt className="text-slate-500">Access</dt>
        <dd>{s.streetFt != null && s.streetFt > 0 ? `${fmt(s.streetFt)} ft of new street` : 'no new street'}{s.alleys != null ? ` · ${s.alleys} alle${s.alleys === 1 ? 'y' : 'ys'}` : ''}</dd>
        {(s.usableOpenPct != null || s.greens > 0) && (<><dt className="text-slate-500">Open</dt><dd>{s.usableOpenPct != null ? `${fmt(s.usableOpenPct)}% usable` : ''}{s.greens > 0 ? `${s.usableOpenPct != null ? ' · ' : ''}${s.greens} green${s.greens === 1 ? '' : 's'}` : ''}</dd></>)}
        {s.guestStalls != null && (<><dt className="text-slate-500">Guest parking</dt><dd className={s.guestTarget != null && s.guestStalls < s.guestTarget ? 'text-amber-800' : ''}>{s.guestStalls}{s.guestTarget != null ? ` of ${s.guestTarget}` : ''} stalls</dd></>)}
        {s.stormwaterSf != null && (<><dt className="text-slate-500">Stormwater</dt><dd>{fmt(s.stormwaterSf)} SF{s.stormwaterNeededSf != null ? ` (${fmt(s.stormwaterNeededSf)} needed)` : ''}</dd></>)}
      </dl>
      {s.requiredFails.length > 0 ? (
        <p data-testid="layout-thv3-fails" className="mt-1 font-medium text-red-700">Fails: {s.requiredFails.join(', ')}</p>
      ) : (
        <p className="mt-1 text-emerald-700">Every required test passes.</p>
      )}
      {s.contextFlags.length > 0 && (
        <p className="text-[10px] text-amber-800" title="context tests: shown, not failed">Context flags: {s.contextFlags.join(', ')}</p>
      )}
      {s.overDensityBy != null && (
        <p data-testid="layout-thv3-density" className="mt-1 rounded border border-red-300 bg-red-50 px-1.5 py-1 font-medium text-red-800">
          The engine drew {s.homes} homes; the district's density allows {s.densityCap}. {s.overDensityBy} would have to come out.
        </p>
      )}
      {s.overDensityBy == null && (s.homesBeforeDensityCap != null || s.trimNote) && (
        // engine g13: the drawing is trimmed to the cap (0 Smith Springs Rd: 62 drawn, 42 kept)
        <p data-testid="layout-thv3-trimmed" className="mt-1 text-[10.5px] text-slate-600">
          {s.trimNote
            ?? `${s.homesBeforeDensityCap} homes drawn; trimmed to the district density cap of ${s.densityCap ?? s.homes}.`}
        </p>
      )}
      <p className="mt-1 text-[10px] text-slate-500">The engine plans footprints; the 3D view assumes three stories.</p>
    </div>
  );
}

export function LayoutChoicePanel({
  choice, competition, shown, shownRequested, auto, busy, onChoose, onViewCandidate, onRetry, thV3, thV3Error,
}: {
  choice: LayoutChoice | null;
  competition: SfV1CompetitionState | null;
  /** what the sheet shows now */
  shown: LayoutKind | null;
  /** the neighborhood plan on the sheet ('townhome', 'grid', …) */
  shownRequested: string | null;
  /** the neighborhood went on the sheet by itself: it places more homes */
  auto: boolean;
  busy?: boolean;
  onChoose: (kind: LayoutKind) => void;
  onViewCandidate: (requested: string) => void;
  onRetry?: () => void;
  thV3?: ThV3Summary | null;
  thV3Error?: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const loading = competition?.state === 'loading';
  const nb = choice?.neighborhood ?? null;
  const mf = choice?.multifamilyHomes ?? null;
  const def = choice?.defaultKind ?? 'multifamily';
  const product = choice?.multifamilyProduct ?? 'apartments';
  const nbDisabled = busy || !nb || !nb.drawable;
  const option = (active: boolean) =>
    'flex flex-col items-start rounded-md border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ' +
    (active ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-400' : 'border-slate-200 bg-white hover:border-slate-300');
  const badge = (text: string, tone: string) => <span className={`mt-0.5 rounded px-1 text-[9px] font-semibold uppercase ${tone}`}>{text}</span>;

  return (
    <section
      data-testid="layout-choice"
      data-default={choice ? def : ''}
      data-shown={shown ?? ''}
      data-auto={String(auto)}
      data-flood-hold={String(!!choice?.floodHold)}
      className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Layout</h3>
        <span className="text-[10px] text-slate-500">the one with more homes is the default</span>
      </div>
      <div role="radiogroup" aria-label="Layout" className="mt-1.5 grid grid-cols-2 gap-1.5">
        <button
          type="button" role="radio" aria-checked={shown === 'multifamily'} data-testid="layout-option-multifamily"
          data-homes={mf ?? ''} disabled={busy} onClick={() => onChoose('multifamily')} className={option(shown === 'multifamily')}
        >
          <span className="text-[11px] font-semibold text-slate-800">Multifamily</span>
          <span className="text-base font-semibold leading-tight text-slate-900">{mf != null ? `${mf} home${mf === 1 ? '' : 's'}` : '—'}</span>
          <span className="text-[10px] text-slate-500">{product === 'townhomes' ? 'townhome rows, surface parking' : 'apartments, surface parking'}</span>
          {choice && def === 'multifamily' && badge('default', 'bg-emerald-100 text-emerald-800')}
          {/* 0 Todd Preis Dr: the floodplain leaves no buildable piece; the multifamily engine drew on it anyway */}
          {choice?.floodHold && badge('in the flood hazard area', 'bg-red-100 text-red-800')}
        </button>
        <button
          type="button" role="radio" aria-checked={shown === 'neighborhood'} data-testid="layout-option-neighborhood"
          data-homes={nb?.homes ?? ''} data-requested={nb?.requested ?? ''} disabled={nbDisabled}
          title={nb && !nb.drawable ? 'drawn by an engine this sheet cannot draw yet' : undefined}
          onClick={() => onChoose('neighborhood')} className={option(shown === 'neighborhood')}
        >
          <span className="text-[11px] font-semibold text-slate-800">Neighborhood</span>
          <span className="text-base font-semibold leading-tight text-slate-900">{nb ? `${nb.homes} home${nb.homes === 1 ? '' : 's'}` : loading ? '…' : '—'}</span>
          <span className="text-[10px] text-slate-500">{nb ? nb.label : loading ? 'comparing the patterns…' : 'no pattern places a home'}</span>
          {choice && def === 'neighborhood' && badge('default', 'bg-emerald-100 text-emerald-800')}
          {nb && !nb.buildable && badge('fails a code test', 'bg-red-100 text-red-800')}
        </button>
      </div>

      {loading ? (
        <p data-testid="layout-loading" className="mt-1.5 text-[11px] italic text-slate-500">
          Drawing the neighborhood plans (the grid, the neighborhood, the loop grammar and the townhome engine) to compare with the multifamily plan…
        </p>
      ) : competition?.state === 'error' ? (
        <p data-testid="layout-error" className="mt-1.5 text-[11px] leading-snug text-amber-800">
          The neighborhood plans are unavailable — {competition.error ?? 'no answer'}. The multifamily plan stands.{' '}
          {onRetry && <button type="button" onClick={onRetry} disabled={busy} className="font-semibold underline disabled:opacity-60">Try again</button>}
        </p>
      ) : choice ? (
        <p data-testid="layout-sentence" className="mt-1.5 leading-snug text-slate-700">{choice.sentence}</p>
      ) : null}
      {choice?.densityCap != null && (
        <p data-testid="layout-density" className="mt-0.5 text-[10px] text-slate-500">
          The district's density allows {choice.densityCap.toLocaleString()} homes on this parcel.
        </p>
      )}
      {auto && shown === 'neighborhood' && (
        <p data-testid="layout-auto" className="mt-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 leading-snug text-indigo-900">
          {/* 0 Swiss Ave: the apartment plan failed the overlap check — not outnumbered */}
          The neighborhood went on the sheet by itself because {mf == null ? 'the multifamily plan did not draw' : 'it places more homes'}.{' '}
          <button type="button" data-testid="layout-auto-back" disabled={busy} onClick={() => onChoose('multifamily')} className="font-semibold underline disabled:opacity-60">
            Show the multifamily plan
          </button>
        </p>
      )}
      {thV3Error && shown !== 'neighborhood' && (
        <p data-testid="layout-thv3-error" className="mt-1 text-[11px] leading-snug text-amber-800">Could not draw the townhome plan: {thV3Error}.</p>
      )}
      {thV3 && shown === 'neighborhood' && shownRequested === 'townhome' && <ThV3Facts s={thV3} />}

      {competition && competition.state === 'done' && (shown === 'neighborhood' || showAll) ? (
        <SfV1CompetitionBlock
          competition={competition}
          shownRequested={shown === 'neighborhood' ? shownRequested : null}
          onView={onViewCandidate}
          {...(onRetry ? { onRetry } : {})}
          busy={busy ?? false}
          title="Neighborhood plans"
        />
      ) : null}
      {competition && competition.state === 'done' && shown !== 'neighborhood' && (competition.data?.rows.length ?? 0) > 0 && (
        <button type="button" data-testid="layout-show-all" onClick={() => setShowAll(v => !v)} className="mt-1 text-[10px] text-slate-500 underline decoration-dotted hover:text-slate-700">
          {showAll ? 'hide the neighborhood plans' : `all ${competition.data?.rows.length} neighborhood plans`}
        </button>
      )}
    </section>
  );
}
