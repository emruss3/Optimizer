// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * OverlayLayer: Screen-space UI overlays rendering layer
 * 
 * Renders fixed screen-space UI elements that float above the plan:
 * - North arrow (top-right, static orientation)
 * - Legend (bottom-left, identifies all colors on the sheet)
 * - Scale bar (bottom-right)
 * - Title block (top-right, project metadata)
 * - Draft watermark (when in draft mode)
 * 
 * These are drawn in screen coordinates after the world transform is popped.
 */

import type { Element } from '../../../engine/types';
import type { ParcelTopoView } from '../../../features/site-plan/api/parcelTopo';
import type { SheetTitleBlock } from '../../../features/site-plan/api/sheetAnnotations';
import { pickScaleBarFt } from '../planRendering';
import { UNIT_COLORS } from '../unitLayout';

interface OverlayLayerProps {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  cssWidth: number;
  cssHeight: number;
  elements: Element[];
  topo?: ParcelTopoView | null;
  sheet?: SheetTitleBlock | null;
  draftMode?: boolean;
}

export function renderOverlayLayer({
  ctx,
  zoom,
  cssWidth,
  cssHeight,
  elements,
  topo,
  sheet,
  draftMode = false,
}: OverlayLayerProps): void {
  // Screen-space chrome (after the world transform is popped)
  renderScaleBar(ctx, zoom, cssWidth, cssHeight);
  renderLegend(ctx, cssHeight, elements, topo);
  renderNorthArrow(ctx, cssWidth);
  renderTitleBlock(ctx, zoom, cssWidth, sheet);
  if (draftMode) {
    renderDraftWatermark(ctx, cssWidth, cssHeight);
  }
}

// Screen-space north arrow (top-right)
function renderNorthArrow(
  ctx: CanvasRenderingContext2D,
  cssW: number
): void {
  const x = cssW - 30;
  const y = 34;
  ctx.save();
  ctx.strokeStyle = '#475569';
  ctx.fillStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.lineTo(x, y - 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x - 4.5, y - 3);
  ctx.lineTo(x + 4.5, y - 3);
  ctx.closePath();
  ctx.fill();
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N', x, y + 13);
  ctx.restore();
}

// Screen-space legend (bottom-left)
function renderLegend(
  ctx: CanvasRenderingContext2D,
  cssH: number,
  elements: Element[],
  topo?: ParcelTopoView | null
): void {
  // Townhome plans key their party-wall dwellings
  const thEl = elements.find(e => (e.properties as Record<string, unknown> | undefined)?.th);
  const thW = (thEl?.properties as { th?: { unitWFt?: number | null } } | undefined)?.th?.unitWFt;
  const unitRows: Array<[string, string]> = thEl
    ? [[`Townhome${thW ? ` · ${Math.round(thW)} ft wide` : ''}`, UNIT_COLORS['townhome']]]
    : [
        ['Studio · 550 SF', UNIT_COLORS['studio']],
        ['1 Bed · 700 SF', UNIT_COLORS['1br']],
        ['2 Bed · 1,100 SF', UNIT_COLORS['2br']],
        ['3 Bed · 1,600 SF', UNIT_COLORS['3br']],
      ];
  // Subdivision vocabulary
  const isSubdivision = elements.some(e => e.id.startsWith('subdiv-'));
  const entries: Array<[string, string]> = isSubdivision
    ? [
        ['Street (public ROW)', '#A9B4C0'],
        ['Alley', '#D5DCE4'],
        ['Lot', '#F8FAFC'],
        ['Greenway (floodplain / wetland)', '#99F6E4'],
        ['Court', '#BBF7D0'],
        ['Amenity', '#86EFAC'],
        ['Unassigned land', '#F1F5F9'],
        ['Front setback', '#2563EB'],
        ['Rear setback', '#D97706'],
        ['Side setback', '#64748B'],
      ]
    : [
        ...unitRows,
        ['Core / stairs', '#94A3B8'],
        ['Parking', '#E2E8F0'],
        ['Drive / aisle', '#9AA8B8'],
        ['Open space', '#BBF7D0'],
        ['Amenity / pool', '#F59E0B'],
        ['Front setback', '#2563EB'],
        ['Rear setback', '#D97706'],
        ['Side setback', '#64748B'],
      ];
  const hasLots = elements.some(e => e.type === 'other' && /^Lot \d+$/.test(e.name ?? ''));
  if (hasLots && !isSubdivision) entries.push(['Lot line', '#F8FAFC']);
  if (topo && topo.contours.length > 0) entries.push(['Existing contour · 1 ft (index 5 ft)', 'contour']);

  const pad = 8;
  const rowH = 16;
  ctx.save();
  ctx.font = '500 10px Inter, system-ui, sans-serif';
  let labelW = 0;
  for (const [label] of entries) labelW = Math.max(labelW, ctx.measureText(label).width);
  const boxW = Math.max(isSubdivision ? 196 : 132, Math.ceil(labelW) + pad * 2 + 16);
  const boxH = entries.length * rowH + pad * 2 - 4;
  const x = 12;
  const y = cssH - boxH - 12;

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  entries.forEach(([label, color], i) => {
    const rowY = y + pad + i * rowH + rowH / 2 - 2;
    if (color === 'contour') {
      ctx.strokeStyle = 'rgba(120, 72, 32, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + pad, rowY + 3);
      ctx.quadraticCurveTo(x + pad + 5, rowY - 6, x + pad + 10, rowY - 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x + pad, rowY - 5, 10, 10, 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#475569';
    ctx.fillText(label, x + pad + 16, rowY);
  });
  ctx.restore();
}

// Screen-space scale bar
function renderScaleBar(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  cssW: number,
  cssH: number
): void {
  const { ft, px } = pickScaleBarFt(zoom);
  const x2 = cssW - 20;
  const x1 = x2 - px;
  const y = cssH - 18;

  ctx.save();
  ctx.strokeStyle = '#475569';
  ctx.fillStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.moveTo(x1, y - 4);
  ctx.lineTo(x1, y + 4);
  ctx.moveTo(x2, y - 4);
  ctx.lineTo(x2, y + 4);
  ctx.stroke();
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${ft} ft`, (x1 + x2) / 2, y - 4);
  ctx.restore();
}

// Screen-space title block
function renderTitleBlock(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  cssW: number,
  sheet?: SheetTitleBlock | null
): void {
  if (!sheet) return;
  const pad = 10;
  const y = 12;
  const maxW = Math.min(320, Math.max(200, cssW * 0.3));
  const rows: Array<{ text: string; font: string; color: string; h: number; gap: number }> = [];
  ctx.save();
  const add = (text: string, size: number, weight: number, color: string, gap = 0) => {
    const font = `${weight} ${size}px Inter, system-ui, sans-serif`;
    ctx.font = font;
    wrapText(ctx, text, maxW).forEach((t, i) => rows.push({ text: t, font, color, h: Math.round(size * 1.3), gap: i === 0 ? gap : 0 }));
  };
  // 1 in on screen = 96 px = 96/zoom m
  const scaleFt = Math.round((96 / zoom) * 3.28084);
  add(sheet.project, 12, 700, '#0F172A');
  add(sheet.title, 10, 700, '#1E3A8A', 2);
  if (sheet.subtitle) add(sheet.subtitle, 10, 500, '#475569', 1);
  sheet.notes.forEach((note, i) => add(note, 8.5, 400, '#64748B', i === 0 ? 5 : 1));
  add(`SCALE 1" = ${scaleFt}' on screen · ${sheet.date}`, 9, 500, '#475569', 5);
  add('CONCEPT — NOT FOR CONSTRUCTION', 9.5, 700, '#B45309', 2);
  let boxW = 0;
  for (const r of rows) {
    ctx.font = r.font;
    boxW = Math.max(boxW, ctx.measureText(r.text).width);
  }
  boxW = Math.ceil(boxW) + pad * 2;
  const boxH = rows.reduce((s, r) => s + r.h + r.gap, 0) + pad * 2 - 2;
  // right-aligned, leaving the north arrow its 50 px
  const x = Math.max(12, cssW - 52 - boxW);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let cy = y + pad;
  for (const r of rows) {
    cy += r.gap;
    ctx.font = r.font;
    ctx.fillStyle = r.color;
    ctx.fillText(r.text, x + pad, cy);
    cy += r.h;
  }
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(probe).width > maxW) {
      out.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) out.push(line);
  return out;
}

// Degraded-mode watermark
function renderDraftWatermark(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#B45309';
  ctx.font = '700 26px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let ty = cssH * 0.28; ty < cssH; ty += cssH * 0.44) {
    for (let tx = cssW * 0.3; tx < cssW; tx += cssW * 0.5) {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(-Math.PI / 10);
      ctx.fillText('DRAFT — default assumptions', 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}
