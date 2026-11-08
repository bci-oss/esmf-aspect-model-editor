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

import {inject, Injectable} from '@angular/core';
import {TranslocoService} from '@jsverse/transloco';
import {saveAs} from 'file-saver';
import {IPC_RENDERER} from '../tauri-ipc.provider';
import {NotificationsService, READABLE_NOTIFICATION_TIMEOUT} from './notifications.service';

/**
 * Saves files created in the editor, e.g. exports and generated artifacts: the desktop app asks the user where to save
 * them, the browser downloads them.
 *
 * The desktop app cannot download files: its web view does not identify itself as Safari on macOS, so `file-saver`
 * navigates to a data URL instead, which the app blocks.
 */
@Injectable({providedIn: 'root'})
export class FileSaverService {
  private readonly ipcRenderer = inject(IPC_RENDERER, {optional: true});
  private readonly notifications = inject(NotificationsService);
  private readonly transloco = inject(TranslocoService);

  /**
   * Saves the content under the proposed file name.
   *
   * @returns the path of the saved file; `null` if the user cancelled or the browser downloads the file
   * @throws if the file could not be saved
   */
  async save(content: Blob, fileName: string): Promise<string | null> {
    if (this.ipcRenderer?.saveFile) {
      return this.ipcRenderer.saveFile(fileName, content);
    }
    saveAs(content, fileName);
    return null;
  }

  /** Like {@link save}, but reports a failure to the user instead of to the caller. */
  download(content: Blob, fileName: string): void {
    this.save(content, fileName).catch(error =>
      this.notifications.error({
        title: this.transloco.translate('notificationService.fileSaveFailed', {fileName}),
        message: error instanceof Error ? error.message : String(error ?? ''),
        timeout: READABLE_NOTIFICATION_TIMEOUT,
      }),
    );
  }
}
