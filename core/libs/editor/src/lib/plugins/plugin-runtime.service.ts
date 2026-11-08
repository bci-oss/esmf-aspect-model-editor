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
  ElementRefactoringGuard,
  isPluginCommandEnabled,
  isPluginUsable,
  pluginCommandEntries,
  pluginCommandLabel,
  pluginCommandsAt,
  PluginModel,
  PluginsStore,
} from '@ame/domain';
import {MaxGraphService} from '@ame/graph';
import {
  BackendStatusService,
  IPC_RENDERER,
  ITauriIpcBridge,
  NotificationsService,
  PluginMenuAction,
  PluginMenuPayloadEntry,
  READABLE_NOTIFICATION_TIMEOUT,
  TAURI_EVENTS,
} from '@ame/shared';
import {computed, effect, inject, Injectable, Injector, runInInjectionContext, untracked} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatDialog} from '@angular/material/dialog';
import {TranslocoService} from '@jsverse/transloco';
import {catchError, EMPTY, map, switchMap} from 'rxjs';
import {ElementRefactoringService} from '../refactoring/element-refactoring.service';
import {PluginHostDialogComponent, PluginHostDialogData} from './plugin-host-dialog/plugin-host-dialog.component';
import {PluginModelSnapshotService} from './plugin-model-snapshot.service';

/**
 * Runs the commands of plugins: publishes them to the menu bar of the shell, offers them to the toolbar and opens the
 * user interface of a plugin when one of them is used.
 */
@Injectable({providedIn: 'root'})
export class PluginRuntimeService implements ITauriIpcBridge {
  private readonly ipcRenderer = inject(IPC_RENDERER);
  private readonly store = inject(PluginsStore);
  private readonly backendStatus = inject(BackendStatusService);
  private readonly transloco = inject(TranslocoService);
  private readonly matDialog = inject(MatDialog);
  private readonly notifications = inject(NotificationsService);
  private readonly snapshots = inject(PluginModelSnapshotService);
  private readonly elementRefactoring = inject(ElementRefactoringService);
  private readonly maxGraphService = inject(MaxGraphService);
  private readonly refactoringGuard = inject(ElementRefactoringGuard);
  private readonly injector = inject(Injector);
  private readonly language = toSignal(this.transloco.langChanges$, {initialValue: this.transloco.getActiveLang() || 'en'});

  /** The commands of all usable plugins in the current language. */
  readonly commands = computed(() => (this.store.loaded() ? pluginCommandEntries(this.store.plugins(), this.language()) : []));
  readonly toolbarCommands = computed(() => pluginCommandsAt(this.commands(), 'toolbar'));

  register(): void {
    if (!this.ipcRenderer?.setPluginMenu) return;

    this.ipcRenderer.on(TAURI_EVENTS.SIGNAL.PLUGIN_MENU_ACTION, ({pluginId, entryId}: PluginMenuAction) => this.run(pluginId, entryId));
    runInInjectionContext(this.injector, () => {
      this.loadOnBackendStart();
      this.syncMenu();
    });
  }

  /**
   * Opens the user interface of a plugin for one of its commands. Generator commands get a copy of the open model and
   * the selected element (by default the single selected shape).
   */
  async run(pluginId: string, commandId: string, selectedElement: string | null = this.selectedElementUrn()): Promise<void> {
    const plugin = this.store.plugin(pluginId);
    const command = plugin?.commands?.find(entry => entry.id === commandId);
    if (!plugin || !command || !isPluginUsable(plugin)) {
      this.warn(this.transloco.translate('plugins.runtime.notRunning', {name: plugin?.name ?? pluginId}));
      return;
    }

    let model: PluginModel | null = null;
    if (command.kind === 'generate') {
      model = await this.snapshots.snapshot();
      if (!model) {
        this.warn(this.transloco.translate('plugins.runtime.noModel'));
        return;
      }
    }

    const data: PluginHostDialogData = {
      plugin,
      context: {pluginId, commandId, kind: command.kind, model, selectedElement},
      title: pluginCommandLabel(command, this.language()),
    };
    this.matDialog.open(PluginHostDialogComponent, {data, disableClose: true, autoFocus: 'dialog'});
  }

  private selectedElementUrn(): string | null {
    return this.refactoringGuard.urnOf(this.elementRefactoring.selectedElement());
  }

  private warn(title: string): void {
    this.notifications.warning({title, timeout: READABLE_NOTIFICATION_TIMEOUT});
  }

  /** Plugins are started with the backend, so every start of the backend may bring other plugins. */
  private loadOnBackendStart(): void {
    const readyRevision = computed(() => {
      const status = this.backendStatus.status();
      return status.state === 'ready' ? status.revision : null;
    });
    effect(() => {
      if (readyRevision() === null) return;
      // A backend without plugin support keeps the menu without plugin entries.
      untracked(() =>
        this.store
          .refresh()
          .pipe(catchError(() => EMPTY))
          .subscribe(),
      );
    });
  }

  private syncMenu(): void {
    // Emits once the translation of the language is loaded, so the menu never shows translation keys.
    const menuTitle = toSignal(
      this.transloco.langChanges$.pipe(
        switchMap(lang => this.transloco.selectTranslate<string>('plugins.menuTitle', {}, lang).pipe(map(title => ({lang, title})))),
      ),
    );
    effect(() => {
      const translated = menuTitle();
      // Other windows may have published the menu already; it is only replaced once the plugins are known.
      if (!translated || !this.store.loaded()) return;
      const entries = this.menuEntries(translated.lang, this.maxGraphService.isModelEmpty());
      this.ipcRenderer?.setPluginMenu?.({title: translated.title, entries}).catch(() => undefined);
    });
  }

  private menuEntries(language: string, modelEmpty: boolean): PluginMenuPayloadEntry[] {
    return pluginCommandsAt(pluginCommandEntries(this.store.plugins(), language), 'menu').map(command => ({
      pluginId: command.pluginId,
      entryId: command.commandId,
      label: command.label,
      location: command.menu,
      enabled: isPluginCommandEnabled(command.kind, modelEmpty),
    }));
  }
}
