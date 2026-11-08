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

import {PluginStatus} from '@ame/domain';
import {provideZonelessChangeDetection} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PluginHostFactory} from '../plugin-host.factory';
import {PluginHostContext} from '../plugin-host.model';
import {PluginModuleLoader, PluginVersionChangedError} from '../plugin-module-loader.service';
import {PluginHostDialogComponent, PluginHostDialogData} from './plugin-host-dialog.component';

const ELEMENT = 'ame-plugin-host-dialog-test';
if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, class extends HTMLElement {});

const plugin = {
  id: 'example-import',
  name: 'Example Import',
  version: '1.0.0',
  frontend: {entry: 'frontend/main.js', element: ELEMENT},
} as PluginStatus;

describe('PluginHostDialogComponent', () => {
  let loader: {load: ReturnType<typeof vi.fn>};
  let dialogRef: {close: ReturnType<typeof vi.fn>};
  let hostFactory: {create: ReturnType<typeof vi.fn>};

  const create = async (): Promise<ComponentFixture<PluginHostDialogComponent>> => {
    const data: PluginHostDialogData = {
      plugin,
      context: {pluginId: plugin.id, commandId: 'import', kind: 'import', model: null, selectedElement: null},
      title: 'Import from JSON description...',
    };
    TestBed.configureTestingModule({
      imports: [
        PluginHostDialogComponent,
        TranslocoTestingModule.forRoot({
          langs: {en: {plugins: {runtime: {loadError: 'Plugin {{name}} failed', versionChanged: 'Restart for {{version}} of {{name}}'}}}},
          translocoConfig: {availableLangs: ['en'], defaultLang: 'en'},
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        {provide: MAT_DIALOG_DATA, useValue: data},
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: PluginModuleLoader, useValue: loader},
        {provide: PluginHostFactory, useValue: hostFactory},
      ],
    });
    const fixture = TestBed.createComponent(PluginHostDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const query = (fixture: ComponentFixture<unknown>, testId: string) => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  beforeEach(() => {
    loader = {load: vi.fn(() => Promise.resolve())};
    dialogRef = {close: vi.fn()};
    hostFactory = {
      create: vi.fn((context: PluginHostContext, close: () => void) => ({pluginId: context.pluginId, commandId: context.commandId, close})),
    };
  });

  it('mounts the element of the plugin with its host', async () => {
    const fixture = await create();

    const element = query(fixture, 'plugin-host-container').querySelector(ELEMENT);
    expect(query(fixture, 'plugin-host-title').textContent).toContain('Import from JSON description...');
    expect(element.host).toMatchObject({pluginId: 'example-import', commandId: 'import'});
    expect(query(fixture, 'plugin-host-loading')).toBeNull();

    element.host.close();
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('asks for a restart when the plugin was updated', async () => {
    loader.load.mockRejectedValue(new PluginVersionChangedError(plugin));

    const fixture = await create();

    expect(query(fixture, 'plugin-host-version-changed').textContent).toContain('Restart for 1.0.0 of Example Import');
    expect(query(fixture, 'plugin-host-container').children.length).toBe(0);
  });

  it('shows why the plugin could not be loaded', async () => {
    loader.load.mockRejectedValue(new Error('The plugin does not define the element'));

    const fixture = await create();

    expect(query(fixture, 'plugin-host-error').textContent).toContain('Plugin Example Import failed');
    expect(query(fixture, 'plugin-host-error').textContent).toContain('does not define the element');
  });
});
