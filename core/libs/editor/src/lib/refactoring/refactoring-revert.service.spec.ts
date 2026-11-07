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

import {ConfirmDialogEnum, ConfirmDialogPort, RefactoringHistoryEntry, RefactoringRequest, RefactoringStore} from '@ame/domain';
import {LanguageTranslationService, NotificationsService} from '@ame/shared';
import {HttpErrorResponse} from '@angular/common/http';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {RefactoringRevertService} from './refactoring-revert.service';
import {RefactoringTabSyncService} from './refactoring-tab-sync.service';
import {RefactoringWindowSyncService} from './refactoring-window-sync.service';

const request: RefactoringRequest = {type: 'RENAME_ELEMENT', urn: 'urn:samm:org.example:1.0.0#speed', newName: 'velocity'};
const file = (fileName: string) => ({namespace: 'org.example', version: '1.0.0', fileName, path: fileName, readOnly: false});
const entry: RefactoringHistoryEntry = {
  id: '1',
  description: 'Rename speed',
  timestamp: 1,
  created: [file('New.ttl')],
  modified: [file('Movement.ttl')],
  removed: [file('Old.ttl')],
};

describe('RefactoringRevertService', () => {
  let service: RefactoringRevertService;
  let store: {revert: ReturnType<typeof vi.fn>};
  let tabSync: {synchronize: ReturnType<typeof vi.fn>};
  let windowSync: {publish: ReturnType<typeof vi.fn>};
  let confirmDialog: {open: ReturnType<typeof vi.fn>};
  let notifications: Record<'success' | 'error', ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    store = {revert: vi.fn(() => of(entry))};
    tabSync = {synchronize: vi.fn()};
    windowSync = {publish: vi.fn()};
    confirmDialog = {open: vi.fn(() => of(ConfirmDialogEnum.ok))};
    notifications = {success: vi.fn(), error: vi.fn()};

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: RefactoringStore, useValue: store},
        {provide: RefactoringTabSyncService, useValue: tabSync},
        {provide: RefactoringWindowSyncService, useValue: windowSync},
        {provide: ConfirmDialogPort, useValue: confirmDialog},
        {provide: NotificationsService, useValue: notifications},
        {provide: LanguageTranslationService, useValue: {translateService: {translate: (key: string) => key}}},
      ],
    });
    service = TestBed.inject(RefactoringRevertService);
  });

  it('restores the files and moves the tabs back', () => {
    service.revert(request, entry).subscribe();

    expect(store.revert).toHaveBeenCalledWith('1');
    expect(tabSync.synchronize).toHaveBeenCalledWith(
      {type: 'RENAME_ELEMENT', urn: 'urn:samm:org.example:1.0.0#velocity', newName: 'speed'},
      expect.objectContaining({created: entry.removed, removed: entry.created}),
    );
    expect(windowSync.publish).toHaveBeenCalledWith(tabSync.synchronize.mock.calls[0][0], tabSync.synchronize.mock.calls[0][1]);
    expect(notifications.success).toHaveBeenCalled();
  });

  it('reloads the touched tabs of refactorings recorded without a request', () => {
    service.revert(undefined, entry).subscribe();

    expect(tabSync.synchronize).toHaveBeenCalledWith(undefined, expect.objectContaining({created: entry.removed}));
    expect(notifications.success).toHaveBeenCalled();
  });

  it('asks before overwriting files changed after the refactoring', () => {
    store.revert.mockImplementation((_id: string, force?: boolean) =>
      force ? of(entry) : throwError(() => new HttpErrorResponse({status: 409})),
    );

    service.revert(request, entry).subscribe();

    expect(confirmDialog.open).toHaveBeenCalled();
    expect(store.revert).toHaveBeenLastCalledWith('1', true);
    expect(notifications.success).toHaveBeenCalled();
  });

  it('keeps the files if the forced undo is declined', () => {
    store.revert.mockReturnValue(throwError(() => new HttpErrorResponse({status: 409})));
    confirmDialog.open.mockReturnValue(of(ConfirmDialogEnum.cancel));

    service.revert(request, entry).subscribe();

    expect(store.revert).toHaveBeenCalledTimes(1);
    expect(tabSync.synchronize).not.toHaveBeenCalled();
  });

  it('reports a failed undo', () => {
    store.revert.mockReturnValue(throwError(() => new HttpErrorResponse({status: 500, error: {message: 'Disk full'}})));

    service.revert(request, entry).subscribe();

    expect(notifications.error).toHaveBeenCalledWith(expect.objectContaining({message: 'Disk full'}));
    expect(tabSync.synchronize).not.toHaveBeenCalled();
  });
});
