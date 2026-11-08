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

import {PluginsStore, PluginStatus} from '@ame/domain';
import {NotificationsService} from '@ame/shared';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PluginsSettingsComponent} from './plugins-settings.component';

const plugin = (overrides: Partial<PluginStatus> = {}): PluginStatus => ({
  id: 'example-import',
  name: 'Example import',
  version: '1.0.0',
  description: 'Imports JSON descriptions',
  state: 'ACTIVE',
  enabled: true,
  restartRequired: false,
  error: null,
  frontend: {entry: 'main.js', element: 'ame-plugin-example-import'},
  commands: [],
  actions: [],
  importers: ['json'],
  generators: [],
  ...overrides,
});

describe('PluginsSettingsComponent', () => {
  let fixture: ComponentFixture<PluginsSettingsComponent>;
  let component: PluginsSettingsComponent;
  let store: Record<string, any>;
  let notifications: Record<string, ReturnType<typeof vi.fn>>;

  const render = () => {
    fixture = TestBed.createComponent(PluginsSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };
  const query = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const fileInput = (file: File): HTMLInputElement => {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {value: [file], configurable: true});
    return input;
  };

  beforeEach(async () => {
    const plugins = signal<PluginStatus[]>([plugin()]);
    store = {
      plugins,
      restartRequired: signal(false),
      installing: signal(false),
      restarting: signal(false),
      canRestartBackend: true,
      isBusy: () => false,
      refresh: vi.fn(() => of({pluginApiVersion: 1, plugins: plugins(), restartRequired: false})),
      install: vi.fn(() => of(plugin({state: 'INACTIVE', restartRequired: true}))),
      setEnabled: vi.fn(() => of(plugin())),
      uninstall: vi.fn(() => of({pluginApiVersion: 1, plugins: [], restartRequired: true})),
      restartBackend: vi.fn(() => of({pluginApiVersion: 1, plugins: plugins(), restartRequired: false})),
    };
    notifications = {success: vi.fn(), error: vi.fn(), info: vi.fn()};

    await TestBed.configureTestingModule({
      imports: [
        PluginsSettingsComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: {en: {plugins: {settings: {}}}},
          translocoConfig: {availableLangs: ['en'], defaultLang: 'en'},
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        {provide: PluginsStore, useValue: store},
        {provide: NotificationsService, useValue: notifications},
      ],
    }).compileComponents();
  });

  it('loads and lists the installed plugins', () => {
    render();

    expect(store['refresh']).toHaveBeenCalled();
    expect(query('plugin-example-import')?.textContent).toContain('Example import');
    expect(query('plugin-state-active')).toBeTruthy();
    expect(query('plugins-empty')).toBeNull();
    expect(query('plugins-trust-hint')).toBeTruthy();
  });

  it('shows why the plugins could not be loaded', () => {
    store['refresh'].mockReturnValue(throwError(() => ({error: {error: {message: 'Not found'}}})));
    render();

    expect(query('plugins-load-error')?.textContent).toContain('Not found');
  });

  it('shows the empty state and the error of a failed plugin', () => {
    store['plugins'].set([]);
    render();
    expect(query('plugins-empty')).toBeTruthy();

    store['plugins'].set([plugin({state: 'FAILED', error: 'ClassNotFoundException'})]);
    fixture.detectChanges();
    expect(query('plugin-state-failed')).toBeTruthy();
    expect(query('plugin-error')?.textContent).toContain('ClassNotFoundException');
  });

  it('derives the state shown for a plugin', () => {
    render();

    expect(component.state(plugin())).toBe('active');
    expect(component.state(plugin({state: 'INACTIVE', enabled: false}))).toBe('disabled');
    expect(component.state(plugin({state: 'INACTIVE'}))).toBe('inactive');
    expect(component.state(plugin({state: 'FAILED'}))).toBe('failed');
    expect(component.state(plugin({restartRequired: true}))).toBe('pending');
  });

  it('installs a selected archive', () => {
    render();
    const file = new File(['zip'], 'example-import-1.0.0.zip');

    component.install(fileInput(file));

    expect(store['install']).toHaveBeenCalledWith(file);
    expect(notifications['success']).toHaveBeenCalled();
  });

  it('rejects files that are not plugin archives', () => {
    render();

    component.install(fileInput(new File(['{}'], 'movement.json')));

    expect(store['install']).not.toHaveBeenCalled();
    expect(notifications['error']).toHaveBeenCalled();
  });

  it('reports a failed installation', () => {
    store['install'].mockReturnValue(throwError(() => ({error: {error: {message: 'Invalid plugin.json'}}})));
    render();

    component.install(fileInput(new File(['zip'], 'broken.zip')));

    expect(notifications['error']).toHaveBeenCalledWith(expect.objectContaining({message: 'Invalid plugin.json'}));
  });

  it('enables, disables and removes a plugin', () => {
    render();

    component.toggleEnabled(plugin());
    component.toggleEnabled(plugin({enabled: false}));
    component.remove(plugin());

    expect(store['setEnabled']).toHaveBeenNthCalledWith(1, 'example-import', false);
    expect(store['setEnabled']).toHaveBeenNthCalledWith(2, 'example-import', true);
    expect(store['uninstall']).toHaveBeenCalledWith('example-import');
  });

  it('restarts the backend after removing a running plugin', () => {
    render();

    component.remove(plugin());

    expect(store['restartBackend']).toHaveBeenCalledTimes(1);
    expect(notifications['success']).toHaveBeenCalledTimes(2);
  });

  it('does not restart the backend after removing a plugin that was not running', () => {
    store['uninstall'].mockReturnValue(of({pluginApiVersion: 1, plugins: [], restartRequired: false}));
    render();

    component.remove(plugin());

    expect(store['restartBackend']).not.toHaveBeenCalled();
  });

  it('keeps the restart to the user if the backend cannot be restarted from here', () => {
    store['canRestartBackend'] = false;
    render();

    component.remove(plugin());

    expect(store['restartBackend']).not.toHaveBeenCalled();
  });

  it('offers to restart the backend when plugin changes are pending', () => {
    store['restartRequired'].set(true);
    render();

    query('plugins-restart')?.click();

    expect(query('plugins-restart-banner')).toBeTruthy();
    expect(store['restartBackend']).toHaveBeenCalled();
    expect(notifications['success']).toHaveBeenCalled();
  });

  it('shows why the backend could not be restarted', () => {
    store['restartRequired'].set(true);
    store['restartBackend'].mockReturnValue(throwError(() => 'The backend was started externally on port 9090.'));
    render();

    component.restartBackend();
    fixture.detectChanges();

    expect(query('plugins-restart-error')?.textContent).toContain('started externally');
  });

  it('asks for a manual restart if the backend cannot be restarted from here', () => {
    store['restartRequired'].set(true);
    store['canRestartBackend'] = false;
    render();

    expect(query('plugins-restart-banner')).toBeTruthy();
    expect(query('plugins-restart')).toBeNull();
  });
});
