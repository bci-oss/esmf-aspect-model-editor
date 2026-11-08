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

import {PLUGIN_HOST_API_VERSION, PluginsPort, UiShellStore} from '@ame/domain';
import {FileSaverService, NotificationsService} from '@ame/shared';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {FileHandlingService} from '../editor-toolbar/services/file-handling.service';
import {PluginHostFactory} from './plugin-host.factory';
import {PluginHostContext} from './plugin-host.model';

const fileSaver = {save: vi.fn()};

const model = {namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl', content: '@prefix : <urn:samm:org.example:1.0.0#> .'};
const importContext: PluginHostContext = {pluginId: 'example', commandId: 'import', kind: 'import', model: null, selectedElement: null};
const generateContext: PluginHostContext = {
  pluginId: 'example',
  commandId: 'export',
  kind: 'generate',
  model,
  selectedElement: 'urn:samm:org.example:1.0.0#speed',
};

describe('PluginHostFactory', () => {
  let port: Record<'runAction' | 'importModel' | 'generate' | 'getFrontendFile', ReturnType<typeof vi.fn>>;
  let fileHandling: {loadModel: ReturnType<typeof vi.fn>};
  let notifications: Record<'info' | 'success' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  let close: ReturnType<typeof vi.fn<() => void>>;

  const create = (context: PluginHostContext = importContext) => TestBed.inject(PluginHostFactory).create(context, close);

  beforeEach(() => {
    fileSaver.save.mockReset();
    port = {
      runAction: vi.fn(() => of({ok: true})),
      importModel: vi.fn(() => of({models: [], warnings: []})),
      generate: vi.fn(() => of({files: [], warnings: ['w']})),
      getFrontendFile: vi.fn(() => of(new Blob())),
    };
    fileHandling = {loadModel: vi.fn(() => of(null))};
    notifications = {info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn()};
    close = vi.fn<() => void>();
    TestBed.configureTestingModule({
      providers: [
        {provide: FileSaverService, useValue: fileSaver},
        provideZonelessChangeDetection(),
        {provide: PluginsPort, useValue: port},
        {provide: FileHandlingService, useValue: fileHandling},
        {provide: NotificationsService, useValue: notifications},
        {provide: UiShellStore, useValue: {darkMode: signal(true)}},
        {provide: TranslocoService, useValue: {getActiveLang: () => 'de', translate: (key: string) => key}},
      ],
    });
  });

  it('describes the plugin, the command, the language and the theme', () => {
    const host = create();

    expect(host).toMatchObject({
      apiVersion: PLUGIN_HOST_API_VERSION,
      pluginId: 'example',
      commandId: 'import',
      kind: 'import',
      model: null,
      selectedElement: null,
      language: 'de',
      theme: 'dark',
    });
    expect(Object.isFrozen(host)).toBe(true);
  });

  it('gives generators a read-only copy of the model', () => {
    const host = create(generateContext);

    expect(host).toMatchObject({commandId: 'export', kind: 'generate', model, selectedElement: 'urn:samm:org.example:1.0.0#speed'});
    expect(host.model).not.toBe(model);
    expect(Object.isFrozen(host.model)).toBe(true);
  });

  it('generates with the model and the selected element unless the plugin overrides it', async () => {
    const host = create(generateContext);

    await expect(host.backend.generate('json', {descriptions: 'false'})).resolves.toEqual({files: [], warnings: ['w']});
    await host.backend.generate('json', undefined, {selectedElement: null});
    await host.backend.generate('json', {}, {selectedElement: 'urn:samm:org.example:1.0.0#name'});

    expect(port.generate).toHaveBeenNthCalledWith(1, 'example', 'json', {
      model,
      selectedElement: 'urn:samm:org.example:1.0.0#speed',
      options: {descriptions: 'false'},
    });
    expect(port.generate).toHaveBeenNthCalledWith(2, 'example', 'json', {model, selectedElement: null, options: {}});
    expect(port.generate).toHaveBeenNthCalledWith(3, 'example', 'json', {
      model,
      selectedElement: 'urn:samm:org.example:1.0.0#name',
      options: {},
    });
  });

  it('rejects generation without a model', async () => {
    await expect(create().backend.generate('json')).rejects.toThrow('plugins.runtime.noModel');
    expect(port.generate).not.toHaveBeenCalled();
  });

  it('saves files under their name only', async () => {
    const host = create(generateContext);
    const blob = new Blob(['{}'], {type: 'application/json'});

    await host.saveFile({fileName: 'Movement.description.json', content: blob});
    await host.saveFile({fileName: '../../etc/notes.txt', content: 'hello'});

    expect(fileSaver.save).toHaveBeenNthCalledWith(1, blob, 'Movement.description.json');
    const [text, name] = fileSaver.save.mock.calls[1];
    expect(name).toBe('notes.txt');
    expect(text.type).toBe('text/plain');
    expect(await text.text()).toBe('hello');
  });

  it('rejects files without a name or content', async () => {
    const host = create();

    await expect(host.saveFile({fileName: '..', content: 'x'})).rejects.toThrow('plugins.runtime.saveError');
    await expect(host.saveFile({fileName: 'dir/', content: 'x'})).rejects.toThrow('plugins.runtime.saveError');
    await expect(host.saveFile({fileName: 'a.txt', content: null as any})).rejects.toThrow('plugins.runtime.saveError');
    expect(fileSaver.save).not.toHaveBeenCalled();
  });

  it('tells the plugin when a file could not be saved', async () => {
    fileSaver.save.mockRejectedValue(new Error('disk full'));

    await expect(create().saveFile({fileName: 'a.txt', content: 'x'})).rejects.toThrow('disk full');
  });

  it('binds backend calls to the plugin', async () => {
    const host = create();
    const file = new File(['{}'], 'model.json');

    await expect(host.backend.action('existing-models', {a: 1})).resolves.toEqual({ok: true});
    await host.backend.importModel('json', file, {namespace: 'org.example'});
    await host.resource('./frontend/assets/logo.svg');

    expect(port.runAction).toHaveBeenCalledWith('example', 'existing-models', {a: 1});
    expect(port.importModel).toHaveBeenCalledWith('example', 'json', file, {namespace: 'org.example'});
    expect(port.getFrontendFile).toHaveBeenCalledWith('example', 'assets/logo.svg');
  });

  it('opens models in the editor', async () => {
    await create().workspace.openModel({
      fileName: 'Movement.ttl',
      namespace: 'org.example',
      version: '1.0.0',
      content: '@prefix : <urn:samm:org.example:1.0.0#> .',
    });

    expect(fileHandling.loadModel).toHaveBeenCalledWith('@prefix : <urn:samm:org.example:1.0.0#> .');
  });

  it('rejects models which cannot be opened', async () => {
    fileHandling.loadModel.mockReturnValue(throwError(() => 'Load model failed'));
    const host = create();

    await expect(host.workspace.openModel({content: 'invalid'} as any)).rejects.toThrow('plugins.runtime.openError');
    await expect(host.workspace.openModel({content: ''} as any)).rejects.toThrow('plugins.runtime.openError');
  });

  it('shows notifications of the plugin and closes its dialog', () => {
    const host = create();

    host.notify('Imported', 'success');
    host.notify('Partially imported', 'warning');
    host.notify('Failed', 'error');
    host.notify('Hello');
    host.close();

    expect(notifications.success).toHaveBeenCalledWith(expect.objectContaining({title: 'Imported'}));
    expect(notifications.warning).toHaveBeenCalledWith(expect.objectContaining({title: 'Partially imported'}));
    expect(notifications.error).toHaveBeenCalledWith(expect.objectContaining({title: 'Failed'}));
    expect(notifications.info).toHaveBeenCalledWith(expect.objectContaining({title: 'Hello'}));
    expect(close).toHaveBeenCalledOnce();
  });
});
