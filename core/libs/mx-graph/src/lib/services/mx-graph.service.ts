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

import {CacheUtils, LoadedFilesService} from '@ame/cache';
import {FILTER_ATTRIBUTES, ModelTree} from '@ame/loader-filters';
import {ConfigurationService} from '@ame/settings-dialog';
import {NotificationsService, overlayGeometry} from '@ame/shared';
import {inject, Injectable} from '@angular/core';
import {DefaultCharacteristic, DefaultEntityInstance, DefaultEnumeration, NamedElement} from '@esmf/aspect-model-loader';
import {Cell, CellStyle, Graph} from '@maxgraph/core';
import {environment} from 'environments/environment';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {MxGraphGeometryProviderService, MxGraphSetupService} from '.';
import {MxGraphCharacteristicHelper, MxGraphHelper} from '../helpers';
import {ShapeConfiguration} from '../models';
import {ThemeService} from '../themes/theme.service';
import {MxGraphAttributeService} from './mx-graph-attribute.service';
import {MxGraphShapeOverlayService} from './mx-graph-shape-overlay.service';
import {MxGraphShapeSelectorService} from './mx-graph-shape-selector.service';

export interface Coordinates {
  x: number;
  y: number;
}

@Injectable({providedIn: 'root'})
export class MxGraphService {
  private filterAttributes = inject(FILTER_ATTRIBUTES);
  private loadedFiles = inject(LoadedFilesService);
  private configurationService = inject(ConfigurationService);
  private graphSetupService = inject(MxGraphSetupService);
  private mxGraphGeometryProviderService = inject(MxGraphGeometryProviderService);
  private mxGraphShapeOverlayService = inject(MxGraphShapeOverlayService);
  private mxGraphAttributeService = inject(MxGraphAttributeService);
  private notificationsService = inject(NotificationsService);
  private themeService = inject(ThemeService);
  public mxGraphShapeSelectorService = inject(MxGraphShapeSelectorService);

  // private document: Document;
  private nextCellCoordinates: {x: number; y: number} = null;

  public firstTimeFold = true;
  public graph: Graph;
  public scrollPosition: Coordinates = {
    x: 0,
    y: 0,
  };

  public graphInitialized$ = new BehaviorSubject(false);

  get currentCachedFile() {
    return this.loadedFiles.currentLoadedFile.cachedFile;
  }

  constructor() {
    // this.document = mxUtils.createXmlDocument();
    if (!environment.production) {
      window['angular.mxGraphService'] = this;
    }
  }

  initGraph(): void {
    this.graphSetupService.setUp();
    this.graph = this.mxGraphAttributeService.graphTest;
    this.graph.keepEdgesInBackground = true;
    this.themeService.setGraph(this.graph);
    this.graphInitialized$.next(true);

    Cell.prototype.clone = function () {
      return this;
    };
  }

  setCoordinatesForNextCellRender(x: number, y: number) {
    this.nextCellCoordinates = {x, y};
  }

  /**
   * Sets the scroll position
   *
   * @param event scroll event object
   */
  setScrollPosition(event: Event): void {
    const {scrollLeft, scrollTop} = event.target as HTMLElement;
    this.scrollPosition = {
      x: scrollLeft,
      y: scrollTop,
    };
  }

  /**
   * Method to update the graph.Increments the updateLevel by one.
   * The event notification is queued until updateLevel reaches 0 by use of endUpdate.
   * All changes on mxGraphModel are transactional, that is, they are executed in a single un-doable change on the model
   * (without transaction isolation).  Therefore, if you want to combine any number of changes into a single un-doable change,
   * you should group any two or more API calls that modify the graph model between beginUpdate and endUpdate
   */
  updateGraph(updateFunction: Function): Observable<boolean> {
    const subject = new Subject<boolean>();
    this.graph.model.beginUpdate();
    try {
      updateFunction?.();
    } finally {
      requestAnimationFrame(() => {
        this.graph.model.endUpdate();
        subject.next(true);
      });
    }

    return subject.asObservable();
  }

  /**
   * Gets cell parents
   *
   * @param cell most basic entity of a mx-graph model,
   * @returns array of parent cells
   */
  resolveParents(cell: Cell): Array<Cell> {
    return this.graph.getIncomingEdges(cell, null).map(parent => parent.source);
  }

  /**
   * Gets the cell for a specific model element
   *
   * @param metaModelElement
   * @returns the cell that you want to resolve
   */
  resolveCellByModelElement(metaModelElement: NamedElement): Cell {
    if (metaModelElement instanceof DefaultCharacteristic && metaModelElement.isPredefined) {
      return null;
    }

    return this.graph.getChildVertices(this.graph.getDefaultParent()).find(cell => {
      const metaModel = MxGraphHelper.getModelElementTest(cell);
      return metaModel && metaModelElement && metaModel?.aspectModelUrn === metaModelElement?.aspectModelUrn;
    });
  }

  /**
   * Modifies certain model Element with a new cell configuration.
   *
   * @param {ModelTree<NamedElement>} node - The node representing the model element to render.
   * @param {ShapeConfiguration} [configuration] - Optional configuration to customize shape rendering.
   *
   * @returns {Cell} - The rendered shape cell in the graph.
   *
   * @throws {Error} - If there are issues in shape creation or overlay operations.
   */
  renderModelElement(node: ModelTree<NamedElement>, configuration?: ShapeConfiguration): Cell {
    const geometry = this.mxGraphGeometryProviderService.createGeometryTest(
      node,
      (configuration && configuration?.geometry?.x) || this.nextCellCoordinates?.x || 0,
      (configuration && configuration?.geometry?.y) || this.nextCellCoordinates?.y || 0,
    );

    this.nextCellCoordinates = null;
    const cellStyle = this.themeService.generateThemeStyle(node.shape?.mxGraphStyle?.baseStyleNames[0] || '');

    //debugger;
    if (this.loadedFiles.isElementExtern(node.element)) {
      cellStyle.fillOpacity = 80;
    }

    node.shape.mxGraphStyle = cellStyle;
    const modelShape = this.mxGraphShapeOverlayService.createShapeTest(node, geometry, configuration?.shapeAttributes || []);
    MxGraphHelper.setElementNodeTest(modelShape, node);

    this.mxGraphShapeOverlayService.checkComplexEnumerationOverlaysTest(node.element, modelShape);

    if (this.loadedFiles.isElementInCurrentFile(node.element)) {
      this.mxGraphShapeOverlayService.addBottomShapeOverlayTest(modelShape);
      this.mxGraphShapeOverlayService.addTopShapeOverlayTest(modelShape);
    }
    this.graph.labelChanged(modelShape, MxGraphHelper.createPropertiesLabelTest(modelShape), null);
    this.mxGraphAttributeService.inCollapsedMode && this.foldCell(modelShape);
    return modelShape;
  }

  /**
   * Update all enumerations, parent entity values where deleted entityValue is linked.
   * Delete all child entity values
   *
   * @param selectedModelElement - EntityValue meta model which will be deleted
   */
  public updateEnumerationsWithEntityValue(selectedModelElement: DefaultEntityInstance): void {
    if (this.loadedFiles.isElementExtern(selectedModelElement)) {
      return;
    }

    selectedModelElement.parents.forEach(enumeration => {
      if (!(enumeration instanceof DefaultEnumeration)) {
        return;
      }
      const entityValueIndex = enumeration.values.indexOf(selectedModelElement);
      if (entityValueIndex >= 0) {
        enumeration.values.splice(entityValueIndex, 1);
      }
    });

    // update all parent entity values
    const allEntityValues: DefaultEntityInstance[] = CacheUtils.getCachedElements(this.currentCachedFile, DefaultEntityInstance);

    allEntityValues.forEach(entityValue => {
      entityValue.getTuples().forEach(([propertyUrn, value]) => {
        if (value instanceof DefaultEntityInstance && value.aspectModelUrn === selectedModelElement.aspectModelUrn) {
          entityValue.removeAssertion(propertyUrn, value);
        }
      });
    });

    this.currentCachedFile.removeElement(selectedModelElement.aspectModelUrn);
    // delete all lower entity values that don't belong to an enumeration
    const lowerEntityValuesToDelete = MxGraphCharacteristicHelper.getChildEntityValuesToDelete(
      selectedModelElement,
      allEntityValues.filter(ev => ev.parents.some(p => p instanceof DefaultEnumeration)),
    );
    lowerEntityValuesToDelete.forEach(entityValue => {
      this.currentCachedFile.removeElement(entityValue.aspectModelUrn);
      this.removeCells([this.resolveCellByModelElement(entityValue)]);
    });
  }

  getAllEdges(cellId: string): Cell[] {
    return this.graph.model.getCell(cellId)?.edges;
  }

  /**
   * Navigate to a cell based on URN
   *
   * @param aspectModelUrn aspect URN
   * @returns navigated cell
   */
  navigateToCellByUrn(aspectModelUrn: string): Cell {
    const cellToNavigate = Object.values<Cell>(this.graph.model.cells).find((cell: Cell) => {
      const metaElement = MxGraphHelper.getModelElementTest(cell);
      if (metaElement && metaElement.aspectModelUrn === aspectModelUrn) {
        return cell;
      }
      return null;
    });

    return this.navigateToCell(cellToNavigate, true);
  }

  /**
   * Navigate to a cell
   *
   * @param cell mx element
   * @param center flag to signal if the cell should be visible on the center
   * @returns navigated cell
   */
  navigateToCell(cell: Cell, center: boolean): Cell {
    if (!cell) {
      this.notificationsService.error({title: 'The element you are looking for was not found'});
      return null;
    }

    this.graph.selectCellForEvent(cell, null);
    this.graph.scrollCellToVisible(cell, center);

    return cell;
  }

  /** Removes all elements of the current aspect  */
  deleteAllShapes(): void {
    this.updateGraph(() => this.graph.removeCells(this.graph.getChildVertices(this.graph.getDefaultParent())));
  }

  /** Expand all cells*/
  expandCells() {
    const cells = this.graph.getChildCells(this.graph.getDefaultParent(), true, false);
    this.graph.foldCells(false, true, cells);
    this.mxGraphAttributeService.inCollapsedMode = false;

    return this.updateGraph(() => {
      for (const cell of cells) {
        this.graph.resizeCell(
          cell,
          this.mxGraphGeometryProviderService.createGeometryTest(
            MxGraphHelper.getElementNodeTest(cell),
            cell?.geometry?.x,
            cell?.geometry?.y,
          ),
        );
        const modelElement = MxGraphHelper.getModelElementTest(cell);
        if (MxGraphHelper.isComplexEnumeration(modelElement)) {
          this.mxGraphShapeOverlayService.addComplexEnumerationShapeOverlayTest(cell);
        }
        cell.overlays?.forEach(overlay => {
          overlay.image.width = overlayGeometry.expandedWith;
          overlay.image.height = overlayGeometry.expandedHeight;

          MxGraphHelper.setConstrainOverlayOffsetTest(overlay, cell);
        });
      }

      const selectedCell = this.mxGraphShapeSelectorService.getSelectedShapeTest();
      if (selectedCell) {
        this.navigateToCell(selectedCell, true);
      }

      if (this.firstTimeFold) {
        this.firstTimeFold = false;
        this.formatShapes(true);
        this.graph.refresh();
      }
    });
  }

  /** Collapse all cells */
  foldCells() {
    const cells = this.graph.getChildCells(this.graph.getDefaultParent(), true, false);
    this.graph.foldCells(true, true, cells);
    this.mxGraphAttributeService.inCollapsedMode = true;

    return this.updateGraph(() => {
      for (const cell of cells) {
        const modelElement = MxGraphHelper.getModelElementTest(cell);
        if (MxGraphHelper.isComplexEnumeration(modelElement)) {
          this.mxGraphShapeOverlayService.removeOverlayTest(cell, MxGraphHelper.getRightOverlayButtonTest(cell));
        }

        cell.overlays?.forEach(overlay => {
          overlay.image.width = overlayGeometry.collapsedWidth;
          overlay.image.height = overlayGeometry.collapsedHeight;

          MxGraphHelper.setConstrainOverlayOffsetTest(overlay, cell);
        });

        const geometry = cell.getGeometry();
        const isVertex = cell.isVertex();
        this.mxGraphGeometryProviderService.upgradeTraitGeometryTest(cell, geometry, isVertex);
        this.mxGraphGeometryProviderService.upgradeEntityValueGeometryTest(cell, geometry, isVertex);
      }

      const selectedCell = this.mxGraphShapeSelectorService.getSelectedShapeTest();
      if (selectedCell) {
        this.navigateToCell(selectedCell, true);
      }
      if (this.firstTimeFold) {
        this.formatShapes(true);
        this.firstTimeFold = false;
        this.graph.refresh();
      }
    });
  }

  /**
   * Expand a targeted cell
   *
   * @param cell mx element
   */
  expandCell(cell: Cell): void {
    this.graph.foldCells(false, false, [cell]);
    cell.overlays?.forEach(overlay => {
      overlay.image.width = overlayGeometry.expandedWith;
      overlay.image.height = overlayGeometry.expandedHeight;

      MxGraphHelper.setConstrainOverlayOffsetTest(overlay, cell);
    });
  }

  /**
   * Collapse a targeted cell
   *
   * @param cell mx element
   */
  foldCell(cell: Cell): void {
    this.graph.foldCells(true, false, [cell]);
    cell.overlays?.forEach(overlay => {
      overlay.image.width = overlayGeometry.collapsedWidth;
      overlay.image.height = overlayGeometry.collapsedHeight;

      MxGraphHelper.setConstrainOverlayOffsetTest(overlay, cell);
    });
    this.graph.refresh();
  }

  /**
   * Re-formats the entire graph
   *
   * @param force controls whether to ignore "autoFormatEnabled" settings or not
   * @param restoreScrollPosition allows to restore a scroll position to keep the same elements visible after formatting
   */
  formatShapes(force = false, restoreScrollPosition = false): void {
    if (!this.configurationService.getSettings().autoFormatEnabled && !force) return;
    if (this.graph.getDefaultParent().children === undefined) return;

    const selectedShape = restoreScrollPosition ? this.mxGraphShapeSelectorService.getSelectedShapeTest() : undefined;
    const visibleCell = restoreScrollPosition ? this.getVisibleCells()[0] : undefined;
    const visibleCellCoordinates = restoreScrollPosition ? this.getCellCoordinatesTest(visibleCell, this.graph) : undefined;

    this.configurationService.getSettings().enableHierarchicalLayout
      ? MxGraphHelper.setHierarchicalLayoutTest(this.graph, this.mxGraphAttributeService.inCollapsedMode)
      : MxGraphHelper.setCompactTreeLayoutTest(this.graph, this.mxGraphAttributeService.inCollapsedMode);

    if (!restoreScrollPosition) return;

    if (selectedShape) {
      this.navigateToCell(selectedShape, true);
    } else if (visibleCell) {
      const newCellCoordinates = this.getCellCoordinatesTest(visibleCell, this.graph);
      if (visibleCellCoordinates.x === newCellCoordinates.x && visibleCellCoordinates.y === newCellCoordinates.y) return;

      this.graph.scrollCellToVisible(visibleCell, true);
    }
  }

  formatCell(cell: Cell, force = false) {
    if (!force && this.configurationService.getSettings().autoFormatEnabled) {
      // don't apply cell formatting in case auto format is enabled
      return;
    }
    const initialX = cell.geometry.x;
    const initialY = cell.geometry.y;
    const formattedCells = [];
    if (this.graph.getDefaultParent().children !== undefined) {
      this.configurationService.getSettings().enableHierarchicalLayout
        ? MxGraphHelper.setHierarchicalLayoutTest(this.graph, this.mxGraphAttributeService.inCollapsedMode, cell)
        : MxGraphHelper.setCompactTreeLayoutTest(this.graph, this.mxGraphAttributeService.inCollapsedMode, cell);
    }
    this.updateGraph(() => {
      const deltaX = initialX - cell.geometry.x;
      const deltaY = initialY - cell.geometry.y;
      this.applyDelta(cell, deltaX, deltaY, formattedCells);
    }).subscribe(() => {
      this.graph.refresh();
    });
  }

  /**
   * Connect a cell to parent
   *
   * @param child child mx element
   * @param parent parent mx element
   */
  assignToParent(child: Cell, parent?: Cell, edgeStyle?: string): void {
    if (!parent) {
      return;
    }

    const childNode = MxGraphHelper.getElementNodeTest(child);

    if (
      (parent?.edges || []).some(edge => MxGraphHelper.getModelElementTest(edge.target).aspectModelUrn === childNode.element.aspectModelUrn)
    ) {
      return;
    }

    //debugger;
    this.graph.insertEdge(this.graph.getDefaultParent(), null, null, parent, child, {
      baseStyleNames: [edgeStyle || childNode.fromParentArrow],
    } as CellStyle);

    if (!this.filterAttributes.isFiltering) {
      MxGraphHelper.establishRelation(MxGraphHelper.getModelElementTest(parent), childNode.element);
    }
  }

  /**
   * Show validation error on a cell based on an URN string
   *
   * @param focusNodeUrn focused node URN
   */
  showValidationErrorOnShape(focusNodeUrn: string): void {
    Object.values<Cell>(this.graph.model.cells).forEach((cell: Cell) => {
      const modelElement = MxGraphHelper.getModelElementTest(cell);
      if (modelElement && modelElement.aspectModelUrn === focusNodeUrn) {
        // this.graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, 'red', [cell]);
        // this.graph.setCellStyles(mxConstants.STYLE_STROKEWIDTH, 3, [cell]);
      }
    });
  }

  /** Resets entire validation */
  resetValidationErrorOnAllShapes(): void {
    this.updateGraph(() => {
      Object.values<Cell>(this.graph.model.cells).forEach((cell: Cell) => {
        if (!cell.isEdge()) {
          // this.graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, this.themeService.currentColors.border, [cell]);
          // this.graph.setCellStyles(mxConstants.STYLE_STROKEWIDTH, 2, [cell]);
        }
      });
    });
  }

  removeCells(cells: Array<Cell>, includeEdges = true): void {
    for (const cell of cells) {
      if (cell?.isEdge?.()) {
        if (cell.source && cell.target) {
          const parent = MxGraphHelper.getModelElementTest(cell.source);
          const child = MxGraphHelper.getModelElementTest(cell.target);
          if (this.loadedFiles.isElementInCurrentFile(parent)) MxGraphHelper.removeRelation(parent, child);
        }
        continue;
      }

      const modelElement = MxGraphHelper.getModelElementTest(cell);
      if (this.loadedFiles.isElementExtern(modelElement)) continue;

      for (const child of modelElement.children) {
        MxGraphHelper.removeRelation(modelElement, child);
      }

      for (const parent of modelElement.parents) {
        if (this.loadedFiles.isElementInCurrentFile(parent)) MxGraphHelper.removeRelation(parent, modelElement);
      }
    }
    this.graph.removeCells(cells, includeEdges);
  }

  moveCells(cells: Array<Cell>, dx: number, dy: number): void {
    this.graph.moveCells(cells, dx, dy);
  }

  /**
   *
   * @returns array with all available cells(mx elements)
   */
  getAllCells(): Cell[] {
    return this.graph?.getChildVertices?.(this.graph.getDefaultParent());
  }

  setStrokeColor(color: string, shapesToHighlight: Cell[]) {
    // this.graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, color, shapesToHighlight);
  }

  /**
   * This method will search in cache for all entryValues, find the ones with properties = deleted entity value and clear this properties.
   *
   * @param deletedEntityValue - EntityValueProperty.value that needs to be cleared.
   */
  public updateEntityValuesWithReference(deletedEntityValue: DefaultEntityInstance): void {
    if (this.loadedFiles.isElementExtern(deletedEntityValue)) {
      return;
    }

    CacheUtils.getCachedElements(this.currentCachedFile, DefaultEntityInstance).forEach(entityValue =>
      entityValue.getTuples().forEach(([propertyUrn, value]) => {
        if (value instanceof DefaultEntityInstance && value.aspectModelUrn === deletedEntityValue.aspectModelUrn) {
          entityValue.removeAssertion(propertyUrn, value);
        }
      }),
    );
  }

  /**
   * This method will transform cell to modelElement and update all the references where deletedEntityValueCells ar present.
   *
   * @param deletedEntityValueCells - cell which needs to be cleaned
   */
  public updateEntityValuesWithCellReference(deletedEntityValueCells: Array<Cell>): void {
    deletedEntityValueCells
      .filter(entityValueCell => entityValueCell.isVertex())
      .forEach(entityValueCell =>
        this.updateEntityValuesWithReference(MxGraphHelper.getModelElementTest<DefaultEntityInstance>(entityValueCell)),
      );
  }

  private applyDelta(cell: Cell, deltaX: number, deltaY: number, formattedCells: Cell[]) {
    if (!cell || formattedCells.includes(cell)) {
      return;
    }

    formattedCells.push(cell);
    cell.geometry.x += deltaX;
    cell.geometry.y += deltaY;

    const edgesToRedraw = this.graph.getOutgoingEdges(cell, null);
    for (const edge of edgesToRedraw) {
      this.applyDelta(edge.target, deltaX, deltaY, formattedCells);
      this.graph.resetEdge(edge);
    }
  }

  /**
   * Get an array of cells which are currently visible to a user
   */
  public getVisibleCells(): Cell[] {
    const graph = this.mxGraphAttributeService.graphTest;
    const cells: Record<any, Cell> = graph.model.cells;
    const visibleCells: Cell[] = [];

    Object.values(cells).forEach(cell => {
      const isCellVisible = this.isCellVisible(cell, graph, this.scrollPosition);

      if (isCellVisible) {
        visibleCells.push(cell);
      }
    });

    return visibleCells;
  }

  /**
   * Determines whether a cell is currently visible to a user or not.
   *
   * @param cell a cell to examine
   * @param graph a graph the cell belongs to
   * @param scrollPosition current position of the scroll, relative to the graph container
   */
  public isCellVisible(cell: Cell, graph: Graph, scrollPosition: Coordinates): boolean {
    if (cell.edge) return false;

    const viewportWidth = graph.container.clientWidth;
    const viewportHeight = graph.container.clientHeight;

    const xRangeStart = scrollPosition.x;
    const xRangeEnd = viewportWidth + xRangeStart;
    const yRangeStart = scrollPosition.y;
    const yRangeEnd = viewportHeight + yRangeStart;
    const coordinates = this.getCellCoordinatesTest(cell, graph);

    if (!coordinates) return false;

    return coordinates.x >= xRangeStart && coordinates.x <= xRangeEnd && coordinates.y >= yRangeStart && coordinates.y <= yRangeEnd;
  }

  /**
   * Get cell coordinates from DOM element directly
   *
   * @param cell target cell
   * @param graph a graph the cell belongs to
   */
  public getCellCoordinatesTest(cell: Cell, graph: Graph): Coordinates {
    const cellState = graph.view.getState(cell);
    const cellNode = cellState?.shape?.node;

    if (!cellNode) return undefined;

    const childNode = cellNode.firstChild as HTMLElement;
    const x = +childNode.getAttribute('x');
    const y = +childNode.getAttribute('y');

    return {x, y};
  }
}
