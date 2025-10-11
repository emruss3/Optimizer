/**
 * E2E Tests for Site Planner Flow
 * 
 * Tests the complete planner workflow from parcel selection to scheme generation
 * and export functionality.
 */

import { test, expect } from '@playwright/test';

// Test fixture data
const TEST_PARCEL = {
  ogc_fid: 661807,
  address: '123 Test Street',
  expected_area_sqft: 50000
};

test.describe('Site Planner E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the planner
    await page.goto('/planner');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should load parcel and display buildable envelope', async ({ page }) => {
    // Select test parcel
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);

    // Wait for parcel to load
    await page.waitForSelector('[data-testid="buildable-area"]', { timeout: 10000 });

    // Verify buildable area is displayed
    const buildableArea = page.locator('[data-testid="buildable-area"]');
    await expect(buildableArea).toBeVisible();

    // Verify area is reasonable
    const areaText = await page.textContent('[data-testid="buildable-area-size"]');
    expect(areaText).toMatch(/\d+,\d+\s+sq\s+ft/);

    // Verify no placeholder rectangle is shown
    const placeholderRect = page.locator('[data-testid="placeholder-rect"]');
    await expect(placeholderRect).not.toBeVisible();
  });

  test('should display setback overlays and edge classifications', async ({ page }) => {
    // Load test parcel
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);

    await page.waitForSelector('[data-testid="buildable-area"]');

    // Verify setback lines are displayed
    const setbackLines = page.locator('[data-testid="setback-line"]');
    await expect(setbackLines).toHaveCount(3); // front, side, rear

    // Verify edge type indicators
    const frontageBadge = page.locator('[data-testid="frontage-badge"]');
    await expect(frontageBadge).toBeVisible();

    // Verify setback distances are shown
    const setbackLabels = page.locator('[data-testid="setback-label"]');
    await expect(setbackLabels).toHaveCount(3);
  });

  test('should generate and display massing schemes', async ({ page }) => {
    // Load test parcel
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);

    await page.waitForSelector('[data-testid="buildable-area"]');

    // Click optimize button
    await page.click('[data-testid="optimize-button"]');

    // Wait for schemes to generate
    await page.waitForSelector('[data-testid="scheme-thumbnail"]', { timeout: 15000 });

    // Verify at least 3 schemes are generated
    const schemeThumbnails = page.locator('[data-testid="scheme-thumbnail"]');
    await expect(schemeThumbnails).toHaveCount({ min: 3 });

    // Verify KPI chips are displayed
    const kpiChips = page.locator('[data-testid="kpi-chip"]');
    await expect(kpiChips).toHaveCount({ min: 1 });

    // Verify pareto selection is working
    const paretoSchemes = page.locator('[data-testid="pareto-scheme"]');
    await expect(paretoSchemes).toHaveCount({ min: 1 });
  });

  test('should update KPIs in real-time during interaction', async ({ page }) => {
    // Load test parcel
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);

    await page.waitForSelector('[data-testid="buildable-area"]');

    // Get initial KPI values
    const initialCoverage = await page.textContent('[data-testid="coverage-kpi"]');
    const initialFAR = await page.textContent('[data-testid="far-kpi"]');

    // Add a building element
    await page.click('[data-testid="add-building-button"]');
    await page.click('[data-testid="canvas"]', { position: { x: 100, y: 100 } });

    // Wait for KPI update
    await page.waitForTimeout(500);

    // Verify KPIs have updated
    const updatedCoverage = await page.textContent('[data-testid="coverage-kpi"]');
    const updatedFAR = await page.textContent('[data-testid="far-kpi"]');

    expect(updatedCoverage).not.toBe(initialCoverage);
    expect(updatedFAR).not.toBe(initialFAR);

    // Verify compliance indicators
    const complianceIndicator = page.locator('[data-testid="compliance-indicator"]');
    await expect(complianceIndicator).toBeVisible();
  });

  test('should enforce setback constraints during dragging', async ({ page }) => {
    // Load test parcel
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);

    await page.waitForSelector('[data-testid="buildable-area"]');

    // Add a building element
    await page.click('[data-testid="add-building-button"]');
    await page.click('[data-testid="canvas"]', { position: { x: 100, y: 100 } });

    // Try to drag building beyond setback line
    const buildingElement = page.locator('[data-testid="building-element"]').first();
    const buildingBox = await buildingElement.boundingBox();
    
    if (buildingBox) {
      // Drag to a position that should violate setbacks
      await page.mouse.move(buildingBox.x + buildingBox.width / 2, buildingBox.y + buildingBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(buildingBox.x - 50, buildingBox.y - 50); // Move toward setback
      await page.mouse.up();

      // Verify building snaps back to valid position
      await page.waitForTimeout(300);
      const newBuildingBox = await buildingElement.boundingBox();
      expect(newBuildingBox?.x).toBeGreaterThan(buildingBox.x - 30); // Should not move too far
    }
  });

  test('should display permitted uses and apply presets', async ({ page }) => {
    // Load test parcel
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);

    await page.waitForSelector('[data-testid="buildable-area"]');

    // Verify permitted uses chips are displayed
    const permittedUsesChips = page.locator('[data-testid="permitted-use-chip"]');
    await expect(permittedUsesChips).toHaveCount({ min: 1 });

    // Click on a permitted use chip
    await permittedUsesChips.first().click();

    // Verify preset is applied (massing parameters change)
    await page.waitForTimeout(1000);
    
    // Verify massing is regenerated with new preset
    const massingElements = page.locator('[data-testid="massing-element"]');
    await expect(massingElements).toHaveCount({ min: 1 });
  });

  test('should export data in multiple formats', async ({ page }) => {
    // Load test parcel and generate schemes
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);

    await page.waitForSelector('[data-testid="buildable-area"]');
    await page.click('[data-testid="optimize-button"]');
    await page.waitForSelector('[data-testid="scheme-thumbnail"]');

    // Set up download promise
    const downloadPromise = page.waitForEvent('download');

    // Click export button
    await page.click('[data-testid="export-button"]');

    // Verify download starts
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/site-plan-.*\.geojson/);

    // Test CSV export
    const csvDownloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-csv-button"]');
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toMatch(/site-plan-.*\.csv/);

    // Test PDF export
    const pdfDownloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-pdf-button"]');
    const pdfDownload = await pdfDownloadPromise;
    expect(pdfDownload.suggestedFilename()).toMatch(/site-plan-.*\.pdf/);
  });

  test('should persist data after save and reload', async ({ page }) => {
    // Load test parcel and create a design
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);

    await page.waitForSelector('[data-testid="buildable-area"]');
    
    // Add building elements
    await page.click('[data-testid="add-building-button"]');
    await page.click('[data-testid="canvas"]', { position: { x: 100, y: 100 } });
    await page.click('[data-testid="canvas"]', { position: { x: 200, y: 200 } });

    // Get KPI values
    const coverageValue = await page.textContent('[data-testid="coverage-kpi"]');
    const farValue = await page.textContent('[data-testid="far-kpi"]');

    // Save the design
    await page.click('[data-testid="save-button"]');
    await page.waitForSelector('[data-testid="save-success"]');

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify data persisted
    const reloadedCoverage = await page.textContent('[data-testid="coverage-kpi"]');
    const reloadedFAR = await page.textContent('[data-testid="far-kpi"]');

    expect(reloadedCoverage).toBe(coverageValue);
    expect(reloadedFAR).toBe(farValue);

    // Verify building elements are still there
    const buildingElements = page.locator('[data-testid="building-element"]');
    await expect(buildingElements).toHaveCount(2);
  });

  test('should handle errors gracefully', async ({ page }) => {
    // Test with invalid parcel ID
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', '999999');
    await page.click('[data-testid="search-button"]');

    // Verify error message is displayed
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Parcel not found');

    // Verify canvas shows fallback state
    const fallbackMessage = page.locator('[data-testid="fallback-message"]');
    await expect(fallbackMessage).toBeVisible();
  });

  test('should maintain performance with large datasets', async ({ page }) => {
    // Load test parcel
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);

    await page.waitForSelector('[data-testid="buildable-area"]');

    // Generate many schemes
    await page.click('[data-testid="optimize-button"]');
    
    // Wait for generation to complete (should be under 10 seconds)
    await page.waitForSelector('[data-testid="scheme-thumbnail"]', { timeout: 10000 });

    // Verify UI remains responsive
    const schemeThumbnails = page.locator('[data-testid="scheme-thumbnail"]');
    await expect(schemeThumbnails).toHaveCount({ min: 8 });

    // Test scrolling through schemes
    await page.hover('[data-testid="scheme-thumbnail"]:nth-child(5)');
    await page.waitForTimeout(100);

    // Verify no performance warnings
    const performanceWarning = page.locator('[data-testid="performance-warning"]');
    await expect(performanceWarning).not.toBeVisible();
  });
});

test.describe('Planner Integration Tests', () => {
  test('should integrate with underwriting workflow', async ({ page }) => {
    // Complete planner flow
    await page.goto('/planner');
    await page.click('[data-testid="parcel-selector"]');
    await page.fill('[data-testid="parcel-search"]', TEST_PARCEL.ogc_fid.toString());
    await page.click(`[data-testid="parcel-${TEST_PARCEL.ogc_fid}"]`);
    await page.waitForSelector('[data-testid="buildable-area"]');
    await page.click('[data-testid="optimize-button"]');
    await page.waitForSelector('[data-testid="scheme-thumbnail"]');

    // Select best scheme
    await page.click('[data-testid="scheme-thumbnail"]:first-child');
    await page.click('[data-testid="select-scheme-button"]');

    // Navigate to underwriting
    await page.click('[data-testid="underwriting-button"]');
    await page.waitForURL('**/underwriting/**');

    // Verify underwriting data is populated
    const underwritingData = page.locator('[data-testid="underwriting-data"]');
    await expect(underwritingData).toBeVisible();

    // Verify KPIs match planner
    const plannerCoverage = await page.textContent('[data-testid="coverage-kpi"]');
    const underwritingCoverage = await page.textContent('[data-testid="underwriting-coverage"]');
    expect(underwritingCoverage).toBe(plannerCoverage);
  });
});
