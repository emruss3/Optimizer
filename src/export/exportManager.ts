/**
 * Export Manager - GeoJSON, CSV, and PDF Export Functionality
 * 
 * Handles exporting site plans, KPIs, and compliance data in multiple formats.
 */

import { Element } from '../types/parcel';
import { GradingResult } from '../grading/gradePad';

export interface ExportData {
  parcelId: string;
  parcelAddress: string;
  buildableArea: number;
  elements: Element[];
  kpis: {
    coverage: number;
    impervious: number;
    far: number;
    height: number;
    parking: number;
    openSpace: number;
  };
  compliance: {
    coverageOk: boolean;
    imperviousOk: boolean;
    farOk: boolean;
    heightOk: boolean;
    parkingOk: boolean;
    openSpaceOk: boolean;
  };
  grading?: GradingResult;
  zoning: {
    base: string;
    maxFAR: number;
    maxHeight: number;
    setbacks: { front: number; side: number; rear: number };
    permittedUses: string[];
  };
  metadata: {
    exportDate: string;
    version: string;
    generatedBy: string;
  };
}

export interface GeoJSONExport {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: any;
    properties: {
      id: string;
      type: string;
      name: string;
      area?: number;
      [key: string]: any;
    };
  }>;
  metadata: {
    parcelId: string;
    exportDate: string;
    coordinateSystem: 'EPSG:3857';
  };
}

export interface CSVExport {
  headers: string[];
  rows: Array<Record<string, string | number | boolean>>;
  metadata: {
    parcelId: string;
    exportDate: string;
    totalRows: number;
  };
}

/**
 * Export site plan data as GeoJSON
 */
export function exportGeoJSON(data: ExportData): GeoJSONExport {
  const features = data.elements.map(element => {
    // Convert element vertices to GeoJSON polygon
    const coordinates = [element.vertices.map(vertex => [vertex.x, vertex.y])];
    
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates
      },
      properties: {
        id: element.id,
        type: element.type,
        name: element.properties.name || element.type,
        area: element.properties.area,
        color: element.properties.color,
        ...element.properties
      }
    };
  });

  return {
    type: 'FeatureCollection',
    features,
    metadata: {
      parcelId: data.parcelId,
      exportDate: data.metadata.exportDate,
      coordinateSystem: 'EPSG:3857'
    }
  };
}

/**
 * Export KPIs and compliance data as CSV
 */
export function exportCSV(data: ExportData): CSVExport {
  const headers = [
    'Metric',
    'Value',
    'Target',
    'Compliance',
    'Status'
  ];

  const rows = [
    {
      Metric: 'Coverage',
      Value: `${(data.kpis.coverage * 100).toFixed(1)}%`,
      Target: 'Zoning Max',
      Compliance: data.compliance.coverageOk ? 'PASS' : 'FAIL',
      Status: data.compliance.coverageOk ? 'Compliant' : 'Non-compliant'
    },
    {
      Metric: 'Impervious Coverage',
      Value: `${(data.kpis.impervious * 100).toFixed(1)}%`,
      Target: 'Zoning Max',
      Compliance: data.compliance.imperviousOk ? 'PASS' : 'FAIL',
      Status: data.compliance.imperviousOk ? 'Compliant' : 'Non-compliant'
    },
    {
      Metric: 'FAR',
      Value: data.kpis.far.toFixed(2),
      Target: data.zoning.maxFAR.toFixed(2),
      Compliance: data.compliance.farOk ? 'PASS' : 'FAIL',
      Status: data.compliance.farOk ? 'Compliant' : 'Non-compliant'
    },
    {
      Metric: 'Height',
      Value: `${data.kpis.height.toFixed(0)} ft`,
      Target: `${data.zoning.maxHeight.toFixed(0)} ft`,
      Compliance: data.compliance.heightOk ? 'PASS' : 'FAIL',
      Status: data.compliance.heightOk ? 'Compliant' : 'Non-compliant'
    },
    {
      Metric: 'Parking Ratio',
      Value: data.kpis.parking.toFixed(2),
      Target: 'Required',
      Compliance: data.compliance.parkingOk ? 'PASS' : 'FAIL',
      Status: data.compliance.parkingOk ? 'Compliant' : 'Non-compliant'
    },
    {
      Metric: 'Open Space',
      Value: `${(data.kpis.openSpace * 100).toFixed(1)}%`,
      Target: 'Zoning Min',
      Compliance: data.compliance.openSpaceOk ? 'PASS' : 'FAIL',
      Status: data.compliance.openSpaceOk ? 'Compliant' : 'Non-compliant'
    }
  ];

  // Add grading data if available
  if (data.grading) {
    rows.push(
      {
        Metric: 'Cut Volume',
        Value: `${data.grading.cutCY.toLocaleString()} CY`,
        Target: 'N/A',
        Compliance: 'N/A',
        Status: 'Calculated'
      },
      {
        Metric: 'Fill Volume',
        Value: `${data.grading.fillCY.toLocaleString()} CY`,
        Target: 'N/A',
        Compliance: 'N/A',
        Status: 'Calculated'
      },
      {
        Metric: 'Grading Cost',
        Value: `$${data.grading.totalCost.toLocaleString()}`,
        Target: 'N/A',
        Compliance: 'N/A',
        Status: 'Calculated'
      }
    );
  }

  return {
    headers,
    rows,
    metadata: {
      parcelId: data.parcelId,
      exportDate: data.metadata.exportDate,
      totalRows: rows.length
    }
  };
}

/**
 * Generate PDF report (placeholder - would integrate with PDF library)
 */
export function generatePDFReport(data: ExportData): Promise<Blob> {
  // This would integrate with a PDF generation library like jsPDF or Puppeteer
  // For now, return a placeholder blob
  return new Promise((resolve) => {
    const content = `
      SITE PLAN REPORT
      ================
      
      Parcel ID: ${data.parcelId}
      Address: ${data.parcelAddress}
      Export Date: ${data.metadata.exportDate}
      
      BUILDABLE AREA: ${data.buildableArea.toLocaleString()} sq ft
      
      KPIs:
      - Coverage: ${(data.kpis.coverage * 100).toFixed(1)}%
      - Impervious: ${(data.kpis.impervious * 100).toFixed(1)}%
      - FAR: ${data.kpis.far.toFixed(2)}
      - Height: ${data.kpis.height.toFixed(0)} ft
      - Parking: ${data.kpis.parking.toFixed(2)}
      - Open Space: ${(data.kpis.openSpace * 100).toFixed(1)}%
      
      COMPLIANCE STATUS:
      - Coverage: ${data.compliance.coverageOk ? 'PASS' : 'FAIL'}
      - Impervious: ${data.compliance.imperviousOk ? 'PASS' : 'FAIL'}
      - FAR: ${data.compliance.farOk ? 'PASS' : 'FAIL'}
      - Height: ${data.compliance.heightOk ? 'PASS' : 'FAIL'}
      - Parking: ${data.compliance.parkingOk ? 'PASS' : 'FAIL'}
      - Open Space: ${data.compliance.openSpaceOk ? 'PASS' : 'FAIL'}
      
      ZONING:
      - Base: ${data.zoning.base}
      - Max FAR: ${data.zoning.maxFAR}
      - Max Height: ${data.zoning.maxHeight} ft
      - Setbacks: Front ${data.zoning.setbacks.front}ft, Side ${data.zoning.setbacks.side}ft, Rear ${data.zoning.setbacks.rear}ft
      - Permitted Uses: ${data.zoning.permittedUses.join(', ')}
    `;
    
    const blob = new Blob([content], { type: 'text/plain' });
    resolve(blob);
  });
}

/**
 * Download file to user's device
 */
export function downloadFile(content: string | Blob, filename: string, mimeType: string = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export all formats at once
 */
export function exportAll(data: ExportData) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseFilename = `site-plan-${data.parcelId}-${timestamp}`;
  
  // Export GeoJSON
  const geoJSON = exportGeoJSON(data);
  downloadFile(
    JSON.stringify(geoJSON, null, 2),
    `${baseFilename}.geojson`,
    'application/geo+json'
  );
  
  // Export CSV
  const csv = exportCSV(data);
  const csvContent = [
    csv.headers.join(','),
    ...csv.rows.map(row => csv.headers.map(header => `"${row[header]}"`).join(','))
  ].join('\n');
  
  downloadFile(
    csvContent,
    `${baseFilename}.csv`,
    'text/csv'
  );
  
  // Export PDF (async)
  generatePDFReport(data).then(pdfBlob => {
    downloadFile(
      pdfBlob,
      `${baseFilename}.pdf`,
      'application/pdf'
    );
  });
}

/**
 * Import GeoJSON and restore geometry
 */
export function importGeoJSON(geoJSON: GeoJSONExport): Element[] {
  return geoJSON.features.map(feature => {
    const coords = feature.geometry.coordinates[0];
    const vertices = coords.map(([x, y]: [number, number]) => ({ x, y }));
    
    return {
      id: feature.properties.id,
      type: feature.properties.type as any,
      vertices,
      properties: {
        name: feature.properties.name,
        area: feature.properties.area,
        color: feature.properties.color,
        ...feature.properties
      }
    };
  });
}
