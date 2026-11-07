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
import {MatDialog} from '@angular/material/dialog';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ElementUsageDialogComponent} from './element-usage-dialog/element-usage-dialog.component';
import {RefactoringDialogService} from './refactoring-dialog.service';
import {RefactoringDialogComponent, RefactoringDialogResult} from './refactoring-dialog/refactoring-dialog.component';
import {RefactoringTabSyncService} from './refactoring-tab-sync.service';

const SPEED = 'urn:samm:org.example:1.0.0#speed';
/** What the dialog is opened with; the user enters the new name in the dialog. */
const openedWith: RefactoringRequest = {type: 'RENAME_ELEMENT', urn: SPEED};
const request: RefactoringRequest = {...openedWith, newName: 'velocity'};
const file = (fileName: string) => ({namespace: 'org.example', version: '1.0.0', fileName, path: fileName, readOnly: false});
const entry: RefactoringHistoryEntry = {
  id: '1',
  description: 'Rename speed',
  timestamp: 1,
  created: [file('New.ttl')],
  modified: [file('Movement.ttl')],
  removed: [file('Old.ttl')],
};

describe('RefactoringDialogService', () => {
  let service: RefactoringDialogService;
  let matDialog: {open: ReturnType<typeof vi.fn>};
  let store: {revert: ReturnType<typeof vi.fn>};
  let tabSync: {synchronize: ReturnType<typeof vi.fn>};
  let confirmDialog: {open: ReturnType<typeof vi.fn>};
  let notifications: Record<'info' | 'success' | 'error', ReturnType<typeof vi.fn>>;

  const dialogClosingWith = (result: RefactoringDialogResult | undefined) =>
    matDialog.open.mockReturnValue({afterClosed: () => of(result)});

  beforeEach(() => {
    matDialog = {open: vi.fn()};
    store = {revert: vi.fn(() => of(entry))};
    tabSync = {synchronize: vi.fn()};
    confirmDialog = {open: vi.fn(() => of(ConfirmDialogEnum.ok))};
    notifications = {info: vi.fn(), success: vi.fn(), error: vi.fn()};

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: MatDialog, useValue: matDialog},
        {provide: RefactoringStore, useValue: store},
        {provide: RefactoringTabSyncService, useValue: tabSync},
        {provide: ConfirmDialogPort, useValue: confirmDialog},
        {provide: NotificationsService, useValue: notifications},
        {provide: LanguageTranslationService, useValue: {translateService: {translate: (key: string) => key}}},
      ],
    });
    service = TestBed.inject(RefactoringDialogService);
  });

  it('synchronizes the tabs with the applied request and offers to undo it', () => {
    dialogClosingWith({request, entry});

    let result: RefactoringHistoryEntry | null | undefined;
    service.open(openedWith).subscribe(value => (result = value));

    expect(matDialog.open).toHaveBeenCalledWith(RefactoringDialogComponent, expect.objectContaining({data: {request: openedWith}}));
    expect(result).toBe(entry);
    expect(tabSync.synchronize).toHaveBeenCalledWith(request, entry);
    expect(notifications.info).toHaveBeenCalledWith(expect.objectContaining({onClick: expect.any(Function)}));
  });

  it('does nothing when the dialog is cancelled', () => {
    dialogClosingWith(undefined);

    let result: RefactoringHistoryEntry | null | undefined;
    service.open(openedWith).subscribe(value => (result = value));

    expect(result).toBeNull();
    expect(tabSync.synchronize).not.toHaveBeenCalled();
    expect(notifications.info).not.toHaveBeenCalled();
  });

  it('undoes the refactoring from the notification and moves the tabs back', () => {
    dialogClosingWith({request, entry});
    service.open(openedWith).subscribe();

    notifications.info.mock.calls[0][0].onClick();

    expect(store.revert).toHaveBeenCalledWith('1');
    expect(tabSync.synchronize).toHaveBeenLastCalledWith(
      {type: 'RENAME_ELEMENT', urn: 'urn:samm:org.example:1.0.0#velocity', newName: 'speed'},
      expect.objectContaining({created: entry.removed, removed: entry.created}),
    );
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

  it('shows the usages of an element', () => {
    service.showUsages(SPEED);

    expect(matDialog.open).toHaveBeenCalledWith(ElementUsageDialogComponent, expect.objectContaining({data: {urn: SPEED}}));
  });
});
