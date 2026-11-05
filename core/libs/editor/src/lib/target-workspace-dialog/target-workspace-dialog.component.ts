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

import {ModelSource} from '@ame/domain';
import {DialogCloseButtonComponent} from '@ame/shared';
import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {MatButton} from '@angular/material/button';
import {MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle} from '@angular/material/dialog';
import {MatIcon} from '@angular/material/icon';
import {MatRadioButton, MatRadioGroup} from '@angular/material/radio';
import {TranslocoDirective} from '@jsverse/transloco';

export interface TargetWorkspaceDialogData {
  workspaces: ModelSource[];
  /** Preselected workspace path, usually the one chosen last. */
  selected: string | null;
  fileName: string;
}

/** Asks in which workspace a model that was never saved should be stored. Closes with the workspace path, or nothing if cancelled. */
@Component({
  selector: 'ame-target-workspace-dialog',
  template: `
    <ng-container *transloco="let t">
      <ame-dialog-close-button />
      <h2 mat-dialog-title>{{ t('modelSources.targetDialog.title') }}</h2>

      <mat-dialog-content>
        <p>{{ t('modelSources.targetDialog.content', {file: data.fileName}) }}</p>
        <mat-radio-group
          class="workspaces"
          [value]="selected()"
          [attr.aria-label]="t('modelSources.targetDialog.title')"
          (change)="selected.set($event.value)"
        >
          @for (workspace of data.workspaces; track workspace.path) {
            <mat-radio-button [value]="workspace.path" [attr.data-testid]="'target-workspace-' + $index">
              <span class="name">
                <mat-icon>{{ workspace.defaultWorkspace ? 'home' : 'folder' }}</mat-icon>
                {{ workspace.defaultWorkspace ? t('modelSources.workspaces.defaultName', {name: workspace.name}) : workspace.name }}
              </span>
              <span class="path">{{ workspace.path }}</span>
            </mat-radio-button>
          }
        </mat-radio-group>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button (click)="cancel()" mat-button data-testid="target-workspace-cancel">{{ t('modelSources.targetDialog.cancel') }}</button>
        <button [disabled]="!selected()" (click)="confirm()" mat-flat-button color="primary" data-testid="target-workspace-ok">
          {{ t('modelSources.targetDialog.save') }}
        </button>
      </mat-dialog-actions>
    </ng-container>
  `,
  styles: `
    .workspaces {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .name {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    .name mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .path {
      display: block;
      font-size: 12px;
      opacity: 0.7;
      word-break: break-all;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogCloseButtonComponent,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatIcon,
    MatRadioGroup,
    MatRadioButton,
    TranslocoDirective,
  ],
})
export class TargetWorkspaceDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<TargetWorkspaceDialogComponent, string>>(MatDialogRef);
  readonly data: TargetWorkspaceDialogData = inject(MAT_DIALOG_DATA);
  readonly selected = signal<string | null>(this.data.selected ?? this.data.workspaces[0]?.path ?? null);

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    const selected = this.selected();
    if (selected) this.dialogRef.close(selected);
  }
}
