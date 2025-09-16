/*
 * Copyright (c) 2024 Robert Bosch Manufacturing Solutions GmbH
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
import {ShapeConnectorService} from '@ame/connection';
import {DefaultFilter, FiltersService} from '@ame/loader-filters';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {Injectable, inject} from '@angular/core';
import {DefaultEntity, DefaultProperty, PredefinedEntitiesEnum, SammE} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {MxGraphHelper, MxGraphVisitorHelper} from '../../helpers';
import {MxGraphRenderer} from '../../renderers';
import {MxGraphShapeOverlayService} from '../mx-graph-shape-overlay.service';
import {MxGraphService} from '../mx-graph.service';

@Injectable({providedIn: 'root'})
export class BaseEntityRendererService {
  private filtersService = inject(FiltersService);
  private loadedFiles = inject(LoadedFilesService);
  private mxGraphService = inject(MxGraphService);
  private sammLangService = inject(SammLanguageSettingsService);
  private shapeConnectorService = inject(ShapeConnectorService);
  private mxGraphShapeOverlayService = inject(MxGraphShapeOverlayService);

  public handleExtendsElement(cell: Cell) {
    const metaModelElement = MxGraphHelper.getModelElementTest<DefaultEntity>(cell);
    const currentPredefinedAbstractEntity = this.hasPredefinedAbstractEntity(cell);

    if (currentPredefinedAbstractEntity && this.isSameExtendedElement(cell, currentPredefinedAbstractEntity)) {
      return;
    }

    if (this.isAlreadyConnected(cell)) {
      return;
    }

    if (!metaModelElement.extends_) {
      this.cleanUpAbstractConnections(cell);
      return;
    }

    if (currentPredefinedAbstractEntity) {
      this.cleanUpAbstractConnections(cell);
    }

    const mxGraphRenderer = new MxGraphRenderer(
      this.mxGraphService,
      this.mxGraphShapeOverlayService,
      this.sammLangService,
      this.loadedFiles.currentLoadedFile.rdfModel,
    );

    const extendsElement = metaModelElement.extends_;
    if (extendsElement.isPredefined) {
      let predefinedCell = this.mxGraphService.resolveCellByModelElement(extendsElement);
      if (predefinedCell) {
        this.shapeConnectorService.connectShapes(metaModelElement, extendsElement, cell, predefinedCell);
        return;
      }

      const [filteredElement] = new DefaultFilter(this.loadedFiles).filter([extendsElement]);
      mxGraphRenderer.render(filteredElement, cell);
      predefinedCell = this.mxGraphService.resolveCellByModelElement(extendsElement);

      // setting to null to create the properties after abstract properties
      metaModelElement.extends_ = null;
      this.shapeConnectorService.connectShapes(metaModelElement, extendsElement, cell, predefinedCell);
      return;
    }

    const cachedEntity = this.loadedFiles.currentLoadedFile.cachedFile.resolveInstance(extendsElement);
    const resolvedCell = this.mxGraphService.resolveCellByModelElement(cachedEntity);
    const entityCell = resolvedCell
      ? resolvedCell
      : this.mxGraphService.renderModelElement(this.filtersService.createNode(extendsElement, {parent: metaModelElement}));
    this.shapeConnectorService.connectShapes(metaModelElement, extendsElement, cell, entityCell);

    this.updateCell(cell);
  }

  private hasPredefinedAbstractEntity(cell: Cell): Cell {
    const children = this.mxGraphService.graph.getOutgoingEdges(cell, null).map(e => e.target);

    for (const child of children) {
      const modelElement = MxGraphHelper.getModelElementTest<DefaultEntity>(child);
      if (modelElement?.aspectModelUrn.startsWith(SammE.versionLessUri) && modelElement?.name in PredefinedEntitiesEnum) {
        return child;
      }
    }

    return null;
  }

  private isSameExtendedElement(cell: Cell, child: Cell) {
    const modelElement = MxGraphHelper.getModelElementTest<DefaultEntity>(cell);
    const childModel = MxGraphHelper.getModelElementTest<DefaultEntity>(child);
    return childModel && modelElement.extends_ && modelElement.extends_?.aspectModelUrn === childModel?.aspectModelUrn;
  }

  private isAlreadyConnected(cell: Cell) {
    const modelElement = MxGraphHelper.getModelElementTest<DefaultEntity>(cell);
    const extendedElement = modelElement.extends_;

    if (!extendedElement) {
      return false;
    }

    return this.mxGraphService.graph
      .getOutgoingEdges(cell, null)
      .some(({target}) => MxGraphHelper.getModelElementTest(target).aspectModelUrn === extendedElement.aspectModelUrn);
  }

  private cleanUpAbstractConnections(cell: Cell) {
    const childrenEdges = this.mxGraphService.graph.getOutgoingEdges(cell, null);

    const entityChildEdge = childrenEdges.find(edge => MxGraphHelper.getModelElementTest(edge.target) instanceof DefaultEntity);

    if (!entityChildEdge) {
      return;
    }

    const entityChildModelElement = MxGraphHelper.getModelElementTest<DefaultEntity>(entityChildEdge.target);
    const extendedProperties = childrenEdges
      .map(e => e.target)
      .filter(c => {
        const childModelElement = MxGraphHelper.getModelElementTest(c);
        if (!(childModelElement instanceof DefaultProperty)) {
          return false;
        }

        return entityChildModelElement.properties.some(property => property.aspectModelUrn === childModelElement.extends_?.aspectModelUrn);
      });

    this.mxGraphService.removeCells([entityChildEdge, ...extendedProperties]);
  }

  private updateCell(cell: Cell) {
    cell['configuration'].fields = MxGraphVisitorHelper.getElementProperties(MxGraphHelper.getModelElementTest(cell), this.sammLangService);
    this.mxGraphService.graph.labelChanged(cell, MxGraphHelper.createPropertiesLabelTest(cell), null);
  }
}
