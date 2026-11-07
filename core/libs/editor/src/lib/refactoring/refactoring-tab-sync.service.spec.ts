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

import {ChangedFile} from '@ame/domain';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {FileHandlingService} from '../editor-toolbar/services/file-handling.service';
import {TabStateService} from '../tabs/tab-state.service';
import {EditorTab} from '../tabs/tab.model';
import {RefactoringTabSyncService} from './refactoring-tab-sync.service';

const file = (fileName: string, namespace = 'org.example', version = '1.0.0'): ChangedFile => ({
  namespace,
  version,
  fileName,
  path: `/workspace/${namespace}/${version}/${fileName}`,
  readOnly: false,
});

const tab = (fileName: string, overrides: Partial<EditorTab> = {}): EditorTab => ({
  id: `org.example:1.0.0:${fileName}`,
  namespace: 'org.example:1.0.0',
  file: fileName,
  aspectModelUrn: `urn:samm:org.example:1.0.0#${fileName.replace('.ttl', '')}`,
  ...overrides,
});

const noChange = {created: [] as ChangedFile[], modified: [] as ChangedFile[], removed: [] as ChangedFile[]};

describe('RefactoringTabSyncService', () => {
  let service: RefactoringTabSyncService;
  let tabs: ReturnType<typeof signal<EditorTab[]>>;
  let activeTabId: ReturnType<typeof signal<string | null>>;
  let tabState: {
    tabs: typeof tabs;
    activeTabId: typeof activeTabId;
    closeTab: ReturnType<typeof vi.fn>;
    tabsStore: {renameTab: ReturnType<typeof vi.fn>};
  };
  let fileHandling: {loadNamespaceFile: ReturnType<typeof vi.fn>};

  beforeEach(() => {
    tabs = signal<EditorTab[]>([]);
    activeTabId = signal<string | null>(null);
    tabState = {tabs, activeTabId, closeTab: vi.fn(() => of(true)), tabsStore: {renameTab: vi.fn()}};
    fileHandling = {loadNamespaceFile: vi.fn()};

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: TabStateService, useValue: tabState},
        {provide: FileHandlingService, useValue: fileHandling},
      ],
    });
    service = TestBed.inject(RefactoringTabSyncService);
  });

  it('reports only dirty tabs of changed or removed files', () => {
    tabs.set([tab('Movement.ttl', {isDirty: true}), tab('Shared.ttl', {isDirty: true}), tab('Other.ttl')]);

    const unsaved = service.unsavedTabsAmong({
      ...noChange,
      modified: [file('Movement.ttl'), file('Other.ttl')],
      created: [file('Shared.ttl')],
    });

    expect(unsaved.map(t => t.file)).toEqual(['Movement.ttl']);
  });

  it('reloads the active tab of a modified file with the renamed element', () => {
    tabs.set([tab('Movement.ttl')]);
    activeTabId.set('org.example:1.0.0:Movement.ttl');

    service.synchronize(
      {type: 'RENAME_ELEMENT', urn: 'urn:samm:org.example:1.0.0#Movement', newName: 'Motion'},
      {...noChange, modified: [file('Movement.ttl')]},
    );

    expect(fileHandling.loadNamespaceFile).toHaveBeenCalledWith(
      'org.example:1.0.0:Movement.ttl',
      'urn:samm:org.example:1.0.0#Motion',
      'org.example:1.0.0:Movement.ttl',
    );
  });

  it('lets an inactive tab follow its renamed file and reload when shown', () => {
    const renamed = tab('Movement.ttl', {filesSnapshot: {}});
    tabs.set([renamed]);

    service.synchronize(
      {type: 'RENAME_FILE', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl', newName: 'Motion.ttl'},
      {...noChange, created: [file('Motion.ttl')], removed: [file('Movement.ttl')]},
    );

    expect(tabState.tabsStore.renameTab).toHaveBeenCalledWith(
      'org.example:1.0.0:Movement.ttl',
      expect.objectContaining({
        id: 'org.example:1.0.0:Motion.ttl',
        file: 'Motion.ttl',
        namespace: 'org.example:1.0.0',
        filesSnapshot: undefined,
      }),
    );
    expect(fileHandling.loadNamespaceFile).not.toHaveBeenCalled();
  });

  it('moves tabs into the new namespace version', () => {
    tabs.set([tab('Movement.ttl')]);

    service.synchronize(
      {type: 'RENAME_NAMESPACE', namespace: 'org.example', version: '1.0.0', targetNamespace: 'org.example', targetVersion: '2.0.0'},
      {
        ...noChange,
        created: [file('Movement.ttl', 'org.example', '2.0.0'), file('Other.ttl', 'org.example', '2.0.0')],
        removed: [file('Movement.ttl')],
      },
    );

    expect(tabState.tabsStore.renameTab).toHaveBeenCalledWith(
      'org.example:1.0.0:Movement.ttl',
      expect.objectContaining({
        id: 'org.example:2.0.0:Movement.ttl',
        namespace: 'org.example:2.0.0',
        aspectModelUrn: 'urn:samm:org.example:2.0.0#Movement',
      }),
    );
  });

  it('closes tabs of removed files without successor', () => {
    tabs.set([tab('Movement.ttl'), tab('Unaffected.ttl')]);

    service.synchronize(
      {type: 'MOVE_ELEMENT', urn: 'urn:samm:org.example:1.0.0#speed', targetFileName: 'Shared.ttl'},
      {
        ...noChange,
        created: [file('Shared.ttl'), file('Extra.ttl')],
        removed: [file('Movement.ttl')],
      },
    );

    expect(tabState.closeTab).toHaveBeenCalledExactlyOnceWith('org.example:1.0.0:Movement.ttl');
    expect(tabState.tabsStore.renameTab).not.toHaveBeenCalled();
  });

  it('ignores the unsaved changes of kept tabs', () => {
    tabs.set([tab('Movement.ttl', {isDirty: true})]);

    const unsaved = service.unsavedTabsAmong({...noChange, removed: [file('Movement.ttl')]}, t => t.file === 'Movement.ttl');

    expect(unsaved).toEqual([]);
  });

  it('does not touch kept tabs', () => {
    tabs.set([tab('Movement.ttl')]);
    activeTabId.set('org.example:1.0.0:Movement.ttl');

    service.synchronize(
      {type: 'RENAME_ELEMENT', urn: 'urn:samm:org.example:1.0.0#Movement', newName: 'Motion'},
      {...noChange, modified: [file('Movement.ttl')]},
      t => t.id === 'org.example:1.0.0:Movement.ttl',
    );

    expect(fileHandling.loadNamespaceFile).not.toHaveBeenCalled();
    expect(tabState.tabsStore.renameTab).not.toHaveBeenCalled();
  });

  it('lets tabs follow a file moved into another namespace', () => {
    tabs.set([tab('Movement.ttl')]);

    service.synchronize(
      {
        type: 'MOVE_FILE',
        namespace: 'org.example',
        version: '1.0.0',
        fileName: 'Movement.ttl',
        targetNamespace: 'com.example',
        targetVersion: '2.0.0',
        targetFileName: 'Motion.ttl',
      },
      {...noChange, created: [file('Motion.ttl', 'com.example', '2.0.0')], removed: [file('Movement.ttl')]},
    );

    expect(tabState.tabsStore.renameTab).toHaveBeenCalledWith(
      'org.example:1.0.0:Movement.ttl',
      expect.objectContaining({
        id: 'com.example:2.0.0:Motion.ttl',
        namespace: 'com.example:2.0.0',
        file: 'Motion.ttl',
        aspectModelUrn: 'urn:samm:com.example:2.0.0#Movement',
      }),
    );
  });
});
