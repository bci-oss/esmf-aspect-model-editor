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

import {DialogCloseButtonComponent} from '@ame/shared';
import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {MatButton} from '@angular/material/button';
import {MatCheckbox} from '@angular/material/checkbox';
import {MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle} from '@angular/material/dialog';
import {MatFormField, MatLabel} from '@angular/material/form-field';
import {MatIcon} from '@angular/material/icon';
import {MatInput} from '@angular/material/input';
import {MatOption, MatSelect} from '@angular/material/select';
import {TranslocoDirective} from '@jsverse/transloco';

export interface ClearWorkspaceOption {
  path: string;
  name: string;
  defaultWorkspace: boolean;
  fileCount: number;
}

export interface ClearWorkspaceDialogData {
  fileCount: number;
  /** The workspaces to choose from; empty if there is only one. */
  workspaces?: ClearWorkspaceOption[];
  /** Preselected workspace path. */
  selected?: string | null;
}

export interface ClearWorkspaceDialogResult {
  backup: boolean;
  /** The workspace to clear; undefined if there is only one. */
  workspace?: string;
}

/** The word to type to confirm. Not translated, so it is the same in every language and in the documentation. */
export const CLEAR_WORKSPACE_CONFIRM_WORD = 'CLEAR';

/** Asks for a typed confirmation before all Aspect Models of the workspace are deleted. */
@Component({
  selector: 'ame-clear-workspace-dialog',
  templateUrl: './clear-workspace-dialog.component.html',
  styleUrls: ['./clear-workspace-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogCloseButtonComponent,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatCheckbox,
    MatFormField,
    MatLabel,
    MatInput,
    MatIcon,
    MatSelect,
    MatOption,
    TranslocoDirective,
  ],
})
export class ClearWorkspaceDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<ClearWorkspaceDialogComponent, ClearWorkspaceDialogResult>>(MatDialogRef);
  public readonly data: ClearWorkspaceDialogData = inject(MAT_DIALOG_DATA);

  public readonly confirmWord = CLEAR_WORKSPACE_CONFIRM_WORD;
  public readonly backup = signal(true);
  public readonly typed = signal('');
  public readonly workspaces = this.data.workspaces ?? [];
  public readonly workspace = signal<string | undefined>(
    this.workspaces.length ? (this.workspaces.find(option => option.path === this.data.selected) ?? this.workspaces[0]).path : undefined,
  );
  /** Number of files deleted in the selected workspace. */
  public readonly fileCount = computed(() => {
    const selected = this.workspace();
    return selected ? (this.workspaces.find(option => option.path === selected)?.fileCount ?? 0) : this.data.fileCount;
  });
  public readonly confirmed = computed(() => this.typed().trim() === this.confirmWord && this.fileCount() > 0);

  public cancel(): void {
    this.dialogRef.close();
  }

  public clear(): void {
    if (this.confirmed()) {
      this.dialogRef.close({backup: this.backup(), workspace: this.workspace()});
    }
  }
}
