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
import {NamedElement} from '@esmf/aspect-model-loader';
import {LoadedFilesService} from '../../model-session/loaded-files.service';
import {ModelSourcesStore} from '../model-sources/model-sources.store';

/** Actions the graph context menu fires for the selected element; registered by the editor. */
export const ElementRefactoringAction = {
  rename: 'refactor-rename',
  move: 'refactor-move',
  usages: 'refactor-usages',
} as const;

/** Why an element cannot be renamed or moved across files. */
export type ElementRefactoringBlocker = 'notSaved' | 'readOnly' | 'external' | 'predefined';

/**
 * Decides whether an element of the current model can be renamed or moved across files. Shared by every place that
 * offers these refactorings (element editor, toolbar, context menu), so they always agree.
 */
@Injectable({providedIn: 'root'})
export class ElementRefactoringGuard {
  private readonly loadedFiles = inject(LoadedFilesService);
  private readonly modelSources = inject(ModelSourcesStore);

  /** The URN the refactorings work on; anonymous elements have none. */
  urnOf(element: NamedElement | null | undefined): string | null {
    return element && !element.isAnonymous?.() ? element.aspectModelUrn : null;
  }

  /**
   * Why the element cannot be changed, or null if it can: only named elements of the current model that is stored in
   * a writable workspace can. Evaluated on demand, because the loaded file is mutated when it is saved for the first time.
   */
  blocker(element: NamedElement | null | undefined): ElementRefactoringBlocker | null {
    if (element?.isPredefined) return 'predefined';

    const currentFile = this.loadedFiles.currentLoadedFile;
    if (!this.urnOf(element) || !currentFile?.fromWorkspace) return 'notSaved';
    if (this.modelSources.isReadOnlyLocation(currentFile.rdfModel?.getSourceLocation())) return 'readOnly';
    if (this.loadedFiles.isElementExtern(element)) return 'external';
    return null;
  }

  canRefactor(element: NamedElement | null | undefined): boolean {
    return this.blocker(element) === null;
  }

  /** Usages are known for every named element of the workspaces, but not for the SAMM meta model. */
  canShowUsages(element: NamedElement | null | undefined): boolean {
    return !!this.urnOf(element) && !element.isPredefined;
  }
}
