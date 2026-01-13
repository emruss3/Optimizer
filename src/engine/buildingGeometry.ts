// ┬⌐ 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { Polygon } from 'geojson';
import type { BuildingSpec, SiteState } from './model';
import { intersection, pointInPoly, bbox, area } from './geometry';

/**
 * Build building footprint polygon from BuildingSpec
 * Creates a rectangle rotated about the anchor point
 */
export function buildBuildingFootprint(spec: BuildingSpec): Polygon {
  const { anchor, widthM, depthM, rotationRad } = spec;

  // Create rectangle centered at anchor (or corner-based, depending on type)
  // For MF_BAR_V1, we'll use center anchor
  const halfWidth = widthM / 2;
  const halfDepth = depthM / 2;

  // Four corners relative to anchor (before rotation)
  const corners = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth]
  ];

  // Rotate corners about origin, then translate to anchor
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  const rotatedCorners = corners.map(([x, y]) => {
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return [anchor.x + rx, anchor.y + ry];
  });

  // Close the ring
  rotatedCorners.push([rotatedCorners[0][0], rotatedCorners[0][1]]);

  return {
    type: 'Polygon',
    coordinates: [rotatedCorners]
  };
}

/**
 * Clamp building to envelope and avoid overlaps
 * Snaps building to nearest feasible pose
 *
 * v1: Simple implementation - projects anchor to nearest point inside envelope
 * and nudges away from collisions
 */
export function clampBuildingToEnvelope(
  spec: BuildingSpec,
  envelope: Polygon,
  otherBuildings: BuildingSpec[]
): BuildingSpec {
  const footprint = buildBuildingFootprint(spec);
  const footprintBbox = bbox(footprint);
  const envelopeBbox = bbox(envelope);

  // Check if building is completely outside envelope
  const allCornersInside = footprint.coordinates[0].slice(0, -1).every(coord =>
    pointInPoly(coord, envelope)
  );

  if (allCornersInside) {
    // Check for overlaps with other buildings
    const hasOverlap = otherBuildings.some(other => {
      if (other.id === spec.id) return false;
      const otherFootprint = buildBuildingFootprint(other);
      return polygonsOverlap(footprint, otherFootprint);
    });

    if (!hasOverlap) {
      // Building is valid, return as-is
      return spec;
    }
  }

  // Building needs adjustment
  let newAnchor = { ...spec.anchor };
  let newRotation = spec.rotationRad;

  // Strategy 1: Try to move anchor to center of envelope
  const envBbox = bbox(envelope);
  const envCenterX = (envBbox.minX + envBbox.maxX) / 2;
  const envCenterY = (envBbox.minY + envBbox.maxY) / 2;

  // Check if center position works
  const testSpec: BuildingSpec = {
    ...spec,
    anchor: { x: envCenterX, y: envCenterY }
  };
  const testFootprint = buildBuildingFootprint(testSpec);
  const testAllInside = testFootprint.coordinates[0].slice(0, -1).every(coord =>
    pointInPoly(coord, envelope)
  );

  if (testAllInside) {
    // Check for overlaps at center position
    const testHasOverlap = otherBuildings.some(other => {
      if (other.id === spec.id) return false;
      const otherFootprint = buildBuildingFootprint(other);
      return polygonsOverlap(testFootprint, otherFootprint);
    });

    if (!testHasOverlap) {
      newAnchor = { x: envCenterX, y: envCenterY };
    }
  }

  // Strategy 2: If center doesn't work, try nudging from current position
  if (newAnchor.x === spec.anchor.x && newAnchor.y === spec.anchor.y) {
    // Try moving toward envelope center in small steps
    const stepSize = Math.min(spec.widthM, spec.depthM) * 0.1;
    const dx = envCenterX - spec.anchor.x;
    const dy = envCenterY - spec.anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const steps = Math.ceil(dist / stepSize);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const candidateAnchor = {
          x: spec.anchor.x + dx * t,
          y: spec.anchor.y + dy * t
        };

        const candidateSpec: BuildingSpec = {
          ...spec,
          anchor: candidateAnchor
        };
        const candidateFootprint = buildBuildingFootprint(candidateSpec);
        const candidateAllInside = candidateFootprint.coordinates[0].slice(0, -1).every(coord =>
          pointInPoly(coord, envelope)
        );

        if (candidateAllInside) {
          const candidateHasOverlap = otherBuildings.some(other => {
            if (other.id === spec.id) return false;
            const otherFootprint = buildBuildingFootprint(other);
            return polygonsOverlap(candidateFootprint, otherFootprint);
          });

          if (!candidateHasOverlap) {
            newAnchor = candidateAnchor;
            break;
          }
        }
      }
    }
  }

  // Strategy 3: If still no valid position, try small random offsets
  if (newAnchor.x === spec.anchor.x && newAnchor.y === spec.anchor.y) {
    const maxAttempts = 10;
    const offsetRange = Math.min(spec.widthM, spec.depthM);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = (attempt / maxAttempts) * Math.PI * 2;
      const offset = offsetRange * (0.5 + attempt * 0.1);
      const candidateAnchor = {
        x: spec.anchor.x + Math.cos(angle) * offset,
        y: spec.anchor.y + Math.sin(angle) * offset
      };

      const candidateSpec: BuildingSpec = {
        ...spec,
        anchor: candidateAnchor
      };
      const candidateFootprint = buildBuildingFootprint(candidateSpec);
      const candidateAllInside = candidateFootprint.coordinates[0].slice(0, -1).every(coord =>
        pointInPoly(coord, envelope)
      );

      if (candidateAllInside) {
        const candidateHasOverlap = otherBuildings.some(other => {
          if (other.id === spec.id) return false;
          const otherFootprint = buildBuildingFootprint(other);
          return polygonsOverlap(candidateFootprint, otherFootprint);
        });

        if (!candidateHasOverlap) {
          newAnchor = candidateAnchor;
          break;
        }
      }
    }
  }

  // Return clamped spec (respect locks)
  return {
    ...spec,
    anchor: spec.locked?.position ? spec.anchor : newAnchor,
    rotationRad: spec.locked?.rotation ? spec.rotationRad : newRotation
  };
}

/**
 * Check if two polygons overlap (simplified - uses bbox + point checks)
 */
function polygonsOverlap(poly1: Polygon, poly2: Polygon): boolean {
  const bbox1 = bbox(poly1);
  const bbox2 = bbox(poly2);

  // Quick bbox check
  if (bbox1.maxX < bbox2.minX || bbox1.minX > bbox2.maxX ||
      bbox1.maxY < bbox2.minY || bbox1.minY > bbox2.maxY) {
    return false;
  }

  // Check if any corner of poly1 is inside poly2
  const corners1 = poly1.coordinates[0].slice(0, -1);
  for (const corner of corners1) {
    if (pointInPoly(corner, poly2)) {
      return true;
    }
  }

  // Check if any corner of poly2 is inside poly1
  const corners2 = poly2.coordinates[0].slice(0, -1);
  for (const corner of corners2) {
    if (pointInPoly(corner, poly1)) {
      return true;
    }
  }

  // For rectangles, if bboxes overlap and no corner is inside, they might still overlap
  // This is a simplified check - for production, use proper intersection
  return false;
}
