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

import {TestBed} from '@angular/core/testing';
import {firstValueFrom, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {NamespacesManagerService} from '../namespace-manager/shared/services/namespaces-manager.service';
import {MigratorApiService} from './migrator-api.service';
import {ModelApiService} from './model-api.service';
import {WorkspaceApiFacade} from './workspace-api.facade';

describe('WorkspaceApiFacade', () => {
  let facade: WorkspaceApiFacade;
  let modelApi: Record<string, ReturnType<typeof vi.fn>>;
  let migratorApi: Record<string, ReturnType<typeof vi.fn>>;
  let namespacesManager: {importNamespaces: ReturnType<typeof vi.fn>};

  beforeEach(() => {
    modelApi = {
      getStoragePath: vi.fn(() => of({path: '', storagePath: '/ws'})),
      getElementLocation: vi.fn(() => of({path: '/ws/a.ttl', line: 3, column: 1})),
      fetchAspectMetaModel: vi.fn(() => of({content: 'ttl', sourceLocation: null})),
      deleteAspectModel: vi.fn(() => of('deleted')),
      getReferences: vi.fn(() => of({deletable: true, references: [], unreadableFiles: []})),
      deleteNamespace: vi.fn(() => of({deletable: true, references: [], unreadableFiles: []})),
      clearWorkspace: vi.fn(() => of({deletedFiles: 2, backupCreated: true})),
    };
    migratorApi = {
      hasFilesToMigrate: vi.fn(() => of(true)),
      createBackup: vi.fn(() => of('backup')),
      migrateWorkspace: vi.fn(() => of({success: 'ok', errors: []})),
    };
    namespacesManager = {importNamespaces: vi.fn(() => of('imported'))};

    TestBed.configureTestingModule({
      providers: [
        {provide: ModelApiService, useValue: modelApi},
        {provide: MigratorApiService, useValue: migratorApi},
        {provide: NamespacesManagerService, useValue: namespacesManager},
      ],
    });
    facade = TestBed.inject(WorkspaceApiFacade);
  });

  it('should delegate the element location to the model api', async () => {
    await expect(firstValueFrom(facade.getElementLocation('urn:samm:x:1.0.0#A'))).resolves.toEqual({
      path: '/ws/a.ttl',
      line: 3,
      column: 1,
    });
    expect(modelApi.getElementLocation).toHaveBeenCalledWith('urn:samm:x:1.0.0#A', undefined);
  });

  it('should pass the preferred file name to the model api', async () => {
    await firstValueFrom(facade.getElementLocation('urn:samm:x:1.0.0#A', 'B.ttl'));
    expect(modelApi.getElementLocation).toHaveBeenCalledWith('urn:samm:x:1.0.0#A', 'B.ttl');
  });

  it('should delegate storage and model file operations to the model api', async () => {
    const file = {namespace: 'org.example', version: '1.0.0', fileName: 'A.ttl', workspace: '/ws'};
    await firstValueFrom(facade.getStoragePath(file));
    await firstValueFrom(facade.fetchAspectMetaModel('urn:samm:x:1.0.0#A'));
    await firstValueFrom(facade.deleteAspectModel('urn:samm:x:1.0.0#A'));
    await firstValueFrom(facade.getReferences('org.example', '1.0.0', 'A.ttl', '/ws'));
    await firstValueFrom(facade.deleteNamespace('org.example', '1.0.0', '/ws'));
    await firstValueFrom(facade.clearWorkspace(true, '/ws'));

    expect(modelApi.getStoragePath).toHaveBeenCalledWith(file);
    expect(modelApi.fetchAspectMetaModel).toHaveBeenCalledWith('urn:samm:x:1.0.0#A');
    expect(modelApi.deleteAspectModel).toHaveBeenCalledWith('urn:samm:x:1.0.0#A');
    expect(modelApi.getReferences).toHaveBeenCalledWith('org.example', '1.0.0', 'A.ttl', '/ws');
    expect(modelApi.deleteNamespace).toHaveBeenCalledWith('org.example', '1.0.0', '/ws');
    expect(modelApi.clearWorkspace).toHaveBeenCalledWith(true, '/ws');
  });

  it('should delegate migration and import to the dedicated services', async () => {
    const zip = new File([], 'package.zip');
    await firstValueFrom(facade.hasFilesToMigrate());
    await firstValueFrom(facade.createBackup());
    await firstValueFrom(facade.migrateWorkspace(true));
    await firstValueFrom(facade.importNamespaces(zip));

    expect(migratorApi.hasFilesToMigrate).toHaveBeenCalled();
    expect(migratorApi.createBackup).toHaveBeenCalled();
    expect(migratorApi.migrateWorkspace).toHaveBeenCalledWith(true);
    expect(namespacesManager.importNamespaces).toHaveBeenCalledWith(zip);
  });
});
