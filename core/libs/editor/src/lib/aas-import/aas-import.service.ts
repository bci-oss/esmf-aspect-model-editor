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

import {ModelSourcesStore} from '@ame/domain';
import {createFile, FileInfo, LanguageTranslationService, NotificationsService, TauriSignalsService} from '@ame/shared';
import {inject, Injectable} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {Observable} from 'rxjs';
import {filter, switchMap, tap} from 'rxjs/operators';
import {AasImportDialogComponent, AasImportDialogData, AasImportResult} from './aas-import-dialog/aas-import-dialog.component';

const AAS_MIME_TYPE = 'application/octet-stream';

/** Imports the Aspect Models of an Asset Administration Shell (AASX, XML or JSON) into a workspace. */
@Injectable({providedIn: 'root'})
export class AasImportService {
  private readonly matDialog = inject(MatDialog);
  private readonly modelSources = inject(ModelSourcesStore);
  private readonly notificationsService = inject(NotificationsService);
  private readonly tauriSignalsService = inject(TauriSignalsService);
  private readonly translate = inject(LanguageTranslationService);

  onImportAas(fileInfo: FileInfo): void {
    this.importAas(fileInfo).subscribe();
  }

  /** Emits the result once the models were imported; completes without a value if the user cancels. */
  importAas(fileInfo: FileInfo): Observable<AasImportResult> {
    const data: AasImportDialogData = {file: createFile(fileInfo.content, fileInfo.name, AAS_MIME_TYPE)};

    return this.modelSources.ensureLoaded().pipe(
      switchMap(() =>
        this.matDialog
          .open<AasImportDialogComponent, AasImportDialogData, AasImportResult>(AasImportDialogComponent, {data, width: '640px'})
          .afterClosed(),
      ),
      filter((result): result is AasImportResult => !!result),
      tap(result => this.onImported(result)),
    );
  }

  private onImported({workspace, imported}: AasImportResult): void {
    if (workspace) this.modelSources.rememberTargetWorkspace(workspace);
    this.tauriSignalsService.call('requestRefreshWorkspaces');
    this.notificationsService.success({
      title: this.translate.translateService.translate('aasImport.imported', {count: imported}),
      timeout: 5000,
    });
  }
}
