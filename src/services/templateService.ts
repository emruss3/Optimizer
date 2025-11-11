// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { Element } from '../engine/types';

const generateId = () => Math.random().toString(36).substr(2, 9);

export interface LayoutTemplate {
  id: string;
  name: string;
  type: 'single-family' | 'duplex' | 'apartment' | 'office' | 'retail' | 'hotel';
  description: string;
  minAreaSqFt: number;
  generate: (centerX: number, centerY: number, parcelBounds?: { minX: number; minY: number; maxX: number; maxY: number }) => Element[];
}

export class TemplateService {
  /**
   * Generate Single Family Home template
   */
  static generateSingleFamily(centerX: number, centerY: number): Element[] {
    const width = 60; // 60 feet
    const height = 40; // 40 feet
    const coords: number[][] = [
      [centerX - width / 2, centerY - height / 2],
      [centerX + width / 2, centerY - height / 2],
      [centerX + width / 2, centerY + height / 2],
      [centerX - width / 2, centerY + height / 2],
      [centerX - width / 2, centerY - height / 2]
    ];

    return [{
      id: generateId(),
      type: 'building',
      name: 'Single Family Home',
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: {
        areaSqFt: width * height,
        units: 1,
        color: '#10b981'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'template'
      }
    }];
  }

  /**
   * Generate Duplex template
   */
  static generateDuplex(centerX: number, centerY: number): Element[] {
    const width = 60; // 60 feet
    const height = 40; // 40 feet
    const coords: number[][] = [
      [centerX - width / 2, centerY - height / 2],
      [centerX + width / 2, centerY - height / 2],
      [centerX + width / 2, centerY + height / 2],
      [centerX - width / 2, centerY + height / 2],
      [centerX - width / 2, centerY - height / 2]
    ];

    return [{
      id: generateId(),
      type: 'building',
      name: 'Duplex (2 units)',
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: {
        areaSqFt: width * height,
        units: 2,
        color: '#8b5cf6'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'template'
      }
    }];
  }

  /**
   * Generate Apartment Complex template
   */
  static generateApartmentComplex(centerX: number, centerY: number, units = 20): Element[] {
    const elements: Element[] = [];
    const buildingWidth = 120; // 120 feet
    const buildingHeight = 80; // 80 feet
    
    // Main building
    const coords: number[][] = [
      [centerX - buildingWidth / 2, centerY - buildingHeight / 2],
      [centerX + buildingWidth / 2, centerY - buildingHeight / 2],
      [centerX + buildingWidth / 2, centerY + buildingHeight / 2],
      [centerX - buildingWidth / 2, centerY + buildingHeight / 2],
      [centerX - buildingWidth / 2, centerY - buildingHeight / 2]
    ];

    elements.push({
      id: generateId(),
      type: 'building',
      name: `Apartment Complex (${units} units)`,
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: {
        areaSqFt: buildingWidth * buildingHeight,
        units,
        color: '#3b82f6'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'template'
      }
    });

    // Add parking
    const parkingWidth = 120;
    const parkingHeight = 60;
    const parkingCoords: number[][] = [
      [centerX - parkingWidth / 2, centerY + buildingHeight / 2 + 10],
      [centerX + parkingWidth / 2, centerY + buildingHeight / 2 + 10],
      [centerX + parkingWidth / 2, centerY + buildingHeight / 2 + 10 + parkingHeight],
      [centerX - parkingWidth / 2, centerY + buildingHeight / 2 + 10 + parkingHeight],
      [centerX - parkingWidth / 2, centerY + buildingHeight / 2 + 10]
    ];

    elements.push({
      id: generateId(),
      type: 'parking',
      name: 'Parking Lot',
      geometry: {
        type: 'Polygon',
        coordinates: [parkingCoords]
      },
      properties: {
        areaSqFt: parkingWidth * parkingHeight,
        parkingSpaces: Math.floor((parkingWidth * parkingHeight) / 300), // ~300 sq ft per space
        color: '#10b981'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'template'
      }
    });

    return elements;
  }

  /**
   * Generate Office Building template
   */
  static generateOfficeBuilding(centerX: number, centerY: number): Element[] {
    const width = 100; // 100 feet
    const height = 80; // 80 feet
    const coords: number[][] = [
      [centerX - width / 2, centerY - height / 2],
      [centerX + width / 2, centerY - height / 2],
      [centerX + width / 2, centerY + height / 2],
      [centerX - width / 2, centerY + height / 2],
      [centerX - width / 2, centerY - height / 2]
    ];

    return [{
      id: generateId(),
      type: 'building',
      name: 'Office Building',
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: {
        areaSqFt: width * height,
        stories: 3,
        color: '#1e40af'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'template'
      }
    }];
  }

  /**
   * Generate Retail Center template
   */
  static generateRetailCenter(centerX: number, centerY: number): Element[] {
    const width = 150; // 150 feet
    const height = 100; // 100 feet
    const coords: number[][] = [
      [centerX - width / 2, centerY - height / 2],
      [centerX + width / 2, centerY - height / 2],
      [centerX + width / 2, centerY + height / 2],
      [centerX - width / 2, centerY + height / 2],
      [centerX - width / 2, centerY - height / 2]
    ];

    return [{
      id: generateId(),
      type: 'building',
      name: 'Retail Center',
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: {
        areaSqFt: width * height,
        color: '#dc2626'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'template'
      }
    }];
  }

  /**
   * Generate Hotel/Hospitality template
   */
  static generateHotel(centerX: number, centerY: number): Element[] {
    const width = 120; // 120 feet
    const height = 100; // 100 feet
    const coords: number[][] = [
      [centerX - width / 2, centerY - height / 2],
      [centerX + width / 2, centerY - height / 2],
      [centerX + width / 2, centerY + height / 2],
      [centerX - width / 2, centerY + height / 2],
      [centerX - width / 2, centerY - height / 2]
    ];

    return [{
      id: generateId(),
      type: 'building',
      name: 'Hotel/Hospitality',
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: {
        areaSqFt: width * height,
        stories: 4,
        color: '#f59e0b'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'template'
      }
    }];
  }

  /**
   * Get all available templates
   */
  static getTemplates(): LayoutTemplate[] {
    return [
      {
        id: 'single-family',
        name: 'Single Family Home',
        type: 'single-family',
        description: 'Single family residence',
        minAreaSqFt: 2000,
        generate: (x, y) => this.generateSingleFamily(x, y)
      },
      {
        id: 'duplex',
        name: 'Duplex',
        type: 'duplex',
        description: 'Two-unit duplex',
        minAreaSqFt: 3000,
        generate: (x, y) => this.generateDuplex(x, y)
      },
      {
        id: 'apartment',
        name: 'Apartment Complex',
        type: 'apartment',
        description: 'Multi-unit apartment building',
        minAreaSqFt: 10000,
        generate: (x, y) => this.generateApartmentComplex(x, y, 20)
      },
      {
        id: 'office',
        name: 'Office Building',
        type: 'office',
        description: 'Commercial office building',
        minAreaSqFt: 8000,
        generate: (x, y) => this.generateOfficeBuilding(x, y)
      },
      {
        id: 'retail',
        name: 'Retail Center',
        type: 'retail',
        description: 'Retail shopping center',
        minAreaSqFt: 15000,
        generate: (x, y) => this.generateRetailCenter(x, y)
      },
      {
        id: 'hotel',
        name: 'Hotel/Hospitality',
        type: 'hotel',
        description: 'Hotel or hospitality facility',
        minAreaSqFt: 12000,
        generate: (x, y) => this.generateHotel(x, y)
      }
    ];
  }

  /**
   * Apply template at position
   */
  static applyTemplate(templateId: string, centerX: number, centerY: number): Element[] {
    const templates = this.getTemplates();
    const template = templates.find(t => t.id === templateId);
    if (!template) return [];
    return template.generate(centerX, centerY);
  }
}

