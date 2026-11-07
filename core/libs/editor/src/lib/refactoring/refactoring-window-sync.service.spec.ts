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

import {RefactoringHistoryEntry, RefactoringRequest, RefactoringStore, WorkspaceNamespacesService} from '@ame/domain';
import {IPC_RENDERER, LanguageTranslationService, NotificationsService, TAURI_EVENTS} from '@ame/shared';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorTab} from '../tabs/tab.model';
import {RefactoringTabSyncService} from './refactoring-tab-sync.service';
import {RefactoringAppliedSignal, RefactoringWindowSyncService} from './refactoring-window-sync.service';

const request: RefactoringRequest = {type: 'RENAME_ELEMENT', urn: 'urn:samm:org.example:1.0.0#speed', newName: 'velocity'};
const change: Pick<RefactoringHistoryEntry, 'created' | 'modified' | 'removed'> = {
  created: [],
  modified: [{namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl', path: 'Movement.ttl', readOnly: false}],
  removed: [],
};

function createIpcMock() {
  const handlers = new Map<string, (...args: any[]) => void>();
  return {
    handlers,
    send: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => handlers.set(event, handler)),
  };
}

describe('RefactoringWindowSyncService', () => {
  let ipc: ReturnType<typeof createIpcMock>;
  let store: {loadHistory: ReturnType<typeof vi.fn>; history: {set: ReturnType<typeof vi.fn>}};
  let namespaces: {clear: ReturnType<typeof vi.fn>};
  let tabSync: {synchronize: ReturnType<typeof vi.fn>; unsavedTabsAmong: ReturnType<typeof vi.fn>};
  let notifications: {warning: ReturnType<typeof vi.fn>};

  const create = (ipcRenderer: ReturnType<typeof createIpcMock> | undefined = ipc) => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: IPC_RENDERER, useValue: ipcRenderer},
        {provide: RefactoringStore, useValue: store},
        {provide: WorkspaceNamespacesService, useValue: namespaces},
        {provide: RefactoringTabSyncService, useValue: tabSync},
        {provide: NotificationsService, useValue: notifications},
        {provide: LanguageTranslationService, useValue: {translateService: {translate: (key: string) => key}}},
      ],
    });
    const service = TestBed.inject(RefactoringWindowSyncService);
    service.register();
    return service;
  };

  /** Delivers a signal as Tauri does: to every window, the sending one included. */
  const deliver = (signal: RefactoringAppliedSignal) => ipc.handlers.get(TAURI_EVENTS.SIGNAL.REFACTORING_APPLIED)!(signal);

  beforeEach(() => {
    ipc = createIpcMock();
    store = {loadHistory: vi.fn(() => of([])), history: {set: vi.fn()}};
    namespaces = {clear: vi.fn()};
    tabSync = {synchronize: vi.fn(), unsavedTabsAmong: vi.fn(() => [])};
    notifications = {warning: vi.fn()};
  });

  it('publishes the applied refactoring with the window as origin', () => {
    create().publish(request, change);

    expect(ipc.send).toHaveBeenCalledWith(TAURI_EVENTS.SIGNAL.REFACTORING_APPLIED, {origin: expect.any(String), request, change});
  });

  it('ignores its own signal', () => {
    create().publish(request, change);

    deliver(ipc.send.mock.calls[0][1]);

    expect(tabSync.synchronize).not.toHaveBeenCalled();
    expect(store.loadHistory).not.toHaveBeenCalled();
  });

  it('follows a refactoring of another window and keeps tabs with unsaved changes', () => {
    create();

    deliver({origin: 'other-window', request, change});

    expect(namespaces.clear).toHaveBeenCalled();
    expect(store.loadHistory).toHaveBeenCalled();
    expect(tabSync.synchronize).toHaveBeenCalledWith(request, change, expect.any(Function));
    const keep = tabSync.synchronize.mock.calls[0][2];
    expect(keep({isDirty: true} as EditorTab)).toBe(true);
    expect(keep({isDirty: false} as EditorTab)).toBe(false);
    expect(notifications.warning).not.toHaveBeenCalled();
  });

  it('warns about affected tabs with unsaved changes', () => {
    tabSync.unsavedTabsAmong.mockReturnValue([{id: 'tab-1', file: 'Movement.ttl', namespace: 'org.example:1.0.0', isDirty: true}]);
    create();

    deliver({origin: 'other-window', request, change});

    expect(tabSync.unsavedTabsAmong).toHaveBeenCalledWith(change);
    expect(notifications.warning).toHaveBeenCalledWith(expect.objectContaining({title: 'refactoring.sync.dirtyTabs'}));
  });

  it('clears the history if it cannot be reloaded', () => {
    store.loadHistory.mockReturnValue(throwError(() => new Error('offline')));
    create();

    deliver({origin: 'other-window', change});

    expect(store.history.set).toHaveBeenCalledWith([]);
    expect(tabSync.synchronize).toHaveBeenCalledWith(undefined, change, expect.any(Function));
  });

  it('does nothing outside of Tauri', () => {
    expect(() => create(undefined).publish(request, change)).not.toThrow();
  });
});
