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
import {
  ModelInfo,
  MxGraphAttributeService,
  MxGraphHelper,
  MxGraphService,
  MxGraphShapeOverlayService,
  TraitRenderService,
} from '@ame/mx-graph';
import {inject, Injectable} from '@angular/core';
import {DefaultCharacteristic, DefaultEither, DefaultEntity, DefaultProperty, DefaultTrait, NamedElement} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {BaseModelService} from './base-model-service';

interface EitherInformation {
  urn: string;
  left: string;
  right: string;
}

@Injectable({providedIn: 'root'})
export class TraitModelService extends BaseModelService {
  private mxGraphAttributeService = inject(MxGraphAttributeService);
  private mxGraphShapeOverlayService = inject(MxGraphShapeOverlayService);
  private mxGraphService = inject(MxGraphService);
  private shapeConnectorService = inject(ShapeConnectorService);
  private traitRendererService = inject(TraitRenderService);

  update(cell: Cell, form: {[key: string]: any}) {
    super.update(cell, form);
    this.traitRendererService.update({cell});
  }

  isApplicable(metaModelElement: NamedElement): boolean {
    return metaModelElement instanceof DefaultTrait;
  }

  delete(cell: Cell) {
    const sourceTargetPair = this.getSourceTargetPairForReconnect(cell);

    const informationOfEithers: Array<EitherInformation> = [];
    Array.from(sourceTargetPair.keys()).forEach(source => {
      const sourceMetaModel = MxGraphHelper.getModelElementTest(source);
      if (sourceMetaModel instanceof DefaultEither) {
        informationOfEithers.push({
          urn: sourceMetaModel.aspectModelUrn,
          left:
            sourceMetaModel.left instanceof DefaultTrait
              ? sourceMetaModel.left?.baseCharacteristic?.aspectModelUrn
              : sourceMetaModel.left?.aspectModelUrn,
          right:
            sourceMetaModel.right instanceof DefaultTrait
              ? sourceMetaModel.right?.baseCharacteristic?.aspectModelUrn
              : sourceMetaModel.right?.aspectModelUrn,
        });
      }
    });

    super.delete(cell);
    const elementModel = MxGraphHelper.getModelElementTest(cell);
    const outgoingEdges = this.mxGraphAttributeService.graphTest.getOutgoingEdges(cell, null);
    const incomingEdges = this.mxGraphAttributeService.graphTest.getIncomingEdges(cell, null);
    this.mxGraphShapeOverlayService.checkAndAddTopShapeActionIconTest(outgoingEdges, elementModel);
    this.mxGraphShapeOverlayService.checkAndAddShapeActionIconTest(incomingEdges, elementModel);
    this.mxGraphService.removeCells([cell]);
    this.reconnectShapePair(sourceTargetPair, informationOfEithers);
  }

  // Used to reconnect Characteristic with Properties if you delete theTrait
  private getSourceTargetPairForReconnect(cell: Cell) {
    const sourceTargetPair = new Map();
    const elementModel = MxGraphHelper.getModelElementTest(cell);
    if (this.loadedFilesService.isElementInCurrentFile(elementModel)) {
      const incomingEdges = this.mxGraphAttributeService.graphTest.getIncomingEdges(cell, null);
      const outgoingEdges = this.mxGraphAttributeService.graphTest.getOutgoingEdges(cell, null);

      // outgoingEdges[0].target can be characteristic or constraint.
      // In this case we need to make sure that we relink property only to characteristic
      const characteristicEdge = outgoingEdges.find(
        edge => MxGraphHelper.getModelElementTest(edge.target) instanceof DefaultCharacteristic,
      );
      if (incomingEdges.length && outgoingEdges.length && characteristicEdge) {
        incomingEdges.forEach(incomingEdge => sourceTargetPair.set(incomingEdge.source, characteristicEdge.target));
      }
    }
    return sourceTargetPair;
  }

  // This is for the special case when a trait is deleted and thus a property is automatically connected with a characteristic.
  private reconnectShapePair(sourceTargetPair: Map<any, any>, informationOfEithers: Array<EitherInformation>) {
    sourceTargetPair.forEach((target, source) => {
      let modelInfo = null;

      const targetModelElement = MxGraphHelper.getModelElementTest(target);
      const sourceModelElement = MxGraphHelper.getModelElementTest(source);

      if (sourceModelElement instanceof DefaultEither) {
        const either = informationOfEithers.find(eitherInfo => eitherInfo.urn === sourceModelElement.aspectModelUrn);
        if (either.left === targetModelElement.aspectModelUrn) {
          modelInfo = ModelInfo.IS_EITHER_LEFT;
        } else if (either.right == targetModelElement.aspectModelUrn) {
          modelInfo = ModelInfo.IS_EITHER_RIGHT;
        }
      }

      const newConnection = this.shapeConnectorService.connectShapes(sourceModelElement, targetModelElement, source, target, modelInfo);

      if (newConnection) {
        this.mxGraphShapeOverlayService.removeOverlayTest(target, MxGraphHelper.getTopOverlayButtonTest(target));
        this.mxGraphShapeOverlayService.removeOverlaysByConnectionTest(sourceModelElement, source);
        this.mxGraphShapeOverlayService.addTopShapeOverlayTest(target);
        if (
          targetModelElement instanceof DefaultCharacteristic &&
          sourceModelElement instanceof DefaultProperty &&
          !(targetModelElement.dataType instanceof DefaultEntity)
        ) {
          this.mxGraphShapeOverlayService.addBottomShapeOverlayTest(target);
        }
        this.mxGraphService.formatShapes();
      }
    });
  }
}
