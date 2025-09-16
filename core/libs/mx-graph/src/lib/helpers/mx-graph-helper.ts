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
import {filterRelations, ModelFilter, ModelTree} from '@ame/loader-filters';
import {RdfModelUtil} from '@ame/rdf/utils';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {basicShapeGeometry, ModelCompactTreeLayout, ModelHierarchicalLayout} from '@ame/shared';
import {Injector} from '@angular/core';
import {
  DefaultAspect,
  DefaultCharacteristic,
  DefaultEither,
  DefaultEntity,
  DefaultEntityInstance,
  DefaultEnumeration,
  DefaultOperation,
  DefaultProperty,
  DefaultStructuredValue,
  DefaultTrait,
  ElementSet,
  HasExtends,
  NamedElement,
} from '@esmf/aspect-model-loader';
import {Cell, CellOverlay, CompactTreeLayout, Graph, HierarchicalLayout} from '@maxgraph/core';
import {ModelBaseProperties} from '../models';
import {MxGraphVisitorHelper, ShapeAttribute} from './mx-graph-visitor-helper';

export class MxGraphHelper {
  static filterMode: ModelFilter = ModelFilter.DEFAULT;
  static injector: Injector;

  /**
   * Gets the node element for a cell
   *
   * @param cell mx element
   */
  static getElementNodeTest<U extends NamedElement = NamedElement>(cell: Cell): ModelTree<U> {
    if (typeof cell?.['getMetaModelElement'] === 'function') {
      return (<any>cell).getMetaModelElement();
    }
    return null;
  }

  /**
   * Gets the element model for a cell
   *
   * @param cell mx element
   */
  static getModelElementTest<U extends NamedElement = NamedElement>(cell: Cell): U {
    const node = this.getElementNodeTest<U>(cell);
    return node ? node.element : null;
  }

  /**
   * Checks if child (a property) is either an optional, notInPayload or has a payloadName
   *
   * @param child NamedElement
   * @param parent NamedElement
   */
  static isOptionalProperty(child: DefaultProperty, parent: NamedElement) {
    if (!(parent instanceof DefaultAspect || parent instanceof DefaultEntity) || !(child instanceof DefaultProperty)) {
      return false;
    }

    return parent.propertiesPayload[child.aspectModelUrn]?.optional;
  }

  /**
   * Checks if metaModel is characteristic and predefined.
   */
  static isMetaModelPredefined(metaModel: NamedElement): boolean {
    return metaModel instanceof DefaultCharacteristic && metaModel.isPredefined;
  }

  /**
   * Checks if metaModel is characteristic and not predefined.
   */
  static isMetaModelNotPredefined(metaModel: NamedElement): boolean {
    return metaModel instanceof DefaultCharacteristic && !metaModel.isPredefined;
  }

  /**
   *Checks if metaModel is a complex enumeration.
   */
  static isComplexEnumeration(metaModelElement: NamedElement): boolean {
    return metaModelElement instanceof DefaultEnumeration && metaModelElement.dataType instanceof DefaultEntity;
  }

  static isNewConstrainOverlayButtonTest(overlay: CellOverlay): boolean {
    return overlay.verticalAlign === 'top' && overlay.offset.x > 0;
  }

  static setConstrainOverlayOffsetTest(overlay: CellOverlay, cell: Cell): void {
    if (MxGraphHelper.isNewConstrainOverlayButtonTest(overlay)) {
      overlay.offset.x = cell.geometry.width / 8;
    }
  }

  /**
   * Checks if cell is a characteristic without datatype.
   *
   */
  static isCharacteristicWithoutDataTypeTest(cell: Cell): boolean {
    const modelElement = MxGraphHelper.getModelElementTest<DefaultCharacteristic>(cell);
    return modelElement ? !modelElement?.dataType : false;
  }

  static getCellAttribute(newValue) {
    if (newValue instanceof Array) {
      return RdfModelUtil.getValuesWithoutUrnDefinition(newValue);
    }
    return RdfModelUtil.getValueWithoutUrnDefinition(newValue);
  }

  /**
   * Sets the model element for a cell
   *
   * @param cell mx element
   * @param metaModelObject internal model
   */
  static setElementNodeTest(cell: Cell, node: ModelTree<NamedElement>) {
    cell['getMetaModelElement'] = (): ModelTree<NamedElement> => node;
  }

  /**
   * Checks if the parent of one of its properties has StructuredValue as parent
   *
   * @param cell cell you are testing
   * @param graph the graph the cell can be found
   * @returns boolean
   */
  static hasGrandParentStructuredValueTest(cell: Cell, graph: Graph) {
    return graph
      .getIncomingEdges(cell, null)
      .some(firstEdge =>
        graph
          .getIncomingEdges(firstEdge.source, null)
          .some(secondEdge => MxGraphHelper.getModelElementTest(secondEdge.source) instanceof DefaultStructuredValue),
      );
  }

  /**
   * Adds child into children array from parent.
   * Adds parent into parents array from child.
   *
   * @param parent parent for child
   * @param child child for parent
   */
  static establishRelation(parent: NamedElement, child: NamedElement) {
    const hasRelation = filterRelations.some(relation => {
      if (!(parent instanceof relation.from)) {
        return false;
      }

      if (!relation.to.some(defaultClass => child instanceof defaultClass)) {
        return false;
      }

      return !relation.isExceptions(child, this.filterMode);
    });

    if (hasRelation) {
      parent.children.push(child);
      child.parents.push(parent);
    }
  }

  /**
   * Removes child from children array from parent.
   * Removes parent from parents array from child.
   *
   * @param parent parent for child
   * @param child child for parent
   */
  static removeRelation(parent: NamedElement, child: NamedElement) {
    const loadedFiles = this.injector ? this.injector.get(LoadedFilesService) : null;
    const isRemovable = this.isRemovable(parent, child);
    if (!isRemovable || (loadedFiles?.isElementExtern(parent) && child.isPredefined)) {
      return;
    }

    child.parents = new ElementSet(...child.parents.filter(p => p.aspectModelUrn !== parent.aspectModelUrn));
  }

  private static isRemovable(element: NamedElement, elementToRemove: NamedElement) {
    const loadedFiles = this.injector ? this.injector.get(LoadedFilesService) : null;
    const elementNamespace = element.aspectModelUrn.split('#')[0];
    const toRemoveNamespace = elementToRemove.aspectModelUrn.split('#')[0];

    return (
      elementNamespace !== toRemoveNamespace || !(loadedFiles?.isElementExtern(element) || loadedFiles?.isElementExtern(elementToRemove))
    );
  }

  static isEntityCycleInheritanceTest(child: Cell, parent: NamedElement, graph: Graph): boolean {
    const nextGeneration = graph.getOutgoingEdges(child, null)?.map(edge => edge.target) || [];

    for (const cell of nextGeneration) {
      const modelElement = MxGraphHelper.getModelElementTest(cell);
      return modelElement.aspectModelUrn === parent.aspectModelUrn || this.isEntityCycleInheritanceTest(cell, parent, graph);
    }

    return false;
  }

  static getNewShapeOverlayButtonTest(cell: Cell): CellOverlay {
    return cell?.overlays?.find(overlay => overlay.verticalAlign === 'bottom');
  }

  static getTopOverlayButtonTest(cell: Cell): CellOverlay {
    return cell?.overlays?.find(overlay => overlay.verticalAlign === 'top' && overlay.align === 'center');
  }

  static getRightOverlayButtonTest(cell: Cell): CellOverlay {
    return cell?.overlays?.find(overlay => overlay.align === 'right');
  }

  static setCompactTreeLayoutTest(graph: Graph, inCollapsedMode: boolean, cell?: Cell): void {
    const graphLayout = new CompactTreeLayout(graph);
    graphLayout.maintainParentLocation = true;
    graphLayout.horizontal = false;
    graphLayout.minEdgeJetty = ModelCompactTreeLayout.minEdgeJetty;
    graphLayout.levelDistance = inCollapsedMode
      ? ModelCompactTreeLayout.collapsedLevelDistance
      : ModelCompactTreeLayout.expandedLevelDistance;
    graphLayout.nodeDistance = inCollapsedMode ? ModelCompactTreeLayout.collapsedNodeDistance : ModelCompactTreeLayout.expandedNodeDistance;
    if (cell) {
      graphLayout.execute(graph.getDefaultParent(), cell);
    } else {
      graph.getChildVertices(graph.getDefaultParent())?.forEach(element => {
        if (this.getModelElementTest(element).parents.length === 0) {
          graphLayout.execute(graph.getDefaultParent(), element);
        }
      });
    }
  }

  static setHierarchicalLayoutTest(graph: Graph, inCollapsedMode: boolean, cell?: Cell): void {
    const graphLayout = new HierarchicalLayout(graph);
    graphLayout.maintainParentLocation = true;
    graphLayout.edgeStyle = ModelHierarchicalLayout.edgeStyle;
    graphLayout.intraCellSpacing = inCollapsedMode
      ? ModelHierarchicalLayout.collapsedIntraCellSpacing
      : ModelHierarchicalLayout.expandedIntraCellSpacing;
    graphLayout.interRankCellSpacing = inCollapsedMode
      ? ModelHierarchicalLayout.collapsedInterRankCellSpacing
      : ModelHierarchicalLayout.expandedInterRankCellSpacing;
    graphLayout.execute(graph.getDefaultParent(), cell);
  }

  static getCellHeightTest(cell: Cell) {
    const div = this.createPropertiesLabelTest(cell);
    return div?.style.height.split('px')[0];
  }

  static createEdgeLabelTest(cell: Cell, graph: Graph): HTMLElement {
    const sourceModelElement = MxGraphHelper.getModelElementTest(cell.source);
    const targetModelElement = MxGraphHelper.getModelElementTest(cell.target);

    if (sourceModelElement instanceof DefaultOperation) {
      const isInput = sourceModelElement?.input?.some(overwrittenProp => overwrittenProp === targetModelElement);
      const p = document.createElement('p');
      p.className += ' edge-label operation';
      if (targetModelElement === sourceModelElement?.output && isInput) {
        p.innerText = 'input-output';
      } else if (targetModelElement === sourceModelElement?.output) {
        p.innerText = 'output';
      } else if (isInput) {
        p.innerText = 'input';
      } else {
        return null;
      }
      return p;
    }
    if (sourceModelElement instanceof DefaultEither) {
      const p = document.createElement('p');
      p.className += ' edge-label characteristic';
      if (targetModelElement === sourceModelElement?.left) {
        p.innerText = 'left';
      } else if (targetModelElement === sourceModelElement?.right) {
        p.innerText = 'right';
      } else {
        return null;
      }
      return p;
    }

    if (targetModelElement instanceof DefaultProperty && sourceModelElement instanceof DefaultEntity) {
      const entityIncomingEdges = graph.getIncomingEdges(cell.source, null);
      let hasEnumeration = false;
      if (entityIncomingEdges) {
        entityIncomingEdges.forEach((c: Cell) => {
          // first check if it has a parent Enumeration
          if (this.getElementNodeTest(c.source) instanceof DefaultEnumeration) {
            hasEnumeration = true;
          }
        });
      }
      if (!hasEnumeration) {
        return null;
      }

      const propertyPayload = sourceModelElement.propertiesPayload[targetModelElement.aspectModelUrn];

      if (propertyPayload.notInPayload) {
        const p = document.createElement('p');
        p.className += ' edge-label property';
        p.innerText = 'not in payload';
        return p;
      }
    }
    return null;
  }

  private static createLabelElementTest(cell: Cell) {
    const div = document.createElement('div');
    div.dataset.cellId = cell.id;
    div.dataset.collapsed = cell.collapsed ? 'yes' : 'no';
    div.classList.add('cell-label');
    div.style.width = cell.geometry.width + 'px';
    return div;
  }

  private static createTitleLabelElementTest(cell: Cell, isSmallShape: boolean) {
    const modelElement = MxGraphHelper.getModelElementTest(cell);
    const title = document.createElement('span');
    if (!cell.collapsed) {
      title.style.width = cell.geometry.width + 'px';
    }
    title.title = isSmallShape ? '' : modelElement.name;

    title.innerText = modelElement.name?.length > 24 ? modelElement.name?.substring(0, 21) + '...' : modelElement.name;
    if (cell.collapsed && modelElement instanceof DefaultEntityInstance) {
      title.innerText = this.formatSmallName(modelElement.name);
    }

    title.classList.add('element-name');
    return title;
  }

  private static formatSmallName(name: string) {
    if (name.length < 4) {
      return name;
    } else {
      return name.charAt(0) + '..' + name.charAt(name.length - 1);
    }
  }

  static createPropertiesLabelTest(cell: Cell) {
    const modelElement = MxGraphHelper.getModelElementTest(cell);
    if (!modelElement) {
      return null;
    }

    const node = this.getElementNodeTest(cell);
    if (node.filterType === 'properties' && !(modelElement instanceof DefaultProperty || modelElement instanceof DefaultAspect)) {
      return null;
    }

    const isSmallShape = [DefaultEntityInstance].some(c => modelElement instanceof c);
    const div = this.createLabelElementTest(cell);
    const title = this.createTitleLabelElementTest(cell, isSmallShape);

    div.appendChild(title);

    if (isSmallShape) {
      title.classList.add('simple');
      const extending = modelElement as HasExtends;
      if (extending.extends_ && cell.collapsed) {
        div.removeChild(title);
      }
      return div;
    }

    if (modelElement instanceof DefaultTrait) {
      title.classList.add('simple');
      cell.collapsed && div.removeChild(title);
      return div;
    }

    const iconsBar = this.createShapeIconsBar(cell['configuration']?.baseProperties);

    // Generates an one line property to exactly calculate the height
    // After getting the height, this element is removed
    const heightGenerator = MxGraphHelper.createSpanElement({label: 'x', key: ''});
    div.appendChild(heightGenerator);

    if (cell.collapsed) {
      title.title = '';
      title.classList.add('simple');
    } else {
      iconsBar && !(modelElement instanceof DefaultEntityInstance) && div.appendChild(iconsBar);
      const fields = cell['configuration']?.fields || [];
      const extendedFields = fields.filter(({extended}) => extended);
      const normalFields = fields.filter(({extended}) => !extended);
      for (const conf of [...normalFields, ...extendedFields]) {
        div.appendChild(this.createSpanElement(conf));
      }
    }

    // to get the calculated height, the div needs to be inserted in body
    document.body.appendChild(div);

    // getting all properties
    const infoElements = Array.from(div.querySelectorAll('.element-info'));

    // getting the heightGenerator span created above
    const elementToRemove = infoElements.shift();

    // getting the height then removing the heightGenerator
    const elementHeight = elementToRemove.clientHeight;
    div.removeChild(elementToRemove);
    infoElements.push(iconsBar);

    // calculating the height for the cell for mxGraph relative with html height (41 - html, 35 - mxgraph, result: 41/35)
    const elementsSize = (elementHeight * infoElements.length + title.clientHeight) / (41 / 35) + (infoElements.length ? 30 : 0);

    if (cell.collapsed) {
      cell.geometry.width = Math.max(50, title.clientWidth + 10);
      cell.geometry.height = title.clientHeight + 15;
    } else if (!isSmallShape) {
      cell.geometry.height =
        elementsSize < cell.geometry.height && elementsSize < basicShapeGeometry.expandedHeight
          ? basicShapeGeometry.expandedHeight
          : elementsSize;
      div.style.height = cell.geometry.height + 'px';
    }

    // removing the element from body since the height was got
    document.body.removeChild(div);
    return div;
  }

  private static createShapeIconsBar(baseProperties: ModelBaseProperties) {
    if (!baseProperties) {
      return null;
    }

    const iconsBar = document.createElement('div');
    iconsBar.classList.add('icons-bar');
    const infoLock = document.createElement('div');
    infoLock.title = '';

    if (baseProperties.external && !baseProperties.predefined) {
      infoLock.title += `Namespace: ${baseProperties.namespace} \nVersion: ${baseProperties.version} \nFile: ${baseProperties.fileName}\n`;
      infoLock.classList.add('info-shape');
      iconsBar.appendChild(infoLock);
    }

    if (baseProperties.predefined) {
      infoLock.title += `SAMM Element\n`;
      infoLock.classList.add('info-shape');
      iconsBar.appendChild(infoLock);
    }

    if (baseProperties.isAbstract) {
      infoLock.title += `Abstract Element\n`;
      infoLock.classList.add('info-shape');
      iconsBar.appendChild(infoLock);
    }

    return iconsBar;
  }

  private static createSpanElement(content: ShapeAttribute) {
    const span = document.createElement('span');
    content.extended && (span.style.opacity = '0.75');
    span.classList.add('element-info');
    const sanitizedLabel = `${content.label}`.replace(/\n/g, ' ');
    span.title = (content.extended ? 'Inherited\n' : '') + content.label;
    span.innerText = sanitizedLabel;
    span.dataset.key = content.key;
    span.dataset.lang = content.lang || '';
    return span;
  }

  static updateLabelTest(cell: Cell, graph: Graph, sammLangService: SammLanguageSettingsService) {
    cell['configuration'].fields = MxGraphVisitorHelper.getElementProperties(MxGraphHelper.getModelElementTest(cell), sammLangService);
    graph.labelChanged(cell, MxGraphHelper.createPropertiesLabelTest(cell), null);
  }

  static getNamespaceFromElement(element: NamedElement) {
    const [namespace] = element?.aspectModelUrn.split('#') || ['', ''];
    const splitted = namespace.split(':');
    return [splitted.pop(), splitted.pop()];
  }

  static isChildOf(parent: NamedElement, child: NamedElement) {
    return parent.children.some(el => el.aspectModelUrn === child.aspectModelUrn);
  }
}
