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
import {TauriHelper} from '../../support/tauri-helper';

/**
 * The generators of the ESMF SDK offered in the Generate menu: SQL table definition, JSON-LD, diagram, Parquet payload
 * and Java classes.
 * The backend is mocked; the tests check the requests and what the user sees and downloads.
 */

const SQL = "CREATE TABLE IF NOT EXISTS aspect_default (\n  property1 STRING NOT NULL COMMENT 'Property1'\n);";
const PARQUET = Buffer.from('PAR1PAR1', 'ascii');
const ZIP = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
const JSON_LD = JSON.stringify({'@context': {'@vocab': 'urn:samm:org.eclipse.examples.aspect:1.0.0#'}, '@id': 'AspectDefault'});

interface GenerationRequest {
  params: URLSearchParams;
  contentType: string | null;
}

async function mockGenerator(
  page: Page,
  path: string,
  body: string | Buffer,
  contentType: string,
  status = 200,
): Promise<GenerationRequest[]> {
  const requests: GenerationRequest[] = [];
  await page.route(`**/ame/api/generate/${path}**`, async route => {
    requests.push({params: new URL(route.request().url()).searchParams, contentType: await route.request().headerValue('content-type')});
    await route.fulfill({status, contentType, body});
  });
  return requests;
}

const preview = (page: Page, name: RegExp) => page.getByRole('dialog', {name});

test.describe('SDK generators', () => {
  let app: AppHelper;
  let tauri: TauriHelper;

  test.beforeEach(async ({page}) => {
    app = new AppHelper(page);
    tauri = new TauriHelper(page);
    await tauri.initTauriMock();
    await app.startModelling();
  });

  test.describe('SQL table definition', () => {
    test('asks for the dialect and previews the generated statement', async ({page}) => {
      const requests = await mockGenerator(page, 'sql', SQL, 'text/plain');

      await tauri.emitSignal('GENERATE_SQL');
      await expect(page.getByRole('dialog', {name: 'Generate SQL Table Definition'})).toBeVisible();
      await page.getByTestId('sqlDialect').click();
      await page.getByTestId('sqlDialect-POSTGRESQL').click();
      await page.getByTestId('generateSql').click();

      const dialog = preview(page, /SQL table definition preview/i);
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId('dialogContent')).toHaveValue(SQL);
      expect(requests).toHaveLength(1);
      expect(requests[0].params.get('dialect')).toBe('POSTGRESQL');
      expect(requests[0].params.get('language')).toBe('en');
      expect(requests[0].contentType).toContain('multipart/form-data');
    });

    test('downloads the statement as SQL file', async ({page}) => {
      await mockGenerator(page, 'sql', SQL, 'text/plain');

      await tauri.emitSignal('GENERATE_SQL');
      await page.getByTestId('generateSql').click();
      await expect(preview(page, /SQL table definition preview/i)).toBeVisible();

      const download = page.waitForEvent('download');
      await page.getByTestId('downloadFileButton').click();
      expect((await download).suggestedFilename()).toBe('AspectDefault.sql');
    });

    test('cancelling the dialect dialog generates nothing', async ({page}) => {
      const requests = await mockGenerator(page, 'sql', SQL, 'text/plain');

      await tauri.emitSignal('GENERATE_SQL');
      const dialog = page.getByRole('dialog', {name: 'Generate SQL Table Definition'});
      await dialog.getByRole('button', {name: 'Cancel'}).click();

      await expect(dialog).toHaveCount(0);
      await expect(preview(page, /SQL table definition preview/i)).toHaveCount(0);
      expect(requests).toHaveLength(0);
    });

    test('reports a failing generation', async ({page}) => {
      await mockGenerator(page, 'sql', JSON.stringify({error: {message: 'broken'}}), 'application/json', 400);

      await tauri.emitSignal('GENERATE_SQL');
      await page.getByTestId('generateSql').click();

      await expect(page.locator('.toast-container .ngx-toastr', {hasText: 'Failed to generate the SQL table definition'})).toBeVisible();
      await expect(preview(page, /SQL table definition preview/i)).toHaveCount(0);
      await expect(page.locator('ame-loading-screen')).toHaveCount(0);
    });
  });

  test.describe('JSON-LD', () => {
    test('previews and downloads the model as JSON-LD', async ({page}) => {
      const requests = await mockGenerator(page, 'json-ld', JSON_LD, 'application/ld+json');

      await tauri.emitSignal('GENERATE_JSON_LD');
      await expect(preview(page, /JSON-LD preview/i)).toBeVisible();
      await expect(page.getByTestId('dialogContent')).toHaveValue(/"@id": "AspectDefault"|"@id":"AspectDefault"/);
      expect(requests).toHaveLength(1);

      const download = page.waitForEvent('download');
      await page.getByTestId('downloadFileButton').click();
      expect((await download).suggestedFilename()).toBe('AspectDefault.jsonld');
    });

    test('reports a failing generation', async ({page}) => {
      await mockGenerator(page, 'json-ld', '{}', 'application/json', 500);

      await tauri.emitSignal('GENERATE_JSON_LD');

      await expect(page.locator('.toast-container .ngx-toastr', {hasText: 'Failed to generate JSON-LD'})).toBeVisible();
      await expect(preview(page, /JSON-LD preview/i)).toHaveCount(0);
    });
  });

  test.describe('Diagram', () => {
    test('downloads the diagram in the chosen format', async ({page}) => {
      const requests = await mockGenerator(page, 'diagram', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');

      await tauri.emitSignal('GENERATE_DIAGRAM');
      const dialog = page.getByRole('dialog', {name: 'Generate Diagram'});
      await expect(dialog).toBeVisible();
      await page.getByTestId('diagramFormat').click();
      await page.getByTestId('diagramFormat-PNG').click();

      const download = page.waitForEvent('download');
      await page.getByTestId('downloadDiagram').click();

      expect((await download).suggestedFilename()).toBe('AspectDefault.png');
      await expect(dialog).toHaveCount(0);
      expect(requests[0].params.get('format')).toBe('PNG');
      expect(requests[0].params.get('language')).toBe('en');
    });

    test('keeps the dialog open when the generation fails', async ({page}) => {
      await mockGenerator(page, 'diagram', '{}', 'application/json', 500);

      await tauri.emitSignal('GENERATE_DIAGRAM');
      await page.getByTestId('downloadDiagram').click();

      await expect(page.locator('.toast-container .ngx-toastr', {hasText: 'Failed to generate the diagram'})).toBeVisible();
      await expect(page.getByRole('dialog', {name: 'Generate Diagram'})).toBeVisible();
      await expect(page.getByTestId('downloadDiagram')).toBeEnabled();
    });
  });

  test.describe('Parquet payload', () => {
    test('downloads the sample payload without asking anything', async ({page}) => {
      const requests = await mockGenerator(page, 'parquet-payload', PARQUET, 'application/vnd.apache.parquet');

      const download = page.waitForEvent('download');
      await tauri.emitSignal('GENERATE_PARQUET_PAYLOAD');

      expect((await download).suggestedFilename()).toBe('AspectDefault-sample.parquet');
      expect(requests).toHaveLength(1);
      expect(requests[0].contentType).toContain('multipart/form-data');
      await expect(page.locator('ame-loading-screen')).toHaveCount(0);
    });

    test('reports a failing generation', async ({page}) => {
      await mockGenerator(page, 'parquet-payload', '{}', 'application/json', 400);

      await tauri.emitSignal('GENERATE_PARQUET_PAYLOAD');

      await expect(page.locator('.toast-container .ngx-toastr', {hasText: 'Failed to generate the Parquet payload'})).toBeVisible();
      await expect(page.locator('ame-loading-screen')).toHaveCount(0);
    });
  });

  test.describe('Java classes', () => {
    const javaDialog = (page: Page) => page.getByRole('dialog', {name: 'Generate Java Classes'});

    test('downloads the classes as ZIP with the chosen options', async ({page}) => {
      const requests = await mockGenerator(page, 'java', ZIP, 'application/zip');

      await tauri.emitSignal('GENERATE_JAVA_CLASSES');
      await expect(javaDialog(page)).toBeVisible();
      await page.getByTestId('javaPackageName').fill('com.example.movement');
      await page.getByTestId('javaStaticMetaModel').getByRole('checkbox').check();
      await page.getByTestId('javaJacksonAnnotations').getByRole('checkbox').uncheck();

      const download = page.waitForEvent('download');
      await page.getByTestId('downloadJavaClasses').click();

      expect((await download).suggestedFilename()).toBe('AspectDefault-java.zip');
      await expect(javaDialog(page)).toHaveCount(0);
      expect(requests[0].params.get('packageName')).toBe('com.example.movement');
      expect(requests[0].params.get('staticMetaModel')).toBe('true');
      expect(requests[0].params.get('jacksonAnnotations')).toBe('false');
    });

    test('does not accept an invalid package name', async ({page}) => {
      const requests = await mockGenerator(page, 'java', ZIP, 'application/zip');

      await tauri.emitSignal('GENERATE_JAVA_CLASSES');
      await page.getByTestId('javaPackageName').fill('com.1example');
      await page.getByTestId('javaPackageName').blur();

      await expect(page.getByTestId('javaPackageNameError')).toBeVisible();
      await expect(page.getByTestId('downloadJavaClasses')).toBeDisabled();
      expect(requests).toHaveLength(0);
    });

    test('keeps the dialog open when the generation fails', async ({page}) => {
      await mockGenerator(page, 'java', '{}', 'application/json', 400);

      await tauri.emitSignal('GENERATE_JAVA_CLASSES');
      await page.getByTestId('downloadJavaClasses').click();

      await expect(page.locator('.toast-container .ngx-toastr', {hasText: 'Failed to generate the Java classes'})).toBeVisible();
      await expect(javaDialog(page)).toBeVisible();
      await expect(page.getByTestId('downloadJavaClasses')).toBeEnabled();
    });
  });
});
