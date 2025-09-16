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

import {MxGraphHelper, MxGraphService} from '@ame/mx-graph';
import {Injectable, inject} from '@angular/core';
import {DefaultCharacteristic, DefaultQuantifiable, DefaultUnit} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {MultiShapeConnector} from '../models';

@Injectable({providedIn: 'root'})
export class CharacteristicUnitConnectionHandler implements MultiShapeConnector<DefaultCharacteristic, DefaultUnit> {
  private mxGraphService = inject(MxGraphService);

  public connect(parentMetaModel: DefaultCharacteristic, childMetaModel: DefaultUnit, parent: Cell, child: Cell) {
    if (!(parentMetaModel instanceof DefaultQuantifiable)) {
      return;
    }

    if (parentMetaModel.unit && parentMetaModel.unit !== childMetaModel) {
      const obsoleteEdge = this.mxGraphService.graph
        .getOutgoingEdges(parent, null)
        .find(edge => MxGraphHelper.getModelElementTest(edge.target) instanceof DefaultUnit);

      const unit = MxGraphHelper.getModelElementTest<DefaultUnit>(obsoleteEdge.target);
      MxGraphHelper.removeRelation(parentMetaModel, unit);

      if (unit.isPredefined) {
        this.mxGraphService.removeCells([obsoleteEdge.target], true);
      } else {
        this.mxGraphService.removeCells([obsoleteEdge]);
      }
    }
    parentMetaModel.unit = childMetaModel;
    this.mxGraphService.assignToParent(child, parent);
  }
}
