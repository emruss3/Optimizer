import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchStylePicker } from './ArchStylePicker';
import type { DrawingScene } from '../scene/types';
import {
  renderSectionSheet, renderSitePlanSheet, renderViewSheet, sheetLayout, viewSheetLayout, SHEET_SIZES,
  type SheetLayout, type SheetSize, type SheetTitle, type HeightControl,
} from '../scene/sheetSvg';

type Which = 'plan' | 'view' | 'section';

/** Resolves after the browser has painted what was just put on screen: a
 *  render holds the page for a few seconds and must not start before that. */
const painted = () => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 40)));

/**
 * The exhibit sheets of the scheme on screen, as vector pages at their true
 * size. A-01 Site Plan is the plan's linework, tags and labels over a render
 * of the site from above. A-02 Aerial View is a rendering of the scheme. Both
 * are drawn from the drawing scene, so their figures are the ones the plan
 * and the 3D inspector show. Each can be saved as a picture for a slide, as
 * SVG, or printed at its true size.
 */
export const ExhibitSheets: React.FC<{
  scene: DrawingScene;
  title: SheetTitle;
  onClose: () => void;
  /** Renders the ground a site plan sheet shows as a picture from above.
   *  Without it, or if it fails, the sheet is the drawn plan. */
  renderUnderlay?: ((layout: SheetLayout, widthPx: number) => Promise<string>) | undefined;
  /** Renders the scheme from the air at the given size, for A-02. */
  renderView?: ((widthPx: number, heightPx: number) => Promise<string>) | undefined;
  /** Repaints a rendering as a photograph (the photoreal pass), for A-02. */
  photoreal?: ((image: string) => Promise<string>) | undefined;
  /** The architectural style the pictures are rendered in: a change of it is a new picture. */
  look?: string | undefined;
  /** The sheet to open on. */
  initial?: Which | undefined;
  /** The name the scheme goes by in the app, shown with its revision. */
  schemeName?: string | undefined;
  /** Open, then print every sheet as one set. */
  printSetOnOpen?: boolean | undefined;
  /** The zoning height limit and plane, for the section. */
  heightControl?: HeightControl | null | undefined;
}> = ({ scene, title, onClose, renderUnderlay, renderView, photoreal, look, initial, schemeName, printSetOnOpen, heightControl }) => {
  const [which, setWhich] = useState<Which>(initial ?? 'plan');
  const [size, setSize] = useState<SheetSize>('slide');
  const [style, setStyle] = useState<'rendered' | 'drawn'>(renderUnderlay ? 'rendered' : 'drawn');
  const [underlay, setUnderlay] = useState<{ key: string; href: string } | null>(null);
  const [view, setView] = useState<{ key: string; href: string } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [viewFailed, setViewFailed] = useState(false);
  const [painted2, setPainted2] = useState<{ key: string; href: string } | null>(null);
  const [painting, setPainting] = useState(false);
  const [paintError, setPaintError] = useState<string | null>(null);
  const [showPainted, setShowPainted] = useState(true);
  const key = `${scene.identity.key}|${scene.identity.revision}|${size}|${look ?? ''}`;

  useEffect(() => {
    if (which !== 'plan' || style !== 'rendered' || !renderUnderlay || underlay?.key === key) return;
    let live = true;
    setRendering(true);
    const layout = sheetLayout(scene, size);
    // the drawing area at 200 dots to the inch, once the sheet is on screen
    painted()
      .then(() => (live ? renderUnderlay(layout, Math.round((layout.draw.w / 72) * 200)) : Promise.reject(new Error('closed'))))
      .then(href => { if (live) setUnderlay({ key, href }); })
      .catch(err => { if (live) { console.warn('[sheet] the plan could not be rendered; showing the drawn plan.', err); setStyle('drawn'); } })
      .finally(() => { if (live) setRendering(false); });
    return () => { live = false; };
  }, [which, style, renderUnderlay, key, scene, size, underlay?.key]);

  useEffect(() => {
    if (which !== 'view' || !renderView || view?.key === key || viewFailed) return;
    let live = true;
    setRendering(true);
    const { image } = viewSheetLayout(size);
    painted()
      .then(() => (live ? renderView(Math.round((image.w / 72) * 200), Math.round((image.h / 72) * 200)) : Promise.reject(new Error('closed'))))
      .then(href => { if (live) setView({ key, href }); })
      .catch(err => { if (live) { console.warn('[sheet] the view could not be rendered.', err); setViewFailed(true); } })
      .finally(() => { if (live) setRendering(false); });
    return () => { live = false; };
  }, [which, renderView, key, size, view?.key, viewFailed]);

  useEffect(() => {
    // on the way down, and stopped there: Escape closes the sheets, not the workspace under them
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const picture = style === 'rendered' && underlay?.key === key ? { href: underlay.href } : null;
  const planSheet = useMemo(() => renderSitePlanSheet(scene, title, size, picture), [scene, title, size, picture]);
  const rendering2 = view?.key === key ? view.href : null;
  const viewPicture = painted2?.key === key && showPainted ? { href: painted2.href, ai: true } : rendering2 ? { href: rendering2 } : null;
  const paint = useCallback(() => {
    if (!photoreal || !rendering2) return;
    setPainting(true);
    setPaintError(null);
    photoreal(rendering2)
      .then(href => { setPainted2({ key, href }); setShowPainted(true); })
      .catch(err => setPaintError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPainting(false));
  }, [photoreal, rendering2, key]);
  const viewSheet = useMemo(() => renderViewSheet(scene, title, size, viewPicture), [scene, title, size, viewPicture]);
  const sectionSheet = useMemo(() => renderSectionSheet(scene, title, size, heightControl ?? null), [scene, title, size, heightControl]);
  const sheet = which === 'plan' ? planSheet : which === 'view' ? viewSheet : sectionSheet;
  const number = which === 'plan' ? 'A-01' : which === 'view' ? 'A-02' : 'A-03';
  const name = which === 'plan' ? 'site-plan' : which === 'view' ? 'aerial-view' : 'section';
  const fileName = `${number}_${name}_${scene.identity.parcelId}_rev-${scene.identity.revision}_${size}.svg`;

  const download = useCallback(() => {
    const url = URL.createObjectURL(new Blob([sheet.svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [sheet.svg, fileName]);

  // The sheet as a picture for a slide: the same page, rastered at 200 dpi.
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

  const printSheets = useCallback((svgs: string[], docTitle: string) => {
    const { wIn, hIn } = SHEET_SIZES[size];
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.srcdoc = `<!doctype html><html><head><title>${docTitle}</title><style>@page{size:${wIn}in ${hIn}in;margin:0}html,body{margin:0}svg{display:block;width:${wIn}in;height:${hIn}in;break-after:page}svg:last-child{break-after:auto}</style></head><body>${svgs.join('')}</body></html>`;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
  }, [size]);
  const print = useCallback(() => printSheets([sheet.svg], number), [printSheets, sheet.svg, number]);

  // Every sheet in one print job. The aerial view is rendered first if it has
  // not been looked at yet; if it cannot be, the set goes out without it.
  const [setBusy, setSetBusy] = useState(false);
  const [setNote, setSetNote] = useState<string | null>(null);
  const printSet = useCallback(async () => {
    setSetBusy(true);
    setSetNote(null);
    try {
      let aerial = viewPicture;
      if (!aerial && renderView && !viewFailed) {
        const { image } = viewSheetLayout(size);
        try {
          const href = await renderView(Math.round((image.w / 72) * 200), Math.round((image.h / 72) * 200));
          setView({ key, href });
          aerial = { href };
        } catch (err) {
          console.warn('[sheet] the view could not be rendered for the set.', err);
        }
      }
      const svgs = [planSheet.svg];
      if (aerial) svgs.push(renderViewSheet(scene, title, size, aerial).svg);
      if (scene.buildings.length > 0) svgs.push(sectionSheet.svg);
      if (renderView && !aerial) setSetNote('The aerial view could not be rendered. The set was sent without sheet A-02.');
      printSheets(svgs, `Exhibit set ${scene.identity.parcelId} rev ${scene.identity.revision}`);
    } finally {
      setSetBusy(false);
    }
  }, [viewPicture, renderView, viewFailed, size, key, planSheet.svg, scene, title, sectionSheet.svg, printSheets]);
  const setAsked = useRef(false);
  useEffect(() => {
    if (!printSetOnOpen || setAsked.current) return;
    // wait for the rendered plan so the set carries the same sheet the screen shows
    if (style === 'rendered' && renderUnderlay && !picture) return;
    setAsked.current = true;
    void printSet();
  }, [printSetOnOpen, style, renderUnderlay, picture, printSet]);

  // what a full set will contain, and why a sheet is missing from it
  const sheetList = [
    { number: 'A-01', included: true, state: 'ready' },
    renderView
      ? { number: 'A-02', included: !viewFailed, state: viewFailed ? 'left out: the aerial view could not be rendered' : viewPicture ? 'ready' : 'renders on export' }
      : { number: 'A-02', included: false, state: 'left out: no 3D view for this plan' },
    scene.buildings.length > 0
      ? { number: 'A-03', included: true, state: 'ready' }
      : { number: 'A-03', included: false, state: 'left out: no building to cut' },
  ];

  const seg = (on: boolean, first: boolean) => `px-2.5 py-1 ${on ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} ${first ? '' : 'border-l border-gray-200'}`;
  const scaleNote = which === 'section' ? 'Schematic section · graphic scale' : which === 'view'
    ? 'A rendering: not to scale'
    : planSheet.numericScale ? `Scale ${planSheet.numericScale} at full size` : size === 'slide' ? 'Slide, 16:9 · graphic scale' : 'Graphic scale only';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex flex-col" role="dialog" aria-modal="true" aria-label="Exhibit sheets" data-testid="exhibit-sheets">
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 text-sm">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium" role="group" aria-label="Sheet">
          <button type="button" aria-pressed={which === 'plan'} onClick={() => setWhich('plan')} data-testid="sheet-tab-plan" className={seg(which === 'plan', true)}>A-01 Site Plan</button>
          {renderView && <button type="button" aria-pressed={which === 'view'} onClick={() => setWhich('view')} data-testid="sheet-tab-view" className={seg(which === 'view', false)}>A-02 Aerial View</button>}
          {scene.buildings.length > 0 && <button type="button" aria-pressed={which === 'section'} onClick={() => setWhich('section')} data-testid="sheet-tab-section" className={seg(which === 'section', false)}>A-03 Section</button>}
        </div>
        <span className="text-gray-700 text-xs" data-testid="sheet-identity">
          {schemeName ? `${schemeName} · ` : ''}rev <span className="font-mono">{scene.identity.revision}</span>
        </span>
        <span className="text-gray-500 text-xs" data-testid="sheet-scale">{scaleNote}</span>
        {setBusy && <span className="text-xs text-blue-700">Preparing the set…</span>}
        {setNote && <span className="text-xs text-amber-700" data-testid="sheet-set-note">{setNote}</span>}
        {rendering && <span className="text-xs text-blue-700" data-testid="sheet-rendering">Rendering…</span>}
        {which === 'view' && viewFailed && <span className="text-xs text-amber-700">This device could not render the view.</span>}
        {which === 'view' && painting && <span className="text-xs text-blue-700" data-testid="sheet-painting">Painting the photoreal picture, about a minute…</span>}
        {which === 'view' && paintError && <span className="text-xs text-amber-700" data-testid="sheet-paint-error">{paintError}</span>}
        <div className="ml-auto flex items-center gap-3">
          {look && (which === 'view' || style === 'rendered') && <ArchStylePicker className="inline-flex items-center gap-1 text-xs" />}
          {which === 'plan' && renderUnderlay && (
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs" role="group" aria-label="Plan style">
              {(['rendered', 'drawn'] as const).map((k, i) => (
                <button key={k} type="button" aria-pressed={style === k} onClick={() => setStyle(k)} data-testid={`sheet-style-${k}`} className={seg(style === k, i === 0)}>
                  {k === 'rendered' ? 'Rendered' : 'Drawn'}
                </button>
              ))}
            </div>
          )}
          {which === 'view' && photoreal && rendering2 && (
            painted2?.key === key ? (
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs" role="group" aria-label="Picture">
                <button type="button" aria-pressed={showPainted} onClick={() => setShowPainted(true)} data-testid="sheet-picture-photoreal" className={seg(showPainted, true)}>Photoreal</button>
                <button type="button" aria-pressed={!showPainted} onClick={() => setShowPainted(false)} data-testid="sheet-picture-model" className={seg(!showPainted, false)}>Model</button>
              </div>
            ) : (
              <button type="button" onClick={paint} disabled={painting} data-testid="sheet-photoreal" title="Repaint the rendering as a photograph. Sends the picture, and only the picture, to an image model." className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs hover:bg-gray-700 disabled:opacity-50">Photoreal</button>
            )
          )}
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs" role="group" aria-label="Page size">
            {(['slide', 'tabloid', 'letter'] as SheetSize[]).map((k, i) => (
              <button key={k} type="button" aria-pressed={size === k} onClick={() => setSize(k)} data-testid={`sheet-size-${k}`} className={seg(size === k, i === 0)}>
                {k === 'letter' ? 'Letter' : k === 'tabloid' ? '11 × 17' : 'Slide 16:9'}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500" data-testid="sheet-list" title="What a full set contains">
            {sheetList.map(x => `${x.number} ${x.state}`).join(' · ')}
          </span>
          <details className="relative" data-testid="sheet-more-formats">
            <summary className="list-none cursor-pointer px-3 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 select-none">More formats</summary>
            <div className="absolute right-0 mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-1 flex flex-col w-44">
              <button type="button" onClick={downloadPng} disabled={pngBusy} data-testid="sheet-download-png" title="A picture of this sheet at 200 dpi, for a slide" className="text-left px-3 py-1.5 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50">PNG image of this sheet</button>
              <button type="button" onClick={download} data-testid="sheet-download" title="The sheet as a vector drawing" className="text-left px-3 py-1.5 rounded text-gray-700 hover:bg-gray-50">SVG drawing of this sheet</button>
            </div>
          </details>
          <button type="button" onClick={() => { void printSet(); }} disabled={setBusy} data-testid="sheet-print-set" title="Opens the print dialog with every sheet. Choose Save as PDF there." className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">{(n => (n === 1 ? 'Save PDF · the one sheet' : `Save PDF · all ${n} sheets`))(sheetList.filter(x => x.included).length)}</button>
          <button type="button" onClick={print} data-testid="sheet-print" title="Opens the print dialog with this sheet. Choose Save as PDF there." className="px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Save PDF · {number}</button>
          <button type="button" onClick={onClose} aria-label="Close sheets" className="px-2 py-1 text-gray-500 hover:text-gray-900">Close</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-6 flex items-start justify-center">
        <div
          data-testid={which === 'plan' ? 'sheet-a01' : 'sheet-a02'}
          data-sheet-size={size}
          data-sheet-style={which === 'section' ? 'drawn' : which === 'plan' ? (picture ? 'rendered' : 'drawn') : viewPicture ? (viewPicture.ai ? 'photoreal' : 'rendered') : 'pending'}
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
