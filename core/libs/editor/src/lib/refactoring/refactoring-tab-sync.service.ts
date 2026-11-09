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

import {ChangedFile, LoadedFilesService, NamespaceFile, RefactoringHistoryEntry, RefactoringRequest} from '@ame/domain';
import {inject, Injectable, Injector} from '@angular/core';
import {FileHandlingService} from '../editor-toolbar/services/file-handling.service';
import {TabStateService} from '../tabs/tab-state.service';
import {EditorTab} from '../tabs/tab.model';
import {relocatedUrn, urnOfMovedFile} from './refactoring-urns';

type FileChange = Pick<RefactoringHistoryEntry, 'created' | 'modified' | 'removed'>;

/** Tabs to leave as they are, e.g. the tab saved right after the refactoring or tabs with unsaved changes. */
export type KeepTab = (tab: EditorTab) => boolean;

export interface TabSyncOptions {
  /**
   * Also counts tabs whose model references a changed file, or whose unresolved references a created file may define.
   * They are reloaded in place. Off for refactorings, which update the referencing files themselves.
   */
  withReferences?: boolean;
}

/** Keeps the open tabs in line with the files a refactoring (or its revert) changed on disk. */
@Injectable({providedIn: 'root'})
export class RefactoringTabSyncService {
  private readonly tabState = inject(TabStateService);
  private readonly loadedFiles = inject(LoadedFilesService);
  private readonly injector = inject(Injector);

  // Lazy on purpose: FileHandlingService depends (indirectly) on the services opening this dialog
  private get fileHandling(): FileHandlingService {
    return this.injector.get(FileHandlingService);
  }

  /** Open tabs of the changed or removed files. */
  affectedTabsAmong(change: FileChange, options: TabSyncOptions = {}): EditorTab[] {
    return this.tabState.tabs().filter(tab => this.isAffected(tab, change) || (options.withReferences && this.references(tab, change)));
  }

  /** Open tabs with unsaved changes the refactoring would overwrite; it must not be applied then. */
  unsavedTabsAmong(change: FileChange, keep: KeepTab = () => false, options: TabSyncOptions = {}): EditorTab[] {
    return this.affectedTabsAmong(change, options).filter(tab => tab.isDirty && !keep(tab));
  }

  /**
   * Reloads the active tab if its file changed and lets the other affected tabs reload when they are shown next.
   * Tabs of a renamed or moved file follow it; tabs of a deleted file without successor are closed.
   *
   * @param request moves the opened elements along; without it, the tabs only follow their files
   */
  synchronize(
    request: RefactoringRequest | undefined,
    change: FileChange,
    keep: KeepTab = () => false,
    options: TabSyncOptions = {},
  ): void {
    for (const tab of this.tabState.tabs()) {
      if (keep(tab)) continue;

      if (change.modified.some(file => isFileOf(tab, file))) {
        this.reload(tab, {namespace: tab.namespace, file: tab.file}, urn => relocatedUrn(urn, request));
        continue;
      }

      const removed = change.removed.find(file => isFileOf(tab, file));
      if (!removed) {
        if (options.withReferences && this.references(tab, change)) {
          this.reload(tab, {namespace: tab.namespace, file: tab.file}, urn => urn);
        }
        continue;
      }

      const successor = successorOf(removed, change);
      if (successor) {
        this.reload(tab, {namespace: namespaceKey(successor), file: successor.fileName}, urn =>
          urnOfMovedFile(relocatedUrn(urn, request), removed, successor),
        );
      } else {
        this.tabState.closeTab(tab.id).subscribe();
      }
    }
  }

  private reload(tab: EditorTab, target: {namespace: string; file: string}, relocate: (urn: string) => string): void {
    const id = `${target.namespace}:${target.file}`;
    const aspectModelUrn = tab.aspectModelUrn && relocate(tab.aspectModelUrn);

    if (tab.id === this.tabState.activeTabId()) {
      if (aspectModelUrn) this.fileHandling.loadNamespaceFile(id, aspectModelUrn, tab.id);
      return;
    }

    // Without a snapshot the tab loads the file from the workspace when it is shown again
    this.tabState.tabsStore.renameTab(tab.id, {
      ...tab,
      id,
      namespace: target.namespace,
      file: target.file,
      aspectModelUrn,
      editElementUrn: tab.editElementUrn && relocate(tab.editElementUrn),
      filesSnapshot: undefined,
      savedModelBaseline: undefined,
    });
  }

  private isAffected(tab: EditorTab, change: FileChange): boolean {
    return [...change.modified, ...change.removed].some(file => isFileOf(tab, file));
  }

  private references(tab: EditorTab, change: FileChange): boolean {
    const loadedFiles = this.loadedFilesOf(tab);
    const isLoaded = (changed: ChangedFile) =>
      loadedFiles.some(file => !file.unresolved && file.namespace === namespaceKey(changed) && file.name === changed.fileName);
    const mayResolve = (created: ChangedFile) => loadedFiles.some(file => file.unresolved && file.namespace === namespaceKey(created));

    return [...change.modified, ...change.removed].some(isLoaded) || change.created.some(mayResolve);
  }

  /** The files loaded for the tab: the current ones for the active tab, otherwise those stored when it was left. */
  private loadedFilesOf(tab: EditorTab): NamespaceFile[] {
    const files = tab.id === this.tabState.activeTabId() ? this.loadedFiles.files : tab.filesSnapshot;
    return Object.values(files ?? {});
  }
}

function namespaceKey(file: ChangedFile): string {
  return `${file.namespace}:${file.version}`;
}

function isFileOf(tab: EditorTab, file: ChangedFile): boolean {
  return tab.namespace === namespaceKey(file) && tab.file === file.fileName;
}

/** The created file replacing a removed one: the same file in the new namespace, or the only file of a renamed one. */
function successorOf(removed: ChangedFile, change: FileChange): ChangedFile | undefined {
  const sameName = change.created.find(file => file.fileName === removed.fileName);
  if (sameName) return sameName;
  return change.removed.length === 1 && change.created.length === 1 ? change.created[0] : undefined;
}
