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
  EntityRenderService,
  MxGraphAttributeService,
  MxGraphHelper,
  MxGraphService,
  MxGraphShapeOverlayService,
  MxGraphVisitorHelper,
} from '@ame/mx-graph';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {useUpdater} from '@ame/utils';
import {inject, Injectable} from '@angular/core';
import {DefaultEntity, DefaultEntityInstance, DefaultEnumeration, NamedElement} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {BaseEntityModelService} from './base-entity-model.service';
import {BaseModelService} from './base-model-service';

@Injectable({providedIn: 'root'})
export class EntityModelService extends BaseModelService {
  private mxGraphShapeOverlayService = inject(MxGraphShapeOverlayService);
  private entityInstanceService = inject(EntityInstanceService);
  private mxGraphService = inject(MxGraphService);
  private mxGraphAttributeService = inject(MxGraphAttributeService);
  private entityRenderer = inject(EntityRenderService);
  private languageService = inject(SammLanguageSettingsService);
  private baseEntityModel = inject(BaseEntityModelService);

  isApplicable(metaModelElement: NamedElement): boolean {
    return metaModelElement instanceof DefaultEntity;
  }

  update(cell: Cell, form: {[key: string]: any}) {
    const modelElement = MxGraphHelper.getModelElementTest<DefaultEntity>(cell);

    if (form.editedProperties) {
      for (const property of modelElement.properties) {
        const newKeys = form.editedProperties[property.aspectModelUrn];
        if (!newKeys) {
          continue;
        }
        if (!modelElement.propertiesPayload[property.aspectModelUrn]) {
          modelElement.propertiesPayload[property.aspectModelUrn] = {} as any;
        }

        modelElement.propertiesPayload[property.aspectModelUrn].notInPayload = newKeys.notInPayload;
        modelElement.propertiesPayload[property.aspectModelUrn].optional = newKeys.optional;
        modelElement.propertiesPayload[property.aspectModelUrn].payloadName = newKeys.payloadName;
      }
    }

    super.update(cell, form);
    this.baseEntityModel.checkExtendedElement(modelElement, form?.extends);
    this.entityRenderer.update({cell});
  }

  delete(cell: Cell) {
    this.updateExtends(cell);
    super.delete(cell);
    const modelElement = MxGraphHelper.getModelElementTest<DefaultEntity>(cell);
    const outgoingEdges = this.mxGraphAttributeService.graphTest.getOutgoingEdges(cell, null);
    const incomingEdges = this.mxGraphAttributeService.graphTest.getIncomingEdges(cell, null);
    this.mxGraphShapeOverlayService.checkAndAddTopShapeActionIconTest(outgoingEdges, modelElement);
    this.mxGraphShapeOverlayService.checkAndAddShapeActionIconTest(incomingEdges, modelElement);

    this.entityInstanceService.onEntityRemove(modelElement, () => {
      if (!cell?.edges) {
        this.mxGraphService.removeCells([cell]);
        return;
      }

      const entityValuesToDelete = [];
      for (const edge of cell.edges) {
        const sourceModelElement = MxGraphHelper.getModelElementTest<NamedElement>(edge.source);
        if (sourceModelElement && this.loadedFilesService.isElementInCurrentFile(sourceModelElement)) {
          this.currentCachedFile.removeElement(modelElement.aspectModelUrn);
          useUpdater(sourceModelElement).delete(modelElement);
        }

        if (sourceModelElement instanceof DefaultEnumeration) {
          // we need to remove and add back the + button for enumeration
          this.mxGraphShapeOverlayService.removeComplexTypeShapeOverlaysTest(edge.source);
          this.mxGraphShapeOverlayService.addBottomShapeOverlayTest(edge.source);
        }

        if (sourceModelElement instanceof DefaultEntityInstance && edge.source.style.fillColor.includes('entityValue')) {
          entityValuesToDelete.push(edge.source);
          MxGraphHelper.removeRelation(sourceModelElement, modelElement);
        }
      }

      this.mxGraphService.updateEntityValuesWithCellReference(entityValuesToDelete);
      this.mxGraphService.removeCells([cell, ...entityValuesToDelete]);
    });
  }

  private updateExtends(cell: Cell) {
    const incomingEdges = this.mxGraphAttributeService.graphTest.getIncomingEdges(cell, null);
    for (const edge of incomingEdges) {
      const entity = MxGraphHelper.getModelElementTest<DefaultEntity>(edge.source);
      if (!(entity instanceof DefaultEntity)) {
        continue;
      }

      entity.extends_ = null;
      MxGraphHelper.removeRelation(entity, MxGraphHelper.getModelElementTest(cell));
      edge.source['configuration'].fields = MxGraphVisitorHelper.getElementProperties(entity, this.languageService);
      this.mxGraphService.graph.labelChanged(edge.source, MxGraphHelper.createPropertiesLabelTest(edge.source), null);
    }
  }
}
