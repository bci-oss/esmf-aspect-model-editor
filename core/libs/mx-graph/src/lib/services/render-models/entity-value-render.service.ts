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

import {ShapeConnectorService} from '@ame/connection';
import {FiltersService} from '@ame/loader-filters';
import {Injectable, inject} from '@angular/core';
import {DefaultEntity, DefaultEntityInstance, DefaultEnumeration, DefaultState} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {MxGraphHelper} from '../../helpers';
import {EdgeStyles, RendererUpdatePayload} from '../../models';
import {MxGraphAttributeService} from '../mx-graph-attribute.service';
import {MxGraphShapeOverlayService} from '../mx-graph-shape-overlay.service';
import {BaseRenderService} from './base-render-service';

@Injectable({providedIn: 'root'})
export class EntityValueRenderService extends BaseRenderService {
  private filtersService = inject(FiltersService);
  private mxGraphShapeOverlay = inject(MxGraphShapeOverlayService);
  private shapeConnectorService = inject(ShapeConnectorService);
  private mxGraphAttributeService = inject(MxGraphAttributeService);

  isApplicable(cell: Cell): boolean {
    return MxGraphHelper.getModelElementTest(cell) instanceof DefaultEntityInstance;
  }

  update({cell}: RendererUpdatePayload) {
    const modelElement = MxGraphHelper.getModelElementTest<DefaultEntityInstance>(cell);

    this.removeChildrenEntityValuesIfNecessary(cell);

    for (const [, value] of modelElement.getTuples() || []) {
      if (!(value instanceof DefaultEntityInstance)) {
        continue;
      }

      if (this.isChildOf(cell, value)) {
        continue;
      }

      this.connectEntityValues(modelElement, value);
    }

    super.update({cell});
  }

  create(modelElement: DefaultEntityInstance, parent: Cell) {
    this.shapeConnectorService.createAndConnectShape(modelElement, parent);
    this.mxGraphShapeOverlay.removeOverlaysByConnectionTest(modelElement, parent);

    const parentModelElement = MxGraphHelper.getModelElementTest<DefaultEnumeration>(parent);
    MxGraphHelper.establishRelation(parentModelElement, modelElement);
    MxGraphHelper.establishRelation(modelElement, parentModelElement.dataType as DefaultEntity);
    if (parentModelElement.dataType instanceof DefaultEntity) {
      this.connectEntityValueWithChildren(modelElement);
    }
  }

  delete(cell: Cell) {
    const modelElement = MxGraphHelper.getModelElementTest<DefaultEntityInstance>(cell);
    const incomingEdges = this.mxGraphAttributeService.graphTest.getIncomingEdges(cell, null);
    this.updateEnumeration(modelElement, incomingEdges);
    this.mxGraphService.updateEnumerationsWithEntityValue(modelElement);
    this.mxGraphService.updateEntityValuesWithReference(modelElement);
    this.mxGraphService.removeCells([cell]);
  }

  private updateEnumeration(entityValue: DefaultEntityInstance, incomingEdges: Array<Cell>) {
    const edge = incomingEdges.find(incomingEdge => MxGraphHelper.getModelElementTest(incomingEdge?.source) instanceof DefaultEnumeration);
    const metaModelElement = MxGraphHelper.getModelElementTest(edge?.source);

    if (!(metaModelElement instanceof DefaultEnumeration)) {
      return;
    }

    const entityValueIndex = metaModelElement.values.indexOf(entityValue);
    if (entityValueIndex >= 0) {
      metaModelElement.values.splice(entityValueIndex, 1);
    }
  }

  deleteByModel(modelElement: DefaultEntityInstance) {
    const modelCell = this.mxGraphService
      .getAllCells()
      .find(cell => MxGraphHelper.getModelElementTest(cell).aspectModelUrn === modelElement.aspectModelUrn);

    if (!modelCell) {
      return;
    }

    this.delete(modelCell);
  }

  private connectEntityValueWithChildren(modelElement: DefaultEntityInstance) {
    const entityInstances = Array.from(modelElement.assertions.values()).flat();
    for (const property of entityInstances) {
      if (!(property instanceof DefaultEntityInstance)) {
        continue;
      }

      this.connectEntityValues(modelElement, property);
      this.connectEntityValueWithChildren(property);
    }
  }

  private isChildOf(parent: Cell, child: DefaultEntityInstance) {
    return this.mxGraphService.graph
      .getOutgoingEdges(parent, null)
      .find(edge => MxGraphHelper.getModelElementTest(edge.target).aspectModelUrn === child?.aspectModelUrn);
  }

  private connectEntityValues(parent: DefaultEntityInstance, child: DefaultEntityInstance) {
    const inGraph = this.inMxGraph(child);

    if (!inGraph) {
      // Render ChildEntityValue
      this.mxGraphService.renderModelElement(this.filtersService.createNode(child, {parent}));

      // Connect ChildEntityValue with its entity
      this.mxGraphService.assignToParent(
        this.mxGraphService.resolveCellByModelElement(child.type),
        this.mxGraphService.resolveCellByModelElement(child),
        EdgeStyles.entityValueEntityEdge,
      );
    }

    // Connect EntityValue with ChildEntityValue
    this.mxGraphService.assignToParent(
      this.mxGraphService.resolveCellByModelElement(child),
      this.mxGraphService.resolveCellByModelElement(parent),
      EdgeStyles.entityValueEntityEdge,
    );
  }

  private removeChildrenEntityValuesIfNecessary(cell: Cell) {
    const children = this.mxGraphService.graph.getOutgoingEdges(cell, null);
    const modelElement = MxGraphHelper.getModelElementTest<DefaultEntityInstance>(cell);

    if (!children.length) {
      return;
    }

    children
      .map(edge => edge.target)
      .filter(child => child && child.id !== cell.id && MxGraphHelper.getModelElementTest(child) instanceof DefaultEntityInstance)
      .forEach(child => {
        const connectingEdge: Cell = this.mxGraphService.graph.getIncomingEdges(child, null).find(edge => edge?.source == cell);
        const isLinkedToOtherEntityValues = this.mxGraphService.graph.getOutgoingEdges(child, null).some(edge => {
          if (!edge?.source) {
            return false;
          }

          const parentModelElement = MxGraphHelper.getModelElementTest(edge.source);
          if (
            !(parentModelElement instanceof DefaultEntityInstance) ||
            !(parentModelElement instanceof DefaultEnumeration) ||
            !(parentModelElement instanceof DefaultState)
          ) {
            return false;
          }

          return parentModelElement.aspectModelUrn !== modelElement.aspectModelUrn;
        });
        const childModelElement = MxGraphHelper.getModelElementTest(child);
        const entityValues: DefaultEntityInstance[] = modelElement.getValues<DefaultEntityInstance[]>();
        const isPartOfTheModel = entityValues.some(entityValue => entityValue.aspectModelUrn === childModelElement.aspectModelUrn);
        if (!isLinkedToOtherEntityValues && !childModelElement.parents?.length && !isPartOfTheModel) {
          this.delete(child);
        } else if (!isLinkedToOtherEntityValues && childModelElement.parents?.length > 0 && !isPartOfTheModel && connectingEdge) {
          this.mxGraphService.removeCells([connectingEdge]);
        }
      });
  }
}
