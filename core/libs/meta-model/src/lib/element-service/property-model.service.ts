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
import {MxGraphAttributeService, MxGraphHelper, MxGraphService, MxGraphVisitorHelper, PropertyRenderService} from '@ame/mx-graph';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {useUpdater} from '@ame/utils';
import {inject, Injectable} from '@angular/core';
import {DefaultProperty, DefaultStructuredValue, HasExtends, NamedElement} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {BaseModelService} from './base-model-service';

@Injectable({providedIn: 'root'})
export class PropertyModelService extends BaseModelService {
  private entityInstanceService = inject(EntityInstanceService);
  private mxGraphService = inject(MxGraphService);
  private sammLangService = inject(SammLanguageSettingsService);
  private propertyRenderer = inject(PropertyRenderService);
  private mxGraphAttributeService = inject(MxGraphAttributeService);

  isApplicable(metaModelElement: NamedElement): boolean {
    return metaModelElement instanceof DefaultProperty;
  }

  update(cell: Cell, form: {[key: string]: any}) {
    const modelElement = MxGraphHelper.getModelElementTest<DefaultProperty>(cell);
    if (modelElement.extends_) {
      return;
    }

    modelElement.exampleValue = form.exampleValue;
    super.update(cell, form);

    modelElement.extends_ = form.extends instanceof DefaultProperty ? form.extends : null;
    this.updatePropertiesNames(cell);
    this.propertyRenderer.update({cell});
  }

  delete(cell: Cell) {
    const node = MxGraphHelper.getModelElementTest<DefaultProperty>(cell);

    const parents = this.mxGraphService.resolveParents(cell);
    for (const parent of parents) {
      const parentModel = MxGraphHelper.getModelElementTest(parent);
      if (parentModel instanceof DefaultStructuredValue) {
        useUpdater(parent).delete(node);
        MxGraphHelper.updateLabelTest(parent, this.mxGraphService.graph, this.sammLangService);
      }
    }

    this.updateExtends(cell);

    super.delete(cell);
    this.entityInstanceService.onPropertyRemove(node, () => {
      this.mxGraphService.removeCells([cell]);
    });
  }

  private updatePropertiesNames(cell: Cell) {
    const parents =
      this.mxGraphService.resolveParents(cell)?.filter(e => MxGraphHelper.getModelElementTest(e) instanceof DefaultProperty) || [];
    const modelElement = MxGraphHelper.getModelElementTest(cell);

    for (const parentCell of parents) {
      const parentModelElement = MxGraphHelper.getModelElementTest(parentCell);
      parentModelElement.name = `[${modelElement.name}]`;
      parentModelElement.aspectModelUrn = `${parentModelElement.aspectModelUrn.split('#')[0]}#${parentModelElement.name}`;
      this.updateCell(parentCell);
    }
  }

  private updateCell(cell: Cell) {
    cell['configuration'].fields = MxGraphVisitorHelper.getElementProperties(MxGraphHelper.getModelElementTest(cell), this.sammLangService);
    this.mxGraphService.graph.labelChanged(cell, MxGraphHelper.createPropertiesLabelTest(cell), null);
  }

  private updateExtends(cell: Cell, isDeleting = true) {
    const incomingEdges = this.mxGraphAttributeService.graphTest.getIncomingEdges(cell, null);
    for (const edge of incomingEdges) {
      const element = MxGraphHelper.getModelElementTest<HasExtends>(edge.source);
      if (element instanceof DefaultProperty && isDeleting) {
        element.extends_ = null;
        this.mxGraphService.removeCells([edge.source]);
        continue;
      }

      this.updateCell(edge.source);
    }
  }
}
