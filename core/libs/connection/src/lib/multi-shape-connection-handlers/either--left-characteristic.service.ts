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

import {MxGraphAttributeService, MxGraphHelper, MxGraphService} from '@ame/mx-graph';
import {Injectable, inject} from '@angular/core';
import {DefaultCharacteristic, DefaultEither} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {MultiShapeConnector} from '../models';

@Injectable({providedIn: 'root'})
export class EitherCharacteristicLeftConnectionHandler implements MultiShapeConnector<DefaultEither, DefaultCharacteristic> {
  private mxGraphService = inject(MxGraphService);
  private mxGraphAttributeService = inject(MxGraphAttributeService);

  public connect(parentMetaModel: DefaultEither, childMetaModel: DefaultCharacteristic, parent: Cell, child: Cell) {
    parentMetaModel.left = childMetaModel;
    this.mxGraphAttributeService.graphTest.getOutgoingEdges(parent, null).forEach(outEdge => {
      if (outEdge.target && (outEdge.target as any).getMetaModelElement().aspectModelUrn === parentMetaModel.left?.aspectModelUrn) {
        MxGraphHelper.removeRelation(parentMetaModel, parentMetaModel.left);
        this.mxGraphService.removeCells([parent.removeEdge(outEdge, true)]);
      }
    });

    this.mxGraphService.assignToParent(child, parent);
    this.mxGraphService.formatShapes();
  }
}
