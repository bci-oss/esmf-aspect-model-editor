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
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {inject} from '@angular/core';
import {DefaultAspect, DefaultEntity, DefaultProperty, NamedElement} from '@esmf/aspect-model-loader';
import {Cell, Graph} from '@maxgraph/core';
import {MxGraphHelper, MxGraphVisitorHelper} from '../../helpers';
import {RendererUpdatePayload} from '../../models';
import {MxGraphService} from '../mx-graph.service';

export abstract class BaseRenderService {
  protected mxGraphService = inject(MxGraphService);
  protected sammLangService = inject(SammLanguageSettingsService);
  protected loadedFilesService = inject(LoadedFilesService);

  get graph(): Graph {
    return this.mxGraphService.graph;
  }

  public abstract isApplicable(cell: Cell): boolean;

  public update({cell, callback}: RendererUpdatePayload) {
    const modelElement = MxGraphHelper.getModelElementTest(cell);

    cell.setId(modelElement.name);
    cell.setAttribute('name', modelElement.name);

    cell['configuration'].fields = MxGraphVisitorHelper.getElementProperties(modelElement, this.sammLangService);
    cell['configuration'].baseProperties = MxGraphVisitorHelper.getModelInfo(modelElement, this.loadedFilesService.currentLoadedFile);
    this.graph.labelChanged(cell, MxGraphHelper.createPropertiesLabelTest(cell), null);

    if (typeof callback === 'function') {
      callback();
    }
    this.mxGraphService.formatCell(cell);
    this.mxGraphService.formatShapes();
  }

  protected renderOptionalProperties(cell: Cell) {
    const modelElement = MxGraphHelper.getModelElementTest<DefaultAspect | DefaultEntity>(cell);
    this.graph.getOutgoingEdges(cell, null)?.forEach((e: Cell) => {
      const property = MxGraphHelper.getModelElementTest(e.target);
      if (!(property instanceof DefaultProperty)) {
        return;
      }

      this.mxGraphService.removeCells([e]);
      MxGraphHelper.establishRelation(modelElement, property);
      this.graph.insertEdge(this.graph.getDefaultParent(), null, null, e.source, e.target, {
        baseStyleNames: [modelElement.propertiesPayload[property.aspectModelUrn]?.optional ? 'optionalPropertyEdge' : 'defaultEdge'],
      });
    });
  }

  protected inMxGraph(modelElement: NamedElement): Cell {
    return this.mxGraphService
      ?.getAllCells()
      ?.find(cell => MxGraphHelper.getModelElementTest(cell)?.aspectModelUrn === modelElement?.aspectModelUrn);
  }

  protected renderParents(cell: Cell) {
    const parents = this.mxGraphService.resolveParents(cell);

    for (const parent of parents) {
      const parentElementModel = MxGraphHelper.getModelElementTest(parent);
      parent['configuration'].fields = MxGraphVisitorHelper.getElementProperties(parentElementModel, this.sammLangService);
      parent['configuration'].baseProperties = MxGraphVisitorHelper.getModelInfo(
        parentElementModel,
        this.loadedFilesService.currentLoadedFile,
      );
      this.graph.labelChanged(parent, MxGraphHelper.createPropertiesLabelTest(parent), null);
    }
  }
}
