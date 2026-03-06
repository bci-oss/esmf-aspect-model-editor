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
import {MaxGraphAttributeService, MaxGraphHelper, MaxGraphService, MaxGraphShapeSelectorService} from '@ame/max-graph';
import {BindingsService} from '@ame/shared';
import {inject, Injectable, NgZone} from '@angular/core';
import {NamedElement} from '@esmf/aspect-model-loader';
import {InternalEvent} from '@maxgraph/core';
import {BehaviorSubject} from 'rxjs';
import {EditorService} from '../../editor.service';
import {OpenReferencedElementService} from '../../open-element-window/open-element-window.service';
import {ShapeSettingsStateService} from './shape-settings-state.service';

@Injectable({providedIn: 'root'})
export class ShapeSettingsService {
  private ngZone = inject(NgZone);
  private maxgraphAttributeService = inject(MaxGraphAttributeService);
  private maxgraphService = inject(MaxGraphService);
  private maxgraphShapeSelectorService = inject(MaxGraphShapeSelectorService);
  private bindingsService = inject(BindingsService);
  private editorService = inject(EditorService);
  private shapeSettingsStateService = inject(ShapeSettingsStateService);
  private openReferencedElementService = inject(OpenReferencedElementService);
  private loadedFiles = inject(LoadedFilesService);

  private selectedCellsSubject = new BehaviorSubject([]);

  public modelElement: NamedElement = null;
  public hasCellsSubject = new BehaviorSubject(false);
  public selectedCells$ = this.selectedCellsSubject.asObservable();
  public hasCellsSubject$ = this.hasCellsSubject.asObservable();

  setGraphListeners() {
    this.setCellAddedListener();
    this.setSelectCellListener();
    this.setMoveCellsListener();
    this.setFoldListener();
    this.setDblClickListener();
  }

  setContextMenuActions() {
    this.bindingsService.registerAction('editElement', () => this.editSelectedCell());
    this.bindingsService.registerAction('deleteElement', () => this.editorService.deleteSelectedElements());
  }

  setHotKeysActions() {
    this.maxgraphService.graph.container.addEventListener('wheel', evt => {
      if (evt.altKey) {
        evt.preventDefault();
      }
    });
  }

  setCellAddedListener(): void {
    const graph = this.maxgraphAttributeService.graph;
    graph.addListener(InternalEvent.CELLS_ADDED, () => {
      const graph = this.maxgraphAttributeService.graph;
      const vertexCount = Object.values(graph.getDataModel().cells).filter(cell => cell.isVertex()).length > 0;

      this.ngZone.run(() => this.hasCellsSubject.next(vertexCount));
    });
  }

  setSelectCellListener() {
    this.maxgraphAttributeService.graph
      .getSelectionModel()
      .addListener(InternalEvent.CHANGE, selectionModel => this.ngZone.run(() => this.selectedCellsSubject.next(selectionModel.cells)));
  }

  setMoveCellsListener() {
    this.maxgraphAttributeService.graph.addListener(InternalEvent.MOVE_CELLS, () =>
      this.ngZone.run(() => (this.maxgraphAttributeService.graph.resetEdgesOnMove = true)),
    );
  }

  setFoldListener() {
    this.maxgraphAttributeService.graph.addListener(InternalEvent.FOLD_CELLS, () => this.maxgraphService.formatShapes());
  }

  setDblClickListener() {
    this.maxgraphAttributeService.graph.addListener(InternalEvent.DOUBLE_CLICK, () => this.ngZone.run(() => this.editSelectedCell()));
  }

  unselectShapeForUpdate() {
    this.shapeSettingsStateService.selectedShapeForUpdate = null;
  }

  editSelectedCell() {
    this.shapeSettingsStateService.selectedShapeForUpdate = this.maxgraphShapeSelectorService.getSelectedShape();
    const selectedElement = this.shapeSettingsStateService.selectedShapeForUpdate;

    if (!selectedElement || selectedElement?.isEdge()) {
      this.shapeSettingsStateService.selectedShapeForUpdate = null;
      return;
    }

    this.modelElement = MaxGraphHelper.getModelElement(selectedElement);
    if (this.loadedFiles.isElementExtern(this.modelElement) && !this.modelElement.isPredefined) {
      this.openReferencedElementService.openReferencedElement(this.modelElement);
      return;
    }

    this.shapeSettingsStateService.openShapeSettings();
  }

  editModel(elementModel: NamedElement) {
    this.shapeSettingsStateService.openShapeSettings();
    this.modelElement = elementModel;
  }
}
