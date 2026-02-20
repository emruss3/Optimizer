// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { Polygon } from 'geojson';
import type { BuildingSpec, SiteState } from './model';
import { intersection, difference, isPointInPolygon, bbox, areaM2, polygons } from './geometry';

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Rotate a point (x, y) about the origin by (cos, sin), then translate by (tx, ty).
 */
function xform(x: number, y: number, cos: number, sin: number, tx: number, ty: number): number[] {
  return [x * cos - y * sin + tx, x * sin + y * cos + ty];
}

/**
 * Build a closed GeoJSON ring from local-space points, applying rotation + translation.
 */
function buildRing(
  localPoints: number[][],
  cos: number,
  sin: number,
  tx: number,
  ty: number
): number[][] {
  const ring = localPoints.map(([x, y]) => xform(x, y, cos, sin, tx, ty));
  ring.push([ring[0][0], ring[0][1]]); // close
  return ring;
}

/**
 * Get all vertices of a footprint polygon (excluding the closing duplicate).
 * Handles polygons with holes (courtyard-wrap) — checks all rings.
 */
function getAllVertices(poly: Polygon): number[][] {
  const verts: number[][] = [];
  for (const ring of poly.coordinates) {
    // Skip closing vertex (last == first)
    for (let i = 0; i < ring.length - 1; i++) {
      verts.push(ring[i]);
    }
  }
  return verts;
}

// ─── footprint generators ────────────────────────────────────────────────────

/**
 * Build building footprint polygon from BuildingSpec.
 * Supports: MF_BAR_V1, MF_L_SHAPE, MF_PODIUM, MF_U_SHAPE, MF_COURTYARD_WRAP, CUSTOM.
 */
export function buildBuildingFootprint(spec: BuildingSpec): Polygon {
  const { anchor, widthM, depthM, rotationRad } = spec;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const tx = anchor.x;
  const ty = anchor.y;

  switch (spec.type) {
    case 'MF_L_SHAPE':
      return buildLShapeFootprint(spec, cos, sin, tx, ty);
    case 'MF_PODIUM':
      // Podium footprint is the full rectangle (same as bar); tower vs podium floors
      // are handled in GFA calculations, not footprint shape.
      return buildRectFootprint(widthM, depthM, cos, sin, tx, ty);
    case 'MF_U_SHAPE':
      return buildUShapeFootprint(spec, cos, sin, tx, ty);
    case 'MF_COURTYARD_WRAP':
      return buildCourtyardWrapFootprint(spec, cos, sin, tx, ty);
    case 'MF_BAR_V1':
    case 'CUSTOM':
    default:
      return buildRectFootprint(widthM, depthM, cos, sin, tx, ty);
  }
}

/**
 * Rectangle (bar) footprint centred on anchor.
 */
function buildRectFootprint(
  widthM: number,
  depthM: number,
  cos: number,
  sin: number,
  tx: number,
  ty: number
): Polygon {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const corners = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd]
  ];
  return { type: 'Polygon', coordinates: [buildRing(corners, cos, sin, tx, ty)] };
}

/**
 * L-shape footprint.
 * Main bar (widthM × depthM) centred on anchor, plus a wing extending from bottom-right.
 *
 *   ┌──────────┐
 *   │  main    │
 *   │          ├───────┐
 *   └──────────┤  wing │
 *              └───────┘
 */
function buildLShapeFootprint(
  spec: BuildingSpec,
  cos: number,
  sin: number,
  tx: number,
  ty: number
): Polygon {
  const hw = spec.widthM / 2;
  const hd = spec.depthM / 2;
  const ww = spec.wingWidth ?? hw * 0.6;
  const wd = spec.wingDepth ?? spec.depthM;

  // L-shape vertices (CCW), centred on anchor
  // Main rect top-left → top-right → wing junction → wing outer → wing bottom → bottom-left
  const pts = [
    [-hw, -hd],             // top-left of main
    [hw, -hd],              // top-right of main
    [hw, hd - wd],          // right edge, where wing starts
    [hw + ww, hd - wd],     // wing top-right
    [hw + ww, hd],          // wing bottom-right
    [-hw, hd],              // bottom-left of main
  ];

  return { type: 'Polygon', coordinates: [buildRing(pts, cos, sin, tx, ty)] };
}

/**
 * U-shape footprint.
 * Rectangle with a courtyard cutout on one side (bottom).
 *
 *   ┌──────────────┐
 *   │              │
 *   │  ┌────────┐  │
 *   │  │courtyard│  │
 *   └──┘        └──┘
 */
function buildUShapeFootprint(
  spec: BuildingSpec,
  cos: number,
  sin: number,
  tx: number,
  ty: number
): Polygon {
  const hw = spec.widthM / 2;
  const hd = spec.depthM / 2;
  const cw = (spec.courtyardWidth ?? spec.widthM * 0.5) / 2;
  const cd = spec.courtyardDepth ?? spec.depthM * 0.5;

  // Outer rectangle with courtyard notch at bottom (CCW)
  const pts = [
    [-hw, -hd],     // top-left
    [hw, -hd],      // top-right
    [hw, hd],       // bottom-right
    [cw, hd],       // courtyard bottom-right
    [cw, hd - cd],  // courtyard top-right
    [-cw, hd - cd], // courtyard top-left
    [-cw, hd],      // courtyard bottom-left
    [-hw, hd],      // bottom-left
  ];

  return { type: 'Polygon', coordinates: [buildRing(pts, cos, sin, tx, ty)] };
}

/**
 * Courtyard-wrap footprint.
 * Full rectangle ring: outer rectangle minus inner courtyard.
 * Represented as a polygon with a hole.
 *
 *   ┌──────────────┐
 *   │ ┌──────────┐ │
 *   │ │ courtyard│ │
 *   │ └──────────┘ │
 *   └──────────────┘
 */
function buildCourtyardWrapFootprint(
  spec: BuildingSpec,
  cos: number,
  sin: number,
  tx: number,
  ty: number
): Polygon {
  const hw = spec.widthM / 2;
  const hd = spec.depthM / 2;
  const cw = (spec.courtyardWidth ?? spec.widthM * 0.6) / 2;
  const cd = (spec.courtyardDepth ?? spec.depthM * 0.5) / 2;

  // Outer ring (CCW)
  const outer = buildRing(
    [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]],
    cos, sin, tx, ty
  );

  // Inner ring (CW — hole)
  const inner = buildRing(
    [[-cw, -cd], [-cw, cd], [cw, cd], [cw, -cd]],
    cos, sin, tx, ty
  );

  return { type: 'Polygon', coordinates: [outer, inner] };
}

// ─── clamping ────────────────────────────────────────────────────────────────

/**
 * Check if all vertices of a footprint are inside the envelope.
 * Works with non-rectangular polygons and polygons with holes.
 */
function footprintInsideEnvelope(footprint: Polygon, envelope: Polygon): boolean {
  const verts = getAllVertices(footprint);
  return verts.every(coord => isPointInPolygon(coord, envelope.coordinates[0]));
}

/**
 * Clamp building to envelope and (optionally) avoid overlaps with other buildings.
 *
 * @param skipOverlapCheck - When true, skip the expensive polygon-intersection overlap
 *   tests. Use this during SA iterations where only containment matters; the full
 *   overlap check is only needed for final result rendering.
 */
export function clampBuildingToEnvelope(
  spec: BuildingSpec,
  envelope: Polygon,
  otherBuildings: BuildingSpec[],
  skipOverlapCheck = false
): BuildingSpec {
  const footprint = buildBuildingFootprint(spec);

  // Check if building is completely inside envelope
  const allInside = footprintInsideEnvelope(footprint, envelope);

  if (allInside) {
    if (skipOverlapCheck) return spec; // fast path for SA iterations

    // Check for overlaps with other buildings
    const hasOverlap = otherBuildings.some(other => {
      if (other.id === spec.id) return false;
      return polygonsOverlap(footprint, buildBuildingFootprint(other));
    });
    if (!hasOverlap) return spec;
  }

  // Building needs adjustment — move to a valid position inside the envelope.
  let newAnchor = { ...spec.anchor };

  // Strategy 1: Move anchor to envelope bbox center
  const envBbox = bbox(envelope);
  const envCenterX = (envBbox.minX + envBbox.maxX) / 2;
  const envCenterY = (envBbox.minY + envBbox.maxY) / 2;
  const testSpec: BuildingSpec = { ...spec, anchor: { x: envCenterX, y: envCenterY } };
  const testFootprint = buildBuildingFootprint(testSpec);

  if (footprintInsideEnvelope(testFootprint, envelope)) {
    const ok = skipOverlapCheck || !otherBuildings.some(other => {
      if (other.id === spec.id) return false;
      return polygonsOverlap(testFootprint, buildBuildingFootprint(other));
    });
    if (ok) newAnchor = { x: envCenterX, y: envCenterY };
  }

  // Strategy 2: Nudge toward envelope centre in small steps
  if (newAnchor.x === spec.anchor.x && newAnchor.y === spec.anchor.y) {
    const stepSize = Math.min(spec.widthM, spec.depthM) * 0.1;
    const dx = envCenterX - spec.anchor.x;
    const dy = envCenterY - spec.anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const steps = Math.ceil(dist / stepSize);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const candidateAnchor = { x: spec.anchor.x + dx * t, y: spec.anchor.y + dy * t };
        const candidateSpec: BuildingSpec = { ...spec, anchor: candidateAnchor };
        const candidateFootprint = buildBuildingFootprint(candidateSpec);
        if (footprintInsideEnvelope(candidateFootprint, envelope)) {
          const ok = skipOverlapCheck || !otherBuildings.some(other => {
            if (other.id === spec.id) return false;
            return polygonsOverlap(candidateFootprint, buildBuildingFootprint(other));
          });
          if (ok) { newAnchor = candidateAnchor; break; }
        }
      }
    }
  }

  // Strategy 3: Deterministic grid nudges (only when overlap checking enabled)
  if (!skipOverlapCheck && newAnchor.x === spec.anchor.x && newAnchor.y === spec.anchor.y) {
    const offsetRange = Math.min(spec.widthM, spec.depthM);
    const step = Math.max(0.5, offsetRange * 0.1);
    const steps = Math.max(1, Math.floor(offsetRange / step));
    outer: for (let ring = 1; ring <= steps; ring++) {
      const offset = ring * step;
      for (let dx = -offset; dx <= offset; dx += step) {
        for (let dy = -offset; dy <= offset; dy += step) {
          const candidateAnchor = { x: spec.anchor.x + dx, y: spec.anchor.y + dy };
          const candidateSpec: BuildingSpec = { ...spec, anchor: candidateAnchor };
          const candidateFootprint = buildBuildingFootprint(candidateSpec);
          if (footprintInsideEnvelope(candidateFootprint, envelope)) {
            const ok = !otherBuildings.some(other => {
              if (other.id === spec.id) return false;
              return polygonsOverlap(candidateFootprint, buildBuildingFootprint(other));
            });
            if (ok) { newAnchor = candidateAnchor; break outer; }
          }
        }
      }
    }
  }

  // Strategy 4: Shrink building progressively until it fits at envelope center
  if (newAnchor.x === spec.anchor.x && newAnchor.y === spec.anchor.y) {
    const cx = envCenterX;
    const cy = envCenterY;
    for (let scale = 0.9; scale >= 0.3; scale -= 0.1) {
      const shrunkSpec: BuildingSpec = {
        ...spec,
        anchor: { x: cx, y: cy },
        widthM: Math.max(8, spec.widthM * scale),
        depthM: Math.max(8, spec.depthM * scale),
      };
      const shrunkFootprint = buildBuildingFootprint(shrunkSpec);
      if (footprintInsideEnvelope(shrunkFootprint, envelope)) {
        const ok = skipOverlapCheck || !otherBuildings.some(other => {
          if (other.id === spec.id) return false;
          return polygonsOverlap(shrunkFootprint, buildBuildingFootprint(other));
        });
        if (ok) return { ...shrunkSpec, locked: spec.locked };
      }
    }
    // Strategy 5: Force tiny building at centroid — absolute last resort
    const tinySpec: BuildingSpec = { ...spec, anchor: { x: cx, y: cy }, widthM: 10, depthM: 10, rotationRad: 0 };
    if (footprintInsideEnvelope(buildBuildingFootprint(tinySpec), envelope)) {
      return { ...tinySpec, locked: spec.locked };
    }
  }

  return {
    ...spec,
    anchor: spec.locked?.position ? spec.anchor : newAnchor,
    rotationRad: spec.locked?.rotation ? spec.rotationRad : spec.rotationRad
  };
}

/**
 * Check if two polygons overlap (intersection area > 0)
 */
function polygonsOverlap(poly1: Polygon, poly2: Polygon): boolean {
  const clipped = intersection(poly1, poly2);
  const clippedPolys = polygons(clipped);
  const overlapArea = clippedPolys.reduce((sum, poly) => sum + areaM2(poly), 0);
  return overlapArea > 0.5;
}
