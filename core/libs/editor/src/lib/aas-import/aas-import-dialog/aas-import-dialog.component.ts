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

import {AasImportCandidate, ModelApiPort, ModelSourcesStore} from '@ame/domain';
import {DialogCloseButtonComponent} from '@ame/shared';
import {HttpErrorResponse, HttpStatusCode} from '@angular/common/http';
import {Component, computed, DestroyRef, inject, signal} from '@angular/core';
import {rxResource, takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatRadioModule} from '@angular/material/radio';
import {TranslocoDirective} from '@jsverse/transloco';
import {finalize, first} from 'rxjs/operators';

export interface AasImportDialogData {
  file: File;
}

export interface AasImportResult {
  workspace: string | null;
  imported: number;
}

type ImportError = 'conflict' | 'failed';

/**
 * Shows the Aspect Models found in an Asset Administration Shell and imports them into the chosen workspace.
 * Existing files are never overwritten, so the import is only possible if none of the files exists already.
 */
@Component({
  selector: 'ame-aas-import-dialog',
  templateUrl: './aas-import-dialog.component.html',
  styleUrls: ['./aas-import-dialog.component.scss'],
  imports: [
    DialogCloseButtonComponent,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatRadioModule,
    TranslocoDirective,
  ],
})
export class AasImportDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<AasImportDialogComponent, AasImportResult>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly modelApi = inject(ModelApiPort);
  private readonly modelSources = inject(ModelSourcesStore);

  readonly data: AasImportDialogData = inject(MAT_DIALOG_DATA);
  readonly workspaces = this.modelSources.workspaces;
  readonly hasMultipleWorkspaces = this.modelSources.hasMultipleWorkspaces;
  readonly workspace = signal<string | null>(this.modelSources.preferredWorkspace() ?? this.workspaces()[0]?.path ?? null);

  readonly candidates = rxResource<AasImportCandidate[], {workspace: string | null}>({
    params: () => ({workspace: this.workspace()}),
    stream: ({params}) => this.modelApi.previewAasImport(this.data.file, params.workspace ?? undefined),
  });
  readonly conflicts = computed(() =>
    this.candidates.hasValue() ? this.candidates.value().filter(candidate => candidate.alreadyExists) : [],
  );
  readonly importing = signal(false);
  readonly importError = signal<ImportError | null>(null);
  readonly canImport = computed(
    () => this.candidates.hasValue() && this.candidates.value().length > 0 && this.conflicts().length === 0 && !this.importing(),
  );

  selectWorkspace(path: string): void {
    this.importError.set(null);
    this.workspace.set(path);
  }

  /** `namespace:version/file.ttl`, the way files are shown in the workspace. */
  fileLabel(candidate: AasImportCandidate): string {
    return `${candidate.namespace}:${candidate.version}/${candidate.fileName}`;
  }

  import(): void {
    if (!this.canImport()) return;

    const workspace = this.workspace();
    const imported = this.candidates.value()?.length ?? 0;
    this.importing.set(true);
    this.importError.set(null);
    this.modelApi
      .importAas(this.data.file, workspace ?? undefined)
      .pipe(
        first(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.importing.set(false)),
      )
      .subscribe({
        next: () => this.dialogRef.close({workspace, imported}),
        error: (error: unknown) => {
          this.importError.set(this.isConflict(error) ? 'conflict' : 'failed');
          if (this.isConflict(error)) this.candidates.reload();
        },
      });
  }

  private isConflict(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === HttpStatusCode.Conflict;
  }
}
