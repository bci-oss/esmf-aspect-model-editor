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

import {expect, test} from '@playwright/test';
import {API_BASE_URL, NAMESPACES_URL, SAMM_VERSION_ACTUAL, setUpDefaultRoutes} from '../../support/api-mocks';
import {AppHelper} from '../../support/app-helper';
import {SELECTOR_openFileMenu, SELECTOR_workspaceBtn} from '../../support/constants';
import {readFixture} from '../../support/drag-drop-utils';
import {TauriHelper} from '../../support/tauri-helper';

/** Workspace files are opened in the external editor (VS Code by default) through the desktop shell. */

const NAMESPACE = 'org.eclipse.examples.aspect';
const VERSION = '1.0.0';
const FILE = 'SampleModel.ttl';
const STORAGE_PATH = `/home/user/aspect-models/${NAMESPACE}/${VERSION}/${FILE}`;

test.describe('Open in external editor', () => {
  let tauri: TauriHelper;

  test.beforeEach(async ({page}) => {
    tauri = new TauriHelper(page);
    await tauri.initTauriMock();
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
    await page.route(`${API_BASE_URL}/models/storage-path*`, route =>
      route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({storagePath: STORAGE_PATH})}),
    );

    await new AppHelper(page).visitDefault(false);
    await page.locator(SELECTOR_workspaceBtn).click({force: true});
    await expect(page.locator('ame-workspace-file-list')).toBeVisible();
  });

  test('opens a workspace file in VS Code', async ({page}) => {
    // The file menu button is only rendered on hover of the file row
    await page.getByRole('button', {name: `Select file ${FILE}`}).hover();
    await page.locator(SELECTOR_openFileMenu).first().click();

    const openButton = page.getByTestId('fileMenuOpenInExternalEditorButton');
    await expect(openButton).toContainText('Open in VS Code');
    await tauri.clearSentEvents();
    await openButton.click();

    await expect
      .poll(async () => (await tauri.getSentEvents('openInExternalEditor')).map(event => event.args?.[0]), {timeout: 10000})
      .toContainEqual(expect.objectContaining({url: `vscode://file${STORAGE_PATH}`, path: STORAGE_PATH}));
  });
});
