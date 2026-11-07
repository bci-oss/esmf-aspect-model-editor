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
import {API_BASE_URL, NAMESPACES_URL, SAMM_VERSION_ACTUAL, setUpDefaultRoutes} from '../../support/api-mocks';
import {AppHelper} from '../../support/app-helper';
import {SELECTOR_openFileMenu, SELECTOR_workspaceBtn} from '../../support/constants';
import {readFixture} from '../../support/drag-drop-utils';

/**
 * Refactorings started from the workspace: the dialog previews the changed files, applies the refactoring through the
 * SDK and offers to undo it. The backend is mocked; the tests check the requests and what the user sees.
 */

const NAMESPACE = 'org.eclipse.examples.aspect';
const VERSION = '1.0.0';
const FILE = 'SampleModel.ttl';
const REFACTORING_URL = `${API_BASE_URL}/refactoring`;

const changedFile = (fileName: string, readOnly = false) => ({
  namespace: NAMESPACE,
  version: VERSION,
  fileName,
  path: `/home/user/aspect-models/${NAMESPACE}/${VERSION}/${fileName}`,
  readOnly,
});

const RENAME_PREVIEW = {
  description: `Rename file ${FILE} to Renamed.ttl`,
  report: '',
  created: [changedFile('Renamed.ttl')],
  modified: [],
  removed: [changedFile(FILE)],
  blocked: [],
  applicable: true,
};

const HISTORY_ENTRY = {
  id: 'refactoring-1',
  description: RENAME_PREVIEW.description,
  timestamp: 1767225600000,
  created: RENAME_PREVIEW.created,
  modified: [],
  removed: RENAME_PREVIEW.removed,
};

interface RefactoringRequests {
  previews: any[];
  applies: any[];
  reverts: string[];
}

async function mockRefactoring(page: Page, preview: object = RENAME_PREVIEW): Promise<RefactoringRequests> {
  const requests: RefactoringRequests = {previews: [], applies: [], reverts: []};
  const json = (route: Route, body: object) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});

  await page.route(`${REFACTORING_URL}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/preview')) {
      requests.previews.push(route.request().postDataJSON());
      return json(route, preview);
    }
    if (path.endsWith('/apply')) {
      requests.applies.push(route.request().postDataJSON());
      return json(route, HISTORY_ENTRY);
    }
    if (path.endsWith('/revert')) {
      requests.reverts.push(path);
      return json(route, {...HISTORY_ENTRY, id: 'refactoring-2', created: HISTORY_ENTRY.removed, removed: HISTORY_ENTRY.created});
    }
    return json(route, []);
  });

  return requests;
}

async function openRenameFileDialog(page: Page): Promise<void> {
  await page.locator(SELECTOR_workspaceBtn).click({force: true});
  await expect(page.locator('ame-workspace-file-list')).toBeVisible();

  // The file menu button is only rendered on hover of the file row
  await page.getByRole('button', {name: `Select file ${FILE}`}).hover();
  await page.locator(SELECTOR_openFileMenu).first().click();
  await page.getByTestId('fileMenuRenameFileButton').click();
}

const refactoringDialog = (page: Page) => page.getByRole('dialog', {name: 'Rename file'});
const toast = (page: Page, text: string | RegExp) => page.locator('.toast-container .ngx-toastr', {hasText: text});

test.describe('Workspace refactorings', () => {
  test.beforeEach(async ({page}) => {
    await setUpDefaultRoutes(page);

    await page.route(`**${NAMESPACES_URL}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          [NAMESPACE]: [
            {
              version: VERSION,
              models: [
                {
                  name: FILE,
                  model: FILE,
                  aspectModelUrn: `urn:samm:${NAMESPACE}:${VERSION}#SampleModel`,
                  version: SAMM_VERSION_ACTUAL,
                  existing: true,
                },
              ],
            },
          ],
        }),
      }),
    );

    await page.route(`**${API_BASE_URL}/models/batch*`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            aspectModelUrn: `urn:samm:${NAMESPACE}:${VERSION}#SampleModel`,
            aspectModel: readFixture('default-models/aspect-default.txt'),
            absoluteName: `${NAMESPACE}:${VERSION}:${FILE}`,
            fileName: FILE,
            modelVersion: SAMM_VERSION_ACTUAL,
          },
        ]),
      }),
    );

    await new AppHelper(page).startModelling(false);
  });

  test('previews and applies a file rename and offers to undo it', async ({page}) => {
    const requests = await mockRefactoring(page);
    await openRenameFileDialog(page);

    const dialog = refactoringDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('refactoring-apply')).toBeDisabled();

    await dialog.getByTestId('refactoring-new-name').fill('Renamed');
    await dialog.getByTestId('refactoring-preview-button').click();

    await expect(dialog.getByTestId('refactoring-preview-created')).toContainText(`${NAMESPACE}:${VERSION}/Renamed.ttl`);
    await expect(dialog.getByTestId('refactoring-preview-removed')).toContainText(`${NAMESPACE}:${VERSION}/${FILE}`);
    expect(requests.previews).toHaveLength(1);
    expect(requests.previews[0]).toMatchObject({type: 'RENAME_FILE', namespace: NAMESPACE, version: VERSION, fileName: FILE});

    await dialog.getByTestId('refactoring-apply').click();

    await expect(dialog).toHaveCount(0);
    expect(requests.applies).toEqual(requests.previews);

    const applied = toast(page, RENAME_PREVIEW.description);
    await expect(applied).toContainText('Click here to undo.');
    await applied.click();

    await expect(toast(page, `Undone: ${RENAME_PREVIEW.description}`)).toBeVisible();
    expect(requests.reverts).toEqual([`/ame/api/refactoring/history/${HISTORY_ENTRY.id}/revert`]);
  });

  test('hides an outdated preview when the input changes', async ({page}) => {
    await mockRefactoring(page);
    await openRenameFileDialog(page);

    const dialog = refactoringDialog(page);
    await dialog.getByTestId('refactoring-new-name').fill('Renamed');
    await dialog.getByTestId('refactoring-preview-button').click();
    await expect(dialog.getByTestId('refactoring-preview')).toBeVisible();

    await dialog.getByTestId('refactoring-new-name').fill('RenamedAgain');

    await expect(dialog.getByTestId('refactoring-preview')).toHaveCount(0);
    await expect(dialog.getByTestId('refactoring-apply')).toBeDisabled();
  });

  test('cannot apply a refactoring that would change read-only files', async ({page}) => {
    const requests = await mockRefactoring(page, {
      ...RENAME_PREVIEW,
      modified: [],
      blocked: [changedFile('Shared.ttl', true)],
      applicable: false,
    });
    await openRenameFileDialog(page);

    const dialog = refactoringDialog(page);
    await dialog.getByTestId('refactoring-new-name').fill('Renamed');
    await dialog.getByTestId('refactoring-preview-button').click();

    await expect(dialog.getByTestId('refactoring-preview-blocked')).toContainText('Shared.ttl');
    await expect(dialog.getByTestId('refactoring-blocked')).toBeVisible();
    await expect(dialog.getByTestId('refactoring-apply')).toBeDisabled();
    expect(requests.applies).toHaveLength(0);
  });

  test('cancelling changes nothing', async ({page}) => {
    const requests = await mockRefactoring(page);
    await openRenameFileDialog(page);

    const dialog = refactoringDialog(page);
    await dialog.getByTestId('refactoring-cancel').click();

    await expect(dialog).toHaveCount(0);
    expect(requests.previews).toHaveLength(0);
    expect(requests.applies).toHaveLength(0);
  });
});
