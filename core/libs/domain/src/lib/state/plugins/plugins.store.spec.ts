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

import {BackendStatus, BackendStatusService} from '@ame/shared';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {firstValueFrom, of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PluginsOverview, PluginStatus} from '../../model-api';
import {PluginsPort} from '../../ports/plugins.port';
import {PluginsStore} from './plugins.store';

const plugin = (id: string, overrides: Partial<PluginStatus> = {}): PluginStatus => ({
  id,
  name: id,
  version: '1.0.0',
  description: null,
  state: 'ACTIVE',
  enabled: true,
  restartRequired: false,
  error: null,
  frontend: {entry: 'main.js', element: `ame-plugin-${id}`},
  commands: [],
  actions: [],
  importers: [],
  generators: [],
  ...overrides,
});
const overview = (plugins: PluginStatus[], restartRequired = false): PluginsOverview => ({pluginApiVersion: 1, plugins, restartRequired});
const backend = (state: BackendStatus['state'], revision: number, message: string | null = null): BackendStatus => ({
  state,
  port: '30001',
  message,
  revision,
});
const flush = () => new Promise(resolve => setTimeout(resolve));
const settle = async () => {
  TestBed.tick();
  await flush();
};

describe('PluginsStore', () => {
  let store: PluginsStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let backendStatus: ReturnType<typeof signal<BackendStatus>>;
  let restart: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    api = {
      getOverview: vi.fn(() => of(overview([plugin('example')]))),
      install: vi.fn(() => of(plugin('example', {state: 'INACTIVE', restartRequired: true}))),
      uninstall: vi.fn(() => of(overview([], true))),
      setEnabled: vi.fn((id: string, enabled: boolean) => of(plugin(id, {enabled, restartRequired: true}))),
    };
    backendStatus = signal(backend('ready', 1));
    restart = vi.fn(async () => backendStatus.set(backend('starting', 2)));

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: PluginsPort, useValue: api},
        {
          provide: BackendStatusService,
          useValue: {status: backendStatus, canRestart: true, restarting: signal(false), restart},
        },
      ],
    });
    store = TestBed.inject(PluginsStore);
  });

  const ids = () => store.plugins().map(p => p.id);

  it('loads the plugins', async () => {
    expect(store.loaded()).toBe(false);

    await firstValueFrom(store.refresh());

    expect(store.loaded()).toBe(true);
    expect(store.plugins().map(p => p.id)).toEqual(['example']);
    expect(store.plugin('example')?.state).toBe('ACTIVE');
  });

  it('loads the plugins once they are needed and again with every start of the backend', async () => {
    await settle();
    expect(api['getOverview']).not.toHaveBeenCalled();

    store.load();
    await settle();
    expect(ids()).toEqual(['example']);

    api['getOverview'].mockReturnValue(of(overview([plugin('example'), plugin('other')])));
    backendStatus.set(backend('starting', 2));
    await settle();
    expect(ids()).toEqual(['example']);

    backendStatus.set(backend('ready', 3));
    await settle();
    expect(ids()).toEqual(['example', 'other']);
    expect(api['getOverview']).toHaveBeenCalledTimes(2);
  });

  it('reloads the plugins when they are needed again', async () => {
    store.load();
    await settle();
    store.load();
    await settle();

    expect(api['getOverview']).toHaveBeenCalledTimes(2);
  });

  it('keeps the last plugins and reports why they could not be reloaded', async () => {
    store.load();
    await settle();
    expect(ids()).toEqual(['example']);
    api['getOverview'].mockReturnValue(throwError(() => new Error('404')));

    store.load();
    await settle();

    expect(store.loadError()?.message).toBe('404');
    expect(ids()).toEqual(['example']);
  });

  it('stays unloaded if the backend does not know plugins', async () => {
    api['getOverview'].mockReturnValue(throwError(() => new Error('404')));

    await expect(firstValueFrom(store.refresh())).rejects.toThrow('404');
    expect(store.loaded()).toBe(false);
  });

  it('installs a plugin and reloads the overview', async () => {
    api['getOverview'].mockReturnValue(of(overview([plugin('example', {state: 'INACTIVE', restartRequired: true})], true)));
    const file = new File(['zip'], 'example.zip');

    const status = await firstValueFrom(store.install(file));

    expect(api['install']).toHaveBeenCalledWith(file);
    expect(status.restartRequired).toBe(true);
    expect(store.restartRequired()).toBe(true);
    expect(store.installing()).toBe(false);
  });

  it('marks a plugin as busy while it is changed', async () => {
    let busyDuringRequest = false;
    api['setEnabled'].mockImplementation((id: string, enabled: boolean) => {
      busyDuringRequest = store.isBusy(id);
      return of(plugin(id, {enabled}));
    });

    await firstValueFrom(store.setEnabled('example', false));

    expect(busyDuringRequest).toBe(true);
    expect(store.isBusy('example')).toBe(false);
    expect(api['getOverview']).toHaveBeenCalled();
  });

  it('takes over the overview after uninstalling', async () => {
    await firstValueFrom(store.refresh());

    await firstValueFrom(store.uninstall('example'));

    expect(store.plugins()).toEqual([]);
    expect(store.restartRequired()).toBe(true);
  });

  it('restarts the backend and reloads the plugins once it is ready', async () => {
    const result = firstValueFrom(store.restartBackend());
    await flush();
    expect(restart).toHaveBeenCalled();
    expect(api['getOverview']).not.toHaveBeenCalled();

    backendStatus.set(backend('ready', 3));
    TestBed.tick();

    expect((await result).plugins.map(p => p.id)).toEqual(['example']);
  });

  it('fails if the backend does not start again', async () => {
    const result = firstValueFrom(store.restartBackend());
    await flush();

    backendStatus.set(backend('failed', 3, 'Port in use'));
    TestBed.tick();

    await expect(result).rejects.toThrow('Port in use');
    expect(api['getOverview']).not.toHaveBeenCalled();
  });
});
