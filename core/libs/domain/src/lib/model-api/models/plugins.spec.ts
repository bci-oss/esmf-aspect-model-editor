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

import {describe, expect, it} from 'vitest';
import {
  isPluginCommandEnabled,
  isPluginUsable,
  PluginCommand,
  pluginCommandEntries,
  pluginCommandLabel,
  pluginCommandsAt,
  pluginDisplayState,
  pluginFrontendPath,
  pluginSaveFileName,
  PluginStatus,
  toPluginGenerationResult,
} from './plugins';

const item = (overrides: Partial<PluginCommand> = {}): PluginCommand => ({
  id: 'import',
  kind: 'import',
  label: 'Import JSON',
  labels: {de: 'JSON importieren'},
  icon: 'upload_file',
  placements: ['menu'],
  menu: 'file/import',
  ...overrides,
});
const plugin = (overrides: Partial<PluginStatus> = {}): PluginStatus => ({
  id: 'example',
  name: 'Example',
  version: '1.0.0',
  description: null,
  state: 'ACTIVE',
  enabled: true,
  restartRequired: false,
  error: null,
  frontend: {entry: 'main.js', element: 'ame-plugin-example'},
  commands: [item()],
  actions: [],
  importers: [],
  generators: [],
  ...overrides,
});

describe('plugins', () => {
  it('uses the label of the language and falls back to the default label and the id', () => {
    expect(pluginCommandLabel(item(), 'de')).toBe('JSON importieren');
    expect(pluginCommandLabel(item(), 'zh')).toBe('Import JSON');
    expect(pluginCommandLabel(item({label: null, labels: {en: 'Import'}}), 'zh')).toBe('Import');
    expect(pluginCommandLabel(item({label: null, labels: {}}), 'zh')).toBe('import');
  });

  it('only offers running plugins with a user interface', () => {
    expect(isPluginUsable(plugin())).toBe(true);
    expect(isPluginUsable(plugin({state: 'INACTIVE'}))).toBe(false);
    expect(isPluginUsable(plugin({state: 'FAILED'}))).toBe(false);
    expect(isPluginUsable(plugin({frontend: null}))).toBe(false);
    expect(isPluginUsable(plugin({frontend: {entry: 'main.js', element: null}}))).toBe(false);
  });

  it('resolves frontend files relative to the frontend folder', () => {
    expect(pluginFrontendPath('frontend/main.js')).toBe('main.js');
    expect(pluginFrontendPath('./frontend/assets/icon.svg')).toBe('assets/icon.svg');
    expect(pluginFrontendPath('assets/icon.svg')).toBe('assets/icon.svg');
    expect(pluginFrontendPath('/styles.css')).toBe('styles.css');
  });

  it('lists the commands of the usable plugins in the language', () => {
    const exportCommand = item({
      id: 'export',
      kind: 'generate',
      labels: {},
      icon: 'output',
      placements: ['toolbar'],
      menu: 'generate',
    });
    const entries = pluginCommandEntries(
      [plugin(), plugin({id: 'off', state: 'INACTIVE'}), plugin({id: 'gen', commands: [exportCommand]})],
      'de',
    );

    expect(entries).toEqual([
      {
        pluginId: 'example',
        commandId: 'import',
        kind: 'import',
        label: 'JSON importieren',
        icon: 'upload_file',
        placements: ['menu'],
        menu: 'file/import',
      },
      {
        pluginId: 'gen',
        commandId: 'export',
        kind: 'generate',
        label: 'Import JSON',
        icon: 'output',
        placements: ['toolbar'],
        menu: 'generate',
      },
    ]);
    expect(pluginCommandsAt(entries, 'menu').map(entry => entry.commandId)).toEqual(['import']);
    expect(pluginCommandsAt(entries, 'toolbar').map(entry => entry.commandId)).toEqual(['export']);
  });

  it('enables generator commands only with an open model', () => {
    expect(isPluginCommandEnabled('import', true)).toBe(true);
    expect(isPluginCommandEnabled('generate', false)).toBe(true);
    expect(isPluginCommandEnabled('generate', true)).toBe(false);
  });

  it('derives the state shown for a plugin', () => {
    expect(pluginDisplayState(plugin())).toBe('active');
    expect(pluginDisplayState(plugin({state: 'INACTIVE', enabled: false}))).toBe('disabled');
    expect(pluginDisplayState(plugin({state: 'INACTIVE'}))).toBe('inactive');
    expect(pluginDisplayState(plugin({state: 'FAILED'}))).toBe('failed');
    expect(pluginDisplayState(plugin({state: 'FAILED', enabled: false, restartRequired: true}))).toBe('pending');
  });

  it('strips folders from the names of files to save', () => {
    expect(pluginSaveFileName('Movement.json')).toBe('Movement.json');
    expect(pluginSaveFileName('../out/ Movement.json ')).toBe('Movement.json');
    expect(pluginSaveFileName('C:\\out\\Movement.json')).toBe('Movement.json');
    expect(pluginSaveFileName('out/')).toBeNull();
    expect(pluginSaveFileName('..')).toBeNull();
    expect(pluginSaveFileName(undefined)).toBeNull();
  });

  it('decodes generated files into blobs', async () => {
    const result = toPluginGenerationResult({files: [{fileName: 'a.txt', mediaType: 'text/plain', content: btoa('hello')}], warnings: []});

    expect(result.warnings).toEqual([]);
    expect(result.files[0]).toMatchObject({fileName: 'a.txt', mediaType: 'text/plain'});
    expect(await result.files[0].content.text()).toBe('hello');
  });
});
