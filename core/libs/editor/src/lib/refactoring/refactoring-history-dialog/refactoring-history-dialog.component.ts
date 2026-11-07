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

import {RefactoringHistoryEntry, RefactoringStore} from '@ame/domain';
import {DialogCloseButtonComponent} from '@ame/shared';
import {DatePipe} from '@angular/common';
import {Component, DestroyRef, inject} from '@angular/core';
import {rxResource, takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatDialogModule} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {RefactoringRevertService} from '../refactoring-revert.service';

/** Lists the applied refactorings of all workspaces, the latest first, and undoes them. */
@Component({
  selector: 'ame-refactoring-history-dialog',
  templateUrl: './refactoring-history-dialog.component.html',
  styleUrls: ['./refactoring-history-dialog.component.scss'],
  imports: [
    DatePipe,
    DialogCloseButtonComponent,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoDirective,
  ],
})
export class RefactoringHistoryDialogComponent {
  private readonly refactorings = inject(RefactoringStore);
  private readonly reverter = inject(RefactoringRevertService);
  private readonly destroyRef = inject(DestroyRef);

  // The store keeps the list up to date while the dialog is open, e.g. after an undo
  readonly loading = rxResource({stream: () => this.refactorings.loadHistory()});
  readonly history = this.refactorings.history;
  readonly busy = this.refactorings.busy;

  revert(entry: RefactoringHistoryEntry): void {
    if (this.busy()) return;
    this.reverter.revert(entry.request, entry).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
