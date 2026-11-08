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

import {PluginGenerationResult, PluginImportResult, PluginsOverview, PluginStatus} from '@ame/domain';
import {APP_CONFIG, AppConfig, BackendStatusService} from '@ame/shared';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {PluginsApiService} from './plugins-api.service';

const pluginsUrl = 'http://localhost:9090/ame/api/plugins';
const overview: PluginsOverview = {pluginApiVersion: 1, plugins: [], restartRequired: false};
const status = {id: 'example-import', restartRequired: true} as PluginStatus;

describe('PluginsApiService', () => {
  let service: PluginsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {provide: APP_CONFIG, useValue: {api: {plugins: '/ame/api/plugins'}} as AppConfig},
        {provide: BackendStatusService, useValue: {serviceUrl: () => 'http://localhost:9090'}},
      ],
    });
    service = TestBed.inject(PluginsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the overview', () => {
    let result: PluginsOverview | undefined;
    service.getOverview().subscribe(value => (result = value));

    const req = httpMock.expectOne(pluginsUrl);
    expect(req.request.method).toBe('GET');
    req.flush(overview);

    expect(result).toEqual(overview);
  });

  it('uploads a plugin archive', () => {
    const file = new File(['zip'], 'example-import-1.0.0.zip');
    let result: PluginStatus | undefined;
    service.install(file).subscribe(value => (result = value));

    const req = httpMock.expectOne(pluginsUrl);
    expect(req.request.method).toBe('POST');
    expect((req.request.body as FormData).get('file')).toBeInstanceOf(File);
    req.flush(status);

    expect(result).toEqual(status);
  });

  it('uninstalls a plugin', () => {
    service.uninstall('example-import').subscribe();

    const req = httpMock.expectOne(`${pluginsUrl}/example-import`);
    expect(req.request.method).toBe('DELETE');
    req.flush(overview);
  });

  it('enables and disables a plugin', () => {
    service.setEnabled('example-import', false).subscribe();

    const req = httpMock.expectOne(`${pluginsUrl}/example-import/enabled`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({enabled: false});
    req.flush(status);
  });

  it('runs an action with a JSON payload', () => {
    let result: string[] | undefined;
    service.runAction<string[]>('example-import', 'existing-models', {filter: 'a'}).subscribe(value => (result = value));

    const req = httpMock.expectOne(`${pluginsUrl}/example-import/actions/existing-models`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    expect(req.request.body).toBe('{"filter":"a"}');
    req.flush(['a.ttl']);

    expect(result).toEqual(['a.ttl']);
  });

  it('sends JSON null for an action without payload', () => {
    service.runAction('example-import', 'existing-models').subscribe();

    const req = httpMock.expectOne(`${pluginsUrl}/example-import/actions/existing-models`);
    expect(req.request.body).toBe('null');
    req.flush(null);
  });

  it('imports a model with options', () => {
    const file = new File(['{}'], 'movement.json');
    const imported: PluginImportResult = {models: [], warnings: ['skipped']};
    let result: PluginImportResult | undefined;
    service.importModel('example-import', 'json', file, {namespace: 'org.example'}).subscribe(value => (result = value));

    const req = httpMock.expectOne(`${pluginsUrl}/example-import/importers/json`);
    const body = req.request.body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.get('options')).toBe('{"namespace":"org.example"}');
    req.flush(imported);

    expect(result).toEqual(imported);
  });

  it('imports a model without options', () => {
    service.importModel('example-import', 'json', new File(['{}'], 'movement.json')).subscribe();

    const req = httpMock.expectOne(`${pluginsUrl}/example-import/importers/json`);
    expect((req.request.body as FormData).has('options')).toBe(false);
    req.flush({models: [], warnings: []});
  });

  it('generates files and decodes their Base64 content', async () => {
    const request = {
      model: {namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl', content: '@prefix : <urn:x#> .'},
      selectedElement: 'urn:samm:org.example:1.0.0#speed',
      options: {descriptions: 'false'},
    };
    const utf8Base64 = btoa(String.fromCharCode(...new TextEncoder().encode('{"ä":1}')));
    let result: PluginGenerationResult | undefined;
    service.generate('example', 'json', request).subscribe(value => (result = value));

    const req = httpMock.expectOne(`${pluginsUrl}/example/generators/json`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({files: [{fileName: 'Movement.description.json', mediaType: 'application/json', content: utf8Base64}], warnings: ['w']});

    expect(result!.warnings).toEqual(['w']);
    expect(result!.files).toHaveLength(1);
    const [file] = result!.files;
    expect(file).toMatchObject({fileName: 'Movement.description.json', mediaType: 'application/json'});
    expect(file.content.type).toBe('application/json');
    expect(await file.content.text()).toBe('{"ä":1}');
  });

  it('loads a frontend file as blob with an encoded path', () => {
    let result: Blob | undefined;
    service.getFrontendFile('example-import', '/assets/my icon.svg').subscribe(value => (result = value));

    const req = httpMock.expectOne(`${pluginsUrl}/example-import/frontend/assets/my%20icon.svg`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['<svg/>']));

    expect(result).toBeInstanceOf(Blob);
  });
});
