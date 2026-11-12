import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DrawingScene } from '../scene/types';
import { renderSitePlanSheet, sheetLayout, SHEET_SIZES, type SheetLayout, type SheetSize, type SheetTitle } from '../scene/sheetSvg';

/**
 * The exhibit sheets of the scheme on screen, as vector drawings at page size.
 * A-01 Site Plan is drawn from the drawing scene: its tags, stories, areas and
 * heights are the scene's own. Download gives the SVG; Print sends the page at
 * its true size, so the stated scale holds at 100%.
 */
export const ExhibitSheets: React.FC<{
  scene: DrawingScene;
  title: SheetTitle;
  onClose: () => void;
  /** Renders the ground the sheet shows as a picture from above. Without it,
   *  or if it fails, the sheet is the drawn plan. */
  renderUnderlay?: ((layout: SheetLayout, widthPx: number) => Promise<string>) | undefined;
}> = ({ scene, title, onClose, renderUnderlay }) => {
  const [size, setSize] = useState<SheetSize>('slide');
  const [style, setStyle] = useState<'rendered' | 'drawn'>(renderUnderlay ? 'rendered' : 'drawn');
  const [underlay, setUnderlay] = useState<{ key: string; href: string } | null>(null);
  const [rendering, setRendering] = useState(false);
  const key = `${scene.identity.key}|${scene.identity.revision}|${size}`;
  useEffect(() => {
    if (style !== 'rendered' || !renderUnderlay || underlay?.key === key) return;
    let live = true;
    setRendering(true);
    const layout = sheetLayout(scene, size);
    // the drawing area at 200 dots to the inch
    renderUnderlay(layout, Math.round((layout.draw.w / 72) * 200))
      .then(href => { if (live) setUnderlay({ key, href }); })
      .catch(err => { console.warn('[sheet] the plan could not be rendered; showing the drawn plan.', err); if (live) setStyle('drawn'); })
      .finally(() => { if (live) setRendering(false); });
    return () => { live = false; };
  }, [style, renderUnderlay, key, scene, size, underlay?.key]);
  const picture = style === 'rendered' && underlay?.key === key ? { href: underlay.href } : null;
  const sheet = useMemo(() => renderSitePlanSheet(scene, title, size, picture), [scene, title, size, picture]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fileName = `A-01_site-plan_${scene.identity.parcelId}_${size}.svg`;

  const download = useCallback(() => {
    const url = URL.createObjectURL(new Blob([sheet.svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [sheet.svg, fileName]);

  // The sheet as a picture for a slide: the same vector drawing, rastered at
  // 200 dpi of its page size.
  const [pngBusy, setPngBusy] = useState(false);
  const downloadPng = useCallback(() => {
    setPngBusy(true);
    const url = URL.createObjectURL(new Blob([sheet.svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    const done = () => { URL.revokeObjectURL(url); setPngBusy(false); };
    img.onload = () => {
      try {
        const scale = 200 / 72;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(sheet.widthPt * scale);
        canvas.height = Math.round(sheet.heightPt * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const a = document.createElement('a');
          a.href = canvas.toDataURL('image/png');
          a.download = fileName.replace(/\.svg$/, '.png');
          a.click();
        }
      } finally {
        done();
      }
    };
    img.onerror = done;
    img.src = url;
  }, [sheet.svg, sheet.widthPt, sheet.heightPt, fileName]);

  const print = useCallback(() => {
    const { wIn, hIn } = SHEET_SIZES[size];
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.srcdoc = `<!doctype html><html><head><title>A-01 Site Plan</title><style>@page{size:${wIn}in ${hIn}in;margin:0}html,body{margin:0}svg{display:block;width:${wIn}in;height:${hIn}in}</style></head><body>${sheet.svg}</body></html>`;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
  }, [sheet.svg, size]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex flex-col" role="dialog" aria-modal="true" aria-label="Exhibit sheets" data-testid="exhibit-sheets">
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 text-sm">
        <span className="font-semibold text-gray-900">A-01 Site Plan</span>
        <span className="text-gray-500 text-xs" data-testid="sheet-scale">
          {sheet.numericScale ? `Scale ${sheet.numericScale} at full size` : size === 'slide' ? 'Slide, 16:9 · graphic scale' : 'Graphic scale only'}
        </span>
        {rendering && <span className="text-xs text-blue-700" data-testid="sheet-rendering">Rendering the plan…</span>}
        {renderUnderlay && (
          <div className="ml-auto inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs" role="group" aria-label="Plan style">
            {(['rendered', 'drawn'] as const).map(k => (
              <button key={k} type="button" aria-pressed={style === k} onClick={() => setStyle(k)} data-testid={`sheet-style-${k}`} className={`px-2.5 py-1 ${style === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} ${k === 'drawn' ? 'border-l border-gray-200' : ''}`}>
                {k === 'rendered' ? 'Rendered' : 'Drawn'}
              </button>
            ))}
          </div>
        )}
        <div className={`${renderUnderlay ? '' : 'ml-auto '}inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs`} role="group" aria-label="Page size">
          {(Object.keys(SHEET_SIZES) as SheetSize[]).map(k => (
            <button
              key={k}
              type="button"
              aria-pressed={size === k}
              onClick={() => setSize(k)}
              data-testid={`sheet-size-${k}`}
              className={`px-2.5 py-1 ${size === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} ${k !== 'letter' ? 'border-l border-gray-200' : ''}`}
            >
              {k === 'letter' ? 'Letter' : k === 'tabloid' ? '11 × 17' : 'Slide 16:9'}
            </button>
          ))}
        </div>
        <button type="button" onClick={downloadPng} disabled={pngBusy} data-testid="sheet-download-png" title="A picture of the sheet at 200 dpi, for a slide" className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">Download PNG</button>
        <button type="button" onClick={download} data-testid="sheet-download" className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">Download SVG</button>
        <button type="button" onClick={print} data-testid="sheet-print" className="px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Print</button>
        <button type="button" onClick={onClose} aria-label="Close sheets" className="px-2 py-1 text-gray-500 hover:text-gray-900">Close</button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-6 flex items-start justify-center">
        <div
          data-testid="sheet-a01"
          data-sheet-size={size}
          data-sheet-style={picture ? 'rendered' : 'drawn'}
          className="bg-white shadow-xl w-full [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
          style={{ maxWidth: `min(100%, calc((100vh - 110px) * ${SHEET_SIZES[size].wIn / SHEET_SIZES[size].hIn}))` }}
          // the sheet is generated here from the scene, with every text escaped
          dangerouslySetInnerHTML={{ __html: sheet.svg }}
        />
      </div>
    </div>
  );
};

export default ExhibitSheets;
