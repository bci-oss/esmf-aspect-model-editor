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

import {expect, Page, test} from '@playwright/test';
import {AppHelper} from '../../support/app-helper';
import {mockPlugin, mockPluginBackend, PluginBackendMock} from '../../support/plugin-mocks';
import {TauriHelper} from '../../support/tauri-helper';

const plugin = (page: Page, id = 'e2e-import') => page.getByTestId(`plugin-${id}`);

async function openPluginSettings(page: Page): Promise<void> {
  await new AppHelper(page).openSettings();
  await page.getByTestId('settings-node-plugins').click();
  await expect(page.getByTestId('plugins-install-card')).toBeVisible();
}

async function selectArchive(page: Page, name: string): Promise<void> {
  await page.getByTestId('plugins-file-input').setInputFiles({name, mimeType: 'application/zip', buffer: Buffer.from('PK')});
}

test.describe('Plugin settings', () => {
  let backend: PluginBackendMock;

  test.describe('in the desktop application', () => {
    let tauri: TauriHelper;

    test.beforeEach(async ({page}) => {
      tauri = new TauriHelper(page);
      await tauri.initTauriMock();
      backend = await mockPluginBackend(page);
      await new AppHelper(page).startModelling();
      await openPluginSettings(page);
    });

    test('installs a plugin and restarts the backend to start it', async ({page}) => {
      await expect(page.getByTestId('plugins-trust-hint')).toBeVisible();
      await expect(page.getByTestId('plugins-empty')).toBeVisible();

      await selectArchive(page, 'e2e-import-plugin-1.0.0.zip');

      await expect(plugin(page)).toContainText('E2E Import');
      await expect(plugin(page).getByTestId('plugin-state-pending')).toBeVisible();
      await expect(page.getByTestId('plugins-restart-banner')).toBeVisible();
      expect(backend.requests).toContainEqual({method: 'POST', path: ''});

      backend.restart();
      await page.getByTestId('plugins-restart').click();

      await expect(plugin(page).getByTestId('plugin-state-active')).toBeVisible();
      await expect(page.getByTestId('plugins-restart-banner')).toHaveCount(0);
      expect(await tauri.getSentEvents('reloadBackend')).toHaveLength(1);
    });

    test('rejects files which are no plugin archives', async ({page}) => {
      await selectArchive(page, 'notes.txt');

      await expect(page.locator('.toast-error')).toContainText('"notes.txt" is not a plugin archive (.zip)');
      expect(backend.requests.filter(request => request.method === 'POST')).toHaveLength(0);
    });
  });

  test.describe('with installed plugins', () => {
    test.beforeEach(async ({page}) => {
      backend = await mockPluginBackend(page, [
        mockPlugin(),
        mockPlugin({id: 'broken', name: 'Broken Plugin', state: 'FAILED', error: 'Missing class org.example.Broken'}),
      ]);
      await new AppHelper(page).startModelling();
      await openPluginSettings(page);
    });

    test('shows the state and the error of every plugin', async ({page}) => {
      await expect(plugin(page).getByTestId('plugin-state-active')).toBeVisible();
      await expect(plugin(page, 'broken').getByTestId('plugin-state-failed')).toBeVisible();
      await expect(plugin(page, 'broken').getByTestId('plugin-error')).toHaveText(/Missing class org\.example\.Broken/);
    });

    test('disables a plugin and asks to restart the backend manually outside the desktop application', async ({page}) => {
      await plugin(page).getByTestId('plugin-menu').click();
      await page.getByTestId('plugin-enabled').click();

      await expect(plugin(page).getByTestId('plugin-state-pending')).toBeVisible();
      await expect(page.getByTestId('plugins-restart-banner')).toBeVisible();
      await expect(page.getByTestId('plugins-restart')).toHaveCount(0);
      expect(backend.requests).toContainEqual({method: 'PUT', path: '/e2e-import/enabled'});
    });

    test('removes a plugin', async ({page}) => {
      await plugin(page, 'broken').getByTestId('plugin-menu').click();
      await page.getByTestId('plugin-remove').click();

      await expect(plugin(page, 'broken')).toHaveCount(0);
      await expect(plugin(page)).toBeVisible();
      expect(backend.requests).toContainEqual({method: 'DELETE', path: '/broken'});
    });
  });
});
