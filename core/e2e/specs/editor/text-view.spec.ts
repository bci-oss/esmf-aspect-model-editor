/*
 * Copyright (c) 2026 Robert Bosch Manufacturing Solutions GmbH
 *
 * See the AUTHORS file(s) distributed with this work for
 * additional information regarding authorship.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

import {expect, Page, Route, test} from '@playwright/test';
import {API_BASE_URL, FORMAT_API_URL, VALIDATE_API_URL} from '../../support/api-mocks';
import {AppHelper} from '../../support/app-helper';
import {SELECTOR_tbDeleteButton, SELECTOR_tbValidateButton} from '../../support/constants';

const NS = 'urn:samm:org.eclipse.examples.aspect:1.0.0#';

const FORMATTED_MODEL = `@prefix samm: <urn:samm:org.eclipse.esmf.samm:meta-model:2.2.0#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix : <${NS}> .

:AspectDefault a samm:Aspect ;
   samm:preferredName "AspectDefault"@en ;
   samm:properties ( :property1 ) ;
   samm:operations ( ) ;
   samm:events ( ) .

:property1 a samm:Property ;
   samm:characteristic :Characteristic1 .

:Characteristic1 a samm:Characteristic ;
   samm:dataType xsd:string .
`;

async function routeFormat(page: Page, body: string, delayMs = 0): Promise<void> {
  await page.route(FORMAT_API_URL, async (route: Route) => {
    if (delayMs) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    await route.fulfill({status: 200, contentType: 'text/plain', body});
  });
}

test.describe('Editor - Graph / Aspect Model text view', () => {
  let app: AppHelper;

  const textContent = (page: Page) => page.getByTestId('text-view-content');

  async function openTextView(page: Page): Promise<void> {
    await page.getByTestId('editor-view-text').click();
    await page.mouse.move(400, 400);
    await expect(page.getByTestId('canvas-area')).toHaveAttribute('data-view-mode', 'text');
    await expect(textContent(page)).toBeVisible();
  }

  test.beforeEach(async ({page}) => {
    app = new AppHelper(page);
    await app.startModelling();
  });

  test('switches between graph and read-only Turtle text', async ({page}) => {
    await expect(page.getByTestId('editor-view-toggle')).toBeVisible();
    await openTextView(page);

    await expect(page.locator('#graph')).toBeHidden();
    await expect(textContent(page)).toContainText(':AspectDefault');
    await expect(textContent(page)).toContainText('samm:Aspect');
    await expect(textContent(page)).toHaveAttribute('aria-readonly', 'true');
    await expect(page.locator('.cm-lineNumbers .cm-gutterElement', {hasText: /^1$/})).toBeVisible();
    await expect(page.getByTestId('text-view-readonly')).toBeVisible();
    await expect(page.getByTestId('text-view-line-count')).toBeVisible();
    // The e2e format mock returns nothing, so the raw serialization is shown.
    await expect(page.getByTestId('text-view-unformatted')).toBeVisible();
    const fontFamily = await page
      .locator('.cm-line span')
      .first()
      .evaluate(el => getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('monospace');

    await page.getByTestId('editor-view-graph').click();
    await expect(page.locator('#graph')).toBeVisible();
    await expect(page.locator('ame-aspect-model-text-view')).toHaveCount(0);
  });

  test('closes an open sidebar when switching to the text view', async ({page}) => {
    await page.getByTestId('elementsBtn').click();
    await expect(page.locator('ame-sidebar-samm-elements')).toBeVisible();

    await openTextView(page);
    await expect(page.locator('ame-sidebar-samm-elements')).toHaveCount(0);
    await expect(page.getByTestId('elementsBtn')).not.toHaveClass(/selected/);

    await page.getByTestId('workspaceBtn').click();
    await expect(page.locator('ame-workspace')).toBeVisible();
    await page.getByTestId('editor-view-graph').click();
    await openTextView(page);
    await expect(page.locator('ame-workspace')).toHaveCount(0);
  });

  test('shows the formatted model as it would be saved', async ({page}) => {
    await routeFormat(page, FORMATTED_MODEL);
    await openTextView(page);

    await expect(textContent(page)).toContainText(':property1 a samm:Property ;');
    await expect(page.getByTestId('text-view-unformatted')).toHaveCount(0);
  });

  test('disables graph-only toolbar actions in the text view', async ({page}) => {
    await openTextView(page);

    await expect(page.locator(SELECTOR_tbDeleteButton)).toHaveClass(/disabled/);
    await expect(page.locator('[data-testid="formatButton"]')).toHaveClass(/disabled/);
    await expect(page.locator(SELECTOR_tbValidateButton)).not.toHaveClass(/disabled/);
  });

  test('scrolls to the element selected in the graph', async ({page}) => {
    await routeFormat(page, FORMATTED_MODEL);
    await app.clickShape('property1');
    await openTextView(page);

    await expect(page.locator('.cm-ame-target-line')).toContainText(':property1 a samm:Property');
  });

  test.describe('open in VS Code', () => {
    const LOCATION_PATH = '/home/user/aspect-models/org.eclipse.examples.aspect/1.0.0/AspectDefault.ttl';

    async function trackOpenedUrls(page: Page): Promise<() => Promise<string[]>> {
      await page.evaluate(() => {
        (window as any).__openedUrls = [];
        window.open = (url?: string | URL) => {
          (window as any).__openedUrls.push(String(url));
          return null;
        };
      });
      return () => page.evaluate(() => (window as any).__openedUrls as string[]);
    }

    async function routeLocation(page: Page): Promise<string[]> {
      const requestedUrns: string[] = [];
      await page.route(`${API_BASE_URL}/models/location*`, async (route: Route) => {
        requestedUrns.push(route.request().headers()['aspect-model-urn']);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({path: LOCATION_PATH, line: 9, column: 1}),
        });
      });
      return requestedUrns;
    }

    test('opens the element clicked with Ctrl or Cmd at its declaration', async ({page}) => {
      await routeFormat(page, FORMATTED_MODEL);
      const requestedUrns = await routeLocation(page);
      await openTextView(page);
      const openedUrls = await trackOpenedUrls(page);

      await page
        .locator('.cm-line', {hasText: /^:property1 a samm:Property/})
        .click({position: {x: 12, y: 5}, modifiers: ['ControlOrMeta']});

      await expect.poll(openedUrls).toEqual([`vscode://file${LOCATION_PATH}:9:1`]);
      expect(requestedUrns).toEqual([`${NS}property1`]);
    });

    test('shows the element under the mouse as link while Ctrl or Cmd is held', async ({page}) => {
      await routeFormat(page, FORMATTED_MODEL);
      await openTextView(page);
      const line = page.locator('.cm-line', {hasText: /^:property1 a samm:Property/});

      await line.hover({position: {x: 12, y: 5}});
      await expect(page.locator('.cm-ame-element-link')).toHaveCount(0);

      await page.keyboard.down('ControlOrMeta');
      await expect(page.locator('.cm-ame-element-link')).toHaveText(':property1');
      await page.keyboard.up('ControlOrMeta');
      await expect(page.locator('.cm-ame-element-link')).toHaveCount(0);
    });

    test('opens the element via the icon next to its definition', async ({page}) => {
      await routeFormat(page, FORMATTED_MODEL);
      const requestedUrns = await routeLocation(page);
      await openTextView(page);
      const openedUrls = await trackOpenedUrls(page);

      const lineBox = await page.locator('.cm-line', {hasText: /^:property1 a samm:Property/}).boundingBox();
      const icons = page.locator('.cm-ame-activate-gutter [data-testid="text-view-open-element"]');
      let clicked = false;
      for (const icon of await icons.all()) {
        const box = await icon.boundingBox();
        if (lineBox && box && Math.abs(box.y + box.height / 2 - (lineBox.y + lineBox.height / 2)) < lineBox.height / 2) {
          await expect(icon).toHaveAttribute('title', /VS Code/);
          await icon.click();
          clicked = true;
          break;
        }
      }

      expect(clicked).toBe(true);
      await expect.poll(openedUrls).toEqual([`vscode://file${LOCATION_PATH}:9:1`]);
      expect(requestedUrns).toEqual([`${NS}property1`]);
    });

    test('opens the element at the cursor via the toolbar', async ({page}) => {
      await routeFormat(page, FORMATTED_MODEL);
      const requestedUrns = await routeLocation(page);
      await openTextView(page);
      const openedUrls = await trackOpenedUrls(page);

      await page.locator('.cm-line', {hasText: /^:Characteristic1 a/}).click({position: {x: 12, y: 5}});
      const button = page.getByTestId('text-view-open-in-external-editor');
      await button.click();

      await expect.poll(openedUrls).toEqual([`vscode://file${LOCATION_PATH}:9:1`]);
      expect(requestedUrns).toEqual([`${NS}Characteristic1`]);
    });
  });

  test('underlines validation errors at the element and shows them on hover', async ({page}) => {
    await routeFormat(page, FORMATTED_MODEL);
    await page.route(VALIDATE_API_URL, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          violationErrors: [
            {message: 'Property1 is broken', focusNode: `${NS}property1`, fix: [], errorCode: 'ERR_TEST'},
            {message: 'Characteristic1 is broken', focusNode: `${NS}Characteristic1`, fix: [], errorCode: 'ERR_TEST'},
          ],
        }),
      });
    });
    await page.locator(SELECTOR_tbValidateButton).click();
    await openTextView(page);

    await expect(page.getByTestId('text-view-problems')).toContainText('2');
    const marks = page.locator('.cm-lintRange-error');
    await expect(marks).toHaveCount(2);
    // the element is underlined, not the whole line
    await expect(marks.first()).toHaveText(':property1');
    await expect(marks.last()).toHaveText(':Characteristic1');
    await expect(page.locator('.cm-gutter-lint .cm-lint-marker-error')).toHaveCount(2);

    await marks.first().hover();
    await expect(page.locator('.cm-tooltip-lint')).toContainText('Property1 is broken');

    // F8 selects the next problem in the text
    await textContent(page).click();
    await page.keyboard.press('F8');
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toMatch(/^(:property1|:Characteristic1)$/);

    await page.getByTestId('text-view-problems').click();
    await expect(page.locator('.cm-ame-target-line')).toContainText(':property1 a samm:Property');
    await page.getByTestId('text-view-problems').click();
    await expect(page.locator('.cm-ame-target-line')).toContainText(':Characteristic1 a samm:Characteristic');
  });

  test('hides the problem counter for a valid model', async ({page}) => {
    await routeFormat(page, FORMATTED_MODEL);
    await page.route(VALIDATE_API_URL, route =>
      route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({violationErrors: []})}),
    );
    await page.locator(SELECTOR_tbValidateButton).click();
    await openTextView(page);

    await expect(textContent(page)).toContainText(':property1 a samm:Property');
    await expect(page.getByTestId('text-view-problems')).toHaveCount(0);
    await expect(page.locator('.cm-lintRange-error')).toHaveCount(0);
  });

  test('shows a loading indicator while the model is formatted', async ({page}) => {
    await routeFormat(page, FORMATTED_MODEL, 1500);
    await page.getByTestId('editor-view-text').click();

    await expect(page.getByTestId('text-view-loading')).toBeVisible();
    await expect(textContent(page)).toContainText(':property1 a samm:Property ;', {timeout: 10000});
    await expect(page.getByTestId('text-view-loading')).toHaveCount(0);
  });

  test('opens the search panel via button and keyboard shortcut', async ({page}) => {
    await openTextView(page);

    await page.getByTestId('text-view-search').click();
    await expect(page.locator('.cm-search')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-search')).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+f');
    await expect(page.locator('.cm-search')).toBeVisible();
  });

  test('keeps the graph when deleting from the text view via keyboard', async ({page}) => {
    await app.clickShape('property1');
    await openTextView(page);
    await textContent(page).click();
    await page.keyboard.press('Delete');

    await page.getByTestId('editor-view-graph').click();
    await app.shapeExists('property1');
  });
});
