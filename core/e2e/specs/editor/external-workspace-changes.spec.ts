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
import {API_BASE_URL, NAMESPACES_URL, SAMM_VERSION_ACTUAL, setUpDefaultRoutes, WORKSPACE_EVENTS_URL} from '../../support/api-mocks';
import {AppHelper} from '../../support/app-helper';
import {SELECTOR_workspaceBtn} from '../../support/constants';
import {readFixture} from '../../support/drag-drop-utils';

/**
 * Files changed outside of the editor, e.g. in VS Code: the backend reports them as server-sent events and the editor
 * refreshes its workspace. The backend is mocked; the event stream is released by the test.
 */

const NAMESPACE = 'org.eclipse.examples.aspect';
const VERSION = '1.0.0';

const modelEntry = (name: string) => ({
  name,
  model: name,
  aspectModelUrn: `urn:samm:${NAMESPACE}:${VERSION}#${name.replace('.ttl', '')}`,
  version: SAMM_VERSION_ACTUAL,
  existing: true,
});

const changedFile = (fileName: string) => ({
  namespace: NAMESPACE,
  version: VERSION,
  fileName,
  path: `/home/user/aspect-models/${NAMESPACE}/${VERSION}/${fileName}`,
  readOnly: false,
});

const fileButton = (page: Page, file: string) => page.getByRole('button', {name: `Select file ${file}`});

test.describe('External workspace changes', () => {
  test('refreshes the workspace when a file is created outside of the editor', async ({page}) => {
    let files = ['SampleModel.ttl'];
    let release!: () => void;
    const released = new Promise<void>(resolve => (release = resolve));
    let connections = 0;

    await setUpDefaultRoutes(page);
    await page.route(`**${NAMESPACES_URL}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({[NAMESPACE]: [{version: VERSION, models: files.map(modelEntry)}]}),
      }),
    );
    await page.route(`**${API_BASE_URL}/models/batch*`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          files.map(fileName => ({
            aspectModelUrn: modelEntry(fileName).aspectModelUrn,
            aspectModel: readFixture('default-models/aspect-default.txt'),
            absoluteName: `${NAMESPACE}:${VERSION}:${fileName}`,
            fileName,
            modelVersion: SAMM_VERSION_ACTUAL,
          })),
        ),
      }),
    );
    // The first connection reports the change once released; reconnects find a backend without further changes
    await page.route(WORKSPACE_EVENTS_URL, async (route: Route) => {
      if (connections++ > 0) return route.abort();
      await released;
      const change = {created: [changedFile('Created.ttl')], modified: [], removed: []};
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `event: ready\ndata: {}\n\nevent: files-changed\ndata: ${JSON.stringify(change)}\n\n`,
      });
    });

    await new AppHelper(page).startModelling(false);
    await page.locator(SELECTOR_workspaceBtn).click({force: true});
    await expect(fileButton(page, 'SampleModel.ttl')).toBeVisible();
    await expect(fileButton(page, 'Created.ttl')).toHaveCount(0);
    await expect.poll(() => connections).toBe(1);

    files = [...files, 'Created.ttl'];
    release();

    await expect(fileButton(page, 'Created.ttl')).toBeVisible();
  });

  test('asks before reloading an open model changed outside of the editor', async ({page}) => {
    let release!: () => void;
    const released = new Promise<void>(resolve => (release = resolve));
    let connections = 0;

    await setUpDefaultRoutes(page);
    await page.route(WORKSPACE_EVENTS_URL, async (route: Route) => {
      if (connections++ > 0) return route.abort();
      await released;
      const change = {created: [], modified: [changedFile('AspectDefault.ttl')], removed: []};
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `event: ready\ndata: {}\n\nevent: files-changed\ndata: ${JSON.stringify(change)}\n\n`,
      });
    });

    await new AppHelper(page).startModelling(false);
    await expect.poll(() => connections).toBe(1);
    release();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Files changed outside of the editor');
    await expect(dialog).toContainText('AspectDefault.ttl');
    await dialog.getByRole('button', {name: 'Keep current state'}).click();
    await expect(dialog).toHaveCount(0);
  });
});
