/*
 * Copyright (c) 2026 Robert Bosch Manufacturing Solutions GmbH
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
import {MaxGraphHelper, MaxGraphVisitorHelper} from '../../helpers';
import {RendererUpdatePayload} from '../../models';
import {MaxGraphAttributeService} from '../max-graph-attribute.service';
import {MaxGraphService} from '../max-graph.service';

export abstract class BaseRenderService {
  protected maxgraphService = inject(MaxGraphService);
  protected sammLangService = inject(SammLanguageSettingsService);
  protected loadedFilesService = inject(LoadedFilesService);
  protected maxgraphAttributeService = inject(MaxGraphAttributeService);

  get graph(): Graph {
    return this.maxgraphService.graph;
  }

  public abstract isApplicable(cell: Cell): boolean;

  public update({cell, callback}: RendererUpdatePayload) {
    const modelElement = MaxGraphHelper.getModelElement(cell);

    cell.setId(modelElement.name);
    cell.setAttribute('name', modelElement.name);

    cell['configuration'].fields = MaxGraphVisitorHelper.getElementProperties(modelElement, this.sammLangService);
    cell['configuration'].baseProperties = MaxGraphVisitorHelper.getModelInfo(modelElement, this.loadedFilesService.currentLoadedFile);
    this.graph.labelChanged(cell, MaxGraphHelper.createPropertiesLabel(cell), null);

    if (typeof callback === 'function') {
      callback();
    }
    this.maxgraphService.formatCell(cell);
    this.maxgraphService.formatShapes();
  }

  protected renderOptionalProperties(cell: Cell) {
    const modelElement = MaxGraphHelper.getModelElement<DefaultAspect | DefaultEntity>(cell);
    this.graph.getOutgoingEdges(cell, null)?.forEach((e: Cell) => {
      const property = MaxGraphHelper.getModelElement(e.target);
      if (!(property instanceof DefaultProperty)) {
        return;
      }

      this.maxgraphService.removeCells([e]);
      MaxGraphHelper.establishRelation(modelElement, property);
      this.graph.insertEdge(this.graph.getDefaultParent(), null, null, e.source, e.target, {
        baseStyleNames: [modelElement.propertiesPayload[property.aspectModelUrn]?.optional ? 'optionalPropertyEdge' : 'defaultEdge'],
      });
    });
  }

  protected inMaxgraph(modelElement: NamedElement): Cell {
    return this.maxgraphService
      ?.getAllCells()
      ?.find(cell => MaxGraphHelper.getModelElement(cell)?.aspectModelUrn === modelElement?.aspectModelUrn);
  }

  protected renderParents(cell: Cell) {
    const parents = this.maxgraphService.resolveParents(cell);

    for (const parent of parents) {
      const parentElementModel = MaxGraphHelper.getModelElement(parent);
      parent['configuration'].fields = MaxGraphVisitorHelper.getElementProperties(parentElementModel, this.sammLangService);
      parent['configuration'].baseProperties = MaxGraphVisitorHelper.getModelInfo(
        parentElementModel,
        this.loadedFilesService.currentLoadedFile,
      );
      this.graph.labelChanged(parent, MaxGraphHelper.createPropertiesLabel(parent), null);
    }
  }

  protected refreshPropertiesLabel(cell: Cell, modelElement: NamedElement) {
    cell['configuration'].fields = MaxGraphVisitorHelper.getElementProperties(modelElement, this.sammLangService);
    this.maxgraphAttributeService.graph.labelChanged(cell, MaxGraphHelper.createPropertiesLabel(cell), null);
  }
}
