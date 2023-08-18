/*
 * Copyright (c) 2023 Robert Bosch Manufacturing Solutions GmbH
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

import {Injectable} from '@angular/core';
import {BaseMetaModelElement} from '@ame/meta-model';
import {MxGraphAttributeService, MxGraphHelper, MxGraphService, MxGraphShapeSelectorService, mxEvent, mxUtils} from '@ame/mx-graph';
import {BindingsService} from '@ame/shared';
import {mxgraph} from 'mxgraph-factory';
import {EditorService} from '../../editor.service';
import {BehaviorSubject} from 'rxjs';

const PURPLE_BLUE = '#448ee4';
const BLACK = 'black';

@Injectable({providedIn: 'root'})
export class ShapeSettingsService {
  public selectedShapeForUpdate: mxgraph.mxCell;
  public isShapeSettingOpened = false;
  public modelElement: BaseMetaModelElement = null;
  private shapesToHighlight: Array<mxgraph.mxCell> | null;

  onSettingsOpened$ = new BehaviorSubject(this.isShapeSettingOpened);

  constructor(
    private mxGraphAttributeService: MxGraphAttributeService,
    private mxGraphService: MxGraphService,
    private mxGraphShapeSelectorService: MxGraphShapeSelectorService,
    private bindingsService: BindingsService,
    private editorService: EditorService
  ) {}

  setGraphListeners() {
    this.setMoveCellsListener();
    this.setFoldListener();
    this.setDblClickListener();
  }

  setContextMenuActions() {
    this.bindingsService.registerAction('editElement', () => this.editSelectedCell());
    this.bindingsService.registerAction('deleteElement', () => this.editorService.deleteSelectedElements());
  }

  setHotKeysActions() {
    this.editorService.bindAction(
      'deleteElement',
      mxUtils.bind(this, () => this.editorService.deleteSelectedElements())
    );

    this.mxGraphService.graph.container.addEventListener('wheel', evt => {
      if (evt.altKey) {
        evt.preventDefault();
      }
    });
  }

  setSelectCellListener() {
    this.mxGraphAttributeService.graph
      .getSelectionModel()
      .addListener(mxEvent.CHANGE, selectionModel => this.selectCells(selectionModel.cells));
  }

  setMoveCellsListener() {
    this.mxGraphAttributeService.graph.addListener(
      mxEvent.MOVE_CELLS,
      mxUtils.bind(this, () => {
        this.mxGraphAttributeService.graph.resetEdgesOnMove = true;
      })
    );
  }

  setFoldListener() {
    this.mxGraphAttributeService.graph.addListener(mxEvent.FOLD_CELLS, () => this.mxGraphService.formatShapes());
  }

  setDblClickListener() {
    this.mxGraphAttributeService.graph.addListener(mxEvent.DOUBLE_CLICK, () => this.editSelectedCell());
  }

  openShapeSettings() {
    this.isShapeSettingOpened = true;
    this.onSettingsOpened$.next(this.isShapeSettingOpened);
  }

  closeShapeSettings() {
    this.isShapeSettingOpened = false;
    this.onSettingsOpened$.next(this.isShapeSettingOpened);
  }

  unselectShapeForUpdate() {
    this.selectedShapeForUpdate = null;
  }

  editSelectedCell() {
    this.selectedShapeForUpdate = this.mxGraphShapeSelectorService.getSelectedShape();

    if (!this.selectedShapeForUpdate || this.selectedShapeForUpdate?.isEdge()) {
      this.selectedShapeForUpdate = null;
      return;
    }

    this.openShapeSettings();
    this.modelElement = MxGraphHelper.getModelElement(this.selectedShapeForUpdate);
  }

  editModel(elementModel: BaseMetaModelElement) {
    this.openShapeSettings();
    this.modelElement = elementModel;
  }

  selectCells(cells: Array<mxgraph.mxCell>) {
    if (this.shapesToHighlight) {
      this.mxGraphService.setStrokeColor(BLACK, this.shapesToHighlight);
    }

    if (!cells.length || cells.length >= 2) {
      return;
    }

    this.shapesToHighlight = [];
    const selectedCell = cells[0];

    if (!selectedCell.isEdge()) {
      this.shapesToHighlight.push(...this.mxGraphAttributeService.graph.getOutgoingEdges(selectedCell));
      const elementShapes = this.shapesToHighlight.filter(edge => MxGraphHelper.getModelElement(edge.target)).map(edge => edge.target);
      this.shapesToHighlight.push(...elementShapes);
      this.mxGraphService.setStrokeColor(PURPLE_BLUE, this.shapesToHighlight);
    }

    // this.changeDetector.detectChanges();
  }
}