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

import {PluginsPort, PluginStatus} from '@ame/domain';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PluginModuleLoader, PluginVersionChangedError} from './plugin-module-loader.service';

let elementCounter = 0;

function plugin(element: string, version = '1.0.0'): PluginStatus {
  return {
    id: 'example-import',
    name: 'Example Import',
    version,
    description: '',
    state: 'ACTIVE',
    enabled: true,
    restartRequired: false,
    error: null,
    frontend: {entry: 'frontend/main.js', element},
    commands: [],
    actions: [],
    importers: [],
    generators: [],
  };
}

describe('PluginModuleLoader', () => {
  let port: {getFrontendFile: ReturnType<typeof vi.fn>};
  let loader: PluginModuleLoader;
  let importUrl: ReturnType<typeof vi.fn>;
  let element: string;

  beforeEach(() => {
    element = `ame-plugin-test-${++elementCounter}`;
    port = {getFrontendFile: vi.fn(() => of(new Blob(['export {};'])))};
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection(), {provide: PluginsPort, useValue: port}]});
    loader = TestBed.inject(PluginModuleLoader);
    importUrl = vi.fn(async () => customElements.define(element, class extends HTMLElement {}));
    vi.spyOn(loader as any, 'importUrl').mockImplementation(importUrl);
  });

  it('imports the entry relative to the frontend folder once', async () => {
    await loader.load(plugin(element));
    await loader.load(plugin(element));

    expect(port.getFrontendFile).toHaveBeenCalledOnce();
    expect(port.getFrontendFile).toHaveBeenCalledWith('example-import', 'main.js');
    expect(importUrl).toHaveBeenCalledWith(expect.stringMatching(/^blob:/));
  });

  it('asks for a restart when another version was loaded already', async () => {
    await loader.load(plugin(element));

    await expect(loader.load(plugin(element, '1.1.0'))).rejects.toBeInstanceOf(PluginVersionChangedError);
  });

  it('fails when the module does not define the element and allows a retry', async () => {
    importUrl.mockResolvedValueOnce(undefined);

    await expect(loader.load(plugin(element))).rejects.toThrow(`<${element}>`);
    await loader.load(plugin(element));

    expect(port.getFrontendFile).toHaveBeenCalledTimes(2);
  });

  it('fails for plugins without user interface', async () => {
    await expect(loader.load({...plugin(element), frontend: null})).rejects.toThrow('no user interface');
  });
});
