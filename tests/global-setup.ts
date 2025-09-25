import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  // Global setup can be used to:
  // - Set up test data
  // - Authenticate users
  // - Set up database state
  // - Configure environment variables
  
  console.log('Running global setup...');
  
  // Example: Start a browser and navigate to the app to warm it up
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Wait for the dev server to be ready
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    console.log('Application is ready for testing');
  } catch (error) {
    console.warn('Could not connect to application:', error);
  } finally {
    await browser.close();
  }
}

export default globalSetup;


