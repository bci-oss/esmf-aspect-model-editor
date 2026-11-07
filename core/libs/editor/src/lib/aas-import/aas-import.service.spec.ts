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

import {ModelSourcesStore} from '@ame/domain';
import {LanguageTranslationService, NotificationsService, TauriSignalsService} from '@ame/shared';
import {TestBed} from '@angular/core/testing';
import {MatDialog} from '@angular/material/dialog';
import {firstValueFrom, of, toArray} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AasImportDialogComponent, AasImportResult} from './aas-import-dialog/aas-import-dialog.component';
import {AasImportService} from './aas-import.service';

describe('AasImportService', () => {
  let service: AasImportService;
  let result: AasImportResult | undefined;
  let matDialog: {open: ReturnType<typeof vi.fn>};
  let modelSources: {ensureLoaded: ReturnType<typeof vi.fn>; rememberTargetWorkspace: ReturnType<typeof vi.fn>};
  let tauriSignals: {call: ReturnType<typeof vi.fn>};
  let notifications: {success: ReturnType<typeof vi.fn>};

  const fileInfo = {path: '/tmp/Shell.aasx', name: 'Shell.aasx', content: new Uint8Array([80, 75])};

  beforeEach(() => {
    result = {workspace: '/home/team', imported: 2};
    matDialog = {open: vi.fn(() => ({afterClosed: () => of(result)}))};
    modelSources = {ensureLoaded: vi.fn(() => of([])), rememberTargetWorkspace: vi.fn()};
    tauriSignals = {call: vi.fn()};
    notifications = {success: vi.fn()};

    TestBed.configureTestingModule({
      providers: [
        {provide: MatDialog, useValue: matDialog},
        {provide: ModelSourcesStore, useValue: modelSources},
        {provide: TauriSignalsService, useValue: tauriSignals},
        {provide: NotificationsService, useValue: notifications},
        {
          provide: LanguageTranslationService,
          useValue: {translateService: {translate: (key: string, params: {count: number}) => `${key}:${params.count}`}},
        },
      ],
    });
    service = TestBed.inject(AasImportService);
  });

  it('opens the import dialog with the chosen file once the workspaces are known', async () => {
    await firstValueFrom(service.importAas(fileInfo));

    expect(modelSources.ensureLoaded).toHaveBeenCalled();
    const [component, config] = matDialog.open.mock.calls[0];
    expect(component).toBe(AasImportDialogComponent);
    expect(config.data.file).toBeInstanceOf(File);
    expect(config.data.file.name).toBe('Shell.aasx');
    expect(new Uint8Array(await config.data.file.arrayBuffer())).toEqual(new Uint8Array([80, 75]));
  });

  it('remembers the workspace, refreshes the workspace view and confirms the import', async () => {
    expect(await firstValueFrom(service.importAas(fileInfo))).toEqual(result);

    expect(modelSources.rememberTargetWorkspace).toHaveBeenCalledWith('/home/team');
    expect(tauriSignals.call).toHaveBeenCalledWith('requestRefreshWorkspaces');
    expect(notifications.success).toHaveBeenCalledWith(expect.objectContaining({title: 'aasImport.imported:2'}));
  });

  it('does nothing if the user cancels', async () => {
    result = undefined;

    expect(await firstValueFrom(service.importAas(fileInfo).pipe(toArray()))).toEqual([]);

    expect(tauriSignals.call).not.toHaveBeenCalled();
    expect(notifications.success).not.toHaveBeenCalled();
  });
});
