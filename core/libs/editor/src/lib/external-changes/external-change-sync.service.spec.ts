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

import {
  ChangedFile,
  ConfigurationService,
  ConfirmDialogEnum,
  WorkspaceEvent,
  WorkspaceEventsPort,
  WorkspaceFilesChange,
  WorkspaceNamespacesService,
  WorkspaceStore,
} from '@ame/domain';
import {BackendStatusService, LanguageTranslationService, NotificationsService} from '@ame/shared';
import {DOCUMENT} from '@angular/common';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Observable, Subject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConfirmDialogService} from '../confirm-dialog/confirm-dialog.service';
import {RefactoringTabSyncService} from '../refactoring/refactoring-tab-sync.service';
import {TabStateService} from '../tabs/tab-state.service';
import {EditorTab} from '../tabs/tab.model';
import {ExternalChangeSyncService} from './external-change-sync.service';

const movement: ChangedFile = {
  namespace: 'org.example',
  version: '1.0.0',
  fileName: 'Movement.ttl',
  path: '/ws/Movement.ttl',
  readOnly: false,
};
const change: WorkspaceFilesChange = {created: [], modified: [movement], removed: []};
const cleanTab = {id: 'org.example:1.0.0:Movement.ttl', file: 'Movement.ttl', isDirty: false} as EditorTab;
const dirtyTab = {...cleanTab, isDirty: true} as EditorTab;

describe('ExternalChangeSyncService', () => {
  let ready: ReturnType<typeof signal<boolean>>;
  let streams: Subject<WorkspaceEvent>[];
  let workspaceStore: {triggerRefresh: ReturnType<typeof vi.fn>};
  let namespaces: {clear: ReturnType<typeof vi.fn>};
  let tabs: EditorTab[];
  let tabSync: {
    synchronize: ReturnType<typeof vi.fn>;
    affectedTabsAmong: ReturnType<typeof vi.fn>;
    unsavedTabsAmong: ReturnType<typeof vi.fn>;
  };
  let tabState: {setTabDirty: ReturnType<typeof vi.fn>};
  let dialogResult: Subject<ConfirmDialogEnum>;
  let confirmDialog: {open: ReturnType<typeof vi.fn>};
  let notifications: {info: ReturnType<typeof vi.fn>};
  let settings: {reloadExternalChanges?: boolean};
  let focused: boolean;
  let fakeWindow: EventTarget;

  const start = () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: WorkspaceEventsPort,
          useValue: {
            events: () =>
              new Observable<WorkspaceEvent>(subscriber => {
                const stream = new Subject<WorkspaceEvent>();
                streams.push(stream);
                return stream.subscribe(subscriber);
              }),
          },
        },
        {provide: BackendStatusService, useValue: {isReady: ready}},
        {provide: WorkspaceStore, useValue: workspaceStore},
        {provide: WorkspaceNamespacesService, useValue: namespaces},
        {provide: RefactoringTabSyncService, useValue: tabSync},
        {provide: TabStateService, useValue: tabState},
        {provide: ConfirmDialogService, useValue: confirmDialog},
        {provide: NotificationsService, useValue: notifications},
        {provide: ConfigurationService, useValue: {getSettings: () => settings}},
        {provide: DOCUMENT, useValue: {hasFocus: () => focused, defaultView: fakeWindow}},
        {provide: LanguageTranslationService, useValue: {translateService: {translate: (key: string) => key}}},
      ],
    });
    TestBed.inject(ExternalChangeSyncService).start();
    TestBed.tick();
  };

  const emit = (event: WorkspaceEvent) => streams[streams.length - 1].next(event);
  const keptTabs = (call = 0) => tabs.filter(tab => tabSync.synchronize.mock.calls[call][2](tab)).map(tab => tab.id);

  beforeEach(() => {
    ready = signal(true);
    streams = [];
    workspaceStore = {triggerRefresh: vi.fn()};
    namespaces = {clear: vi.fn()};
    tabs = [];
    const affected = (c: WorkspaceFilesChange) =>
      tabs.filter(tab => [...c.modified, ...c.removed].some(file => file.fileName === tab.file));
    tabSync = {
      synchronize: vi.fn(),
      affectedTabsAmong: vi.fn(affected),
      unsavedTabsAmong: vi.fn((c: WorkspaceFilesChange) => affected(c).filter(tab => tab.isDirty)),
    };
    tabState = {setTabDirty: vi.fn((id: string, isDirty: boolean) => (tabs = tabs.map(tab => (tab.id === id ? {...tab, isDirty} : tab))))};
    dialogResult = new Subject();
    confirmDialog = {open: vi.fn(() => dialogResult)};
    notifications = {info: vi.fn()};
    settings = {};
    focused = true;
    fakeWindow = new EventTarget();
  });

  const focus = () => {
    focused = true;
    fakeWindow.dispatchEvent(new Event('focus'));
  };

  it('connects once the backend is ready and disconnects while it is not', () => {
    ready.set(false);
    start();
    expect(streams).toHaveLength(0);

    ready.set(true);
    TestBed.tick();
    expect(streams).toHaveLength(1);

    ready.set(false);
    TestBed.tick();
    expect(streams[0].observed).toBe(false);
  });

  it('does not refresh on the first ready but after reconnects', () => {
    start();
    emit({type: 'ready'});
    expect(workspaceStore.triggerRefresh).not.toHaveBeenCalled();

    emit({type: 'ready'});
    expect(workspaceStore.triggerRefresh).toHaveBeenCalledTimes(1);
    expect(namespaces.clear).toHaveBeenCalledTimes(1);
    expect(tabSync.synchronize).not.toHaveBeenCalled();
  });

  it('refreshes the workspace on external changes', () => {
    start();
    emit({type: 'files-changed', change: {created: [movement], modified: [], removed: []}});

    expect(workspaceStore.triggerRefresh).toHaveBeenCalled();
    expect(namespaces.clear).toHaveBeenCalled();
    expect(notifications.info).not.toHaveBeenCalled();
    expect(confirmDialog.open).not.toHaveBeenCalled();
  });

  it('ignores changes not affecting open tabs', () => {
    tabs = [cleanTab];
    start();
    emit({type: 'files-changed', change: {created: [], modified: [{...movement, fileName: 'Other.ttl'}], removed: []}});

    expect(tabSync.synchronize).not.toHaveBeenCalled();
    expect(confirmDialog.open).not.toHaveBeenCalled();
  });

  describe('asking (default)', () => {
    it('asks before reloading tabs without unsaved changes', () => {
      tabs = [cleanTab];
      start();
      emit({type: 'files-changed', change});

      expect(tabSync.affectedTabsAmong).toHaveBeenCalledWith(change, {withReferences: true});
      expect(tabSync.synchronize).not.toHaveBeenCalled();
      expect(notifications.info).not.toHaveBeenCalled();
      expect(confirmDialog.open).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'externalChanges.reloadDialog.title',
          phrases: ['externalChanges.reloadDialog.message', 'externalChanges.reloadDialog.question'],
        }),
      );

      dialogResult.next(ConfirmDialogEnum.ok);

      expect(tabSync.synchronize).toHaveBeenCalledWith(undefined, change, expect.any(Function), {withReferences: true});
      expect(keptTabs()).toEqual([]);
    });

    it('warns about unsaved changes and reloads them when the user agrees', () => {
      tabs = [dirtyTab];
      start();
      emit({type: 'files-changed', change});

      expect(confirmDialog.open).toHaveBeenCalledWith(
        expect.objectContaining({
          phrases: [
            'externalChanges.reloadDialog.message',
            'externalChanges.reloadDialog.unsaved',
            'externalChanges.reloadDialog.question',
          ],
        }),
      );

      dialogResult.next(ConfirmDialogEnum.ok);

      expect(tabState.setTabDirty).toHaveBeenCalledWith(dirtyTab.id, false);
      expect(tabSync.synchronize).toHaveBeenCalledTimes(1);
      expect(keptTabs()).toEqual([]);
    });

    it('keeps the tabs when the user declines', () => {
      tabs = [cleanTab, {...dirtyTab, id: 'dirty', file: 'Movement.ttl'} as EditorTab];
      start();
      emit({type: 'files-changed', change});

      dialogResult.next(ConfirmDialogEnum.cancel);

      expect(tabState.setTabDirty).not.toHaveBeenCalled();
      expect(tabSync.synchronize).not.toHaveBeenCalled();
    });

    it('asks only once the editor window has the focus', () => {
      tabs = [cleanTab];
      focused = false;
      start();
      emit({type: 'files-changed', change});

      expect(workspaceStore.triggerRefresh).toHaveBeenCalled();
      expect(confirmDialog.open).not.toHaveBeenCalled();

      focus();

      expect(confirmDialog.open).toHaveBeenCalledTimes(1);
    });

    it('asks once for all changes arriving until the window has the focus', () => {
      const other: ChangedFile = {...movement, fileName: 'Other.ttl', path: '/ws/Other.ttl'};
      const otherTab = {id: 'org.example:1.0.0:Other.ttl', file: 'Other.ttl', isDirty: false} as EditorTab;
      tabs = [cleanTab, otherTab];
      focused = false;
      start();
      emit({type: 'files-changed', change});
      emit({type: 'files-changed', change: {created: [], modified: [other], removed: []}});
      focus();

      expect(confirmDialog.open).toHaveBeenCalledTimes(1);
      expect(tabSync.affectedTabsAmong).toHaveBeenLastCalledWith(
        {created: [], modified: [movement, other], removed: []},
        {withReferences: true},
      );

      dialogResult.next(ConfirmDialogEnum.ok);

      expect(keptTabs()).toEqual([]);
    });

    it('does not ask when the affected tabs were closed before the window got the focus', () => {
      tabs = [cleanTab];
      focused = false;
      start();
      emit({type: 'files-changed', change});
      tabs = [];
      focus();

      expect(confirmDialog.open).not.toHaveBeenCalled();

      tabs = [cleanTab];
      emit({type: 'files-changed', change});

      expect(confirmDialog.open).toHaveBeenCalledTimes(1);
    });

    it('asks again for changes after the decision', () => {
      tabs = [cleanTab];
      start();
      emit({type: 'files-changed', change});
      dialogResult.next(ConfirmDialogEnum.cancel);
      emit({type: 'files-changed', change});

      expect(confirmDialog.open).toHaveBeenCalledTimes(2);
    });
  });

  describe('reloading automatically', () => {
    beforeEach(() => (settings = {reloadExternalChanges: true}));

    it('reloads tabs without unsaved changes and informs about them', () => {
      tabs = [cleanTab];
      start();
      emit({type: 'files-changed', change});

      expect(tabSync.synchronize).toHaveBeenCalledWith(undefined, change, expect.any(Function), {withReferences: true});
      expect(keptTabs()).toEqual([]);
      expect(notifications.info).toHaveBeenCalledWith(expect.objectContaining({title: 'externalChanges.reloaded'}));
      expect(confirmDialog.open).not.toHaveBeenCalled();
    });

    it('reloads tabs with unsaved changes when the user agrees', () => {
      tabs = [dirtyTab];
      start();
      emit({type: 'files-changed', change});

      expect(keptTabs()).toEqual([dirtyTab.id]);
      expect(confirmDialog.open).toHaveBeenCalledWith(expect.objectContaining({title: 'externalChanges.reloadDialog.title'}));

      dialogResult.next(ConfirmDialogEnum.ok);

      expect(tabSync.unsavedTabsAmong).toHaveBeenCalledWith(change, undefined, {withReferences: true});
      expect(tabState.setTabDirty).toHaveBeenCalledWith(dirtyTab.id, false);
      expect(tabSync.synchronize).toHaveBeenCalledTimes(2);
      expect(keptTabs(1)).toEqual([]);
    });

    it('keeps tabs with unsaved changes when the user declines', () => {
      tabs = [dirtyTab];
      start();
      emit({type: 'files-changed', change});

      dialogResult.next(ConfirmDialogEnum.cancel);

      expect(tabState.setTabDirty).not.toHaveBeenCalled();
      expect(tabSync.synchronize).toHaveBeenCalledTimes(1);
    });

    it('asks only once for changes arriving while the dialog is open', () => {
      const other: ChangedFile = {...movement, fileName: 'Other.ttl', path: '/ws/Other.ttl'};
      const otherTab = {id: 'org.example:1.0.0:Other.ttl', file: 'Other.ttl', isDirty: true} as EditorTab;
      tabs = [dirtyTab, otherTab];
      start();
      emit({type: 'files-changed', change});
      emit({type: 'files-changed', change: {created: [], modified: [other], removed: []}});

      expect(confirmDialog.open).toHaveBeenCalledTimes(1);

      dialogResult.next(ConfirmDialogEnum.ok);

      expect(tabState.setTabDirty).toHaveBeenCalledWith(dirtyTab.id, false);
      expect(tabState.setTabDirty).toHaveBeenCalledWith(otherTab.id, false);
    });

    it('does not reload tabs saved while the dialog was open', () => {
      tabs = [dirtyTab];
      start();
      emit({type: 'files-changed', change});
      tabs = [cleanTab];

      dialogResult.next(ConfirmDialogEnum.ok);

      expect(tabState.setTabDirty).not.toHaveBeenCalled();
      expect(keptTabs(1)).toEqual([cleanTab.id]);
    });
  });

  it('starts only once', () => {
    start();
    TestBed.inject(ExternalChangeSyncService).start();
    TestBed.tick();

    expect(streams).toHaveLength(1);
  });
});
