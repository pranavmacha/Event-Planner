import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Inspect stable content; the application respects this accessibility preference.
test.use({reducedMotion: 'reduce'});

test('overview and setup have no WCAG A/AA accessibility violations', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: 'Create an event', exact: true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const setup = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(setup.violations, JSON.stringify(setup.violations.map(v => ({id:v.id, nodes:v.nodes.map(n => ({target:n.target, summary:n.failureSummary}))})), null, 2)).toEqual([]);
  await page.getByRole('button', {name: 'Close dialog', exact: true}).click();
  await page.getByRole('button', {name: 'Explore sample wedding', exact: true}).click();
  await expect(page.getByRole('heading', {name: "Ananya & Arjun's wedding", exact: true})).toBeVisible();
  const overview = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(overview.violations, JSON.stringify(overview.violations.map(v => ({id:v.id, nodes:v.nodes.map(n => ({target:n.target, summary:n.failureSummary}))})), null, 2)).toEqual([]);
});
