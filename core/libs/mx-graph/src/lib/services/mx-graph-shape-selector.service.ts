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
import {inject, Injectable} from '@angular/core';
import {DefaultConstraint, DefaultTrait} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {MxGraphAttributeService} from '.';
import {MxGraphHelper} from '../helpers';

@Injectable({providedIn: 'root'})
export class MxGraphShapeSelectorService {
  private mxGraphAttributeService = inject(MxGraphAttributeService);
  private loadedFiles = inject(LoadedFilesService);

  /**
   * @returns array of selected cells
   */
  public getSelectedCellsTest(): Array<Cell> {
    const tempCurrentSelection = []; // used to keep track of already selected cells to prevent infinite loop
    // only return the parent elements in case of child cells
    const selectedElementCells: Array<Cell> = [];
    this.mxGraphAttributeService.graphTest.selectionModel.cells.forEach((cell: Cell) => {
      if (cell.style?.fillColor.includes('_property')) {
        const parentCell: Cell = cell.getParent();
        if (!selectedElementCells.includes(parentCell)) {
          selectedElementCells.push(parentCell);
          tempCurrentSelection.push(parentCell);
        }
      } else if (!selectedElementCells.includes(cell)) {
        selectedElementCells.push(cell);
        tempCurrentSelection.push(cell);
      }
    });
    // external references will cascade to the upper external references
    let withExternalSelectedElementCells = [];
    selectedElementCells.forEach((cell: Cell) => {
      withExternalSelectedElementCells.push(cell);
      const modelElement = MxGraphHelper.getModelElementTest(cell);
      if (!modelElement) {
        return;
      }
      if (this.loadedFiles.isElementExtern(modelElement)) {
        withExternalSelectedElementCells = [
          ...withExternalSelectedElementCells,
          ...this.getExternalUpperReferenceCellsTest(cell, tempCurrentSelection),
        ];
      }
    });
    // remove duplicates
    return [...new Set(withExternalSelectedElementCells)];
  }

  public getSelectedShapeTest(): Cell {
    const selectedCell = this.getSelectedCellsTest()?.[0];
    return selectedCell ? (selectedCell.isEdge() ? null : selectedCell) : null;
  }

  /**
   *
   * @returns aspect cell for current instance
   */
  public getAspectCell(): Cell {
    return this.mxGraphAttributeService.graphTest.getDefaultParent().getChildCount() > 0
      ? this.mxGraphAttributeService.graphTest.getDefaultParent().children[0]
      : null;
  }

  /**
   * Selects the cluster from which the selected cell is part of
   */
  public selectTree() {
    const graph = this.mxGraphAttributeService.graphTest;
    const selectedCell = graph.getSelectionCell();
    const cellsToSelect = [];
    const stack = [selectedCell];

    while (stack.length) {
      const cell = stack.pop();
      if (!cellsToSelect.includes(cell)) {
        cellsToSelect.push(cell);
      }

      cell.edges.forEach(edge => {
        cellsToSelect.push(edge);

        if (!cellsToSelect.includes(edge.target)) {
          cellsToSelect.push(edge.target);
          stack.push(edge.target);
        }

        if (!cellsToSelect.includes(edge.source)) {
          cellsToSelect.push(edge.source);
          stack.push(edge.source);
        }
      });
    }
    graph.selectCellsForEvent(cellsToSelect, null);
  }

  private getExternalUpperReferenceCellsTest(cell: Cell, currentSelection: Cell[]): Cell[] {
    let upperCells = [];
    const incomingEdges = this.mxGraphAttributeService.graphTest.getIncomingEdges(cell, null);
    incomingEdges.forEach((edge: Cell) => {
      const source = edge.source;
      const sourceModelElement = MxGraphHelper.getModelElementTest(source);
      if (this.loadedFiles.isElementExtern(sourceModelElement) && !currentSelection.includes(source)) {
        upperCells.push(source);
        currentSelection.push(source);
        upperCells = [...upperCells, ...this.getExternalUpperReferenceCellsTest(source, currentSelection)];
      }
    });
    if (MxGraphHelper.getModelElementTest(cell) instanceof DefaultTrait) {
      const outgoingEdges = this.mxGraphAttributeService.graphTest.getOutgoingEdges(cell, null);
      outgoingEdges.forEach((edge: Cell) => {
        const target = edge.target;
        const targetModelElement = MxGraphHelper.getModelElementTest(target);
        if (this.loadedFiles.isElementExtern(targetModelElement) && targetModelElement instanceof DefaultConstraint) {
          upperCells.push(target);
          currentSelection.push(cell);
        }
      });
    }
    return upperCells;
  }
}
