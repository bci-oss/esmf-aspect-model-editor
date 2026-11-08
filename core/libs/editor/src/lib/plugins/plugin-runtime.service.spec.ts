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

import {ElementRefactoringGuard, PluginModel, PluginsStore, PluginStatus} from '@ame/domain';
import {MaxGraphService} from '@ame/graph';
import {IPC_RENDERER, NotificationsService, PluginMenuPayload, TAURI_EVENTS} from '@ame/shared';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {MatDialog} from '@angular/material/dialog';
import {TranslocoService} from '@jsverse/transloco';
import {BehaviorSubject, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ElementRefactoringService} from '../refactoring/element-refactoring.service';
import {PluginHostDialogComponent} from './plugin-host-dialog/plugin-host-dialog.component';
import {PluginModelSnapshotService} from './plugin-model-snapshot.service';
import {PluginRuntimeService} from './plugin-runtime.service';

const model: PluginModel = {namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl', content: '@prefix : <urn:x#> .'};

const examplePlugin: PluginStatus = {
  id: 'example',
  name: 'Example',
  version: '1.0.0',
  description: null,
  state: 'ACTIVE',
  enabled: true,
  restartRequired: false,
  error: null,
  frontend: {entry: 'frontend/main.js', element: 'ame-plugin-example'},
  commands: [
    {
      id: 'import',
      kind: 'import',
      label: 'Import from JSON description...',
      labels: {de: 'Aus JSON-Beschreibung importieren...'},
      icon: 'upload_file',
      placements: ['menu'],
      menu: 'file/import',
    },
    {
      id: 'export',
      kind: 'generate',
      label: 'Generate as JSON description...',
      labels: {},
      icon: 'output',
      placements: ['menu', 'toolbar'],
      menu: 'generate',
    },
  ],
  actions: [],
  importers: ['json'],
  generators: ['json'],
};

function createIpcMock() {
  const handlers = new Map<string, (...args: any[]) => void>();
  return {
    handlers,
    send: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => handlers.set(event, handler)),
    setPluginMenu: vi.fn((_menu: PluginMenuPayload) => Promise.resolve()),
  };
}

describe('PluginRuntimeService', () => {
  let ipc: ReturnType<typeof createIpcMock>;
  let plugins: ReturnType<typeof signal<PluginStatus[]>>;
  let loaded: ReturnType<typeof signal<boolean>>;
  let store: {
    plugins: typeof plugins;
    loaded: typeof loaded;
    load: ReturnType<typeof vi.fn>;
    plugin: (id: string) => PluginStatus | undefined;
  };
  let dialog: {open: ReturnType<typeof vi.fn>};
  let notifications: {warning: ReturnType<typeof vi.fn>};
  let lang: BehaviorSubject<string>;
  let modelEmpty: ReturnType<typeof signal<boolean>>;
  let snapshots: {snapshot: ReturnType<typeof vi.fn<() => Promise<PluginModel | null>>>};
  let selectedElement: ReturnType<typeof signal<{aspectModelUrn: string} | null>>;

  const create = (ipcRenderer: unknown = ipc) => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: IPC_RENDERER, useValue: ipcRenderer},
        {provide: PluginsStore, useValue: store},
        {provide: MatDialog, useValue: dialog},
        {provide: NotificationsService, useValue: notifications},
        {provide: MaxGraphService, useValue: {isModelEmpty: modelEmpty}},
        {provide: PluginModelSnapshotService, useValue: snapshots},
        {provide: ElementRefactoringService, useValue: {selectedElement}},
        {
          provide: ElementRefactoringGuard,
          useValue: {urnOf: (element: {aspectModelUrn: string} | null) => element?.aspectModelUrn ?? null},
        },
        {
          provide: TranslocoService,
          useValue: {
            langChanges$: lang,
            getActiveLang: () => lang.value,
            translate: (key: string) => key,
            selectTranslate: (key: string, params: object, language: string) => of(`${key}:${language}`),
          },
        },
      ],
    });
    const service = TestBed.inject(PluginRuntimeService);
    service.register();
    TestBed.tick();
    return service;
  };

  beforeEach(() => {
    ipc = createIpcMock();
    plugins = signal([examplePlugin]);
    loaded = signal(true);
    store = {plugins, loaded, load: vi.fn(), plugin: id => plugins().find(plugin => plugin.id === id)};
    dialog = {open: vi.fn()};
    notifications = {warning: vi.fn()};
    lang = new BehaviorSubject('en');
    modelEmpty = signal(false);
    snapshots = {snapshot: vi.fn<() => Promise<PluginModel | null>>(() => Promise.resolve(model))};
    selectedElement = signal<{aspectModelUrn: string} | null>(null);
  });

  const dialogData = () => dialog.open.mock.calls[0][1].data;

  it('publishes the menu entries of usable plugins', () => {
    create();

    expect(ipc.setPluginMenu).toHaveBeenLastCalledWith({
      title: 'plugins.menuTitle:en',
      entries: [
        {pluginId: 'example', entryId: 'import', label: 'Import from JSON description...', location: 'file/import', enabled: true},
        {pluginId: 'example', entryId: 'export', label: 'Generate as JSON description...', location: 'generate', enabled: true},
      ],
    });
  });

  it('disables generator menu entries while no Aspect Model is open', () => {
    modelEmpty.set(true);
    create();

    const entries = () => ipc.setPluginMenu.mock.lastCall![0].entries;
    expect(entries().map(entry => entry.enabled)).toEqual([true, false]);

    modelEmpty.set(false);
    TestBed.tick();
    expect(entries().map(entry => entry.enabled)).toEqual([true, true]);
  });

  it('follows the installed plugins and the language', () => {
    create();

    lang.next('de');
    TestBed.tick();
    expect(ipc.setPluginMenu).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'plugins.menuTitle:de',
        entries: [expect.objectContaining({label: 'Aus JSON-Beschreibung importieren...'}), expect.objectContaining({entryId: 'export'})],
      }),
    );

    plugins.set([{...examplePlugin, state: 'FAILED'}]);
    TestBed.tick();
    expect(ipc.setPluginMenu).toHaveBeenLastCalledWith(expect.objectContaining({entries: []}));
  });

  it('loads the plugins', () => {
    create();

    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it('keeps the menu until the plugins are known', () => {
    loaded.set(false);
    create();

    expect(ipc.setPluginMenu).not.toHaveBeenCalled();
  });

  it('offers the commands per placement in the current language', () => {
    const service = create();

    expect(service.commands().map(command => command.commandId)).toEqual(['import', 'export']);
    expect(service.toolbarCommands().map(command => command.commandId)).toEqual(['export']);

    lang.next('de');
    TestBed.tick();
    expect(service.commands()[0].label).toBe('Aus JSON-Beschreibung importieren...');

    loaded.set(false);
    expect(service.commands()).toEqual([]);
  });

  it('opens the plugin for a clicked menu entry', async () => {
    create();

    await ipc.handlers.get(TAURI_EVENTS.SIGNAL.PLUGIN_MENU_ACTION)!({pluginId: 'example', entryId: 'import'});

    expect(dialog.open).toHaveBeenCalledWith(PluginHostDialogComponent, expect.objectContaining({disableClose: true}));
    expect(dialogData()).toEqual({
      plugin: examplePlugin,
      context: {pluginId: 'example', commandId: 'import', kind: 'import', model: null, selectedElement: null},
      title: 'Import from JSON description...',
    });
    expect(snapshots.snapshot).not.toHaveBeenCalled();
  });

  it('gives generators the open model and the selected element', async () => {
    const service = create();
    selectedElement.set({aspectModelUrn: 'urn:samm:org.example:1.0.0#speed'});

    await service.run('example', 'export');

    expect(dialogData().context).toEqual({
      pluginId: 'example',
      commandId: 'export',
      kind: 'generate',
      model,
      selectedElement: 'urn:samm:org.example:1.0.0#speed',
    });
    expect(dialogData().title).toBe('Generate as JSON description...');
  });

  it('does not run generators without an open model', async () => {
    const service = create();
    snapshots.snapshot.mockResolvedValue(null);

    await service.run('example', 'export');

    expect(dialog.open).not.toHaveBeenCalled();
    expect(notifications.warning).toHaveBeenCalledWith(expect.objectContaining({title: 'plugins.runtime.noModel'}));
  });

  it('warns about commands of plugins which are not running', async () => {
    const service = create();
    plugins.set([{...examplePlugin, state: 'FAILED'}]);

    await ipc.handlers.get(TAURI_EVENTS.SIGNAL.PLUGIN_MENU_ACTION)!({pluginId: 'example', entryId: 'import'});
    await ipc.handlers.get(TAURI_EVENTS.SIGNAL.PLUGIN_MENU_ACTION)!({pluginId: 'unknown', entryId: 'import'});
    plugins.set([examplePlugin]);
    await service.run('example', 'unknown');

    expect(dialog.open).not.toHaveBeenCalled();
    expect(notifications.warning).toHaveBeenCalledTimes(3);
  });

  it('does nothing outside the desktop application', () => {
    create(null);

    expect(store.load).not.toHaveBeenCalled();
  });
});
