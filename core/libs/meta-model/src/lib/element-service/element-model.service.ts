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

import {LoadedFilesService} from '@ame/cache';
import {RenameModelDialogService} from '@ame/editor';
import {MaxGraphHelper, MaxGraphService} from '@ame/max-graph';
import {ModelService} from '@ame/rdf/services';
import {NotificationsService, TitleService} from '@ame/shared';
import {LanguageTranslationService} from '@ame/translation';
import {inject, Injectable, Injector} from '@angular/core';
import {DefaultAspect, DefaultEnumeration, NamedElement} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {CharacteristicModelService} from './characteristic-model.service';
import {ModelRootService} from './model-root.service';

@Injectable({providedIn: 'root'})
export class ElementModelService {
  private readonly injector = inject(Injector);
  private readonly titleService = inject(TitleService);
  private readonly maxgraphService = inject(MaxGraphService);
  private readonly modelRootService = inject(ModelRootService);
  private readonly modelService = inject(ModelService);
  private readonly renameModelService = inject(RenameModelDialogService);
  private readonly notificationService = inject(NotificationsService);
  private readonly translate = inject(LanguageTranslationService);
  private readonly loadedFilesService = inject(LoadedFilesService);

  get currentCachedFile() {
    return this.loadedFilesService.currentLoadedFile.cachedFile;
  }

  updateElement(cell: Cell, form: {[key: string]: any}): void {
    if (!cell || cell.isEdge()) {
      return;
    }
    const characteristicModelService = this.injector.get(CharacteristicModelService);
    const modelElement = MaxGraphHelper.getModelElement(cell);

    const modelService =
      modelElement instanceof DefaultEnumeration ? characteristicModelService : this.modelRootService.getElementModelService(modelElement);
    modelService.update(cell, form);
  }

  deleteElement(cell: Cell): void {
    if (!cell) {
      return;
    }

    if (cell?.isEdge()) {
      this.notificationService.warning({
        title: this.translate.language.notificationService.cannotDeleteEdgeTitle,
        message: this.translate.language.notificationService.cannotDeleteEdgeMessage,
        timeout: 5000,
      });
      return;
    }

    if (this.maxgraphService.getAllCells().length === 1) {
      this.notificationService.warning({
        title: this.translate.language.notificationService.modelEmptyMessage,
        message: this.translate.language.notificationService.modelMinimumElementRequirement,
        timeout: 5000,
      });
      return;
    }

    if (this.handleAspectRemoval(cell)) {
      return;
    }

    const elementModel = MaxGraphHelper.getModelElement(cell);
    if (elementModel.isPredefined) {
      const service = this.modelRootService.getPredefinedService(elementModel);
      if (service?.delete && service?.delete?.(cell)) {
        return;
      }
    }

    this.removeElementData(cell);
  }

  private handleAspectRemoval(cell: Cell): boolean {
    const modelElement = MaxGraphHelper.getModelElement(cell);
    if (!(modelElement instanceof DefaultAspect)) {
      return false;
    }
    this.renameModelService.open().subscribe(data => {
      if (!data?.name) {
        return;
      }

      const loadedFile = this.loadedFilesService.currentLoadedFile;
      const oldAbsoluteName = loadedFile.absoluteName;
      this.modelService.removeAspect();
      this.removeElementData(cell);

      this.loadedFilesService.updateAbsoluteName(oldAbsoluteName, `${loadedFile.namespace}:${data.name}`);
      this.titleService.updateTitle(loadedFile.absoluteName);
    });

    return true;
  }

  private removeElementData(cell: Cell): void {
    const modelElement = MaxGraphHelper.getModelElement(cell);
    const elementModelService = this.modelRootService.getElementModelService(modelElement);

    for (const parent of modelElement.parents) {
      if (!(parent instanceof NamedElement)) continue;
      MaxGraphHelper.removeRelation(parent, modelElement);
    }

    for (const child of modelElement.children) {
      if (!(child instanceof NamedElement)) continue;
      MaxGraphHelper.removeRelation(modelElement, child);
    }

    elementModelService?.delete(cell);
    this.currentCachedFile.removeElement(MaxGraphHelper.getModelElement(cell).aspectModelUrn);
  }
}
