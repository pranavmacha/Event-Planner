import {test, expect, type Page} from '@playwright/test';

const change = 'We now have 250 guests instead of 200, our budget is ₹7 lakh instead of ₹8 lakh, and the event is two weeks earlier. Keep food quality as the top priority.';
const eventRead = async (page: Page, id: string) => {
  const response = await page.request.get(`/api/events/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
};
const successful = (path: string, method = 'POST') => (response: import('@playwright/test').Response) => response.url().endsWith(path) && response.request().method() === method && response.ok();

async function addQuote(page: Page, name: string, amount: string, coverage: string) {
  await page.getByRole('button', {name: 'Add vendor quote', exact: true}).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Vendor name', {exact: true}).fill(name);
  await form.getByLabel('Quoted total, before taxes (₹)', {exact: true}).fill(amount);
  await form.getByLabel('Guests covered', {exact: true}).fill(coverage);
  await form.getByLabel('Taxes (₹)', {exact: true}).fill('9000');
  await form.getByLabel('Additional charges (₹)', {exact: true}).fill('5000');
  await form.getByLabel('Inclusions', {exact: true}).fill('Vegetarian buffet, crockery and service staff');
  await form.getByLabel('Exclusions', {exact: true}).fill('Overtime after 10 pm');
  await form.getByLabel('Payment terms', {exact: true}).fill('25% deposit; remainder after service');
  await form.getByRole('button', {name: 'Add quote', exact: true}).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole('heading', {name, exact: true})).toBeVisible();
}

test('create → edit → compare → discard → apply → refresh → restore, with isolated ownership', async ({page, browser}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Demo mode', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Create an event', exact: true}).click();
  let dialog = page.getByRole('dialog');
  const date = new Date(); date.setMonth(date.getMonth() + 4);
  const isoDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  await dialog.getByLabel('Event name', {exact: true}).fill('Meera & Kabir’s celebration');
  await dialog.getByLabel('City or locality', {exact: true}).fill('Bengaluru');
  await dialog.getByLabel('Event date', {exact: true}).fill(isoDate);
  await dialog.getByLabel('Expected guests', {exact: true}).fill('200');
  await dialog.getByLabel('Total budget (₹)', {exact: false}).fill('800000');
  await dialog.getByRole('button', {name: 'Continue', exact: true}).click();
  await dialog.getByLabel('Theme or inspiration', {exact: false}).fill('Marigolds and family stories');
  await dialog.getByRole('button', {name: 'Continue', exact: true}).click();
  await dialog.getByLabel('Non-negotiable requirements', {exact: false}).fill('Accessible venue\nProtect food quality');
  await dialog.getByLabel('Dietary preferences', {exact: true}).fill('Vegetarian and Jain options');
  await dialog.getByLabel('Accessibility needs', {exact: true}).fill('Step-free entry and accessible toilets');
  const createdResponse = page.waitForResponse(successful('/api/events'));
  await dialog.getByRole('button', {name: 'Create my event', exact: true}).click();
  const created = await (await createdResponse).json();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', {name: 'Meera & Kabir’s celebration', exact: true})).toBeVisible();
  expect(created.budget_paise).toBe(80_000_000);
  expect(created.guest_count).toBe(200);

  await page.getByRole('button', {name: 'Budget', exact: true}).click();
  await page.getByRole('button', {name: 'Edit Catering & refreshments', exact: true}).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Estimated price per guest (₹)', {exact: false}).fill('1800');
  await dialog.getByLabel('Quoted total (₹)', {exact: false}).fill('350000');
  await dialog.getByLabel('Committed total (₹)', {exact: true}).fill('350000');
  await dialog.getByLabel('Guests covered by confirmed amount', {exact: false}).fill('200');
  await dialog.getByRole('button', {name: 'Save expense', exact: true}).click();
  await expect(dialog).not.toBeVisible();
  let current = await eventRead(page, created.id);
  const food = current.budget_items.find((item: any) => item.category === 'food');
  expect(food.projected_paise).toBe(35_000_000);

  await page.getByRole('button', {name: /^Tasks & timeline/}).click();
  await page.getByRole('button', {name: 'Complete task: Confirm guest list & essential requirements', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Reopen task: Confirm guest list & essential requirements', exact: true})).toBeVisible();
  current = await eventRead(page, created.id);
  expect(current.tasks.find((t: any) => t.title === 'Shortlist accessible venues').readiness).toBe('ready');

  await page.getByRole('button', {name: 'Vendors', exact: true}).click();
  await addQuote(page, 'Marigold Catering', '180000', '200');
  await addQuote(page, 'Saffron Table', '195000', '250');
  await page.getByRole('checkbox', {name: 'Select Marigold Catering for comparison'}).check();
  await page.getByRole('checkbox', {name: 'Select Saffron Table for comparison'}).check();
  await page.getByRole('button', {name: 'Compare selected quotes', exact: true}).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Deterministic demo comparison', {exact: true})).toBeVisible();
  await expect(dialog.getByRole('columnheader', {name: 'Marigold Catering', exact: true})).toBeVisible();
  await expect(dialog.getByRole('columnheader', {name: 'Saffron Table', exact: true})).toBeVisible();
  await dialog.getByRole('button', {name: 'Back to my shortlist', exact: true}).click();

  const before = await eventRead(page, created.id);
  await page.getByRole('button', {name: 'Change my plan', exact: true}).click();
  await page.getByRole('dialog').getByRole('textbox', {name: 'Change my plan', exact: true}).fill(change);
  const previewResponse = page.waitForResponse(successful(`/api/events/${created.id}/proposals`));
  await page.getByRole('dialog').getByRole('button', {name: 'Preview changes', exact: true}).click();
  const proposal = await (await previewResponse).json();
  await expect(page.getByRole('heading', {name: 'A change of plans, clearly laid out.', exact: true})).toBeVisible();
  await page.screenshot({path: '../docs/screenshots/revision-preview.png', animations: 'disabled'});
  expect(proposal.after.guest_count).toBe(250);
  expect(proposal.after.budget_paise).toBe(70_000_000);
  const earlier = new Date(`${before.event_date}T12:00:00Z`); earlier.setUTCDate(earlier.getUTCDate()-14);
  expect(proposal.after.event_date).toBe(earlier.toISOString().slice(0,10));
  expect(proposal.after.summary.reserve_paise).toBe(7_000_000);
  const revisedFood = proposal.after.budget_items.find((i: any) => i.id === food.id);
  expect(revisedFood.committed_paise).toBe(35_000_000);
  expect(revisedFood.quoted_paise).toBe(35_000_000);
  expect(revisedFood.projected_paise).toBe(44_000_000);
  for (const item of before.budget_items.filter((i: any) => i.cost_type === 'fixed')) {
    expect(proposal.after.budget_items.find((i: any) => i.id === item.id).projected_paise).toBe(item.projected_paise);
  }
  const completed = before.tasks.find((t: any) => t.status === 'done');
  expect(proposal.after.tasks.find((t: any) => t.id === completed.id).due_date).toBe(completed.due_date);
  expect(proposal.task_impacts.length).toBe(before.tasks.filter((t: any) => t.status !== 'done').length);
  expect(proposal.after.summary.remaining_paise).toBe(70_000_000 - proposal.after.summary.projected_paise - 7_000_000);
  await page.getByRole('dialog').getByRole('button', {name: 'Discard proposal', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await eventRead(page, created.id)).toEqual(before);

  await page.getByRole('button', {name: 'Change my plan', exact: true}).click();
  await page.getByRole('dialog').getByRole('textbox', {name: 'Change my plan', exact: true}).fill(change);
  await page.getByRole('dialog').getByRole('button', {name: 'Preview changes', exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Apply revised plan', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Meera & Kabir’s celebration', exact: true})).toBeVisible();
  const applied = await eventRead(page, created.id);
  expect(applied.guest_count).toBe(250);
  expect(applied.budget_paise).toBe(70_000_000);
  expect(applied.version).toBe(before.version + 1);
  expect(applied.non_negotiables).toEqual(before.non_negotiables);
  expect(applied.vendors).toEqual(before.vendors);

  await page.getByRole('button', {name: 'Plan history', exact: true}).click();
  const historyRow = page.locator('.history-row').filter({hasText: 'Before applying change:'}).first();
  await historyRow.getByRole('button', {name: 'Restore this version', exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Restore saved plan', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const restored = await eventRead(page, created.id);
  expect(restored.guest_count).toBe(200);
  expect(restored.budget_paise).toBe(80_000_000);
  expect(restored.event_date).toBe(before.event_date);
  expect(restored.budget_items).toEqual(before.budget_items);
  expect(restored.tasks).toEqual(before.tasks);
  expect(restored.vendors).toEqual(before.vendors);
  await page.getByRole('button', {name: 'Overview', exact: true}).click();
  await page.setViewportSize({width: 1440, height: 1050});
  await page.screenshot({path: '../docs/screenshots/overview.png', animations: 'disabled'});

  const second = await browser.newContext();
  const outsider = await second.newPage();
  await outsider.goto('http://127.0.0.1:5173');
  await expect(outsider.getByRole('button', {name: 'Create an event', exact: true})).toBeVisible();
  expect(await (await second.request.get('http://127.0.0.1:5173/api/events')).json()).toEqual([]);
  expect((await second.request.get(`http://127.0.0.1:5173/api/events/${created.id}`)).status()).toBe(404);
  expect((await second.request.post(`http://127.0.0.1:5173/api/events/${created.id}/proposals/${proposal.id}/apply`)).status()).toBe(404);
  await second.close();
  expect(errors).toEqual([]);
});

test('mobile sample workspace has usable navigation without page overflow', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/');
  await page.getByRole('button', {name: 'Explore sample wedding', exact: true}).click();
  await expect(page.getByRole('heading', {name: "Ananya & Arjun's wedding", exact: true})).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', {name: 'Open navigation', exact: true}).click();
  await page.getByRole('button', {name: 'Budget', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Budget', exact: true})).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
