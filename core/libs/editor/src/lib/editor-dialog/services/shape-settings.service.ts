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
import {MxGraphAttributeService, MxGraphHelper, MxGraphService, MxGraphShapeSelectorService} from '@ame/mx-graph';
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
  private mxGraphAttributeService = inject(MxGraphAttributeService);
  private mxGraphService = inject(MxGraphService);
  private mxGraphShapeSelectorService = inject(MxGraphShapeSelectorService);
  private bindingsService = inject(BindingsService);
  private editorService = inject(EditorService);
  private shapeSettingsStateService = inject(ShapeSettingsStateService);
  private openReferencedElementService = inject(OpenReferencedElementService);
  public loadedFiles = inject(LoadedFilesService);
  private ngZone = inject(NgZone);

  public modelElement: NamedElement = null;

  private selectedCellsSubject = new BehaviorSubject([]);
  public selectedCells$ = this.selectedCellsSubject.asObservable();

  setGraphListeners() {
    this.setMoveCellsListener();
    this.setFoldListener();
    this.setDblClickListener();
    this.setSelectCellListener();
  }

  setContextMenuActions() {
    this.bindingsService.registerAction('editElement', () => this.editSelectedCell());
    this.bindingsService.registerAction('deleteElement', () => this.editorService.deleteSelectedElements());
  }

  setHotKeysActions() {
    this.editorService.bindAction('deleteElement', () => this.ngZone.run(() => this.editorService.deleteSelectedElements()));

    this.mxGraphService.graph.container.addEventListener('wheel', evt => {
      if (evt.altKey) {
        evt.preventDefault();
      }
    });
  }

  setSelectCellListener() {
    this.mxGraphAttributeService.graphTest
      .getSelectionModel()
      .addListener(InternalEvent.CHANGE, selectionModel => this.ngZone.run(() => this.selectedCellsSubject.next(selectionModel.cells)));
  }

  setMoveCellsListener() {
    this.mxGraphAttributeService.graphTest.addListener(InternalEvent.MOVE_CELLS, () =>
      this.ngZone.run(() => (this.mxGraphAttributeService.graphTest.resetEdgesOnMove = true)),
    );
  }

  setFoldListener() {
    this.mxGraphAttributeService.graphTest.addListener(InternalEvent.FOLD_CELLS, () => this.mxGraphService.formatShapes());
  }

  setDblClickListener() {
    this.mxGraphAttributeService.graphTest.addListener(InternalEvent.DOUBLE_CLICK, () => this.ngZone.run(() => this.editSelectedCell()));
  }

  unselectShapeForUpdate() {
    this.shapeSettingsStateService.selectedShapeForUpdate = null;
  }

  editSelectedCell() {
    this.shapeSettingsStateService.selectedShapeForUpdate = this.mxGraphShapeSelectorService.getSelectedShapeTest();
    const selectedElement = this.shapeSettingsStateService.selectedShapeForUpdate;

    if (!selectedElement || selectedElement?.isEdge()) {
      this.shapeSettingsStateService.selectedShapeForUpdate = null;
      return;
    }

    this.modelElement = MxGraphHelper.getModelElementTest(selectedElement);
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
