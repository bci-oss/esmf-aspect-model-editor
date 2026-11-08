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

import {describeSourceError, PluginDisplayState, pluginDisplayState, PluginsStore, PluginStatus} from '@ame/domain';
import {NotificationsService} from '@ame/shared';
import {ChangeDetectionStrategy, Component, computed, inject, OnInit, signal} from '@angular/core';
import {MatButton, MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatMenu, MatMenuItem, MatMenuTrigger} from '@angular/material/menu';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';

const PLUGIN_ARCHIVE_EXTENSION = '.zip';
/** Errors carry the cause reported by the backend, which takes a moment to read. */
const ERROR_NOTIFICATION_TIMEOUT = 6000;

/**
 * Installed plugins: install from a `.zip`, enable, disable and remove. Plugins are loaded when the backend starts, so
 * changes take effect after a restart of the backend.
 */
@Component({
  selector: 'ame-plugins-settings',
  templateUrl: './plugins-settings.component.html',
  styleUrls: ['../model-sources.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIconButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatProgressSpinner, MatTooltip, TranslocoDirective],
})
export class PluginsSettingsComponent implements OnInit {
  readonly store = inject(PluginsStore);
  private readonly notifications = inject(NotificationsService);
  private readonly transloco = inject(TranslocoService);

  readonly archiveExtension = PLUGIN_ARCHIVE_EXTENSION;
  readonly loadError = computed(() => {
    const error = this.store.loadError();
    return error ? describeSourceError(error) || this.transloco.translate('plugins.settings.loadError') : '';
  });
  /** Why the backend could not be restarted, e.g. because it was started externally. */
  readonly restartError = signal('');

  ngOnInit(): void {
    this.store.load();
  }

  install(input: HTMLInputElement): void {
    const file = input.files?.[0];
    // Reset so that selecting the same file again triggers another change event.
    input.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(PLUGIN_ARCHIVE_EXTENSION)) {
      this.notifications.error({title: this.transloco.translate('plugins.settings.notAnArchive', {name: file.name})});
      return;
    }

    this.store.install(file).subscribe({
      next: plugin =>
        this.notifications.success({
          title: this.transloco.translate('plugins.settings.installed', {name: plugin.name, version: plugin.version}),
        }),
      error: error => this.notifyError('plugins.settings.installError', error),
    });
  }

  toggleEnabled(plugin: PluginStatus): void {
    this.store.setEnabled(plugin.id, !plugin.enabled).subscribe({
      error: error => this.notifyError('plugins.settings.updateError', error),
    });
  }

  /**
   * A removed plugin keeps running until the backend stops and its files are only deleted with the next start, so the
   * backend is restarted right away if the application can do so.
   */
  remove(plugin: PluginStatus): void {
    this.store.uninstall(plugin.id).subscribe({
      next: overview => {
        this.notifications.success({title: this.transloco.translate('plugins.settings.removed', {name: plugin.name})});
        if (overview.restartRequired && this.store.canRestartBackend) this.restartBackend();
      },
      error: error => this.notifyError('plugins.settings.removeError', error),
    });
  }

  restartBackend(): void {
    this.restartError.set('');
    this.store.restartBackend().subscribe({
      next: () => this.notifications.success({title: this.transloco.translate('plugins.settings.restarted')}),
      error: error => this.restartError.set(describeSourceError(error) || this.transloco.translate('plugins.settings.restartError')),
    });
  }

  state(plugin: PluginStatus): PluginDisplayState {
    return pluginDisplayState(plugin);
  }

  private notifyError(titleKey: string, error: unknown): void {
    this.notifications.error({
      title: this.transloco.translate(titleKey),
      message: describeSourceError(error),
      timeout: ERROR_NOTIFICATION_TIMEOUT,
    });
  }
}
