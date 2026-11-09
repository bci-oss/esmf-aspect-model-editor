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
  BrowserService,
  buildExternalEditorUrl,
  EXTERNAL_EDITOR_CLI,
  EXTERNAL_EDITOR_NAMES,
  fileUriToPath,
  IPC_RENDERER,
  LanguageTranslationService,
  NotificationsService,
  READABLE_NOTIFICATION_TIMEOUT,
  resolveExternalEditor,
  TextPosition,
} from '@ame/shared';
import {computed, DOCUMENT, inject, Injectable} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {firstValueFrom} from 'rxjs';
import {ElementLocation, WorkspaceFacade} from '../../facades/workspace.facade';
import {LoadedFilesService, NamespaceFile} from '../../model-session/loaded-files.service';
import {ModelSourcesStore} from '../model-sources/model-sources.store';
import {ConfigurationService} from '../settings/configuration.service';
import {splitNamespaceKey} from '../workspace/workspace.models';

/** Actions the graph context menu fires for the selected element; registered by the editor. */
export const ExternalEditorAction = {
  openElement: 'open-in-external-editor',
} as const;

/**
 * Opens workspace files and folders in the VS Code compatible editor chosen in the settings.
 * The desktop app asks the shell, which falls back to the editor CLI and the OS; the browser follows the editor URL.
 */
@Injectable({providedIn: 'root'})
export class ExternalEditorService {
  private readonly configuration = inject(ConfigurationService);
  private readonly workspace = inject(WorkspaceFacade);
  private readonly loadedFiles = inject(LoadedFilesService);
  private readonly modelSources = inject(ModelSourcesStore);
  private readonly ipcRenderer = inject(IPC_RENDERER, {optional: true});
  private readonly browserService = inject(BrowserService);
  private readonly notifications = inject(NotificationsService);
  private readonly translate = inject(LanguageTranslationService);
  private readonly document = inject(DOCUMENT);

  private readonly settings = toSignal(this.configuration.settings$, {initialValue: this.configuration.getSettings()});

  readonly editor = computed(() => resolveExternalEditor(this.settings()?.externalEditor));
  readonly editorName = computed(() => EXTERNAL_EDITOR_NAMES[this.editor()]);

  openFile(path: string, position?: TextPosition): Promise<void> {
    return this.open(path, position);
  }

  openFolder(path: string): Promise<void> {
    return this.open(path);
  }

  /**
   * Opens the file that declares the element at the declaration. If several files of the element's namespace version
   * declare it, the loaded file defining it is meant, e.g. the current model.
   */
  async openElement(aspectModelUrn: string): Promise<void> {
    let location: ElementLocation;
    try {
      location = await firstValueFrom(this.workspace.getElementLocation(aspectModelUrn, this.loadedFileNameOf(aspectModelUrn)));
    } catch (error) {
      if ((error as {status?: number})?.status === 404) {
        this.notifyNotSaved();
      } else {
        this.notifyError(error);
      }
      return;
    }
    await this.openFile(location.path, {line: location.line, column: location.column});
  }

  /** Opens the root folder of the active workspace. */
  async openWorkspace(): Promise<void> {
    let storagePath: string;
    try {
      ({storagePath} = await firstValueFrom(this.workspace.getStoragePath()));
    } catch (error) {
      this.notifyError(error);
      return;
    }
    await this.openFolder(storagePath);
  }

  /** Opens the file of the model shown in the editor. */
  async openCurrentModel(): Promise<void> {
    const path = await this.resolveModelFilePath(this.loadedFiles.currentLoadedFile);
    if (path) {
      await this.openFile(path);
    } else {
      this.notifyNotSaved();
    }
  }

  private loadedFileNameOf(aspectModelUrn: string): string | undefined {
    const file = this.loadedFiles.fileOfElement(aspectModelUrn);
    const namespace = aspectModelUrn.replace('urn:samm:', '').split('#')[0];
    return file?.namespace === namespace ? file.name : undefined;
  }

  private async resolveModelFilePath(file: NamespaceFile | null | undefined): Promise<string | null> {
    if (!file) return null;

    const sourceLocation = file.rdfModel?.getSourceLocation?.();
    const sourcePath = toLocalPath(sourceLocation);
    if (!file.fromWorkspace) return sourcePath;

    if (!file.namespace.includes(':')) return sourcePath;
    try {
      const {storagePath} = await firstValueFrom(
        this.workspace.getStoragePath({
          ...splitNamespaceKey(file.namespace),
          fileName: file.name,
          workspace: this.modelSources.findSource(sourceLocation)?.path,
        }),
      );
      return storagePath || sourcePath;
    } catch {
      return sourcePath;
    }
  }

  private async open(path: string, position?: TextPosition): Promise<void> {
    const editor = this.editor();
    const url = buildExternalEditorUrl(editor, path, position);
    try {
      if (this.ipcRenderer && this.browserService.isStartedAsTauriApp()) {
        await this.ipcRenderer.openInExternalEditor({
          url,
          path,
          line: position?.line,
          column: position?.column,
          cli: EXTERNAL_EDITOR_CLI[editor],
        });
      } else {
        // A new browsing context keeps the editor open if the browser cannot handle the URL scheme.
        this.document.defaultView?.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      this.notifyError(error);
    }
  }

  private notifyNotSaved(): void {
    this.notifications.info({
      title: this.t('externalEditor.notSavedTitle'),
      message: this.t('externalEditor.notSavedMessage'),
      timeout: READABLE_NOTIFICATION_TIMEOUT,
    });
  }

  private notifyError(error: unknown): void {
    const cause = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    this.notifications.error({
      title: this.t('externalEditor.errorTitle'),
      message: cause || this.t('externalEditor.errorMessage'),
      timeout: READABLE_NOTIFICATION_TIMEOUT,
    });
  }

  private t(key: string): string {
    return this.translate.translateService.translate(key, {editor: this.editorName()});
  }
}

/** The local path of a `file:` URI or absolute path; other locations (e.g. URLs) have none. */
function toLocalPath(location: string | null | undefined): string | null {
  const path = location ? fileUriToPath(location) : '';
  return /^([A-Za-z]:)?[\\/]/.test(path) ? path : null;
}
