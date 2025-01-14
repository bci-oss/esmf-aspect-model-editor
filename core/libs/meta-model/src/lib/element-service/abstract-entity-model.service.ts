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

import {EntityInstanceService} from '@ame/editor';
import {
  AbstractEntityRenderService,
  MxGraphAttributeService,
  MxGraphHelper,
  MxGraphService,
  MxGraphShapeOverlayService,
  MxGraphVisitorHelper,
} from '@ame/mx-graph';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {Injectable} from '@angular/core';
import {DefaultEntity, DefaultEntityInstance, DefaultEnumeration, DefaultProperty, NamedElement} from '@esmf/aspect-model-loader';
import {mxgraph} from 'mxgraph-factory';
import {BaseEntityModelService} from './base-entity-model.service';
import {BaseModelService} from './base-model-service';

@Injectable({providedIn: 'root'})
export class AbstractEntityModelService extends BaseModelService {
  constructor(
    private mxGraphShapeOverlayService: MxGraphShapeOverlayService,
    private entityInstanceService: EntityInstanceService,
    private mxGraphService: MxGraphService,
    private mxGraphAttributeService: MxGraphAttributeService,
    private abstractEntityRenderer: AbstractEntityRenderService,
    private baseEntityModel: BaseEntityModelService,
    private languageService: SammLanguageSettingsService,
  ) {
    super();
  }

  isApplicable(metaModelElement: NamedElement): boolean {
    return metaModelElement instanceof DefaultEntity && metaModelElement.isAbstractEntity();
  }

  update(cell: mxgraph.mxCell, form: {[key: string]: any}) {
    const metaModelElement = MxGraphHelper.getModelElement<DefaultEntity>(cell);

    if (form.editedProperties) {
      for (const property of metaModelElement.properties) {
        const newKeys: Record<string, any> = form.editedProperties[property.aspectModelUrn];
        property.notInPayload = newKeys.notInPayload;
        property.optional = newKeys.optional;
        property.payloadName = newKeys.payloadName;
      }

      this.namespacesCacheService.currentCachedFile
        .getCachedEntityValues()
        ?.filter((entityValue: DefaultEntityInstance) => entityValue.type.aspectModelUrn === metaModelElement.aspectModelUrn)
        ?.forEach((entityValue: DefaultEntityInstance) => {
          for (const entityValueProperty of entityValue.properties) {
            const property = metaModelElement.properties.find(property => property.name === entityValueProperty.key.property.name);
            entityValueProperty.key.keys.optional = property.optional;
            entityValueProperty.key.keys.notInPayload = property.notInPayload;
            entityValueProperty.key.keys.payloadName = property.payloadName;
          }
        });
    }

    super.update(cell, form);
    this.baseEntityModel.checkExtendedElement(metaModelElement, form?.extends);
    this.abstractEntityRenderer.update({cell});
  }

  delete(cell: mxgraph.mxCell) {
    const modelElement = MxGraphHelper.getModelElement<DefaultEntity>(cell);
    const outgoingEdges = this.mxGraphAttributeService.graph.getOutgoingEdges(cell);
    const incomingEdges = this.mxGraphAttributeService.graph.getIncomingEdges(cell);

    const extendingProperties = [];
    for (const edge of incomingEdges) {
      const properties = this.mxGraphService.graph
        .getOutgoingEdges(edge.source)
        .filter(e => {
          const property = MxGraphHelper.getModelElement<DefaultProperty>(e.target);
          return property instanceof DefaultProperty && !!property.extends_;
        })
        .map(e => e.target);
      extendingProperties.push(...properties);

      const entity = MxGraphHelper.getModelElement<DefaultEntity>(edge.source);
      entity.extends_ = null;

      MxGraphHelper.removeRelation(entity, modelElement);
      for (const property of properties) {
        MxGraphHelper.removeRelation(entity, MxGraphHelper.getModelElement(property));
      }

      edge.source['configuration'].fields = MxGraphVisitorHelper.getElementProperties(entity, this.languageService);
      this.mxGraphService.graph.labelChanged(edge.source, entity);
    }

    this.mxGraphService.removeCells(extendingProperties);
    this.namespacesCacheService.currentCachedFile.removeElement(modelElement.aspectModelUrn);
    super.delete(cell);

    this.mxGraphShapeOverlayService.checkAndAddTopShapeActionIcon(outgoingEdges, modelElement);
    this.mxGraphShapeOverlayService.checkAndAddShapeActionIcon(incomingEdges, modelElement);
    this.entityInstanceService.onEntityRemove(modelElement, () => {
      if (!cell?.edges) {
        this.mxGraphService.removeCells([cell]);
        return;
      }

      const entityValuesToDelete = [];
      for (const edge of cell.edges) {
        const modelElement = MxGraphHelper.getModelElement(edge.source);
        if (modelElement && !modelElement.isExternalReference()) {
          this.currentCachedFile.removeElement(modelElement.aspectModelUrn);
          (<NamedElement>modelElement).delete(modelElement);
        }

        if (modelElement instanceof DefaultEnumeration) {
          // we need to remove and add back the + button for enumeration
          this.mxGraphShapeOverlayService.removeComplexTypeShapeOverlays(edge.source);
          this.mxGraphShapeOverlayService.addBottomShapeOverlay(edge.source);
        }

        if (modelElement instanceof DefaultEntityInstance && edge.source.style.includes('entityValue')) {
          entityValuesToDelete.push(edge.source);
        }
      }
      this.mxGraphService.updateEntityValuesWithCellReference(entityValuesToDelete);
      this.mxGraphService.removeCells([cell, ...entityValuesToDelete]);
    });
  }
}
