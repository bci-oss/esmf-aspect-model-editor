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

import {RefactoringHistoryEntry, RefactoringRequest} from '@ame/domain';
import {LanguageTranslationService, NotificationsService} from '@ame/shared';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {MatDialog} from '@angular/material/dialog';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ElementUsageDialogComponent} from './element-usage-dialog/element-usage-dialog.component';
import {RefactoringDialogService} from './refactoring-dialog.service';
import {RefactoringDialogComponent, RefactoringDialogResult} from './refactoring-dialog/refactoring-dialog.component';
import {RefactoringHistoryDialogComponent} from './refactoring-history-dialog/refactoring-history-dialog.component';
import {RefactoringRevertService} from './refactoring-revert.service';
import {RefactoringTabSyncService} from './refactoring-tab-sync.service';
import {RefactoringWindowSyncService} from './refactoring-window-sync.service';

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
  let tabSync: {synchronize: ReturnType<typeof vi.fn>};
  let windowSync: {publish: ReturnType<typeof vi.fn>};
  let reverter: {revert: ReturnType<typeof vi.fn>};
  let notifications: {info: ReturnType<typeof vi.fn>};

  const dialogClosingWith = (result: RefactoringDialogResult | undefined) =>
    matDialog.open.mockReturnValue({afterClosed: () => of(result)});

  beforeEach(() => {
    matDialog = {open: vi.fn()};
    tabSync = {synchronize: vi.fn()};
    windowSync = {publish: vi.fn()};
    reverter = {revert: vi.fn(() => of(entry))};
    notifications = {info: vi.fn()};

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: MatDialog, useValue: matDialog},
        {provide: RefactoringTabSyncService, useValue: tabSync},
        {provide: RefactoringRevertService, useValue: reverter},
        {provide: RefactoringWindowSyncService, useValue: windowSync},
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

    expect(matDialog.open).toHaveBeenCalledWith(
      RefactoringDialogComponent,
      expect.objectContaining({data: {request: openedWith, pendingSaveTabId: undefined}}),
    );
    expect(result).toBe(entry);
    expect(tabSync.synchronize).toHaveBeenCalledWith(request, entry, expect.any(Function));
    expect(windowSync.publish).toHaveBeenCalledWith(request, entry);
    expect(notifications.info).toHaveBeenCalledWith(expect.objectContaining({onClick: expect.any(Function)}));
  });

  it('leaves the tab saved after the refactoring alone', () => {
    dialogClosingWith({request, entry});

    service.open(openedWith, {pendingSaveTabId: 'tab-1'}).subscribe();

    expect(matDialog.open).toHaveBeenCalledWith(
      RefactoringDialogComponent,
      expect.objectContaining({data: {request: openedWith, pendingSaveTabId: 'tab-1'}}),
    );
    const keep = tabSync.synchronize.mock.calls[0][2];
    expect(keep({id: 'tab-1'})).toBe(true);
    expect(keep({id: 'tab-2'})).toBe(false);
  });

  it('does nothing when the dialog is cancelled', () => {
    dialogClosingWith(undefined);

    let result: RefactoringHistoryEntry | null | undefined;
    service.open(openedWith).subscribe(value => (result = value));

    expect(result).toBeNull();
    expect(tabSync.synchronize).not.toHaveBeenCalled();
    expect(notifications.info).not.toHaveBeenCalled();
  });

  it('undoes the refactoring from the notification', () => {
    dialogClosingWith({request, entry});
    service.open(openedWith).subscribe();

    notifications.info.mock.calls[0][0].onClick();

    expect(reverter.revert).toHaveBeenCalledWith(request, entry);
  });

  it('shows the usages of an element', () => {
    service.showUsages(SPEED);

    expect(matDialog.open).toHaveBeenCalledWith(ElementUsageDialogComponent, expect.objectContaining({data: {urn: SPEED}}));
  });

  it('shows the refactoring history', () => {
    service.showHistory();

    expect(matDialog.open).toHaveBeenCalledWith(RefactoringHistoryDialogComponent, expect.objectContaining({height: expect.any(String)}));
  });
});
