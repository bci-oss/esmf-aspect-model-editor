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
import {DestroyRef, inject, Injectable, Injector} from '@angular/core';
import {takeUntilDestroyed, toObservable} from '@angular/core/rxjs-interop';
import {distinctUntilChanged, EMPTY, fromEvent, map, Observable, of, switchMap, take} from 'rxjs';
import {ConfirmDialogService} from '../confirm-dialog/confirm-dialog.service';
import {RefactoringTabSyncService} from '../refactoring/refactoring-tab-sync.service';
import {TabStateService} from '../tabs/tab-state.service';
import {EditorTab} from '../tabs/tab.model';

/** Tabs referencing a changed file are affected as well, since their model shows its elements. */
const WITH_REFERENCES = {withReferences: true};

/** Long enough to read the affected files. */
const RELOADED_TABS_INFO_TIMEOUT = 5000;

/**
 * Follows changes of workspace files made outside of the editor, e.g. in VS Code. The workspace is refreshed right
 * away. The user decides whether the affected tabs are reloaded, asked once the editor window has the focus again, so
 * that models never change unnoticed while working elsewhere. With the setting {@link Settings.reloadExternalChanges}
 * tabs without unsaved changes are reloaded right away and the user is only asked about tabs with unsaved changes.
 * Changes made by the editor itself are not reported by the backend.
 */
@Injectable({providedIn: 'root'})
export class ExternalChangeSyncService {
  private readonly workspaceEvents = inject(WorkspaceEventsPort);
  private readonly backendStatus = inject(BackendStatusService);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly workspaceNamespaces = inject(WorkspaceNamespacesService);
  private readonly configuration = inject(ConfigurationService);
  private readonly tabSync = inject(RefactoringTabSyncService);
  private readonly tabState = inject(TabStateService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifications = inject(NotificationsService);
  private readonly translate = inject(LanguageTranslationService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private started = false;
  private connectedBefore = false;
  /** Changes the user has not decided about yet, merged until the decision. */
  private pendingDecision: WorkspaceFilesChange | null = null;

  /** Listens to the workspace events while the backend is ready; reconnects after restarts of the backend. */
  start(): void {
    if (this.started) return;
    this.started = true;

    toObservable(this.backendStatus.isReady, {injector: this.injector})
      .pipe(
        distinctUntilChanged(),
        switchMap(ready => (ready ? this.workspaceEvents.events() : EMPTY)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(event => this.handle(event));
  }

  private handle(event: WorkspaceEvent): void {
    if (event.type === 'files-changed') {
      this.follow(event.change);
      return;
    }

    // Changes made while the connection was lost are unknown; the open tabs are kept, the workspace is reloaded
    if (this.connectedBefore) this.refreshWorkspace();
    this.connectedBefore = true;
  }

  private follow(change: WorkspaceFilesChange): void {
    this.refreshWorkspace();

    const affected = this.tabSync.affectedTabsAmong(change, WITH_REFERENCES);
    if (!affected.length) return;

    if (this.reloadsAutomatically()) {
      const reloaded = affected.filter(tab => !tab.isDirty);
      this.tabSync.synchronize(undefined, change, tab => !!tab.isDirty, WITH_REFERENCES);
      if (reloaded.length) {
        this.notifications.info({
          title: this.translate.translateService.translate('externalChanges.reloaded', {files: fileNames(reloaded)}),
          timeout: RELOADED_TABS_INFO_TIMEOUT,
        });
      }
      if (reloaded.length === affected.length) return;
    }

    this.askToReload(change);
  }

  private refreshWorkspace(): void {
    this.workspaceNamespaces.clear();
    this.workspaceStore.triggerRefresh();
  }

  private reloadsAutomatically(): boolean {
    return this.configuration.getSettings()?.reloadExternalChanges === true;
  }

  /** The tabs to decide about, evaluated at decision time since tabs may be saved or closed meanwhile. */
  private tabsToDecide(change: WorkspaceFilesChange): EditorTab[] {
    return this.reloadsAutomatically()
      ? this.tabSync.unsavedTabsAmong(change, undefined, WITH_REFERENCES)
      : this.tabSync.affectedTabsAmong(change, WITH_REFERENCES);
  }

  /** Asks once for all changes until the user decided, also for changes arriving while waiting or asking. */
  private askToReload(change: WorkspaceFilesChange): void {
    if (this.pendingDecision) {
      this.pendingDecision = mergeChanges(this.pendingDecision, change);
      return;
    }
    this.pendingDecision = change;

    this.whenFocused()
      .pipe(
        switchMap(() => {
          const tabs = this.pendingDecision ? this.tabsToDecide(this.pendingDecision) : [];
          return tabs.length ? this.openDialog(tabs) : of(ConfirmDialogEnum.cancel);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(decision => {
        const decided = this.pendingDecision;
        this.pendingDecision = null;
        if (decided && decision === ConfirmDialogEnum.ok) this.reload(decided);
      });
  }

  /** Emits once the editor window has the focus, i.e. the user works in the editor. */
  private whenFocused(): Observable<void> {
    const window = this.document.defaultView;
    if (this.document.hasFocus() || !window) return of(undefined);
    return fromEvent(window, 'focus').pipe(
      take(1),
      map(() => undefined),
    );
  }

  private openDialog(tabs: EditorTab[]): Observable<ConfirmDialogEnum> {
    const translate = (key: string, params?: Record<string, string>) => this.translate.translateService.translate(key, params);
    const unsaved = tabs.filter(tab => tab.isDirty);
    return this.confirmDialog.open({
      title: translate('externalChanges.reloadDialog.title'),
      phrases: [
        translate('externalChanges.reloadDialog.message', {files: fileNames(tabs)}),
        ...(unsaved.length ? [translate('externalChanges.reloadDialog.unsaved', {files: fileNames(unsaved)})] : []),
        translate('externalChanges.reloadDialog.question'),
      ],
      okButtonText: translate('externalChanges.reloadDialog.reload'),
      closeButtonText: translate('externalChanges.reloadDialog.keep'),
    });
  }

  private reload(change: WorkspaceFilesChange): void {
    const tabs = new Set(this.tabsToDecide(change).map(tab => tab.id));
    // Not dirty anymore, so that neither the reload nor closing a deleted file asks to save the discarded changes
    tabs.forEach(id => this.tabState.setTabDirty(id, false));
    this.tabSync.synchronize(undefined, change, tab => !tabs.has(tab.id), WITH_REFERENCES);
  }
}

function fileNames(tabs: EditorTab[]): string {
  return tabs.map(tab => tab.file).join(', ');
}

function mergeChanges(first: WorkspaceFilesChange, second: WorkspaceFilesChange): WorkspaceFilesChange {
  return {
    created: [...first.created, ...second.created],
    modified: [...first.modified, ...second.modified],
    removed: [...first.removed, ...second.removed],
  };
}
