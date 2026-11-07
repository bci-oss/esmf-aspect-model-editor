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
  ChangedFile,
  ModelSourcesStore,
  RefactoringHistoryEntry,
  RefactoringPreview,
  RefactoringRequest,
  RefactoringStore,
  RefactoringType,
  VersionIncrease,
} from '@ame/domain';
import {DialogCloseButtonComponent} from '@ame/shared';
import {HttpErrorResponse} from '@angular/common/http';
import {Component, computed, DestroyRef, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {applyWhen, form, FormField, pattern, required, validate} from '@angular/forms/signals';
import {MatButtonModule} from '@angular/material/button';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatRadioModule} from '@angular/material/radio';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoDirective} from '@jsverse/transloco';
import {EditorTab} from '../../tabs/tab.model';
import {RefactoringTabSyncService} from '../refactoring-tab-sync.service';
import {parseElementUrn} from '../refactoring-urns';

export interface RefactoringDialogData {
  /** The type and the source of the refactoring; the dialog asks for the target. */
  request: RefactoringRequest;
  /** The tab saved right after the refactoring; its unsaved changes do not block it. */
  pendingSaveTabId?: string;
}

/** The refactoring the dialog applied: the request completed with the target the user entered, and its outcome. */
export interface RefactoringDialogResult {
  request: RefactoringRequest;
  entry: RefactoringHistoryEntry;
}

interface RefactoringFormModel {
  newName: string;
  targetFileName: string;
  targetNamespace: string;
  targetVersion: string;
  /** The workspace path of a new target file; `''` for the workspace of the source file. */
  targetWorkspace: string;
  increase: VersionIncrease;
}

const ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
const FILE_NAME = /^[0-9a-zA-Z_. -]+$/;
const NAMESPACE = /^[A-Za-z0-9]+([.-][A-Za-z0-9_]+)*$/;
const VERSION = /^\d+\.\d+\.\d+(-[A-Za-z0-9]+)?$/;
const TTL = '.ttl';

const PREVIEW_GROUPS: {key: 'created' | 'modified' | 'removed' | 'blocked'; icon: string}[] = [
  {key: 'created', icon: 'add_circle'},
  {key: 'modified', icon: 'edit'},
  {key: 'removed', icon: 'remove_circle'},
  {key: 'blocked', icon: 'lock'},
];

/** Refactorings whose target is part of the request; they are previewed right away. */
const COMPLETE_REQUESTS: RefactoringType[] = ['MOVE_FILE'];

export const VERSION_INCREASES: VersionIncrease[] = ['MAJOR', 'MINOR', 'MICRO'];

/**
 * Asks for the target of a refactoring, shows which files it changes and applies it.
 * Applying is only possible for the previewed input. Closes with the applied refactoring, or nothing if cancelled.
 */
@Component({
  selector: 'ame-refactoring-dialog',
  templateUrl: './refactoring-dialog.component.html',
  styleUrls: ['./refactoring-dialog.component.scss'],
  imports: [
    DialogCloseButtonComponent,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatIconModule,
    MatProgressBarModule,
    FormField,
    TranslocoDirective,
  ],
})
export class RefactoringDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<RefactoringDialogComponent, RefactoringDialogResult>>(MatDialogRef);
  private readonly refactorings = inject(RefactoringStore);
  private readonly tabSync = inject(RefactoringTabSyncService);
  private readonly destroyRef = inject(DestroyRef);

  readonly data: RefactoringDialogData = inject(MAT_DIALOG_DATA);
  readonly type = this.data.request.type;
  readonly element = parseElementUrn(this.data.request.urn);
  readonly increases = VERSION_INCREASES;
  readonly modelSources = inject(ModelSourcesStore);
  readonly busy = this.refactorings.busy;
  readonly progress = this.refactorings.progress;
  readonly progressPercent = computed(() => {
    const progress = this.progress();
    return progress?.steps ? (progress.step / progress.steps) * 100 : 0;
  });

  readonly model = signal<RefactoringFormModel>(initialModel(this.data.request, this.element?.name));
  readonly refactoringForm = form(this.model, path => {
    applyWhen(
      path,
      () => this.type === 'RENAME_ELEMENT',
      schema => {
        required(schema.newName);
        pattern(schema.newName, ELEMENT_NAME);
        validate(schema.newName, ({value}) => {
          const name = value();
          const original = this.element?.name ?? '';
          if (!name || !original) return null;
          if (name === original) return {kind: 'unchanged', message: 'Name is unchanged'};
          return isUpperCase(name) === isUpperCase(original) ? null : {kind: 'casing', message: 'Name must keep its casing'};
        });
      },
    );
    applyWhen(
      path,
      () => this.type === 'RENAME_FILE',
      schema => {
        required(schema.newName);
        pattern(schema.newName, FILE_NAME);
        validate(schema.newName, ({value}) =>
          withTtl(value()) === this.data.request.fileName ? {kind: 'unchanged', message: 'Name is unchanged'} : null,
        );
      },
    );
    applyWhen(
      path,
      () => this.type === 'MOVE_ELEMENT',
      schema => {
        required(schema.targetFileName);
        pattern(schema.targetFileName, FILE_NAME);
      },
    );
    applyWhen(
      path,
      () => this.type === 'MOVE_ELEMENT' || this.type === 'RENAME_NAMESPACE',
      schema => {
        required(schema.targetNamespace);
        pattern(schema.targetNamespace, NAMESPACE);
        required(schema.targetVersion);
        pattern(schema.targetVersion, VERSION);
      },
    );
    applyWhen(
      path,
      () => this.type === 'RENAME_NAMESPACE',
      schema => {
        validate(schema.targetVersion, ({valueOf}) =>
          valueOf(schema.targetNamespace) === this.data.request.namespace && valueOf(schema.targetVersion) === this.data.request.version
            ? {kind: 'unchanged', message: 'Namespace is unchanged'}
            : null,
        );
      },
    );
  });

  /** The complete request for the current input. */
  readonly request = computed<RefactoringRequest>(() => completeRequest(this.data.request, this.model()));

  private readonly previewed = signal<{request: RefactoringRequest; preview: RefactoringPreview} | null>(null);
  /** The preview of the current input; outdated previews are hidden. */
  readonly preview = computed(() => {
    const previewed = this.previewed();
    return previewed && JSON.stringify(previewed.request) === JSON.stringify(this.request()) ? previewed.preview : null;
  });
  /** Open tabs with unsaved changes in files the refactoring changes. */
  readonly unsavedTabs = computed<EditorTab[]>(() => {
    const preview = this.preview();
    return preview ? this.tabSync.unsavedTabsAmong(preview, tab => tab.id === this.data.pendingSaveTabId) : [];
  });
  readonly unsavedFiles = computed(() =>
    this.unsavedTabs()
      .map(tab => tab.file)
      .join(', '),
  );
  readonly previewGroups = computed(() => {
    const preview = this.preview();
    return preview ? PREVIEW_GROUPS.map(group => ({...group, files: preview[group.key]})).filter(group => group.files.length) : [];
  });
  readonly canApply = computed(() => !this.busy() && !!this.preview()?.applicable && this.unsavedTabs().length === 0);
  readonly error = signal<{key: string; message?: string} | null>(null);

  constructor() {
    if (COMPLETE_REQUESTS.includes(this.type)) this.runPreview();
  }

  requestClose(): void {
    if (!this.busy()) this.dialogRef.close();
  }

  runPreview(): void {
    if (this.refactoringForm().invalid() || this.busy()) return;

    const request = this.request();
    this.error.set(null);
    this.refactorings
      .preview(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: preview => this.previewed.set({request, preview}),
        error: error => this.error.set(describeError(error)),
      });
  }

  apply(): void {
    if (!this.canApply()) return;

    const request = this.request();
    this.error.set(null);
    this.refactorings
      .apply(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: entry => this.dialogRef.close({request, entry}),
        error: error => this.error.set(describeError(error)),
      });
  }

  /** `namespace:version/file.ttl`, the way files are shown in the workspace. */
  fileLabel(file: ChangedFile): string {
    return `${file.namespace}:${file.version}/${file.fileName}`;
  }
}

function initialModel(request: RefactoringRequest, elementName = ''): RefactoringFormModel {
  const element = parseElementUrn(request.urn);
  return {
    newName: request.type === 'RENAME_FILE' ? withoutTtl(request.fileName ?? '') : (request.newName ?? elementName),
    targetFileName: '',
    targetNamespace: element?.namespace ?? request.namespace ?? '',
    targetVersion: element?.version ?? request.version ?? '',
    targetWorkspace: '',
    increase: 'MINOR',
  };
}

function completeRequest(request: RefactoringRequest, model: RefactoringFormModel): RefactoringRequest {
  switch (request.type) {
    case 'RENAME_ELEMENT':
      return {...request, newName: model.newName.trim()};
    case 'RENAME_FILE':
      return {...request, newName: withTtl(model.newName)};
    case 'MOVE_ELEMENT':
      return {
        ...request,
        targetFileName: withTtl(model.targetFileName),
        targetNamespace: model.targetNamespace.trim(),
        targetVersion: model.targetVersion.trim(),
        ...(model.targetWorkspace ? {targetWorkspace: model.targetWorkspace} : {}),
      };
    case 'RENAME_NAMESPACE':
      return {...request, targetNamespace: model.targetNamespace.trim(), targetVersion: model.targetVersion.trim()};
    case 'NEW_VERSION':
      return {...request, increase: model.increase};
    case 'MOVE_FILE':
      return request;
  }
}

/** Maps the status codes of the refactoring API to a translation key, with the backend's message for the details. */
function describeError(error: HttpErrorResponse): {key: string; message?: string} {
  const message = error?.error?.error?.message || error?.error?.message || (typeof error?.error === 'string' ? error.error : undefined);
  switch (error?.status) {
    case 409:
      return {key: 'error.conflict', message};
    case 423:
      return {key: 'error.locked'};
    case 404:
      return {key: 'error.notFound', message};
    default:
      return {key: 'error.failed', message: message || error?.message};
  }
}

function isUpperCase(name: string): boolean {
  return name.charAt(0) === name.charAt(0).toUpperCase();
}

function withTtl(fileName: string): string {
  const trimmed = fileName.trim();
  return trimmed.endsWith(TTL) ? trimmed : `${trimmed}${TTL}`;
}

function withoutTtl(fileName: string): string {
  return fileName.endsWith(TTL) ? fileName.slice(0, -TTL.length) : fileName;
}
