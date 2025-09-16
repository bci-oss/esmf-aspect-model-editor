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

/* eslint-disable @typescript-eslint/no-unused-vars */
import {ModelTree} from '@ame/loader-filters';
import {RdfModelUtil} from '@ame/rdf/utils';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {
  DefaultAspect,
  DefaultCharacteristic,
  DefaultConstraint,
  DefaultEntity,
  DefaultEntityInstance,
  DefaultEvent,
  DefaultOperation,
  DefaultProperty,
  DefaultQuantityKind,
  DefaultUnit,
  NamedElement,
  RdfModel,
} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {MxGraphHelper, MxGraphVisitorHelper} from '../helpers';
import {ShapeConfiguration} from '../models';
import {MxGraphService, MxGraphShapeOverlayService} from '../services';
import {ModelRenderer} from './mxgraph-renderer.interface';

export class MxGraphRenderer implements ModelRenderer<Cell, Cell> {
  private shapes: Map<string, Cell>;

  public visitedElements = []; // Keep track of already visited elements

  public set rdfModelValue(rdfModel: RdfModel) {
    this.rdfModel = rdfModel;
  }

  constructor(
    private mxGraphService: MxGraphService,
    private mxGraphShapeOverlayService: MxGraphShapeOverlayService,
    private sammLangService: SammLanguageSettingsService,
    private rdfModel: RdfModel,
  ) {
    this.shapes = new Map<string, Cell>();
  }

  render(elementTree: ModelTree<NamedElement>, parent: Cell, geometry?: ShapeConfiguration['geometry']): Cell {
    const wasVisited = this.visitedElements.includes(elementTree.element);
    const item: Cell = this.renderElement(elementTree, parent, geometry);
    !wasVisited && this.visitedElements.push(elementTree.element);

    if (wasVisited) {
      // In case the element was visited -> don't visit its lower attributes since they were already visited previously
      // This avoids duplication of samm-c elements
      // TODO Might need further investigation
      return item;
    }

    for (const child of elementTree.children) {
      this.render(child, item, null);
    }

    return item;
  }

  // ==========================================================================================
  // Supported visitor types
  // ==========================================================================================

  renderOperation(node: ModelTree<DefaultOperation>, parent: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const cell = this.getOrCreateCell(node, {
      shapeAttributes: MxGraphVisitorHelper.getOperationProperties(node.element, this.sammLangService),
      geometry,
    });
    this.connectIsolatedElement(parent, cell);

    if (node.element.parents.length > 0) {
      this.assignToParent(cell, parent, node);
    }
    return cell;
  }

  renderEntity(node: ModelTree<DefaultEntity>, parent: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const entity = node.element;
    if (this.shapes.get(entity.aspectModelUrn)) {
      const cellTmp = this.shapes.get(entity.aspectModelUrn);
      parent && this.mxGraphService.assignToParent(cellTmp, parent, node.fromParentArrow);
      return undefined;
    }

    const cell = this.getOrCreateCell(node, {
      shapeAttributes: MxGraphVisitorHelper.getEntityProperties(entity, this.sammLangService),
      geometry,
    });
    this.connectIsolatedElement(parent, cell);

    if (entity.parents.length > 0) {
      this.assignToParent(cell, parent, node);
    }
    return cell;
  }

  renderEntityValue(node: ModelTree<DefaultEntityInstance>, parent: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const entityValue = node.element;
    const cell = this.getOrCreateCell(node, {shapeAttributes: [], geometry});
    if (entityValue.parents.length > 0) {
      this.assignToParent(cell, parent, node);
    }

    this.mxGraphService.assignToParent(cell, parent, node.fromParentArrow);
    return cell;
  }

  renderUnit(node: ModelTree<DefaultUnit>, parent: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const unit = node.element;
    if (this.inParentRendered(unit, parent) || (parent && !(MxGraphHelper.getModelElement(parent) instanceof DefaultCharacteristic))) {
      return null;
    }

    const cell = this.getOrCreateCell(node, {
      shapeAttributes: MxGraphVisitorHelper.getUnitProperties(unit, this.sammLangService),
      geometry,
    });
    this.connectIsolatedElement(parent, cell);

    if (unit.parents.length > 0) {
      this.assignToParent(cell, parent, node);
    }
    return cell;
  }

  renderQuantityKind(node: ModelTree<DefaultQuantityKind>, _parent: Cell, _geometry: ShapeConfiguration['geometry'] = {}): Cell {
    // The information is directly shown on the unit, mainly to reduce the amount of shapes
    return undefined;
  }

  renderProperty(node: ModelTree<DefaultProperty>, parent: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const property = node.element;
    const cell = this.getOrCreateCell(node, {
      shapeAttributes: MxGraphVisitorHelper.getPropertyProperties(property, this.sammLangService),
      geometry,
    });
    this.connectIsolatedElement(parent, cell);

    this.assignToParent(cell, parent, node);
    return cell;
  }

  renderAbstractProperty(node: ModelTree<DefaultProperty>, parent: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const abstractProperty = node.element;
    const cell = this.getOrCreateCell(node, {
      shapeAttributes: MxGraphVisitorHelper.getAbstractPropertyProperties(abstractProperty, this.sammLangService),
      geometry,
    });
    this.connectIsolatedElement(parent, cell);

    this.assignToParent(cell, parent, node);
    return cell;
  }

  renderCharacteristic(node: ModelTree<DefaultCharacteristic>, parentCell: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const characteristic = node.element;
    const cell =
      this.shapes.get(characteristic.aspectModelUrn) ||
      this.getOrCreateCell(node, {
        shapeAttributes: MxGraphVisitorHelper.getCharacteristicProperties(characteristic, this.sammLangService),
        geometry,
      });
    this.connectIsolatedElement(parentCell, cell);

    const parent = MxGraphHelper.getModelElement(parentCell);
    if (parent instanceof DefaultProperty && (parentCell as any).isAbstract) {
      return cell;
    }

    if (parent instanceof DefaultProperty) {
      node.element.parents.push(parent);
    }

    this.assignToParent(cell, parentCell, node);
    return cell;
  }

  renderAbstractEntity(node: ModelTree<DefaultEntity>, parent: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const abstractEntity = node.element;
    if (this.shapes.get(abstractEntity.aspectModelUrn)) {
      const cellTmp = this.shapes.get(abstractEntity.aspectModelUrn);
      // Todo It may be that characteristics are not connected.
      if (abstractEntity.parents.length > 0) {
        this.mxGraphService.assignToParent(cellTmp, parent, node.fromParentArrow);
      }
      return undefined;
    }

    const cell = this.getOrCreateCell(node, {
      shapeAttributes: MxGraphVisitorHelper.getAbstractEntityProperties(abstractEntity, this.sammLangService),
      geometry,
    });

    this.connectIsolatedElement(parent, cell);

    this.assignToParent(cell, parent, node);
    return cell;
  }

  renderAspect(node: ModelTree<DefaultAspect>, _parent: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    // English is our default at the moment.
    const aspect = node.element;
    this.sammLangService.setSammLanguageCodes(['en']);
    return this.createCell(node, {shapeAttributes: MxGraphVisitorHelper.getAspectProperties(aspect, this.sammLangService), geometry});
  }

  renderConstraint(node: ModelTree<DefaultConstraint>, context: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const cell = this.getOrCreateCell(node, {
      shapeAttributes: MxGraphVisitorHelper.getConstraintProperties(node.element, this.sammLangService),
      geometry,
    });
    MxGraphHelper.setElementNode(cell, node);
    this.connectIsolatedElement(context, cell);

    this.assignToParent(cell, context, node);
    return cell;
  }

  renderEvent(node: ModelTree<DefaultEvent>, parent: Cell, geometry: ShapeConfiguration['geometry'] = {}): Cell {
    const event = node.element;
    const cell = this.createCell(node, {shapeAttributes: MxGraphVisitorHelper.getEventProperties(event, this.sammLangService), geometry});
    this.connectIsolatedElement(parent, cell);

    this.assignToParent(cell, parent, node);
    return cell;
  }

  private renderElement(node: ModelTree<any>, parent: Cell, geometry?: ShapeConfiguration['geometry']) {
    switch (true) {
      case node.element instanceof DefaultOperation:
        return this.renderOperation(node, parent, geometry);
      case node.element instanceof DefaultEntity && node.element.isAbstractEntity():
        return this.renderAbstractEntity(node, parent, geometry);
      case node.element instanceof DefaultEntity:
        return this.renderEntity(node, parent, geometry);
      case node.element instanceof DefaultEntityInstance:
        return this.renderEntityValue(node, parent, geometry);
      case node.element instanceof DefaultUnit:
        return this.renderUnit(node, parent, geometry);
      case node.element instanceof DefaultQuantityKind:
        return this.renderQuantityKind(node, parent, geometry);
      case node.element instanceof DefaultProperty && node.element.isAbstract:
        return this.renderAbstractProperty(node, parent, geometry);
      case node.element instanceof DefaultProperty:
        return this.renderProperty(node, parent, geometry);
      case node.element instanceof DefaultCharacteristic:
        return this.renderCharacteristic(node, parent, geometry);
      case node.element instanceof DefaultAspect:
        return this.renderAspect(node, parent, geometry);
      case node.element instanceof DefaultConstraint:
        return this.renderConstraint(node, parent, geometry);
      case node.element instanceof DefaultEvent:
        return this.renderEvent(node, parent, geometry);
      default:
        return null;
    }
  }

  // ==========================================================================================
  // Private helper functions
  // ==========================================================================================

  private inParentRendered(element: NamedElement, parent: Cell): boolean {
    return this.mxGraphService.graph
      .getOutgoingEdges(parent, null)
      .some(cell => MxGraphHelper.getModelElement(cell)?.aspectModelUrn === element.aspectModelUrn);
  }

  private connectIsolatedElement(parentCell: Cell, childCell: Cell) {
    if (parentCell) {
      const childNode = MxGraphHelper.getElementNode(childCell);
      const child = childNode.element;
      const parent = MxGraphHelper.getModelElement(parentCell);

      const isParentIsolated = parent.parents.length === 0;
      const isChildIsolated = child.parents.length === 0;

      if (isParentIsolated && isChildIsolated) {
        this.assignToParent(childCell, parentCell, childNode);
      }
    }
  }

  private createCell(node: ModelTree<NamedElement>, {shapeAttributes, geometry}: ShapeConfiguration): Cell {
    return this.mxGraphService.renderModelElement(node, {shapeAttributes: shapeAttributes, geometry});
  }

  private getOrCreateCell(node: ModelTree<any>, {shapeAttributes, geometry}: ShapeConfiguration): Cell {
    const shape = this.shapes.get(node.element.name) || this.mxGraphService.resolveCellByModelElement(node.element);

    if (shape) {
      return shape;
    }

    const cell = this.createCell(node, {shapeAttributes, geometry});

    if (
      this.rdfModel &&
      !RdfModelUtil.isPredefinedCharacteristic(node.element.aspectModelUrn, this.rdfModel.sammC) &&
      !RdfModelUtil.isSammUDefinition(node.element.aspectModelUrn, this.rdfModel.sammU)
    ) {
      this.shapes.set(node.element.aspectModelUrn, cell);
    }

    return cell;
  }

  private assignToParent(cell: Cell, context: Cell, node: ModelTree<NamedElement>) {
    this.mxGraphService.assignToParent(cell, context, node.fromParentArrow);
    this.removeActionIcons(node.element, cell);
  }

  private removeActionIcons(NamedNode: NamedElement, cell: Cell) {
    this.mxGraphShapeOverlayService.removeShapeActionIconsByLoading(NamedNode, cell);
  }
}
