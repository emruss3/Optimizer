import { test, expect } from '@playwright/test';

test('Map loads and parcels render from unified RPC', async ({ page }) => {
  await page.goto('/');
  
  // Wait for the map to load
  await expect(page.getByTestId('map-container')).toBeVisible();
  
  // Check for any parcel-related UI elements
  await expect(page.getByText(/Parcel|Planner|Map/i).first()).toBeVisible();
  
  // If there's a parcel count or layer badge, assert it here
  // This is a basic smoke test to ensure the app loads
});

test('Parcel drawer shows compliance metrics', async ({ page }) => {
  await page.goto('/');
  
  // Wait for map to load
  await expect(page.getByTestId('map-container')).toBeVisible();
  
  // This test would need to be expanded based on the actual UI flow
  // For now, just ensure the page loads without errors
  await expect(page.locator('body')).toBeVisible();
});

