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
import {EntityInstanceService, RenameModelDialogService} from '@ame/editor';
import {
  MaxGraphCharacteristicHelper,
  MaxGraphHelper,
  MaxGraphService,
  MaxGraphShapeOverlayService,
  MaxGraphVisitorHelper,
} from '@ame/max-graph';
import {ModelService} from '@ame/rdf/services';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {NotificationsService, TitleService} from '@ame/shared';
import {LanguageTranslationService} from '@ame/translation';
import {useUpdater} from '@ame/utils';
import {inject, Injectable, Injector} from '@angular/core';
import {
  DefaultAspect,
  DefaultEntity,
  DefaultEntityInstance,
  DefaultEnumeration,
  DefaultProperty,
  DefaultStructuredValue,
  NamedElement,
} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {CharacteristicModelService} from './characteristic-model.service';
import {ModelRootService} from './model-root.service';

@Injectable({providedIn: 'root'})
export class ElementModelService {
  private readonly injector = inject(Injector);
  private readonly titleService = inject(TitleService);
  private readonly maxgraphShapeOverlayService = inject(MaxGraphShapeOverlayService);
  private readonly maxgraphService = inject(MaxGraphService);
  private readonly entityInstanceService = inject(EntityInstanceService);
  private readonly sammLangService = inject(SammLanguageSettingsService);
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
      this.decoupleElements(cell);
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

  decoupleElements(edge: Cell): void {
    const sourceModelElement = MaxGraphHelper.getModelElement(edge.source);
    const targetModelElement = MaxGraphHelper.getModelElement(edge.target);

    MaxGraphHelper.removeRelation(sourceModelElement, targetModelElement);

    if (this.loadedFilesService.isElementExtern(sourceModelElement)) {
      return;
    }

    if (this.handleAbstractEntityRemoval(edge)) {
      return;
    }

    if (this.handleAbstractPropertyRemoval(edge, sourceModelElement, targetModelElement)) {
      return;
    }

    if (this.modelRootService.isPredefined(sourceModelElement)) {
      const service = this.modelRootService.getPredefinedService(sourceModelElement);
      if (service?.decouple && service?.decouple?.(edge, sourceModelElement)) {
        return;
      }
    }

    if (this.handleAbstractElementsDecoupling(edge, sourceModelElement, targetModelElement)) {
      return;
    }

    if (this.handleEntityPropertyDecoupling(edge, sourceModelElement, targetModelElement)) {
      return;
    }

    this.decoupleEnumerationFromEntityValue(sourceModelElement, targetModelElement, edge);

    if (this.handleEnumerationEntityDecoupling(edge, sourceModelElement, targetModelElement)) {
      return;
    }

    if (sourceModelElement instanceof DefaultEntityInstance && targetModelElement instanceof DefaultEntity) {
      this.maxgraphService.updateEnumerationsWithEntityValue(sourceModelElement);
      this.maxgraphService.updateEntityValuesWithCellReference([edge.source]);
      this.maxgraphService.removeCells([edge.source]);
    }

    if (targetModelElement instanceof DefaultEntityInstance) {
      this.maxgraphService.updateEnumerationsWithEntityValue(targetModelElement);
      this.maxgraphService.removeCells([edge.target]);
    }

    if (sourceModelElement instanceof DefaultStructuredValue && targetModelElement instanceof DefaultProperty) {
      useUpdater(sourceModelElement).delete(targetModelElement);
      MaxGraphHelper.updateLabel(edge.source, this.maxgraphService.graph, this.sammLangService);
    }

    this.removeConnectionBetweenElements(edge, sourceModelElement, targetModelElement);
    this.maxgraphService.removeCells([edge]);
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

  private handleAbstractEntityRemoval(edge: Cell): boolean {
    const target = MaxGraphHelper.getModelElement(edge.target);
    if (!(target instanceof DefaultEntity && target.isAbstractEntity())) {
      return false;
    }

    const parents = this.maxgraphService
      .resolveParents(edge.target)
      ?.filter(c => MaxGraphHelper.getModelElement(c) instanceof DefaultEntity);
    const toRemove = [edge];

    for (const parent of parents) {
      const properties = this.maxgraphService.graph
        .getOutgoingEdges(parent, null)
        .map(e => e.target)
        .filter(c => !!MaxGraphHelper.getModelElement<DefaultProperty>(c)?.extends_);

      for (const property of properties) {
        MaxGraphHelper.removeRelation(MaxGraphHelper.getModelElement(parent), MaxGraphHelper.getModelElement(property));
      }

      toRemove.push(...properties);
    }

    this.maxgraphService.removeCells(toRemove);
    const source = MaxGraphHelper.getModelElement<DefaultEntity>(edge.source);
    source.extends_ = null;
    MaxGraphHelper.updateLabel(edge.source, this.maxgraphService.graph, this.sammLangService);
    return true;
  }

  private handleAbstractPropertyRemoval(edge: Cell, source: NamedElement, target: NamedElement): boolean {
    if (
      (source instanceof DefaultProperty && target instanceof DefaultProperty && target.isAbstract) ||
      (source instanceof DefaultProperty && target instanceof DefaultProperty)
    ) {
      const sourceElement = MaxGraphHelper.getModelElement(edge.source);
      MaxGraphHelper.removeRelation(sourceElement, MaxGraphHelper.getModelElement(edge.target));
      this.currentCachedFile.removeElement(sourceElement.aspectModelUrn);
      this.maxgraphService.removeCells([edge, edge.source]);
      return true;
    }

    return false;
  }

  private handleAbstractElementsDecoupling(edge: Cell, source: NamedElement, target: NamedElement): boolean {
    if (
      (source instanceof DefaultEntity && target instanceof DefaultEntity && target.isAbstractEntity()) ||
      (source instanceof DefaultEntity && source.isAbstractEntity() && target instanceof DefaultEntity && target.isAbstractEntity()) ||
      (source instanceof DefaultEntity && target instanceof DefaultEntity) ||
      (source instanceof DefaultProperty && source.isAbstract && target instanceof DefaultProperty && target.isAbstract)
    ) {
      source.extends_ = null;
      edge.source['configuration'].fields = MaxGraphVisitorHelper.getElementProperties(
        MaxGraphHelper.getModelElement(edge.source),
        this.sammLangService,
      );
      this.maxgraphService.graph.labelChanged(edge.source, MaxGraphHelper.createPropertiesLabel(edge.source), null);
      this.removeConnectionBetweenElements(edge, source, target);
      this.maxgraphService.removeCells([edge]);
      return true;
    }

    return false;
  }

  private handleEntityPropertyDecoupling(edge: Cell, source: NamedElement, target: NamedElement): boolean {
    if (source instanceof DefaultEntity && target instanceof DefaultProperty) {
      if (target.extends_) {
        this.maxgraphService.removeCells([edge.target]);
      }

      this.entityInstanceService.onPropertyRemove(target, () => {
        this.removeConnectionBetweenElements(edge, source, target);
        this.maxgraphService.removeCells([edge]);
      });

      return true;
    }

    return false;
  }

  private handleEnumerationEntityDecoupling(edge: Cell, source: NamedElement, target: NamedElement) {
    if (source instanceof DefaultEnumeration && target instanceof DefaultEntity) {
      return this.entityInstanceService.onEntityDisconnect(source, target, () => {
        const obsoleteEntityValues = MaxGraphCharacteristicHelper.findObsoleteEntityValues(edge);
        this.removeConnectionBetweenElements(edge, source, target);
        this.maxgraphService.updateEntityValuesWithCellReference(obsoleteEntityValues);
        this.maxgraphService.removeCells([edge, ...obsoleteEntityValues]);
      });
    }

    return false;
  }

  private removeConnectionBetweenElements(edge: Cell, source: NamedElement, target: NamedElement) {
    if (MaxGraphHelper.isComplexEnumeration(source)) {
      this.maxgraphShapeOverlayService.removeComplexTypeShapeOverlays(edge.source);
    }
    MaxGraphHelper.removeRelation(source, target);
    useUpdater(source).delete(target);
    this.maxgraphShapeOverlayService.checkAndAddShapeActionIcon(new Array(edge), source);
    edge.target.removeEdge(edge, false);
    edge.source.removeEdge(edge, true);
  }

  /**
   * Decouple enumeration - entityValue when the edge between them will be deleted
   *
   * @param sourceModelElement - source enumeration
   * @param targetModelElement - target entity value
   * @param edge - deleted edge
   */
  private decoupleEnumerationFromEntityValue(sourceModelElement: NamedElement, targetModelElement: NamedElement, edge: Cell): void {
    if (sourceModelElement instanceof DefaultEnumeration && targetModelElement instanceof DefaultEntityInstance) {
      const entityValueIndex = sourceModelElement.values.indexOf(targetModelElement);
      const enumerationIndex = targetModelElement.parents.indexOf(sourceModelElement);

      sourceModelElement.values.splice(entityValueIndex, 1);
      targetModelElement.parents.splice(enumerationIndex, 1);

      this.currentCachedFile.removeElement(targetModelElement.aspectModelUrn);
      this.maxgraphService.removeCells([edge.target]);
    }
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
