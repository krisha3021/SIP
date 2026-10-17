import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXTURE_CODE, mockFundApi } from './fixtures';

const CORE_ROUTES = [
  '/',
  '/calculators',
  '/calculators/sip',
  '/calculators/step-up-sip',
  '/calculators/lumpsum',
  '/calculators/corpus-sip',
  '/calculators/goal-planner',
  '/calculators/swp',
  '/calculators/monte-carlo',
  '/calculators/income-tax',
  '/goals',
  '/funds',
  '/historical',
  '/scenario-lab',
  '/saved',
  '/learn',
  '/methodology',
  '/data-sources',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/disclaimer',
];

const isMobile = (name: string) => name.includes('mobile');

test.describe('core routes', () => {
  for (const path of CORE_ROUTES) {
    test(`${path} renders with attribution and no axe violations`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.getByText('Created by Alok Shukla', { exact: true })).toBeVisible();
      // Never a LIVE label or demo OTP anywhere.
      await expect(page.getByText(/\bLIVE\b/)).toHaveCount(0);
      await expect(page.getByText(/OTP/)).toHaveCount(0);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('every internal link on core pages resolves', async ({ page, request }) => {
    const seen = new Set<string>();
    for (const path of ['/', '/calculators', '/goals', '/methodology', '/learn', '/data-sources']) {
      await page.goto(path);
      const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
      for (const h of hrefs) seen.add(h.split('#')[0]!.split('?')[0]!);
    }
    for (const href of seen) {
      const r = await request.get(href);
      expect(r.status(), href).toBeLessThan(400);
    }
  });

  test('unknown route returns 404 page', async ({ page }) => {
    const res = await page.goto('/no-such-page');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('market-status reports no licensed quote provider', async ({ request }) => {
    const r = await request.get('/api/market-status');
    const body = await r.json();
    expect(body.quoteProvider).toBeNull();
    expect(body.message).toMatch(/No licensed quote provider/);
  });

  test('fund API rejects invalid input without calling upstream', async ({ request }) => {
    const bad = await request.get('/api/funds/abc/nav');
    expect([400, 503]).toContain(bad.status());
    const badQ = await request.get('/api/funds/search?q=%3Cscript%3E');
    expect([400, 503]).toContain(badQ.status());
  });
});

test.describe('navigation', () => {
  test('desktop nav or mobile drawer reaches every section', async ({ page }, info) => {
    await page.goto('/');
    if (isMobile(info.project.name)) {
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await menu.click();
      const drawer = page.getByRole('dialog', { name: 'Site menu' });
      await expect(drawer).toBeVisible();
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      // Escape closes the drawer and returns focus to the trigger.
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await expect(menu).toBeFocused();
      await menu.click();
      await drawer.getByRole('link', { name: /Fund Research/ }).click();
      await expect(page).toHaveURL(/\/funds$/);
      await expect(page.getByRole('dialog', { name: 'Site menu' })).toBeHidden();
    } else {
      const nav = page.getByRole('navigation', { name: 'Primary' });
      for (const label of ['Calculators', 'Goals & Retirement', 'Fund Research', 'Historical Analysis', 'Scenario Lab', 'Saved Plans', 'Learn', 'Methodology']) {
        await expect(nav.getByRole('link', { name: label })).toBeVisible();
      }
      await nav.getByRole('link', { name: 'Calculators' }).click();
      await expect(page).toHaveURL(/\/calculators$/);
      await expect(nav.getByRole('link', { name: 'Calculators' })).toHaveAttribute('aria-current', 'page');
    }
  });

  test('skip link moves focus to main content', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'keyboard-only check');
    await page.goto('/calculators');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('calculator directory search filters results', async ({ page }) => {
    await page.goto('/calculators');
    await page.getByLabel('Search calculators').fill('retirement');
    await expect(page.getByRole('link', { name: /SWP/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Lumpsum calculator/ })).toHaveCount(0);
  });
});

test.describe('calculators without login', () => {
  test('SIP: edit inputs, see projection, invalid input shows error', async ({ page }) => {
    await page.goto('/calculators/sip');
    await expect(page.getByText('Projection (assumption-based)')).toBeVisible();
    await expect(page.getByTestId('kpi-value')).toContainText('₹47,14,578.33');
    const monthly = page.getByLabel('Monthly SIP', { exact: true });
    await monthly.fill('20000');
    await expect(page.getByTestId('kpi-value')).toContainText('₹94,29,156.67');
    await monthly.fill('20,000x');
    // Next.js renders its own route announcer with role=alert, so match ours by text.
    await expect(page.getByRole('alert').filter({ hasText: 'No result for these inputs' })).toBeVisible();
    await expect(monthly).toHaveAttribute('aria-invalid', 'true');
  });

  test('share link round-trips assumptions', async ({ page }) => {
    await page.goto('/calculators/sip?m=5000&y=10&r=8&i=5&t=begin&rc=nominal');
    await expect(page.getByLabel('Monthly SIP', { exact: true })).toHaveValue('5000');
    await expect(page.getByTestId('conventions')).toContainText('start of each month');
    await expect(page.getByTestId('conventions')).toContainText('Nominal');
  });

  test('CSV and Excel downloads contain the report', async ({ page }) => {
    await page.goto('/calculators/sip');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^lakshya-sip-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await (await csv.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
    expect(text).toContain('Created by Alok Shukla');
    expect(text).toContain('Projection (assumption-based)');
    expect(text).toContain('Contribution timing');
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
    const bytes = Buffer.concat(await (await xlsx.createReadStream()).toArray());
    expect(bytes.subarray(0, 2).toString()).toBe('PK'); // zip container
  });

  test('save a plan locally and reopen it', async ({ page }) => {
    await page.goto('/calculators/goal-planner');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByLabel('Plan name').fill('Education fund');
    await page.getByRole('button', { name: 'Save plan' }).click();
    await expect(page.getByText('Saved in this browser.')).toBeVisible();
    await page.goto('/saved');
    await page.getByRole('link', { name: 'Education fund' }).click();
    await expect(page).toHaveURL(/\/calculators\/goal-planner\?/);
  });

  test('Monte Carlo runs in a worker and states seed and model caveat', async ({ page }) => {
    await page.goto('/calculators/monte-carlo');
    const headline = page.getByTestId('mc-headline');
    await expect(headline).toBeVisible({ timeout: 20_000 });
    await expect(headline).toContainText('seed 20240601');
    await expect(headline).toContainText('not a guarantee');
    await expect(page.getByTestId('conventions')).toContainText('Web Worker');
  });

  test('tax: FY 2026-27 is disabled with explanation', async ({ page }) => {
    await page.goto('/calculators/income-tax');
    await expect(page.locator('option', { hasText: '2026-27' })).toBeDisabled();
    await expect(page.getByText('FY 2026-27 is disabled')).toBeVisible();
    await expect(page.getByTestId('kpi-new')).toBeVisible();
  });
});

test.describe('fund research (mocked API, synthetic fixture)', () => {
  test('search, open a scheme, see provenance and Not available fields', async ({ page }) => {
    await mockFundApi(page);
    await page.goto('/funds');
    await page.getByLabel('Search mutual fund schemes').fill('fixture');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('link', { name: /TEST FIXTURE Synthetic Fund/ }).click();
    await expect(page).toHaveURL(new RegExp(`/funds/${FIXTURE_CODE}$`));
    await expect(page.getByRole('heading', { name: 'Data source', exact: true })).toBeVisible();
    await expect(page.getByText('Synthetic simulation')).toBeVisible();
    await expect(page.getByText('Expense ratio (TER)')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rolling returns' })).toBeVisible();
  });

  test('historical backtest runs on the fixture series', async ({ page }) => {
    await mockFundApi(page);
    await page.goto(`/historical?scheme=${FIXTURE_CODE}`);
    await expect(page.getByTestId('kpi-value')).toBeVisible();
    await expect(page.getByText('Historical data').first()).toBeVisible();
    await expect(page.getByTestId('conventions')).toContainText('Next-available-NAV allotment');
  });

  test('upstream failure shows an error state, not numbers', async ({ page }) => {
    await page.route('**/api/funds/123/nav', (r) => r.fulfill({ status: 504, json: { ok: false, error: { code: 'UPSTREAM_TIMEOUT', message: 'The NAV provider did not respond in time.' } } }));
    await page.goto('/funds/123');
    await expect(page.getByRole('alert').filter({ hasText: 'The NAV provider did not respond in time.' })).toBeVisible();
    await expect(page.getByText(/NAV on /)).toHaveCount(0);
  });
});
