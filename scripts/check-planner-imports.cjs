#!/usr/bin/env node
/**
 * Lint script to ensure Group A (production) site planner files
 * do not import from Group B (dev/experimental) or Group C (unreferenced) files.
 * 
 * Usage: node scripts/check-planner-imports.js
 * Exit code: 0 if all checks pass, 1 if violations found
 * 
 * Source of truth: docs/site_planner_live_vs_legacy.md
 */

const fs = require('fs');
const path = require('path');

// Group A files (production - from docs/site_planner_live_vs_legacy.md)
const GROUP_A = [
  'src/components/EnterpriseSitePlannerShell.tsx',
  'src/components/SitePlanDesigner.tsx',
  'src/components/site-planner/SitePlanCanvas.tsx',
  'src/components/site-planner/SitePlanToolbar.tsx',
  'src/components/site-planner/StatusBar.tsx',
  'src/components/site-planner/TemplateSelector.tsx',
  'src/hooks/useViewport.ts',
  'src/hooks/useSelection.ts',
  'src/hooks/useDrag.ts',
  'src/hooks/useDrawingTools.ts',
  'src/hooks/useRotation.ts',
  'src/hooks/useVertexEditing.ts',
  'src/hooks/useMeasurement.ts',
  'src/hooks/useGrid.ts',
  'src/services/elementService.ts',
  'src/services/templateService.ts',
  'src/services/parcelGeometry.ts',
  'src/engine/types.ts',
  'src/engine/planner.ts',
  'src/engine/geometry.ts',
  'src/engine/geometry/normalize.ts',
  'src/engine/building.ts',
  'src/engine/parking.ts',
  'src/engine/analysis.ts',
  'src/engine/metrics/parcelMetrics.ts',
  'src/workers/workerManager.ts',
  'src/workers/siteEngineWorker.ts',
  'src/engine/workers/sitegenie/index.ts',
  'src/engine/workers/sitegenie/planner.ts',
  'src/api/fetchEnvelope.ts',
  'src/api/planner.ts',
  'src/utils/reproject.ts',
  'src/utils/coordinateTransform.ts',
  'src/types/parcel.ts',
  'src/types/zoning.ts',
  'src/components/FullAnalysisModal.tsx',
  'src/components/ProjectPanel.tsx',
  'src/components/UnifiedProjectWorkflow.tsx'
];

// Group B files (dev/experimental)
const GROUP_B = [
  'src/components/EnterpriseSitePlanner.tsx',
  'src/components/EnhancedSitePlanner.tsx',
  'src/components/ConsolidatedSitePlanner.tsx',
  'src/components/AIDrivenSitePlanGenerator.tsx',
  'src/components/adapters/SitePlannerAdapters.tsx',
  'src/hooks/useEnhancedSitePlanner.ts',
  'src/features/site-planner/hooks/useMouseHandlers.ts',
  'src/features/site-planner/types.ts',
  'src/components/ParcelAnalysisDemo.tsx',
  'src/components/WorkflowAudit.tsx',
  'src/components/WorkflowConnectionTest.tsx',
  'src/components/UnifiedWorkspace.tsx',
  'src/components/ProjectWorkflow.tsx',
  'src/components/SimpleProjectManager.tsx',
  'src/components/ConnectedProjectWorkflow.tsx',
  'src/components/RealUnderwritingWorkflow.tsx'
];

// Group C files (unreferenced)
const GROUP_C = [
  'src/components/SitePlannerWrapper.tsx',
  'src/components/SetbackOverlay.tsx',
  'src/store/sitePlan.ts',
  'src/services/sitePlanEngine.ts'
];

const GROUP_B_C = [...GROUP_B, ...GROUP_C];

// Normalize paths for comparison
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

// Extract imports from a file
function extractImports(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports = [];
  
  // Match: import ... from '...' or import ... from "..."
  const importRegex = /import\s+(?:[\w*{}\s,]*\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    // Skip node_modules and external packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      continue;
    }
    
    // Resolve relative import to absolute path
    const dir = path.dirname(filePath);
    let resolvedPath;
    
    try {
      // Handle .tsx/.ts extensions
      let resolved = path.resolve(dir, importPath);
      
      // Try with extensions if not already present
      if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
        if (fs.existsSync(resolved + '.tsx')) {
          resolved = resolved + '.tsx';
        } else if (fs.existsSync(resolved + '.ts')) {
          resolved = resolved + '.ts';
        }
      }
      
      resolvedPath = resolved;
      
      // Normalize to src/ relative path
      const srcIndex = resolvedPath.indexOf('src' + path.sep);
      if (srcIndex !== -1) {
        const relativePath = resolvedPath.substring(srcIndex);
        imports.push({
          original: importPath,
          resolved: normalizePath(relativePath)
        });
      }
    } catch (e) {
      // Skip if path resolution fails
    }
  }
  
  return imports;
}

// Check if a resolved import path matches a Group B/C file
function matchesGroupBOrC(resolvedPath, bcFile) {
  const normalizedResolved = normalizePath(resolvedPath);
  const normalizedBC = normalizePath(bcFile);
  
  // Exact match
  if (normalizedResolved === normalizedBC) {
    return true;
  }
  
  // Match without extension
  const resolvedNoExt = normalizedResolved.replace(/\.(tsx?|jsx?)$/, '');
  const bcNoExt = normalizedBC.replace(/\.(tsx?|jsx?)$/, '');
  if (resolvedNoExt === bcNoExt) {
    return true;
  }
  
  // Match by filename
  const resolvedFilename = path.basename(normalizedResolved, path.extname(normalizedResolved));
  const bcFilename = path.basename(normalizedBC, path.extname(normalizedBC));
  if (resolvedFilename === bcFilename) {
    return true;
  }
  
  return false;
}

// Main check
function checkImports() {
  const violations = [];
  
  for (const groupAFile of GROUP_A) {
    const fullPath = path.join(process.cwd(), groupAFile);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  Group A file not found: ${groupAFile}`);
      continue;
    }
    
    const imports = extractImports(fullPath);
    
    for (const imp of imports) {
      // Check if this import matches any Group B/C file
      for (const bcFile of GROUP_B_C) {
        if (matchesGroupBOrC(imp.resolved, bcFile)) {
          violations.push({
            file: groupAFile,
            imports: bcFile,
            importPath: imp.original,
            resolvedPath: imp.resolved
          });
        }
      }
    }
  }
  
  return violations;
}

// Run check
const violations = checkImports();

if (violations.length > 0) {
  console.error('❌ VIOLATION: Group A files importing from Group B/C:\n');
  violations.forEach(v => {
    console.error(`  ${v.file}`);
    console.error(`    → imports ${v.imports}`);
    console.error(`    (import: ${v.importPath} → ${v.resolvedPath})\n`);
  });
  console.error(`\nFound ${violations.length} violation(s).`);
  console.error('See docs/site_planner_live_vs_legacy.md for details.\n');
  process.exit(1);
} else {
  console.log('✅ All Group A files are clean - no imports from Group B/C files.');
  process.exit(0);
}

