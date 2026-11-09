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
import {beforeEach, describe, expect, it} from 'vitest';
import {ModelSource} from '../../model-api/models/model-sources';
import {LoadedFilesService} from '../../model-session';
import {FileStatus, WorkspaceNamespacesService} from './workspace-namespaces.service';
import {WorkspaceStore} from './workspace.store';

function status(name: string, urn = `urn:samm:org.example:1.0.0#${name.replace('.ttl', '')}`) {
  const fileStatus = new FileStatus(name);
  fileStatus.aspectModelUrn = urn;
  return fileStatus;
}

const githubSource: ModelSource = {
  type: 'github',
  id: 'github',
  name: 'owner/repo@main',
  path: '',
  readOnly: true,
  defaultWorkspace: false,
};

describe('WorkspaceNamespacesService', () => {
  let service: WorkspaceNamespacesService;
  let store: InstanceType<typeof WorkspaceStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [WorkspaceStore, {provide: LoadedFilesService, useValue: {}}],
    });
    service = TestBed.inject(WorkspaceNamespacesService);
    store = TestBed.inject(WorkspaceStore);
  });

  it('should not duplicate files when the same statuses are applied repeatedly', () => {
    service.applyFileStatuses([status('A.ttl'), status('B.ttl')]);
    service.applyFileStatuses([status('A.ttl'), status('B.ttl')]);

    expect(service.namespaces()['org.example:1.0.0'].map(f => f.name)).toEqual(['A.ttl', 'B.ttl']);
    expect(store.entities().length).toBe(2);
  });

  it('should replace an existing entry with the latest status', () => {
    service.applyFileStatuses([status('A.ttl')]);
    const updated = status('A.ttl');
    updated.outdated = true;

    service.applyFileStatuses([updated]);

    expect(service.namespaces()['org.example:1.0.0']).toEqual([updated]);
    expect(service.hasOutdatedFiles()).toBe(true);
  });

  it('should not offer a migration for outdated files of read-only sources', () => {
    const githubFile = status('A.ttl');
    githubFile.outdated = true;
    githubFile.source = githubSource;

    service.applyFileStatuses([githubFile]);

    expect(service.namespaces()['org.example:1.0.0'][0].outdated).toBe(true);
    expect(service.hasOutdatedFiles()).toBe(false);
    expect(store.hasOutdatedFiles()).toBe(false);
  });

  it('should offer a migration when a writable workspace contains outdated files', () => {
    const githubFile = status('A.ttl');
    githubFile.outdated = true;
    githubFile.source = githubSource;
    const localFile = status('B.ttl');
    localFile.outdated = true;

    service.applyFileStatuses([githubFile, localFile]);

    expect(service.hasOutdatedFiles()).toBe(true);
    expect(store.hasOutdatedFiles()).toBe(true);
  });
});
