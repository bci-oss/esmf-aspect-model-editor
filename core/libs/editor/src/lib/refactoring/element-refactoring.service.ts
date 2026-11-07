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
  ElementRefactoringAction,
  ElementRefactoringBlocker,
  ElementRefactoringGuard,
  RefactoringDialogPort,
  RefactoringRequest,
} from '@ame/domain';
import {MaxGraphHelper, MaxGraphShapeSelectorService} from '@ame/graph';
import {BindingsService} from '@ame/shared';
import {computed, inject, Injectable} from '@angular/core';
import {NamedElement} from '@esmf/aspect-model-loader';
import {ShapeSettingsStateService} from '../editor-dialog/services/shape-settings-state.service';

export type ElementRefactoringType = Extract<RefactoringRequest['type'], 'RENAME_ELEMENT' | 'MOVE_ELEMENT'>;

/**
 * The refactorings of a single element across all files. Offered in the element editor, the toolbar and the graph
 * context menu; all of them go through this service, so they behave the same.
 */
@Injectable({providedIn: 'root'})
export class ElementRefactoringService {
  private readonly guard = inject(ElementRefactoringGuard);
  private readonly refactoringDialog = inject(RefactoringDialogPort);
  private readonly shapeSettingsState = inject(ShapeSettingsStateService);
  private readonly shapeSelector = inject(MaxGraphShapeSelectorService);
  private readonly bindings = inject(BindingsService);

  /** The element the toolbar and the context menu work on: exactly one selected shape. */
  readonly selectedElement = computed<NamedElement | null>(() => {
    const cells = this.shapeSelector.selectedCells();
    return cells.length === 1 ? (MaxGraphHelper.getModelElement(cells[0]) ?? null) : null;
  });

  registerContextMenuActions(): void {
    this.bindings.registerAction(ElementRefactoringAction.rename, () => this.refactor('RENAME_ELEMENT', this.selectedElement()));
    this.bindings.registerAction(ElementRefactoringAction.move, () => this.refactor('MOVE_ELEMENT', this.selectedElement()));
    this.bindings.registerAction(ElementRefactoringAction.usages, () => this.showUsages(this.selectedElement()));
  }

  urnOf(element: NamedElement | null | undefined): string | null {
    return this.guard.urnOf(element);
  }

  blocker(element: NamedElement | null | undefined): ElementRefactoringBlocker | null {
    return this.guard.blocker(element);
  }

  /**
   * Closes the element editor first; its content would be outdated once the files have changed.
   *
   * @param newName proposed in the dialog of a rename, e.g. the name already typed in the element editor
   */
  refactor(type: ElementRefactoringType, element: NamedElement | null | undefined, newName?: string): void {
    const urn = this.guard.urnOf(element);
    if (!urn || !this.guard.canRefactor(element)) return;

    this.closeElementEditor();
    this.refactoringDialog.open({type, urn, ...(newName ? {newName} : {})}).subscribe();
  }

  canShowUsages(element: NamedElement | null | undefined): boolean {
    return this.guard.canShowUsages(element);
  }

  /** Also available for elements that cannot be refactored, e.g. to see who uses an element of another file. */
  showUsages(element: NamedElement | null | undefined): void {
    if (this.guard.canShowUsages(element)) this.refactoringDialog.showUsages(element.aspectModelUrn);
  }

  showHistory(): void {
    this.refactoringDialog.showHistory();
  }

  private closeElementEditor(): void {
    this.shapeSettingsState.closeShapeSettings();
    this.shapeSettingsState.setSelectedShapeForUpdate(null);
  }
}
