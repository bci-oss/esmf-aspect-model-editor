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

import {MxGraphService} from '@ame/mx-graph';
import {inject, Injectable} from '@angular/core';
import {DefaultCharacteristic, DefaultConstraint, DefaultTrait} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {MultiShapeConnector} from '../models';

@Injectable({providedIn: 'root'})
export class TraitWithCharacteristicOrConstraintConnectionHandler
  implements MultiShapeConnector<DefaultTrait, DefaultCharacteristic | DefaultConstraint>
{
  private mxGraphService = inject(MxGraphService);

  public connect(parentMetaModel: DefaultTrait, childMetaModel: DefaultCharacteristic, parent: Cell, child: Cell) {
    if (childMetaModel instanceof DefaultConstraint) {
      parentMetaModel.constraints.push(childMetaModel);
    } else parentMetaModel.baseCharacteristic = childMetaModel;
    this.mxGraphService.assignToParent(child, parent);
  }
}
