// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { Element } from '../engine/types';

const generateId = () => Math.random().toString(36).substr(2, 9);

export class ElementService {
  /**
   * Create a new element at the specified position
   */
  static createElement(x: number, y: number, type: 'building' | 'parking' | 'greenspace', existingCount = 0): Element {
    let width: number, height: number;
    let color: string;
    
    switch (type) {
      case 'building':
        width = 60;
        height = 40;
        color = '#3B82F6';
        break;
      case 'parking':
        width = 120;
        height = 80;
        color = '#10B981';
        break;
      case 'greenspace':
        width = 60;
        height = 60;
        color = '#059669';
        break;
    }

    const coords: number[][] = [
      [x - width / 2, y - height / 2],
      [x + width / 2, y - height / 2],
      [x + width / 2, y + height / 2],
      [x - width / 2, y + height / 2],
      [x - width / 2, y - height / 2]
    ];

    return {
      id: generateId(),
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${existingCount + 1}`,
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: {
        areaSqFt: width * height,
        color
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'user-drawn'
      }
    };
  }

  /**
   * Delete elements by IDs
   */
  static deleteElements(elements: Element[], idsToDelete: Set<string>): Element[] {
    return elements.filter(el => !idsToDelete.has(el.id));
  }

  /**
   * Copy elements with offset
   */
  static copyElements(elements: Element[], idsToCopy: Set<string>, offsetX = 20, offsetY = 20): Element[] {
    return elements
      .filter(el => idsToCopy.has(el.id))
      .map(element => {
        const coords = element.geometry.coordinates[0].map(([x, y]) => [x + offsetX, y + offsetY]);
        return {
          ...element,
          id: generateId(),
          name: `${element.name} (copy)`,
          geometry: {
            ...element.geometry,
            coordinates: [coords]
          },
          metadata: {
            ...element.metadata,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        };
      });
  }

  /**
   * Move elements by delta
   */
  static moveElements(elements: Element[], idsToMove: Set<string>, deltaX: number, deltaY: number, originalVertices?: Array<{ id: string; coords: number[][] }>): Element[] {
    return elements.map(element => {
      if (!idsToMove.has(element.id)) return element;
      
      const originalCoords = originalVertices?.find(v => v.id === element.id)?.coords || element.geometry.coordinates[0];
      const coords = originalCoords.map(([x, y]: number[]) => [x + deltaX, y + deltaY]);
      
      return {
        ...element,
        geometry: {
          ...element.geometry,
          coordinates: [coords]
        },
        metadata: {
          ...element.metadata,
          updatedAt: new Date().toISOString()
        }
      };
    });
  }

  /**
   * Check if a point is inside an element
   */
  static isPointInElement(x: number, y: number, element: Element): boolean {
    const coords = element.geometry.coordinates[0];
    let inside = false;
    
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      if (((coords[i][1] > y) !== (coords[j][1] > y)) &&
          (x < (coords[j][0] - coords[i][0]) * (y - coords[i][1]) / (coords[j][1] - coords[i][1]) + coords[i][0])) {
        inside = !inside;
      }
    }
    
    return inside;
  }

  /**
   * Find element at point
   */
  static findElementAtPoint(elements: Element[], x: number, y: number): Element | null {
    // Check in reverse order (top-most first)
    for (let i = elements.length - 1; i >= 0; i--) {
      if (this.isPointInElement(x, y, elements[i])) {
        return elements[i];
      }
    }
    return null;
  }

  /**
   * Calculate element center from coordinates
   */
  static calculateElementCenter(element: Element): { x: number; y: number } {
    const coords = element.geometry.coordinates[0];
    const sumX = coords.reduce((sum, [x]) => sum + x, 0);
    const sumY = coords.reduce((sum, [, y]) => sum + y, 0);
    return {
      x: sumX / coords.length,
      y: sumY / coords.length
    };
  }

  /**
   * Rotate a point around a center
   */
  static rotatePoint(point: { x: number; y: number }, center: { x: number; y: number }, angleDegrees: number): { x: number; y: number } {
    const radians = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
  }

  /**
   * Rotate element around its center or specified point
   */
  static rotateElement(element: Element, angleDegrees: number, rotationCenter?: { x: number; y: number }): Element {
    const center = rotationCenter || this.calculateElementCenter(element);
    const coords = element.geometry.coordinates[0];
    const rotatedCoords = coords.map(([x, y]) => {
      const rotated = this.rotatePoint({ x, y }, center, angleDegrees);
      return [rotated.x, rotated.y];
    });

    return {
      ...element,
      geometry: {
        ...element.geometry,
        coordinates: [rotatedCoords]
      },
      properties: {
        ...element.properties,
        rotation: (element.properties.rotation || 0) + angleDegrees
      },
      metadata: {
        ...element.metadata,
        updatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Calculate angle from center to point
   */
  static calculateAngle(center: { x: number; y: number }, point: { x: number; y: number }): number {
    return Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI);
  }

  /**
   * Normalize angle to 0-360 range
   */
  static normalizeAngle(angle: number): number {
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;
    return angle;
  }

  /**
   * Update a single vertex in an element
   */
  static updateVertex(element: Element, vertexIndex: number, x: number, y: number): Element {
    const coords = [...element.geometry.coordinates[0]];
    if (vertexIndex >= 0 && vertexIndex < coords.length) {
      coords[vertexIndex] = [x, y];
      // If it's the last vertex and matches the first, update both
      if (vertexIndex === coords.length - 1 && coords.length > 0) {
        coords[0] = [x, y];
      }
    }

    return {
      ...element,
      geometry: {
        ...element.geometry,
        coordinates: [coords]
      },
      metadata: {
        ...element.metadata,
        updatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Get element bounds
   */
  static getElementBounds(element: Element): { minX: number; minY: number; maxX: number; maxY: number } {
    const coords = element.geometry.coordinates[0];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    coords.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    return { minX, minY, maxX, maxY };
  }

  /**
   * Check if point is near a vertex (for vertex selection)
   */
  static findNearestVertex(element: Element, x: number, y: number, threshold = 10): { vertexIndex: number; distance: number } | null {
    const coords = element.geometry.coordinates[0];
    let nearest: { vertexIndex: number; distance: number } | null = null;

    coords.forEach(([vx, vy], index) => {
      const distance = Math.sqrt(Math.pow(x - vx, 2) + Math.pow(y - vy, 2));
      if (distance < threshold && (!nearest || distance < nearest.distance)) {
        nearest = { vertexIndex: index, distance };
      }
    });

    return nearest;
  }

  /**
   * Align elements
   */
  static alignElements(elements: Element[], idsToAlign: Set<string>, alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): Element[] {
    const elementsToAlign = elements.filter(el => idsToAlign.has(el.id));
    if (elementsToAlign.length < 2) return elements;

    let referenceValue = 0;
    const bounds = elementsToAlign.map(el => this.getElementBounds(el));

    if (alignment === 'left') {
      referenceValue = Math.min(...bounds.map(b => b.minX));
    } else if (alignment === 'right') {
      referenceValue = Math.max(...bounds.map(b => b.maxX));
    } else if (alignment === 'center') {
      const minX = Math.min(...bounds.map(b => b.minX));
      const maxX = Math.max(...bounds.map(b => b.maxX));
      referenceValue = (minX + maxX) / 2;
    } else if (alignment === 'top') {
      referenceValue = Math.min(...bounds.map(b => b.minY));
    } else if (alignment === 'bottom') {
      referenceValue = Math.max(...bounds.map(b => b.maxY));
    } else if (alignment === 'middle') {
      const minY = Math.min(...bounds.map(b => b.minY));
      const maxY = Math.max(...bounds.map(b => b.maxY));
      referenceValue = (minY + maxY) / 2;
    }

    return elements.map(element => {
      if (!idsToAlign.has(element.id)) return element;

      const elementBounds = this.getElementBounds(element);
      let deltaX = 0;
      let deltaY = 0;

      if (alignment === 'left') {
        deltaX = referenceValue - elementBounds.minX;
      } else if (alignment === 'right') {
        deltaX = referenceValue - elementBounds.maxX;
      } else if (alignment === 'center') {
        const centerX = (elementBounds.minX + elementBounds.maxX) / 2;
        deltaX = referenceValue - centerX;
      } else if (alignment === 'top') {
        deltaY = referenceValue - elementBounds.minY;
      } else if (alignment === 'bottom') {
        deltaY = referenceValue - elementBounds.maxY;
      } else if (alignment === 'middle') {
        const centerY = (elementBounds.minY + elementBounds.maxY) / 2;
        deltaY = referenceValue - centerY;
      }

      const coords = element.geometry.coordinates[0].map(([x, y]) => [x + deltaX, y + deltaY]);
      return {
        ...element,
        geometry: {
          ...element.geometry,
          coordinates: [coords]
        },
        metadata: {
          ...element.metadata,
          updatedAt: new Date().toISOString()
        }
      };
    });
  }
}

