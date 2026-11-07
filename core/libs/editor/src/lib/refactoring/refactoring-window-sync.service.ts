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
import {IPC_RENDERER, ITauriIpcBridge, LanguageTranslationService, NotificationsService, TAURI_EVENTS} from '@ame/shared';
import {inject, Injectable} from '@angular/core';
import {RefactoringTabSyncService} from './refactoring-tab-sync.service';

type FileChange = Pick<RefactoringHistoryEntry, 'created' | 'modified' | 'removed'>;

/** Sent to all windows when one of them applied or reverted a refactoring. */
export interface RefactoringAppliedSignal {
  /** The window that applied the refactoring; it has synchronized its tabs already. */
  origin: string;
  request?: RefactoringRequest;
  change: FileChange;
}

/** Long enough to read the affected files. */
const DIRTY_TABS_WARNING_TIMEOUT = 10000;

/**
 * Keeps the other windows in line with refactorings applied in this one: their tabs follow the changed files and
 * their history and namespace cache are reloaded. The model list is refreshed by the workspace signal of the store.
 */
@Injectable({providedIn: 'root'})
export class RefactoringWindowSyncService implements ITauriIpcBridge {
  private readonly ipcRenderer = inject(IPC_RENDERER);
  private readonly refactorings = inject(RefactoringStore);
  private readonly workspaceNamespaces = inject(WorkspaceNamespacesService);
  private readonly tabSync = inject(RefactoringTabSyncService);
  private readonly notifications = inject(NotificationsService);
  private readonly translate = inject(LanguageTranslationService);

  // Tauri delivers the signal to the sending window as well
  private readonly origin = crypto.randomUUID();

  register(): void {
    this.ipcRenderer?.on(TAURI_EVENTS.SIGNAL.REFACTORING_APPLIED, (signal: RefactoringAppliedSignal) => {
      if (signal?.origin && signal.origin !== this.origin) this.follow(signal);
    });
  }

  /** @param request the applied refactoring; undefined for reverts of refactorings recorded by older versions */
  publish(request: RefactoringRequest | undefined, change: FileChange): void {
    const signal: RefactoringAppliedSignal = {origin: this.origin, request, change};
    this.ipcRenderer?.send(TAURI_EVENTS.SIGNAL.REFACTORING_APPLIED, signal);
  }

  private follow({request, change}: RefactoringAppliedSignal): void {
    this.workspaceNamespaces.clear();
    this.refactorings.loadHistory().subscribe({error: () => this.refactorings.history.set([])});

    // Reloading a tab with unsaved changes would discard them; the user decides whether to save over the refactoring
    const unsaved = this.tabSync.unsavedTabsAmong(change);
    this.tabSync.synchronize(request, change, tab => !!tab.isDirty);

    if (unsaved.length) {
      this.notifications.warning({
        title: this.translate.translateService.translate('refactoring.sync.dirtyTabs', {files: unsaved.map(tab => tab.file).join(', ')}),
        timeout: DIRTY_TABS_WARNING_TIMEOUT,
      });
    }
  }
}
