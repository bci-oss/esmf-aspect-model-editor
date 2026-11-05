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

import {TauriSignalsService} from '@ame/shared';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {GithubSourceConfig, GithubSourceStatus, ModelSource, WorkspaceConfig} from '../../model-api';
import {ModelSourcesPort} from '../../ports/model-sources.port';
import {WorkspaceStore} from '../workspace/workspace.store';
import {ModelSourcesStore} from './model-sources.store';

const defaultWorkspace: ModelSource = {
  type: 'workspace',
  id: '/home/models',
  name: 'models',
  path: '/home/models',
  readOnly: false,
  defaultWorkspace: true,
};
const nestedWorkspace: ModelSource = {
  type: 'workspace',
  id: '/home/models/team',
  name: 'team',
  path: '/home/models/team',
  readOnly: false,
  defaultWorkspace: false,
};
const github: ModelSource = {
  type: 'github',
  id: 'gh',
  name: 'org/repo@main',
  path: '/home/github/gh',
  readOnly: true,
  defaultWorkspace: false,
};
const ghSource: GithubSourceConfig = {id: 'gh', owner: 'org', repository: 'repo', ref: 'main'};
const disabledSource: GithubSourceConfig = {id: 'off', owner: 'org', repository: 'old', ref: 'main', enabled: false};
const config: WorkspaceConfig = {
  version: 1,
  workspaces: ['/home/models', '/home/models/team'],
  githubSources: [ghSource, disabledSource],
};
const status = (source: GithubSourceConfig, updateAvailable: boolean): GithubSourceStatus => ({
  source,
  path: '/home/github/' + source.id,
  synced: true,
  updateAvailable,
});

describe('ModelSourcesStore', () => {
  let store: ModelSourcesStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let tauri: {call: ReturnType<typeof vi.fn>};
  let triggerRefresh: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    api = {
      getConfig: vi.fn(() => of(config)),
      getSources: vi.fn(() => of([defaultWorkspace, nestedWorkspace, github])),
      getGithubStatuses: vi.fn(() => of([status(ghSource, false)])),
      checkGithubSource: vi.fn((source: GithubSourceConfig) => of(status(source, true))),
      syncGithubSource: vi.fn((source: GithubSourceConfig) => of(status(source, false))),
    };
    tauri = {call: vi.fn()};
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: ModelSourcesPort, useValue: api},
        {provide: TauriSignalsService, useValue: tauri},
      ],
    });
    store = TestBed.inject(ModelSourcesStore);
    triggerRefresh = vi.spyOn(TestBed.inject(WorkspaceStore), 'triggerRefresh');
  });

  it('loads config, sources and statuses', () => {
    store.refresh().subscribe();

    expect(store.loaded()).toBe(true);
    expect(store.workspaces()).toEqual([defaultWorkspace, nestedWorkspace]);
    expect(store.hasMultipleWorkspaces()).toBe(true);
    expect(store.defaultWorkspace()).toBe('/home/models');
    expect(store.preferredWorkspace()).toBe('/home/models');
    expect(store.githubStatus('gh')?.updateAvailable).toBe(false);
  });

  it('loads only once and ignores errors of older backends', () => {
    store.ensureLoaded().subscribe();
    store.ensureLoaded().subscribe();
    expect(api['getConfig']).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: ModelSourcesPort, useValue: {...api, getConfig: vi.fn(() => throwError(() => new Error('404')))}},
      ],
    });
    let sources: ModelSource[] | undefined;
    TestBed.inject(ModelSourcesStore)
      .ensureLoaded()
      .subscribe(value => (sources = value));
    expect(sources).toEqual([]);
  });

  it('finds the most specific source of a file', () => {
    store.refresh().subscribe();

    expect(store.findSource('file:///home/models/team/org.a/1.0.0/A.ttl')).toBe(nestedWorkspace);
    expect(store.findSource('/home/models/org.a/1.0.0/A.ttl')).toBe(defaultWorkspace);
    expect(store.findSource('/elsewhere/A.ttl')).toBeUndefined();
    expect(store.isReadOnlyLocation('file:///home/github/gh/org.a/1.0.0/A.ttl')).toBe(true);
    expect(store.isReadOnlyLocation('/home/models/org.a/1.0.0/A.ttl')).toBe(false);
  });

  it('checks only enabled sources and emits those with updates', () => {
    store.refresh().subscribe();
    let updates: GithubSourceStatus[] | undefined;

    store.checkAll().subscribe(value => (updates = value));

    expect(api['checkGithubSource']).toHaveBeenCalledTimes(1);
    expect(api['checkGithubSource']).toHaveBeenCalledWith(ghSource);
    expect(updates?.map(update => update.source.id)).toEqual(['gh']);
    expect(store.updatesAvailable().map(update => update.source.id)).toEqual(['gh']);
    expect(store.isBusy('gh')).toBe(false);
  });

  it('ignores failing checks', () => {
    store.refresh().subscribe();
    api['checkGithubSource'].mockReturnValue(throwError(() => new Error('rate limit')));
    let updates: GithubSourceStatus[] | undefined;

    store.checkAll().subscribe(value => (updates = value));

    expect(updates).toEqual([]);
  });

  it('reloads the sources and the workspace after a sync', () => {
    store.refresh().subscribe();
    api['getConfig'].mockClear();

    store.sync(ghSource).subscribe();

    expect(api['syncGithubSource']).toHaveBeenCalledWith(ghSource);
    expect(api['getConfig']).toHaveBeenCalledTimes(1);
    expect(triggerRefresh).toHaveBeenCalled();
    expect(tauri.call).toHaveBeenCalledWith('requestRefreshWorkspaces');
  });

  it('remembers the workspace chosen for new models while it exists', () => {
    store.refresh().subscribe();

    store.rememberTargetWorkspace('/home/models/team');
    expect(store.preferredWorkspace()).toBe('/home/models/team');
    expect(TestBed.inject(ModelSourcesStore).preferredWorkspace()).toBe('/home/models/team');
    expect(triggerRefresh).not.toHaveBeenCalled();

    store.sources.set([defaultWorkspace, github]);
    expect(store.preferredWorkspace()).toBe('/home/models');
  });
});
