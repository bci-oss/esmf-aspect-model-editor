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
import {API_BASE_URL, MODELS_API_ROUTE, NAMESPACES_URL, SAMM_VERSION_ACTUAL, setUpDefaultRoutes} from '../../support/api-mocks';
import {AppHelper} from '../../support/app-helper';
import {SELECTOR_contextMenu, SELECTOR_openFileMenu, SELECTOR_workspaceBtn} from '../../support/constants';
import {readFixture} from '../../support/drag-drop-utils';

/**
 * Element refactorings are offered in the element editor, the toolbar and the context menu of the graph. They need the
 * element to be stored in a workspace file: for a model that has not been saved yet, the menus explain why renaming and
 * moving are not possible and the usage dialog tells the user to save first instead of showing an error.
 */

const NAMESPACE = 'org.eclipse.examples.aspect';
const VERSION = '1.0.0';
const FILE = 'SampleModel.ttl';
const PROPERTY_URN = `urn:samm:${NAMESPACE}:${VERSION}#property1`;

const json = (route: Route, body: unknown) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});

async function openRefactoringContextMenu(page: Page, app: AppHelper, element: string): Promise<void> {
  await app.clickShape(element);
  // A loaded model may be scrolled so that the shape is partly hidden behind the toolbar
  await page.evaluate(name => {
    const graph = (window as any)['angular.maxgraphAttributeService'].graph;
    const cell = graph.getChildCells(graph.getDefaultParent(), true, false).find((c: any) => c.id === name);
    graph.scrollCellToVisible(cell, true);
  }, element);
  // The selection overlay of maxGraph covers the label, so the click goes to the shape position
  const box = await app.getHTMLCell(element).boundingBox();
  if (!box) throw new Error(`Shape ${element} is not rendered`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {button: 'right'});
  await page.getByTestId('context-menu-refactoring').hover();
}

test.describe('Element refactorings of an unsaved model', () => {
  let app: AppHelper;

  test.beforeEach(async ({page}) => {
    await setUpDefaultRoutes(page);
    await page.route(`**${API_BASE_URL}/models/usage*`, route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({message: 'No file defines the element'}),
      }),
    );

    app = new AppHelper(page);
    await app.startModelling(false);
  });

  test('disables rename and move in the element editor and tells why', async ({page}) => {
    await app.dbClickShape('property1');
    await page.getByTestId('element-refactoring-menu').click();

    await expect(page.getByTestId('element-refactoring-rename')).toBeDisabled();
    await expect(page.getByTestId('element-refactoring-move')).toBeDisabled();

    await page.getByTestId('element-refactoring-blocked').hover();
    await expect(page.locator('.mat-mdc-tooltip-show')).toHaveText('Save the model in a workspace first.');
  });

  test('asks to save the model instead of failing to load the usages', async ({page}) => {
    await app.dbClickShape('property1');
    await page.getByTestId('element-refactoring-menu').click();
    await page.getByTestId('element-refactoring-usages').click();

    await expect(page.getByTestId('element-usage-not-saved')).toContainText('is not saved in any workspace file yet');
    await expect(page.getByText('The usages could not be loaded.')).toBeHidden();
  });

  test('offers the toolbar menu only for a single selected element', async ({page}) => {
    await page.getByTestId('tbRefactoringButton').click();
    await expect(page.getByTestId('tbRefactoringRename')).toHaveCount(0);

    await app.clickShape('property1');
    await page.getByTestId('tbRefactoringButton').click();

    await expect(page.getByTestId('tbRefactoringRename')).toBeDisabled();
    await expect(page.getByTestId('tbRefactoringMove')).toBeDisabled();
    await expect(page.getByTestId('tbRefactoringUsages')).toBeEnabled();
  });

  test('disables rename and move in the context menu', async ({page}) => {
    await openRefactoringContextMenu(page, app, 'property1');

    await expect(page.getByTestId('context-menu-refactoring-rename').locator('td.mxDisabled').first()).toBeVisible();
    await expect(page.getByTestId('context-menu-refactoring-rename')).toHaveAttribute('title', 'Save the model in a workspace first.');
    await expect(page.getByTestId('context-menu-refactoring-move').locator('td.mxDisabled').first()).toBeVisible();

    await page.getByTestId('context-menu-refactoring-usages').click();
    await expect(page.getByTestId('element-usage-not-saved')).toBeVisible();
  });
});

test.describe('Element refactorings of a workspace model', () => {
  let app: AppHelper;
  let refactoringPreviews: unknown[];

  test.beforeEach(async ({page}) => {
    refactoringPreviews = [];
    await setUpDefaultRoutes(page);
    await page.route(`**${NAMESPACES_URL}`, route =>
      json(route, {
        [NAMESPACE]: [
          {
            version: VERSION,
            models: [
              {
                name: FILE,
                model: FILE,
                aspectModelUrn: `urn:samm:${NAMESPACE}:${VERSION}#AspectDefault`,
                version: SAMM_VERSION_ACTUAL,
                existing: true,
              },
            ],
          },
        ],
      }),
    );
    await page.route(`**${API_BASE_URL}/models/batch*`, route =>
      json(route, [
        {
          aspectModelUrn: `urn:samm:${NAMESPACE}:${VERSION}#AspectDefault`,
          aspectModel: readFixture('default-models/aspect-default.txt'),
          absoluteName: `${NAMESPACE}:${VERSION}:${FILE}`,
          fileName: FILE,
          modelVersion: SAMM_VERSION_ACTUAL,
        },
      ]),
    );
    await page.route(MODELS_API_ROUTE, route =>
      json(route, {
        content: readFixture('default-models/aspect-default.txt'),
        sourceLocation: `/home/user/aspect-models/${NAMESPACE}/${VERSION}/${FILE}`,
      }),
    );
    await page.route(`**${API_BASE_URL}/models/usage*`, route =>
      json(route, {
        urn: PROPERTY_URN,
        usages: [
          usage('AspectDefault', FILE, false),
          ...Array.from({length: 30}, (_, index) => usage(`consumer${index}`, `Consumer${index % 3}.ttl`, true)),
        ],
        unreadable: [],
      }),
    );
    await page.route(`**${API_BASE_URL}/refactoring/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/progress')) {
        return json(route, {running: true, phase: 'LOADING', step: 1, steps: 2, files: 1200});
      }
      if (path.endsWith('/preview')) {
        refactoringPreviews.push(route.request().postDataJSON());
        // Long enough for the dialog to poll the progress of a large workspace
        await new Promise(resolve => setTimeout(resolve, 1500));
        return json(route, {description: 'Rename', report: '', created: [], modified: [], removed: [], blocked: [], applicable: false});
      }
      return json(route, []);
    });

    app = new AppHelper(page);
    await app.startModelling(false);
    await openWorkspaceFile(page);
  });

  test('allows renaming without saving the model opened from the workspace first', async ({page}) => {
    await app.dbClickShape('property1');
    await page.getByTestId('element-refactoring-menu').click();

    await expect(page.getByTestId('element-refactoring-rename')).toBeEnabled();
    await expect(page.getByTestId('element-refactoring-move')).toBeEnabled();
    await page.getByTestId('element-refactoring-blocked').hover();
    await expect(page.locator('.mat-mdc-tooltip-show')).toHaveCount(0);
  });

  test('renames from the toolbar and shows the progress of a large workspace', async ({page}) => {
    await app.clickShape('property1');
    await page.getByTestId('tbRefactoringButton').click();
    await page.getByTestId('tbRefactoringRename').click();

    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('refactoring-new-name').fill('velocity');
    await dialog.getByTestId('refactoring-preview-button').click();

    await expect(dialog.getByTestId('refactoring-progress-step')).toHaveText('Step 1 of 2');
    await expect(dialog.getByTestId('refactoring-progress-phase')).toHaveText('Loading 1200 files…');
    await expect(dialog.getByTestId('refactoring-progress')).toHaveCount(0);
    expect(refactoringPreviews).toEqual([{type: 'RENAME_ELEMENT', urn: PROPERTY_URN, newName: 'velocity'}]);
  });

  test('moves from the context menu', async ({page}) => {
    await openRefactoringContextMenu(page, app, 'property1');
    await expect(page.getByTestId('context-menu-refactoring-move').locator('td.mxDisabled')).toHaveCount(0);

    await page.getByTestId('context-menu-refactoring-move').click();

    await expect(page.getByRole('dialog').getByTestId('refactoring-target-file')).toBeVisible();
    await expect(page.locator(SELECTOR_contextMenu)).toHaveCount(0);
  });

  test('lists many usages grouped by file and filters them', async ({page}) => {
    await openRefactoringContextMenu(page, app, 'property1');
    await page.getByTestId('context-menu-refactoring-usages').click();

    await expect(page.getByTestId('element-usage-summary')).toHaveText('31 usages in 4 files');
    await expect(page.getByTestId('element-usage-group')).toHaveCount(4);
    await expect(page.getByTestId('element-usage-entry')).toHaveCount(31);

    await page.getByTestId('element-usage-filter').fill('consumer7');
    await expect(page.getByTestId('element-usage-entry')).toHaveCount(1);
    await expect(page.getByTestId('element-usage-group')).toContainText('Consumer1.ttl');

    await page.getByTestId('element-usage-filter').fill('unknown');
    await expect(page.getByTestId('element-usage-no-match')).toBeVisible();
  });
});

/**
 * A file without an Aspect is opened by the URN of one of its elements. If that element is renamed, the tab has to be
 * reloaded by the new URN; the old one no longer exists in any file.
 */
test.describe('Renaming the element a file is opened by', () => {
  const PROPERTIES_FILE = 'Movement.ttl';
  const VELOCITY_URN = `urn:samm:${NAMESPACE}:${VERSION}#velocity`;
  const propertiesFile = (name: string) => `@prefix samm: <urn:samm:org.eclipse.esmf.samm:meta-model:${SAMM_VERSION_ACTUAL}#> .
@prefix samm-c: <urn:samm:org.eclipse.esmf.samm:characteristic:${SAMM_VERSION_ACTUAL}#> .
@prefix : <urn:samm:${NAMESPACE}:${VERSION}#> .

:${name} a samm:Property ;
   samm:characteristic samm-c:Text .
`;
  const changedFile = {
    namespace: NAMESPACE,
    version: VERSION,
    fileName: PROPERTIES_FILE,
    path: `/home/user/aspect-models/${NAMESPACE}/${VERSION}/${PROPERTIES_FILE}`,
    readOnly: false,
  };

  let app: AppHelper;
  let renamed: boolean;
  let requestedUrns: string[];

  test.beforeEach(async ({page}) => {
    renamed = false;
    requestedUrns = [];
    await setUpDefaultRoutes(page);
    await page.route(`**${NAMESPACES_URL}`, route =>
      json(route, {
        [NAMESPACE]: [
          {
            version: VERSION,
            models: [
              {
                name: PROPERTIES_FILE,
                model: PROPERTIES_FILE,
                aspectModelUrn: renamed ? VELOCITY_URN : PROPERTY_URN,
                version: SAMM_VERSION_ACTUAL,
                existing: true,
              },
            ],
          },
        ],
      }),
    );
    await page.route(`**${API_BASE_URL}/models/batch*`, route =>
      json(route, [
        {
          aspectModelUrn: renamed ? VELOCITY_URN : PROPERTY_URN,
          aspectModel: propertiesFile(renamed ? 'velocity' : 'property1'),
          absoluteName: `${NAMESPACE}:${VERSION}:${PROPERTIES_FILE}`,
          fileName: PROPERTIES_FILE,
          modelVersion: SAMM_VERSION_ACTUAL,
        },
      ]),
    );
    await page.route(MODELS_API_ROUTE, route => {
      const urn = route.request().headers()['aspect-model-urn'];
      requestedUrns.push(urn);
      if (urn !== (renamed ? VELOCITY_URN : PROPERTY_URN)) {
        return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({message: `${urn} does not exist`})});
      }
      return json(route, {content: propertiesFile(renamed ? 'velocity' : 'property1'), sourceLocation: changedFile.path});
    });
    await page.route(`**${API_BASE_URL}/refactoring/**`, route => {
      const path = new URL(route.request().url()).pathname;
      const change = {description: 'Rename property1 to velocity', created: [], modified: [changedFile], removed: []};
      if (path.endsWith('/preview')) return json(route, {...change, report: '', blocked: [], applicable: true});
      if (path.endsWith('/apply')) {
        renamed = true;
        return json(route, {...change, id: '1', timestamp: 1});
      }
      return json(route, {running: false, phase: null, step: 0, steps: 0, files: 0});
    });

    app = new AppHelper(page);
    await app.startModelling(false);
    await page.locator(SELECTOR_workspaceBtn).click({force: true});
    await page.getByRole('button', {name: `Select file ${PROPERTIES_FILE}`}).hover();
    await page.locator(SELECTOR_openFileMenu).first().click();
    await page.getByTestId('fileMenuOpenSubMenuButton').click();
    await page.getByTestId('fileMenuLoadAspectModelCurrentButton').click();
    await expect(page.getByTestId('editor-tab').first()).toContainText(PROPERTIES_FILE);
    await page.locator(SELECTOR_workspaceBtn).click({force: true});
  });

  test('reloads the open file by the new URN of the element', async ({page}) => {
    await app.clickShape('property1');
    await page.getByTestId('tbRefactoringButton').click();
    await page.getByTestId('tbRefactoringRename').click();

    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('refactoring-new-name').fill('velocity');
    await dialog.getByTestId('refactoring-preview-button').click();
    await dialog.getByTestId('refactoring-apply').click();

    await expect.poll(() => requestedUrns.at(-1)).toBe(VELOCITY_URN);
    await app.shapeExists('velocity');
    await app.shapeExists('property1', false);
    expect(requestedUrns).not.toContain(undefined);
    expect(requestedUrns.filter(urn => urn === PROPERTY_URN)).toHaveLength(1);
  });
});

function usage(name: string, fileName: string, external: boolean) {
  return {
    urn: `urn:samm:${NAMESPACE}:${VERSION}#${name}`,
    namespace: NAMESPACE,
    version: VERSION,
    fileName,
    path: `/home/user/aspect-models/${NAMESPACE}/${VERSION}/${fileName}`,
    readOnly: false,
    external,
  };
}

async function openWorkspaceFile(page: Page): Promise<void> {
  await page.locator(SELECTOR_workspaceBtn).click({force: true});
  // The file menu button is only rendered on hover of the file row
  await page.getByRole('button', {name: `Select file ${FILE}`}).hover();
  await page.locator(SELECTOR_openFileMenu).first().click();
  await page.getByTestId('fileMenuOpenSubMenuButton').click();
  await page.getByTestId('fileMenuLoadAspectModelCurrentButton').click();
  await expect(page.getByTestId('editor-tab').first()).toContainText(FILE);
  await page.locator(SELECTOR_workspaceBtn).click({force: true});
  await expect(page.locator('ame-workspace-file-list')).toBeHidden();
}
