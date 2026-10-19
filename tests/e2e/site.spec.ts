import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXTURE_CODE, IDCW_FIXTURE_CODE, mockFundApi } from './fixtures';

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
  '/calculators/life-stage-planner',
  '/calculators/cash-flow',
  '/calculators/retirement-planner',
  '/calculators/allocation-explorer',
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
    await page.getByRole('link', { name: /TEST FIXTURE Synthetic Fund - Direct Plan - Growth/ }).click();
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

// Household finances must never appear in share links (keys and the values typed in).
const SENSITIVE_KEYS = ['inc', 'ess', 'emi', 'dep', 'earn', 'efh', 'oth', 'disc', 'inv', 'efs', 'amt'];

async function sharedUrl(page: import('@playwright/test').Page): Promise<URL> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.getByText(/Link copied/)).toBeVisible();
  return new URL(await page.evaluate(() => navigator.clipboard.readText()));
}

function expectNoSensitive(url: URL, typedValues: string[]) {
  expect([...url.searchParams.keys()].filter((k) => SENSITIVE_KEYS.includes(k))).toEqual([]);
  for (const v of typedValues) expect(url.toString()).not.toContain(v);
}

test.describe('planner screens', () => {
  test('Life-stage & Risk Planner: notice, hand-worked scores, private share link', async ({ page }) => {
    await page.goto('/calculators/life-stage-planner');
    await expect(page.getByTestId('mandatory-notice').first()).toContainText('Educational illustration only. This is not a suitability assessment');
    // "steady household" fixture from tests/finance/lifeStage.test.ts: capacity 92, tolerance 72.
    const set = async (label: string, v: string) => page.getByLabel(label, { exact: true }).fill(v);
    await set('Current age', '30');
    await set('Target retirement age', '60');
    await set('Investment horizon (when you need this money)', '20');
    await set('People who depend on household income', '1');
    await set('Earning members', '2');
    await set('Monthly household income (after tax)', '100000');
    await set('Monthly essential expenses', '40000');
    await set('Monthly loan EMIs', '10000');
    await set('Emergency fund you hold, in months of expenses', '6');
    await set('Your emergency-fund target', '6');
    await expect(page.getByLabel('Risk capacity (your situation)')).toContainText('92 / 100');
    await expect(page.getByLabel('Risk tolerance (your answers)')).toContainText('72 / 100');
    await expect(page.getByTestId('profile')).toContainText('Set by: tolerance');
    await expect(page.getByTestId('range-equity')).toContainText(/\d+–\d+%/);
    expectNoSensitive(await sharedUrl(page), ['100000', '40000', '10000']);
  });

  test('Life-stage stress test uses a chosen scheme, and refuses IDCW', async ({ page }) => {
    await mockFundApi(page);
    await page.goto('/calculators/life-stage-planner');
    const slot = page.getByTestId('stress-slot-equity');
    await slot.getByLabel('Find an equity scheme for the stress test').fill('fixture');
    await slot.getByRole('button', { name: 'Search', exact: true }).click();
    await slot.getByRole('button', { name: /TEST FIXTURE Synthetic Fund - Direct Plan - Growth/ }).click();
    const stress = page.getByTestId('stress-result');
    await expect(stress).toContainText('Largest observed fall');
    await expect(stress.getByText('Upper end of equity range')).toBeVisible();
    // Without debt or gold schemes, those are assumed unchanged.
    await expect(page.getByTestId('stress-asset-changes')).toContainText('assumed unchanged');
    await slot.getByText('Data source for this series').click();
    await expect(slot.getByRole('heading', { name: 'Data source', exact: true })).toBeVisible();
    await slot.getByRole('button', { name: 'Choose another scheme' }).click();
    await slot.getByLabel('Find an equity scheme for the stress test').fill('fixture');
    await slot.getByRole('button', { name: 'Search', exact: true }).click();
    await slot.getByRole('button', { name: new RegExp(`Scheme code ${IDCW_FIXTURE_CODE}`) }).click();
    await expect(slot.getByText('This scheme cannot be used for the stress test')).toBeVisible();
  });

  test('PFRDA comparison shows its source and extension label', async ({ page }) => {
    await page.goto('/calculators/life-stage-planner');
    await page.getByLabel(/PFRDA NPS Auto Choice/).check();
    const src = page.getByTestId('pfrda-source');
    await expect(src.getByRole('link')).toHaveAttribute('href', /pfrda\.org\.in/);
    await expect(src).toContainText("Values after age 55 are Lakshya's extension");
  });

  test('cash-flow planner shows a shortfall and keeps finances out of links', async ({ page }) => {
    await page.goto('/calculators/cash-flow');
    await page.getByLabel('Discretionary expenses', { exact: true }).fill('60000');
    await expect(page.getByTestId('kpi-surplus')).toContainText('Monthly shortfall');
    expectNoSensitive(await sharedUrl(page), ['60000', '100000']);
  });

  test('retirement planner shows the engine error for retirement age not after current age', async ({ page }) => {
    await page.goto('/calculators/retirement-planner');
    await expect(page.getByTestId('kpi-corpus')).toBeVisible();
    await page.getByLabel('Retirement age', { exact: true }).fill('30');
    await expect(page.getByRole('alert').filter({ hasText: 'Retirement age must be greater than current age' })).toBeVisible();
    expectNoSensitive(await sharedUrl(page), ['60000']);
  });

  test('allocation explorer always shows its notice', async ({ page }) => {
    await page.goto('/calculators/allocation-explorer');
    await expect(page.getByTestId('mandatory-notice')).toContainText('Educational illustration of an editable rule of thumb');
    await expect(page.getByTestId('kpi-equity')).toBeVisible();
    await page.getByLabel('Age', { exact: true }).fill('17');
    await expect(page.getByTestId('mandatory-notice')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'No result for these inputs' })).toBeVisible();
  });

  test('scenario lab compares through the engine and exports', async ({ page }) => {
    await page.goto('/scenario-lab');
    await expect(page.getByTestId('result-summary')).toContainText('Highest projected value');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^lakshya-scenario-lab-/);
  });
});

test.describe('final coverage', () => {
  test('cron route refuses without a secret and with a wrong one', async ({ request }) => {
    // The e2e server has no CRON_SECRET, so every request must be refused (fails closed).
    expect((await request.get('/api/cron/validate-mf-data')).status()).toBe(401);
    const wrong = await request.get('/api/cron/validate-mf-data', { headers: { authorization: 'Bearer not-the-secret-0123456789-abcdefghijkl' } });
    expect(wrong.status()).toBe(401);
  });

  test('Monte Carlo shows progress, then results', async ({ page }) => {
    await page.goto('/calculators/monte-carlo?n=10000&y=40');
    await expect(page.getByTestId('mc-progress')).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByTestId('mc-headline')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('mc-headline')).toContainText('10,000');
  });

  test('Monte Carlo cancel stops the run', async ({ page }) => {
    await page.goto('/calculators/monte-carlo?n=10000&y=60');
    await expect(page.getByTestId('mc-progress')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Simulation cancelled')).toBeVisible();
    await expect(page.getByTestId('mc-headline')).toHaveCount(0);
  });

  test('historical backtest refuses an IDCW option with the engine message', async ({ page }) => {
    await mockFundApi(page);
    await page.goto(`/historical?scheme=${IDCW_FIXTURE_CODE}`);
    await expect(page.getByText('A backtest is not available for this scheme')).toBeVisible();
    await expect(page.getByText(/IDCW \(dividend\) option/)).toBeVisible();
    await expect(page.getByTestId('kpi-value')).toHaveCount(0);
  });

  test('holdings stay out of share links on corpus + SIP and retirement', async ({ page }) => {
    for (const path of ['/calculators/corpus-sip', '/calculators/retirement-planner']) {
      await page.goto(path);
      const corpus = page.getByLabel(path.includes('corpus') ? 'Existing corpus today' : 'Retirement savings today', { exact: true });
      await corpus.fill('7654321');
      const url = await sharedUrl(page);
      expect(url.searchParams.has('c')).toBe(false);
      expect(url.toString()).not.toContain('7654321');
    }
  });

  test('life-stage planner is labelled an educational illustration', async ({ page }) => {
    await page.goto('/calculators/life-stage-planner');
    const header = page.locator('#results-heading').locator('xpath=..');
    await expect(header.getByText('Educational illustration', { exact: true })).toBeVisible();
    await expect(page.getByText('Projection (assumption-based)')).toHaveCount(0);
  });

  test('rule-table edits are validated, flagged, and resettable', async ({ page }) => {
    await page.goto('/calculators/life-stage-planner');
    await page.getByText('Edit the rule table').click();
    const field = page.locator('input[name="capacity.horizonYears.maxPoints"]');
    await field.fill('31');
    // The engine's schema requires capacity weights to sum to 100.
    await expect(page.getByRole('alert').filter({ hasText: 'These edits cannot be used' })).toContainText('Capacity weights must sum to 100');
    await field.fill('30');
    await page.locator('input[name="tolerance.lossReaction.points.hold"]').fill('40');
    await expect(page.getByTestId('edited-rules')).toContainText("Edited rules — differs from Lakshya's published table");
    expect(page.url()).not.toContain('lossReaction');
    await page.getByTestId('edited-rules').getByRole('button', { name: 'Reset to the published table' }).click();
    await expect(page.getByTestId('edited-rules')).toHaveCount(0);
  });

  test('stress test accepts optional debt and gold schemes with their own dates', async ({ page }) => {
    await mockFundApi(page);
    await page.goto('/calculators/life-stage-planner');
    for (const slot of ['equity', 'debt', 'gold']) {
      const s = page.getByTestId(`stress-slot-${slot}`);
      await s.getByRole('searchbox').fill('fixture');
      await s.getByRole('button', { name: 'Search', exact: true }).click();
      await s.getByRole('button', { name: /TEST FIXTURE Synthetic Fund - Direct Plan - Growth/ }).click();
    }
    await expect(page.getByTestId('stress-own-debt')).toContainText(/peak \d{4}-\d{2}-\d{2}, trough \d{4}-\d{2}-\d{2}/);
    await expect(page.getByTestId('stress-own-gold')).toBeVisible();
    await expect(page.getByTestId('stress-asset-changes')).not.toContainText('assumed unchanged');
  });
});

test.describe('legal drafts', () => {
  for (const path of ['/privacy', '/terms', '/disclaimer']) {
    test(`${path} shows the draft banner and owner placeholders, never invented details`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId('legal-draft-banner')).toContainText('Draft — owner to complete and have reviewed before launch');
      expect(await page.getByTestId('owner-placeholder').count()).toBeGreaterThan(0);
      await expect(page.locator('main')).not.toContainText('@');
    });
  }
});

test.describe('header clock', () => {
  test('shows the current IST time from the device clock and ticks', async ({ page }) => {
    await page.goto('/');
    const clock = page.locator('[data-clock]');
    await expect(clock).toBeVisible();
    await expect(clock).toContainText('Current time — IST');
    await expect(clock).toHaveAttribute('title', /device's clock/i);
    const time = clock.locator('time');
    await expect(time).toHaveText(/\d{1,2}:\d{2}:\d{2} (AM|PM) IST/);
    const first = await time.textContent();
    await expect.poll(async () => time.textContent(), { timeout: 4000 }).not.toBe(first);
    expect(await clock.locator('[aria-live]').count()).toBe(0);
  });
});
