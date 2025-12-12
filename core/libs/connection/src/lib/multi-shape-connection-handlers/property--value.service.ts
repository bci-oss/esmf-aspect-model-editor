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
import {NotificationsService} from '@ame/shared';
import {LanguageTranslationService} from '@ame/translation';
import {Injectable, inject} from '@angular/core';
import {DefaultProperty, DefaultValue} from '@esmf/aspect-model-loader';
import {mxgraph} from 'mxgraph-factory';

@Injectable({providedIn: 'root'})
export class PropertyValueConnectionHandler {
  private notificationService = inject(NotificationsService);
  private translate = inject(LanguageTranslationService);
  private mxGraphService = inject(MxGraphService);

  public connect(parentMetaModel: DefaultProperty, childMetaModel: DefaultValue, parentCell: mxgraph.mxCell, childCell: mxgraph.mxCell) {
    if (parentMetaModel.isPredefined) {
      this.notificationService.warning({title: this.translate.language.NOTIFICATION_SERVICE.CHILD_FOR_PREDEFINED_ELEMENT_ERROR});
      return;
    }

    if (MxGraphHelper.isEntityCycleInheritance(childCell, parentMetaModel, this.mxGraphService.graph)) {
      this.notificationService.warning({
        title: this.translate.language.NOTIFICATION_SERVICE.RECURSIVE_ELEMENTS,
        message: this.translate.language.NOTIFICATION_SERVICE.CIRCULAR_CONNECTION_MESSAGE,
        timeout: 5000,
      });
      return;
    }

    const currentExampleValue = parentMetaModel.exampleValue as DefaultValue;

    if (currentExampleValue && currentExampleValue.aspectModelUrn !== childMetaModel.aspectModelUrn) {
      const obsoleteEdge = this.mxGraphService.graph
        .getOutgoingEdges(parentCell)
        .find(edge => MxGraphHelper.getModelElement(edge.target) instanceof DefaultValue);

      const exampleValue = MxGraphHelper.getModelElement<DefaultValue>(obsoleteEdge.target);
      MxGraphHelper.removeRelation(parentMetaModel, exampleValue);

      this.mxGraphService.removeCells([obsoleteEdge]);
    }

    this.mxGraphService.assignToParent(childCell, parentCell);
  }
}
