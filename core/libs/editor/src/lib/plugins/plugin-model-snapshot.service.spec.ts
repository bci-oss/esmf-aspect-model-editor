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

import {LoadedFilesService, ModelService, RdfPort} from '@ame/domain';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PluginModelSnapshotService} from './plugin-model-snapshot.service';

describe('PluginModelSnapshotService', () => {
  let loadedFiles: {currentLoadedFile: unknown};
  let modelService: {synchronizeModelToRdf: ReturnType<typeof vi.fn>};
  let rdf: {serializeModel: ReturnType<typeof vi.fn>};
  let service: PluginModelSnapshotService;

  beforeEach(() => {
    loadedFiles = {currentLoadedFile: {rdfModel: {}, namespace: 'org.example:1.0.0', name: 'Machine.ttl'}};
    modelService = {synchronizeModelToRdf: vi.fn(() => of(undefined))};
    rdf = {serializeModel: vi.fn(() => '@prefix : <urn:samm:org.example:1.0.0#> .')};

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: LoadedFilesService, useValue: loadedFiles},
        {provide: ModelService, useValue: modelService},
        {provide: RdfPort, useValue: rdf},
      ],
    });
    service = TestBed.inject(PluginModelSnapshotService);
  });

  it('returns the synchronized model split into namespace and version', async () => {
    await expect(service.snapshot()).resolves.toEqual({
      namespace: 'org.example',
      version: '1.0.0',
      fileName: 'Machine.ttl',
      content: '@prefix : <urn:samm:org.example:1.0.0#> .',
    });
    expect(modelService.synchronizeModelToRdf).toHaveBeenCalled();
  });

  it('returns null if no model is open', async () => {
    loadedFiles.currentLoadedFile = null;

    await expect(service.snapshot()).resolves.toBeNull();
    expect(modelService.synchronizeModelToRdf).not.toHaveBeenCalled();
  });

  it('returns null if the model cannot be synchronized', async () => {
    modelService.synchronizeModelToRdf.mockReturnValue(throwError(() => new Error('broken')));

    await expect(service.snapshot()).resolves.toBeNull();
  });

  it('returns null if the namespace has no version', async () => {
    loadedFiles.currentLoadedFile = {rdfModel: {}, namespace: 'org.example', name: 'Machine.ttl'};

    await expect(service.snapshot()).resolves.toBeNull();
  });
});
