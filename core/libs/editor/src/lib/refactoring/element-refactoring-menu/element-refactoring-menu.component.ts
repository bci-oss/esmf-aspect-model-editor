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

import {ElementRefactoringBlocker} from '@ame/domain';
import {ChangeDetectionStrategy, Component, computed, inject, input} from '@angular/core';
import {MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatMenu, MatMenuItem, MatMenuTrigger} from '@angular/material/menu';
import {MatTooltip} from '@angular/material/tooltip';
import {NamedElement} from '@esmf/aspect-model-loader';
import {TranslocoDirective} from '@jsverse/transloco';
import {ElementRefactoringService, ElementRefactoringType} from '../element-refactoring.service';

/** The refactorings of an element across all files, offered in the header of the element editor. */
@Component({
  selector: 'ame-element-refactoring-menu',
  template: `
    <ng-container *transloco="let t; prefix: 'refactoring.elementMenu'">
      <button
        [matMenuTriggerFor]="menu"
        [disabled]="!urn()"
        [matTooltip]="t('tooltip')"
        mat-icon-button
        type="button"
        tabindex="-1"
        data-testid="element-refactoring-menu"
      >
        <mat-icon>more_vert</mat-icon>
      </button>

      <mat-menu #menu="matMenu">
        @let blocker = refactoringBlocker();
        <!-- A disabled menu item does not receive pointer events, so its tooltip sits on a wrapper. -->
        <span
          class="menu-item-wrapper"
          [matTooltip]="blocker ? t('blocked.' + blocker) : ''"
          matTooltipPosition="left"
          data-testid="element-refactoring-blocked"
        >
          <button [disabled]="!!blocker" (click)="refactor('RENAME_ELEMENT')" mat-menu-item data-testid="element-refactoring-rename">
            <mat-icon>drive_file_rename_outline</mat-icon>
            <span>{{ t('rename') }}</span>
          </button>
          <button [disabled]="!!blocker" (click)="refactor('MOVE_ELEMENT')" mat-menu-item data-testid="element-refactoring-move">
            <mat-icon>drive_file_move</mat-icon>
            <span>{{ t('move') }}</span>
          </button>
        </span>
        <button [disabled]="!canShowUsages()" (click)="showUsages()" mat-menu-item data-testid="element-refactoring-usages">
          <mat-icon>account_tree</mat-icon>
          <span>{{ t('usages') }}</span>
        </button>
      </mat-menu>
    </ng-container>
  `,
  styles: `
    .menu-item-wrapper {
      display: block;
    }

    /* Disabled buttons swallow pointer events, which would keep the tooltip with the reason hidden */
    .menu-item-wrapper button:disabled {
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatTooltip, TranslocoDirective],
})
export class ElementRefactoringMenuComponent {
  private readonly elementRefactoring = inject(ElementRefactoringService);

  readonly element = input<NamedElement | null | undefined>(null);

  readonly urn = computed(() => this.elementRefactoring.urnOf(this.element()));

  /** A method instead of a computed signal, because the loaded file is mutated when it is saved for the first time. */
  refactoringBlocker(): ElementRefactoringBlocker | null {
    return this.elementRefactoring.blocker(this.element());
  }

  canRefactor(): boolean {
    return this.refactoringBlocker() === null;
  }

  canShowUsages(): boolean {
    return this.elementRefactoring.canShowUsages(this.element());
  }

  refactor(type: ElementRefactoringType): void {
    this.elementRefactoring.refactor(type, this.element());
  }

  showUsages(): void {
    this.elementRefactoring.showUsages(this.element());
  }
}
