// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * Line Weight System: Civil plan drawing standards
 * 
 * Implements a visual hierarchy for site plan rendering that matches civil
 * engineering and architectural drawing conventions. Line weights establish
 * importance: property boundaries are heaviest, then building/lot lines, then
 * dimensions and annotations, with grids being the lightest.
 * 
 * All weights are in base pixels and scale with zoom (divide by zoom in the
 * rendering layer) to maintain consistent screen appearance at any zoom level.
 */

/**
 * LINE_WEIGHT: Canvas stroke widths in base pixels (apply `/ zoom` in layers)
 * 
 * Hierarchy (heavy → light):
 * - PROPERTY: Parcel boundaries, R.O.W., major property lines (heaviest)
 * - BUILDING: Building footprints, lot boundaries (medium-heavy)
 * - SETBACK: Setback edge overlays (medium - visible but subordinate to property)
 * - DIMENSION: Dimension lines, leaders, callouts (light)
 * - DETAIL: Interior detail lines (unit ticks, stall dividers) (very light)
 * - GRID: Background grid (hairline - barely visible)
 * 
 * Reference: Civil plan conventions typically use 0.7mm (heavy), 0.5mm (medium),
 * 0.35mm (light), 0.25mm (thin), 0.18mm (hairline). Our pixel values approximate
 * these relationships for screen rendering.
 */
export const LINE_WEIGHT = {
  /** Property boundaries, R.O.W., parcel edges - heaviest emphasis */
  PROPERTY: 2.5,
  
  /** Building footprints, lot boundaries - primary elements */
  BUILDING: 2.0,
  
  /** Setback edges - visible but subordinate to property lines */
  SETBACK: 2.5,
  
  /** Dimension lines, leaders, callouts - annotation weight */
  DIMENSION: 1.2,
  
  /** Interior building detail, stall dividers, unit ticks - subtle */
  DETAIL: 0.9,
  
  /** Background reference grid - hairline, barely visible */
  GRID: 0.6,
  
  /** Interactive handles (resize, rotate, vertex) - emphasized for UX */
  HANDLE: 1.5,
  
  /** Street/road casings in neighborhood context - background infrastructure */
  CONTEXT_STREET: 12, // metres in world space, not scaled by zoom
  
  /** Neighbor parcel outlines - subtle background context */
  CONTEXT_PARCEL: 0.8,
} as const;

/**
 * LINE_STYLE: Canvas dash patterns for semantic meaning
 * 
 * Patterns use [dash, gap] arrays for `ctx.setLineDash()`.
 * All values are in base units and should be scaled by zoom (divide by zoom).
 * 
 * Standards:
 * - SOLID: Existing conditions, built elements
 * - DASHED: Proposed work, setbacks, envelopes
 * - DOTTED: Reference lines, property lines in background
 * - LONG_DASH: Existing features being retained
 */
export const LINE_STYLE = {
  /** Solid line - built elements, existing conditions */
  SOLID: [] as number[],
  
  /** Dashed - proposed work, setbacks, buildable envelopes */
  DASHED: [8, 4] as [number, number],
  
  /** Long dash with short gap - property boundaries, parcel lines */
  PROPERTY: [10, 5] as [number, number],
  
  /** Dotted - reference lines, hidden lines */
  DOTTED: [2, 3] as [number, number],
  
  /** Long dash - existing features, context */
  LONG_DASH: [12, 6] as [number, number],
  
  /** Short dash - dimension lines, leaders */
  DIM_LEADER: [4, 3] as [number, number],
} as const;

/**
 * Apply line weight and style to a canvas context.
 * Automatically scales width by zoom and dash pattern.
 * 
 * @param ctx Canvas rendering context
 * @param weight Line weight constant from LINE_WEIGHT
 * @param zoom Current viewport zoom level
 * @param style Optional line style from LINE_STYLE (defaults to SOLID)
 */
export function applyLineStyle(
  ctx: CanvasRenderingContext2D,
  weight: number,
  zoom: number,
  style: readonly number[] = LINE_STYLE.SOLID
): void {
  ctx.lineWidth = weight / zoom;
  if (style.length > 0) {
    ctx.setLineDash(style.map(v => v / zoom));
  } else {
    ctx.setLineDash([]);
  }
}

/**
 * Hierarchy verification (for documentation/testing):
 * PROPERTY > BUILDING > SETBACK > DIMENSION > DETAIL > GRID
 */
export const WEIGHT_HIERARCHY = [
  'PROPERTY',
  'BUILDING', 
  'SETBACK',
  'DIMENSION',
  'DETAIL',
  'GRID',
] as const;
