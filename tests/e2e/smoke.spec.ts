import { test, expect } from '@playwright/test'

test.describe('Application Smoke Tests', () => {
  test('App renders and shows main interface', async ({ page }) => {
    await page.goto('/')
    
    // Check that the main application loads
    await expect(page.getByText(/Full Parcel Analysis|Map|Planner|Parcel/i)).toBeVisible()
    
    // Check that navigation tabs are present
    await expect(page.getByRole('tab', { name: /Overview|HBU Analysis|Site Plan|Site Design|Financial/i })).toBeVisible()
  })

  test('Map loads without critical errors', async ({ page }) => {
    await page.goto('/')
    
    // Wait for the map to load
    await page.waitForTimeout(2000)
    
    // Check that there are no critical console errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    // Navigate around a bit to trigger any lazy-loaded components
    await page.getByRole('tab', { name: /Site Design/i }).click()
    await page.waitForTimeout(1000)
    
    // Filter out known non-critical errors
    const criticalErrors = errors.filter(error => 
      !error.includes('Mapbox token') && 
      !error.includes('webgl') &&
      !error.includes('favicon')
    )
    
    expect(criticalErrors).toHaveLength(0)
  })

  test('Site Planner loads without crashing', async ({ page }) => {
    await page.goto('/')
    
    // Navigate to Site Design tab
    await page.getByRole('tab', { name: /Site Design/i }).click()
    await page.waitForTimeout(2000)
    
    // Check that the site planner interface is present
    await expect(page.getByText(/Visual Site Plan|CAD Site Planner/i)).toBeVisible()
    
    // Check that there are no "Site Planner Error" messages
    await expect(page.getByText('Site Planner Error')).not.toBeVisible()
  })

  test('Template generation interface is present', async ({ page }) => {
    await page.goto('/')
    
    // Navigate to Site Design tab
    await page.getByRole('tab', { name: /Site Design/i }).click()
    await page.waitForTimeout(2000)
    
    // Check that development templates are present
    await expect(page.getByText(/Development Templates|Single Family|Duplex/i)).toBeVisible()
  })
})
