import { expect, test, type Page, type Route } from '@playwright/test';

const settleRender = (page: Page) => page.evaluate(() => new Promise<void>(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
}));

test('the production build creates a plan under its content security policy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /content security policy/i.test(message.text())) errors.push(message.text());
  });
  const response = await page.goto('http://127.0.0.1:8000/');
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await page.getByRole('button', { name: 'Explore sample wedding', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Ananya & Arjun's wedding", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a delayed focus refresh cannot replace a newer saved task', async ({ page }) => {
  const response = await page.request.post('/api/events/sample', { data: {} });
  expect(response.ok()).toBeTruthy();
  const before = await response.json();
  await page.goto('/');
  await page.getByRole('button', { name: /^Tasks & timeline/ }).click();

  let delayed: Route | undefined;
  let started!: () => void;
  const refreshStarted = new Promise<void>(resolve => { started = resolve; });
  await page.route(`**/api/events/${before.id}`, route => {
    delayed = route;
    started();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshStarted;

  const title = 'Confirm guest list & essential requirements';
  await page.getByRole('button', { name: `Complete task: ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Reopen task: ${title}`, exact: true })).toBeVisible();

  await Promise.all([
    page.waitForResponse(res => res.url().endsWith(`/api/events/${before.id}`)),
    delayed!.fulfill({ json: before }),
  ]);
  await settleRender(page);
  await expect(page.getByRole('button', { name: `Reopen task: ${title}`, exact: true })).toBeVisible();
});

test('switching events cancels a focus refresh without switching back', async ({ page }) => {
  const first = await (await page.request.post('/api/events/sample', { data: {} })).json();
  const second = await (await page.request.post('/api/events/sample', { data: {} })).json();
  await page.addInitScript(id => localStorage.setItem('gatherly.activeEvent', id), first.id);
  await page.goto('/');
  const switcher = page.getByRole('combobox', { name: 'Switch event', exact: true });
  await expect(switcher).toHaveValue(first.id);
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible();

  let delayed: Route | undefined;
  let started!: () => void;
  const refreshStarted = new Promise<void>(resolve => { started = resolve; });
  await page.route(`**/api/events/${first.id}`, route => {
    delayed = route;
    started();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshStarted;
  await switcher.selectOption(second.id);
  await delayed!.fulfill({ json: first });
  await settleRender(page);
  await expect(switcher).toHaveValue(second.id);
});

test('blocked browser storage does not prevent loading or saving a plan', async ({ page }) => {
  await page.addInitScript(() => {
    const unavailable = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.getItem = unavailable;
    Storage.prototype.setItem = unavailable;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore sample wedding', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Ananya & Arjun's wedding", exact: true })).toBeVisible();
  await expect(page.getByText('Storage blocked', { exact: true })).not.toBeVisible();
});

test('two submissions in the same turn create only one event', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an event', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Event name', { exact: true }).fill('One celebration');
  await dialog.getByLabel('City or locality', { exact: true }).fill('Bengaluru');
  await dialog.getByLabel('Expected guests', { exact: true }).fill('100');
  await dialog.getByLabel('Total budget (₹)', { exact: false }).fill('500000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  const attempts = await dialog.locator('form').evaluate(form => {
    const originalFetch = window.fetch;
    let writes = 0;
    window.fetch = (input, init) => {
      if (input === '/api/events' && init?.method === 'POST') writes += 1;
      return originalFetch(input, init);
    };
    try {
      (form as HTMLFormElement).requestSubmit();
      (form as HTMLFormElement).requestSubmit();
      return writes;
    } finally {
      window.fetch = originalFetch;
    }
  });
  expect(attempts).toBe(1);
  await expect(dialog).not.toBeVisible();
  const saved = await (await page.request.get('/api/events')).json();
  expect(saved).toHaveLength(1);
});

test('the workspace loads summaries and only fetches the selected full plan', async ({ page }) => {
  const first = await (await page.request.post('/api/events/sample', { data: {} })).json();
  const second = await (await page.request.post('/api/events/sample', { data: {} })).json();
  await page.addInitScript(id => localStorage.setItem('gatherly.activeEvent', id), first.id);
  const details: string[] = [];
  page.on('request', request => {
    const match = new URL(request.url()).pathname.match(/^\/api\/events\/([^/]+)$/);
    if (request.method() === 'GET' && match) details.push(match[1]);
  });
  const summaryResponse = page.waitForResponse(response => response.url().endsWith('/api/events?summary=true'));
  await page.goto('/');
  const summaries = await (await summaryResponse).json();
  expect(summaries).toHaveLength(2);
  for (const summary of summaries)
    expect(Object.keys(summary).sort()).toEqual(['city', 'event_date', 'id', 'name', 'occasion', 'version']);
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible();
  expect(details).toEqual([first.id]);

  const switcher = page.getByRole('combobox', { name: 'Switch event', exact: true });
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/events/${second.id}`)),
    switcher.selectOption(second.id),
  ]);
  await expect(page.getByRole('heading', { name: second.name, exact: true })).toBeVisible();
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/events/${first.id}`)),
    switcher.selectOption(first.id),
  ]);
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible();
  // Switching back fetches a fresh plan instead of retaining every full snapshot.
  expect(details).toEqual([first.id, second.id, first.id]);
});

test('switching while a plan loads prevents its late response from replacing the selection', async ({ page }) => {
  const first = await (await page.request.post('/api/events/sample', { data: {} })).json();
  const second = await (await page.request.post('/api/events/sample', { data: {} })).json();
  await page.addInitScript(id => localStorage.setItem('gatherly.activeEvent', id), first.id);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible();

  let delayed: Route | undefined;
  let started!: () => void;
  const detailStarted = new Promise<void>(resolve => { started = resolve; });
  await page.route(`**/api/events/${second.id}`, route => {
    delayed = route;
    started();
  });
  const switcher = page.getByRole('combobox', { name: 'Switch event', exact: true });
  await switcher.selectOption(second.id);
  await detailStarted;
  await expect(page.getByText('Loading your celebration…', { exact: true })).toBeVisible();
  await switcher.selectOption(first.id);
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible();
  await delayed!.fulfill({ json: { ...second, name: 'The other celebration' } });
  await settleRender(page);
  await expect(switcher).toHaveValue(first.id);
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The other celebration', exact: true })).not.toBeVisible();
});

test('a failed selected plan can be retried without losing the event switcher', async ({ page }) => {
  const saved = await (await page.request.post('/api/events/sample', { data: {} })).json();
  let attempts = 0;
  await page.route(`**/api/events/${saved.id}`, route => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { detail: 'Please try loading this celebration again.' } })
      : route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your celebration needs a moment.', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Switch event', exact: true })).toHaveValue(saved.id);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: saved.name, exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
