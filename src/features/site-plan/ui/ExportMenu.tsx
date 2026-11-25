import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Layers, ClipboardList, ChevronDown } from 'lucide-react';

export interface ExportChoice {
  key: 'site-plan' | '3d-image' | 'set' | 'report';
  /** Why this choice cannot be made right now; absent when it can. */
  blocked?: string | null;
  run: () => void;
}

const COPY: Record<ExportChoice['key'], { label: string; detail: string; icon: React.ReactNode; testid: string }> = {
  'site-plan': { label: 'Site plan PDF', detail: 'Sheet A-01 at page size. Print it to save a PDF.', icon: <FileText className="w-4 h-4" />, testid: 'open-sheets' },
  '3d-image': { label: '3D image', detail: 'A picture of the scheme in three dimensions, as a PNG.', icon: <ImageIcon className="w-4 h-4" />, testid: 'export-3d-image' },
  set: { label: 'Full exhibit set', detail: 'Site plan, aerial view and section in one PDF.', icon: <Layers className="w-4 h-4" />, testid: 'export-set' },
  report: { label: 'Scheme report', detail: 'Plan, tabulation and the solver receipts, print-ready.', icon: <ClipboardList className="w-4 h-4" />, testid: 'export-report' },
};

/**
 * The one place a plan leaves the app. It says which scheme and which
 * revision is about to be sent before anything is downloaded.
 */
const ExportMenu: React.FC<{
  address: string;
  schemeName: string;
  revision: string | null;
  choices: ExportChoice[];
  /** Nothing can be exported yet, and why. */
  blocked?: string | null;
}> = ({ address, schemeName, revision, choices, blocked }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc, true); };
  }, [open]);

  return (
    <div ref={root} className="relative flex-shrink-0">
      <button
        data-testid="export-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        disabled={!!blocked}
        title={blocked ?? 'Export this scheme'}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-80 z-40 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200" data-testid="export-identity">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">You are exporting</div>
            <div className="text-sm font-medium text-gray-900 truncate">{address}</div>
            <div className="text-xs text-gray-600">
              {schemeName}{revision ? <> · revision <span className="font-mono">{revision}</span></> : null}
            </div>
          </div>
          {choices.map(c => {
            const copy = COPY[c.key];
            return (
              <button
                key={c.key}
                role="menuitem"
                data-testid={copy.testid}
                disabled={!!c.blocked}
                title={c.blocked ?? undefined}
                onClick={() => { setOpen(false); c.run(); }}
                className="w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed border-b border-gray-100 last:border-0"
              >
                <span className="mt-0.5 text-gray-500">{copy.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm text-gray-900">{copy.label}</span>
                  <span className="block text-xs text-gray-500">{c.blocked ?? copy.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExportMenu;
