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

import {PLUGIN_HOST_API_VERSION, pluginFrontendPath, PluginModel, pluginSaveFileName, PluginsPort, UiShellStore} from '@ame/domain';
import {FileSaverService, NotificationsService, READABLE_NOTIFICATION_TIMEOUT} from '@ame/shared';
import {inject, Injectable} from '@angular/core';
import {TranslocoService} from '@jsverse/transloco';
import {firstValueFrom} from 'rxjs';
import {FileHandlingService} from '../editor-toolbar/services/file-handling.service';
import {PluginFileToSave, PluginHost, PluginHostContext, PluginNotificationType} from './plugin-host.model';

const NOTIFICATION_TYPES: readonly PluginNotificationType[] = ['info', 'success', 'warning', 'error'];

/** Builds the {@link PluginHost} handed to the user interface of a plugin; every call is bound to that plugin. */
@Injectable({providedIn: 'root'})
export class PluginHostFactory {
  private readonly plugins = inject(PluginsPort);
  private readonly fileSaver = inject(FileSaverService);
  private readonly fileHandling = inject(FileHandlingService);
  private readonly notifications = inject(NotificationsService);
  private readonly uiShell = inject(UiShellStore);
  private readonly transloco = inject(TranslocoService);

  create(context: PluginHostContext, close: () => void): PluginHost {
    const {pluginId, commandId, kind, selectedElement} = context;
    const model = context.model ? Object.freeze({...context.model}) : null;
    return Object.freeze({
      apiVersion: PLUGIN_HOST_API_VERSION,
      pluginId,
      commandId,
      kind,
      model,
      selectedElement,
      language: this.transloco.getActiveLang() || 'en',
      theme: this.uiShell.darkMode() ? 'dark' : 'light',
      backend: Object.freeze({
        action: <T>(actionId: string, payload?: unknown) => firstValueFrom(this.plugins.runAction<T>(pluginId, actionId, payload)),
        importModel: (importerId: string, file: File, options?: Record<string, string>) =>
          firstValueFrom(this.plugins.importModel(pluginId, importerId, file, options)),
        generate: (generatorId: string, options?: Record<string, string>, request?: {selectedElement?: string | null}) => {
          if (!model) return Promise.reject(new Error(this.transloco.translate('plugins.runtime.noModel')));
          const element = request && 'selectedElement' in request ? (request.selectedElement ?? null) : selectedElement;
          return firstValueFrom(this.plugins.generate(pluginId, generatorId, {model, selectedElement: element, options: options ?? {}}));
        },
      }),
      workspace: Object.freeze({openModel: (imported: PluginModel) => this.openModel(imported)}),
      saveFile: (file: PluginFileToSave) => this.saveFile(file),
      resource: (path: string) => firstValueFrom(this.plugins.getFrontendFile(pluginId, pluginFrontendPath(path))),
      notify: (message: string, type: PluginNotificationType = 'info') => this.notify(message, type),
      close,
    });
  }

  private async openModel(model: PluginModel): Promise<void> {
    if (!model?.content) throw new Error(this.transloco.translate('plugins.runtime.openError'));
    try {
      await firstValueFrom(this.fileHandling.loadModel(model.content), {defaultValue: null});
    } catch {
      // The editor has reported the cause already; the plugin only learns that the model was not opened.
      throw new Error(this.transloco.translate('plugins.runtime.openError'));
    }
  }

  private async saveFile(file: PluginFileToSave): Promise<void> {
    // Plugins only choose the name; the user chooses the folder.
    const fileName = pluginSaveFileName(file?.fileName);
    if (!fileName || file.content == null) {
      throw new Error(this.transloco.translate('plugins.runtime.saveError'));
    }
    const content = file.content instanceof Blob ? file.content : new Blob([String(file.content)], {type: file.mediaType || 'text/plain'});
    await this.fileSaver.save(content, fileName);
  }

  private notify(message: string, type: PluginNotificationType): void {
    // Plugins are not type checked, so unknown types are shown as information.
    const known = NOTIFICATION_TYPES.includes(type) ? type : 'info';
    this.notifications[known]({title: String(message ?? ''), timeout: READABLE_NOTIFICATION_TIMEOUT});
  }
}
