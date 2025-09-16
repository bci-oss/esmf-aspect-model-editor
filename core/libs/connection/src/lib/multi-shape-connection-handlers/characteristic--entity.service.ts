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
import {MxGraphAttributeService, MxGraphHelper, MxGraphService, MxGraphShapeOverlayService} from '@ame/mx-graph';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {NotificationsService} from '@ame/shared';
import {Injectable, inject} from '@angular/core';
import {
  DefaultCharacteristic,
  DefaultEntity,
  DefaultEntityInstance,
  DefaultEnumeration,
  DefaultProperty,
  DefaultStructuredValue,
  DefaultUnit,
} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {MultiShapeConnector} from '../models';

@Injectable({providedIn: 'root'})
export class CharacteristicEntityConnectionHandler implements MultiShapeConnector<DefaultCharacteristic, DefaultEntity> {
  private mxGraphService = inject(MxGraphService);
  private mxGraphAttributeService = inject(MxGraphAttributeService);
  private mxGraphShapeOverlayService = inject(MxGraphShapeOverlayService);
  private sammLangService = inject(SammLanguageSettingsService);
  private notificationsService = inject(NotificationsService);
  private loadedFiles = inject(LoadedFilesService);

  get currentCachedFile() {
    return this.loadedFiles.currentLoadedFile.cachedFile;
  }

  connect(parentMetaModel: DefaultCharacteristic, childMetaModel: DefaultEntity, parent: Cell, child: Cell): void {
    if (parentMetaModel instanceof DefaultStructuredValue) {
      return this.notificationsService.warning({
        title: 'Unable to connect elements',
        message: 'StructuredValue can only contain a scalar "string-like value space" value',
        timeout: 5000,
      });
    }

    parentMetaModel.dataType = childMetaModel;
    this.mxGraphAttributeService.graphTest.getOutgoingEdges(parent, null).forEach(outEdge => this.removeCells(outEdge, null));
    this.mxGraphShapeOverlayService.removeOverlayTest(parent, MxGraphHelper.getNewShapeOverlayButtonTest(parent));

    // Add icon when you simply connect an enumeration with an entity.
    if (parentMetaModel instanceof DefaultEnumeration) {
      // TODO User should be informed if he wants to change the entity, otherwise, all the values will be deleted.
      // TODO This should be done in the future.
      // if (!parentMetaModel.createdFromEditor) {
      //   parentMetaModel.values = [];
      // }
      this.mxGraphShapeOverlayService.removeOverlayTest(parent, MxGraphHelper.getRightOverlayButtonTest(parent));
      this.mxGraphShapeOverlayService.addComplexEnumerationShapeOverlayTest(parent);
      this.mxGraphShapeOverlayService.addBottomShapeOverlayTest(parent);
    }

    if (parentMetaModel.dataType) {
      MxGraphHelper.updateLabelTest(parent, this.mxGraphAttributeService.graphTest, this.sammLangService);
    }

    if (parentMetaModel.dataType?.isComplexType()) {
      this.updateChildPropertiesLabels(parent);
    }

    this.mxGraphService.assignToParent(child, parent);
    this.mxGraphService.formatShapes();
  }

  private updateChildPropertiesLabels(parent: Cell): void {
    const parentIncomingEdges = this.mxGraphAttributeService.graphTest.getIncomingEdges(parent, null);
    parentIncomingEdges.forEach(edge => {
      const edgeSourceMetaModelElement = MxGraphHelper.getModelElementTest(edge.source);
      if (edgeSourceMetaModelElement instanceof DefaultProperty) {
        // Remove example value for complex datatypes
        edgeSourceMetaModelElement.exampleValue = null;
        MxGraphHelper.updateLabelTest(edge.source, this.mxGraphAttributeService.graphTest, this.sammLangService);
      }
    });
  }

  private removeCells(edge: Cell, parent: Cell): void {
    const metaModel = MxGraphHelper.getModelElementTest(edge.target);

    if (metaModel instanceof DefaultUnit) return;

    // Remove icon if we delete the edge between enumeration and entity.
    if (metaModel instanceof DefaultEnumeration) {
      this.mxGraphShapeOverlayService.removeComplexTypeShapeOverlaysTest(parent);
    }

    // TODO Should be defined in more details
    if (metaModel instanceof DefaultEntityInstance) {
      for (const child of metaModel.children) {
        MxGraphHelper.removeRelation(metaModel, child);
      }

      this.mxGraphAttributeService.graphTest.getOutgoingEdges(edge.target, null).forEach(outEdge => this.removeCells(outEdge, null));
      this.mxGraphService.removeCells([edge.target]);
      this.currentCachedFile.removeElement(metaModel.aspectModelUrn);
    }

    const parentModel = MxGraphHelper.getModelElementTest(edge.source);
    MxGraphHelper.removeRelation(parentModel, metaModel);
    this.mxGraphService.removeCells([edge]);
  }
}
