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
import {API_BASE_URL} from '../../support/api-mocks';
import {AppHelper} from '../../support/app-helper';
import {TauriHelper} from '../../support/tauri-helper';

/**
 * Importing the Aspect Models of an Asset Administration Shell (File > Import AAS). The backend is mocked; the tests
 * check the preview, the workspace selection, the conflict handling and the requests sent.
 */

const DEFAULT_WORKSPACE = '/home/user/aspect-models';
const SECOND_WORKSPACE = '/home/user/projects/models';
const AAS_FILE = {name: 'Movement.aasx', path: '/home/user/Movement.aasx', content: [0x50, 0x4b, 0x03, 0x04]};

interface Candidate {
  urn: string;
  namespace: string;
  version: string;
  fileName: string;
  alreadyExists: boolean;
}

const candidate = (name: string, alreadyExists = false): Candidate => ({
  urn: `urn:samm:org.eclipse.examples:1.0.0#${name}`,
  namespace: 'org.eclipse.examples',
  version: '1.0.0',
  fileName: `${name}.ttl`,
  alreadyExists,
});

interface AasRequests {
  previews: (string | null)[];
  imports: (string | null)[];
}

async function mockWorkspaces(page: Page, workspaces: string[]): Promise<void> {
  const sources = workspaces.map((path, index) => ({
    type: 'workspace',
    id: path,
    name: path.split('/').pop(),
    path,
    readOnly: false,
    defaultWorkspace: index === 0,
  }));

  await page.route(`${API_BASE_URL}/workspaces**`, route => {
    const isSources = new URL(route.request().url()).pathname.endsWith('/sources');
    const body = isSources ? sources : {version: 1, workspaces, githubSources: []};
    return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
  });
  await page.route(`${API_BASE_URL}/sources/github**`, route => route.fulfill({status: 200, contentType: 'application/json', body: '[]'}));
}

/** Answers the preview per workspace and the import with the given status. */
async function mockAasImport(page: Page, previews: Record<string, Candidate[]>, importStatus = 200): Promise<AasRequests> {
  const requests: AasRequests = {previews: [], imports: []};

  await page.route(`${API_BASE_URL}/package/import-aas**`, route => {
    const url = new URL(route.request().url());
    const workspace = url.searchParams.get('workspace');

    if (url.pathname.endsWith('/preview')) {
      requests.previews.push(workspace);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(previews[workspace ?? DEFAULT_WORKSPACE] ?? []),
      });
    }

    requests.imports.push(workspace);
    return importStatus === 200
      ? route.fulfill({status: 200, contentType: 'application/json', body: '{}'})
      : route.fulfill({status: importStatus, contentType: 'application/json', body: JSON.stringify({error: {message: 'exists'}})});
  });

  return requests;
}

const importDialog = (page: Page) => page.getByRole('dialog', {name: 'Import Asset Administration Shell'});

test.describe('AAS import', () => {
  let tauri: TauriHelper;

  test.beforeEach(async ({page}) => {
    tauri = new TauriHelper(page);
    await tauri.initTauriMock();
  });

  test('previews the Aspect Models of the file and imports them into the workspace', async ({page}) => {
    await mockWorkspaces(page, [DEFAULT_WORKSPACE]);
    const requests = await mockAasImport(page, {[DEFAULT_WORKSPACE]: [candidate('Movement'), candidate('Position')]});
    await new AppHelper(page).startModelling();

    await tauri.emitSignal('IMPORT_AAS', AAS_FILE);

    const dialog = importDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('aas-import-file')).toHaveText(/Movement\.aasx/);
    await expect(dialog.getByTestId('aas-import-candidate')).toHaveCount(2);
    await expect(dialog.getByTestId('aas-import-workspace-0')).toHaveCount(0);

    await dialog.getByTestId('aas-import-confirm').click();

    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.toast-container .ngx-toastr', {hasText: '2 Aspect Model(s) imported'})).toBeVisible();
    expect(requests.previews).toEqual([DEFAULT_WORKSPACE]);
    expect(requests.imports).toEqual([DEFAULT_WORKSPACE]);
  });

  test('previews again for the workspace the user chooses', async ({page}) => {
    await mockWorkspaces(page, [DEFAULT_WORKSPACE, SECOND_WORKSPACE]);
    const requests = await mockAasImport(page, {
      [DEFAULT_WORKSPACE]: [candidate('Movement', true)],
      [SECOND_WORKSPACE]: [candidate('Movement')],
    });
    await new AppHelper(page).startModelling();

    await tauri.emitSignal('IMPORT_AAS', AAS_FILE);

    const dialog = importDialog(page);
    await expect(dialog.getByTestId('aas-import-conflicts')).toBeVisible();
    await expect(dialog.getByTestId('aas-import-confirm')).toBeDisabled();

    await dialog.getByRole('radio', {name: SECOND_WORKSPACE}).check();

    await expect(dialog.getByTestId('aas-import-conflicts')).toHaveCount(0);
    await dialog.getByTestId('aas-import-confirm').click();

    await expect(dialog).toHaveCount(0);
    expect(requests.previews).toEqual([DEFAULT_WORKSPACE, SECOND_WORKSPACE]);
    expect(requests.imports).toEqual([SECOND_WORKSPACE]);
  });

  test('keeps the dialog open when files were created in the meantime', async ({page}) => {
    await mockWorkspaces(page, [DEFAULT_WORKSPACE]);
    const requests = await mockAasImport(page, {[DEFAULT_WORKSPACE]: [candidate('Movement')]}, 409);
    await new AppHelper(page).startModelling();

    await tauri.emitSignal('IMPORT_AAS', AAS_FILE);

    const dialog = importDialog(page);
    await dialog.getByTestId('aas-import-confirm').click();

    await expect(dialog.getByTestId('aas-import-error')).toContainText('Nothing was imported');
    await expect(dialog).toBeVisible();
    expect(requests.imports).toHaveLength(1);
    await expect.poll(() => requests.previews.length).toBe(2);
  });

  test('shows when the file contains no Aspect Models', async ({page}) => {
    await mockWorkspaces(page, [DEFAULT_WORKSPACE]);
    await mockAasImport(page, {[DEFAULT_WORKSPACE]: []});
    await new AppHelper(page).startModelling();

    await tauri.emitSignal('IMPORT_AAS', AAS_FILE);

    const dialog = importDialog(page);
    await expect(dialog.getByTestId('aas-import-empty')).toBeVisible();
    await expect(dialog.getByTestId('aas-import-confirm')).toBeDisabled();
  });

  test('cancelling imports nothing', async ({page}) => {
    await mockWorkspaces(page, [DEFAULT_WORKSPACE]);
    const requests = await mockAasImport(page, {[DEFAULT_WORKSPACE]: [candidate('Movement')]});
    await new AppHelper(page).startModelling();

    await tauri.emitSignal('IMPORT_AAS', AAS_FILE);

    const dialog = importDialog(page);
    await expect(dialog.getByTestId('aas-import-candidate')).toHaveCount(1);
    await dialog.getByTestId('aas-import-cancel').click();

    await expect(dialog).toHaveCount(0);
    expect(requests.imports).toHaveLength(0);
  });
});
