import React from 'react';
import type { Element, SiteMetrics, FeasibilityViolation } from '../../../engine/types';
import type { PlannerContextResponse } from '../api/plannerContext';
import { plannerContextSummary } from '../api/plannerContext';
import type { MaxBuildout } from '../api/maxBuildout';
import TabulationPanel from './TabulationPanel';
import MaxBuildoutHeadline from './MaxBuildoutHeadline';
import FlagsPanel from './FlagsPanel';

/**
 * THE EXIT ARTIFACT (P1-5): a print-ready scheme report. The browser's
 * print engine produces the PDF (vector text, embedded plan snapshot), so
 * every honest component — tabulation, theoretical-envelope headline with
 * the solver's verdict, the proof receipts — is reused verbatim. This is
 * the page a TestFit user cannot produce: every number carries its source.
 */
const ExportReport: React.FC<{
  address: string;
  zoning: string | null;
  planPng: string | null;
  planBasis: string | null;
  metrics: SiteMetrics | null;
  elements: Element[];
  buildout: MaxBuildout | null;
  currentStories: number | null;
  plannerCtx: PlannerContextResponse | null;
  violations: FeasibilityViolation[];
  lineageFlags: string[];
  acres?: number | null;
  onClose: () => void;
}> = ({
  address,
  zoning,
  planPng,
  planBasis,
  metrics,
  elements,
  buildout,
  currentStories,
  plannerCtx,
  violations,
  lineageFlags,
  acres,
  onClose,
}) => {
  return (
    <div className="export-report fixed inset-0 z-50 bg-white overflow-y-auto">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .export-report, .export-report * { visibility: visible; }
          .export-report { position: absolute !important; inset: 0; overflow: visible !important; }
          .no-print { display: none !important; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="no-print sticky top-0 bg-slate-900 text-white px-4 py-2 flex items-center gap-3">
        <span className="text-sm font-medium">Scheme report — print to PDF</span>
        <button
          onClick={() => window.print()}
          className="ml-auto px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-sm"
        >
          Print / Save as PDF
        </button>
        <button onClick={onClose} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-sm">
          Close
        </button>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-4 text-gray-900">
        <header className="border-b border-gray-300 pb-3">
          <h1 className="text-xl font-bold">{address}</h1>
          <div className="text-sm text-gray-600">
            {zoning ? `Zoning ${zoning}` : ''}
            {acres != null ? ` · ${acres.toFixed(2)} ac` : ''}
            {' · '}
            {new Date().toLocaleDateString()} — generated site scheme
          </div>
          {planBasis && <div className="text-xs text-gray-500 mt-1">Plan basis: {planBasis}</div>}
        </header>

        {planPng && (
          <img
            src={planPng}
            alt="Site plan"
            className="w-full border border-gray-200 rounded"
          />
        )}

        <MaxBuildoutHeadline
          buildout={buildout}
          achievedGsf={metrics?.totalBuiltSF ?? null}
          currentStories={currentStories}
          optimizationStatus={metrics?.optimizationStatus ?? null}
          optimizationProof={metrics?.optimizationProof ?? null}
        />

        <TabulationPanel
          elements={elements}
          metrics={metrics}
          plannerCtx={plannerCtx}
          acres={acres ?? undefined}
        />

        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Constraints, flags &amp; solver receipts</h2>
          <FlagsPanel
            violations={violations}
            lineageFlags={lineageFlags}
            proof={metrics?.optimizationProof ?? null}
            regimeComparison={metrics?.regimeComparison ?? null}
          />
        </div>

        {plannerCtx && (
          <footer className="text-[10px] text-gray-500 border-t border-gray-200 pt-2">
            Context: {plannerContextSummary(plannerCtx)} · context id {plannerCtx.context_id} · hash{' '}
            {plannerCtx.context_hash}
            <br />
            Every constraint above cites its source (ordinance, precedent set, or solver proof). Theoretical
            envelope figures are statutory upper bounds; "achievable" is used only for solver-reproduced numbers.
          </footer>
        )}
      </div>
    </div>
  );
};

export default ExportReport;
