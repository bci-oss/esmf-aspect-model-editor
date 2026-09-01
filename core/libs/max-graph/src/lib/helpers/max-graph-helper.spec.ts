import {
  DefaultAspect,
  DefaultCharacteristic,
  DefaultEither,
  DefaultEntity,
  DefaultEnumeration,
  DefaultOperation,
  DefaultProperty,
  DefaultTrait,
} from '@esmf/aspect-model-loader';
import {Cell, CellOverlay, Graph} from '@maxgraph/core';
import {describe, expect, it} from 'vitest';
import {MaxGraphHelper} from './max-graph-helper';

describe('MaxGraphHelper', () => {
  describe('getElementNode & getModelElement & setElementNode', () => {
    it('should get and set element node on cell', () => {
      const cell = new Cell();
      const element = new DefaultAspect({name: 'Aspect1', aspectModelUrn: 'urn:test#Aspect1', metaModelVersion: '2.1.0'});
      const node = {element, children: []} as any;

      expect(MaxGraphHelper.getElementNode(cell)).toBeNull();
      expect(MaxGraphHelper.getModelElement(cell)).toBeNull();

      MaxGraphHelper.setElementNode(cell, node);
      expect(MaxGraphHelper.getElementNode(cell)).toBe(node);
      expect(MaxGraphHelper.getModelElement(cell)).toBe(element);
    });
  });

  describe('isOptionalProperty', () => {
    it('should return false for non property or non aspect/entity parent', () => {
      const prop = new DefaultProperty({name: 'p', aspectModelUrn: 'urn:test#p', metaModelVersion: '2.1.0'});
      const char = new DefaultCharacteristic({name: 'c', aspectModelUrn: 'urn:test#c', metaModelVersion: '2.1.0'});
      expect(MaxGraphHelper.isOptionalProperty(prop, char)).toBe(false);
    });

    it('should return optional status from parent propertiesPayload', () => {
      const prop = new DefaultProperty({name: 'p', aspectModelUrn: 'urn:test#p', metaModelVersion: '2.1.0'});
      const aspect = new DefaultAspect({
        name: 'Aspect',
        aspectModelUrn: 'urn:test#Aspect',
        metaModelVersion: '2.1.0',
      });
      aspect.propertiesPayload = {
        'urn:test#p': {optional: true, notInPayload: false, payloadName: 'p'},
      };
      expect(MaxGraphHelper.isOptionalProperty(prop, aspect)).toBe(true);
    });
  });

  describe('isMetaModelPredefined & isMetaModelNotPredefined', () => {
    it('should identify predefined characteristic', () => {
      const char = new DefaultCharacteristic({name: 'c', aspectModelUrn: 'urn:test#c', isPredefined: true, metaModelVersion: '2.1.0'});
      expect(MaxGraphHelper.isMetaModelPredefined(char)).toBe(true);
      expect(MaxGraphHelper.isMetaModelNotPredefined(char)).toBe(false);
    });

    it('should identify non-predefined characteristic', () => {
      const char = new DefaultCharacteristic({name: 'c', aspectModelUrn: 'urn:test#c', isPredefined: false, metaModelVersion: '2.1.0'});
      expect(MaxGraphHelper.isMetaModelPredefined(char)).toBe(false);
      expect(MaxGraphHelper.isMetaModelNotPredefined(char)).toBe(true);
    });
  });

  describe('isComplexEnumeration', () => {
    it('should return true for enumeration with entity dataType', () => {
      const entity = new DefaultEntity({name: 'E', aspectModelUrn: 'urn:test#E', metaModelVersion: '2.1.0'});
      const enumEl = new DefaultEnumeration({
        name: 'Enum',
        aspectModelUrn: 'urn:test#Enum',
        values: [],
        dataType: entity,
        metaModelVersion: '2.1.0',
      });
      expect(MaxGraphHelper.isComplexEnumeration(enumEl)).toBe(true);
    });

    it('should return false for simple enumeration', () => {
      const enumEl = new DefaultEnumeration({
        name: 'Enum',
        aspectModelUrn: 'urn:test#Enum',
        values: [],
        metaModelVersion: '2.1.0',
      });
      expect(MaxGraphHelper.isComplexEnumeration(enumEl)).toBe(false);
    });
  });

  describe('overlay helpers', () => {
    it('should check isNewConstrainOverlayButton', () => {
      const overlay1 = {verticalAlign: 'top', offset: {x: 10}} as CellOverlay;
      const overlay2 = {verticalAlign: 'bottom', offset: {x: 10}} as CellOverlay;
      const overlay3 = {verticalAlign: 'top', offset: {x: -1}} as CellOverlay;

      expect(MaxGraphHelper.isNewConstrainOverlayButton(overlay1)).toBe(true);
      expect(MaxGraphHelper.isNewConstrainOverlayButton(overlay2)).toBe(false);
      expect(MaxGraphHelper.isNewConstrainOverlayButton(overlay3)).toBe(false);
    });

    it('should set constrain overlay offset', () => {
      const overlay = {verticalAlign: 'top', offset: {x: 10}} as CellOverlay;
      const cell = {geometry: {width: 160}} as Cell;

      MaxGraphHelper.setConstrainOverlayOffset(overlay, cell);
      expect(overlay.offset.x).toBe(20);
    });
  });

  describe('getCellAttribute', () => {
    it('should format single value and array of values', () => {
      expect(MaxGraphHelper.getCellAttribute('urn:samm:org.eclipse.esmf#Aspect')).toBe('Aspect');
      expect(MaxGraphHelper.getCellAttribute(['urn:samm:org.eclipse.esmf#A', 'urn:samm:org.eclipse.esmf#B'])).toBe('A, B');
    });
  });

  describe('establishRelation & removeRelation', () => {
    it('should establish relation between aspect and property', () => {
      const aspect = new DefaultAspect({name: 'Aspect', aspectModelUrn: 'urn:test#Aspect', metaModelVersion: '2.1.0'});
      const prop = new DefaultProperty({name: 'Prop', aspectModelUrn: 'urn:test#Prop', metaModelVersion: '2.1.0'});

      MaxGraphHelper.establishRelation(aspect, prop);
      expect(prop.parents.some(p => p.aspectModelUrn === aspect.aspectModelUrn)).toBe(true);
    });

    it('should remove relation between aspect and property', () => {
      const aspect = new DefaultAspect({name: 'Aspect', aspectModelUrn: 'urn:test#Aspect', metaModelVersion: '2.1.0'});
      const prop = new DefaultProperty({name: 'Prop', aspectModelUrn: 'urn:test#Prop', metaModelVersion: '2.1.0'});

      MaxGraphHelper.establishRelation(aspect, prop);
      MaxGraphHelper.removeRelation(aspect, prop);
      expect(prop.parents.some(p => p.aspectModelUrn === aspect.aspectModelUrn)).toBe(false);
    });
  });

  describe('overlay button getters', () => {
    it('should get overlay by alignment', () => {
      const cell = {
        overlays: [
          {verticalAlign: 'bottom', align: 'center'},
          {verticalAlign: 'top', align: 'center'},
          {verticalAlign: 'top', align: 'right'},
        ],
      } as unknown as Cell;

      expect(MaxGraphHelper.getNewShapeOverlayButton(cell)).toBe(cell.overlays[0]);
      expect(MaxGraphHelper.getTopOverlayButton(cell)).toBe(cell.overlays[1]);
      expect(MaxGraphHelper.getRightOverlayButton(cell)).toBe(cell.overlays[2]);
    });
  });

  describe('getNamespaceFromElement & isChildOf', () => {
    it('should extract namespace from element', () => {
      const el = new DefaultAspect({name: 'A', aspectModelUrn: 'urn:samm:org.eclipse.esmf:1.0.0#A', metaModelVersion: '2.1.0'});
      const result = MaxGraphHelper.getNamespaceFromElement(el);
      expect(result).toBeDefined();
    });

    it('should check isChildOf', () => {
      const parent = new DefaultAspect({name: 'Parent', aspectModelUrn: 'urn:test#Parent', metaModelVersion: '2.1.0'});
      const child = new DefaultProperty({name: 'Child', aspectModelUrn: 'urn:test#Child', metaModelVersion: '2.1.0'});

      expect(MaxGraphHelper.isChildOf(parent, child)).toBe(false);
      parent.properties.push(child);
      expect(MaxGraphHelper.isChildOf(parent, child)).toBe(true);
    });
  });

  describe('createEdgeLabel', () => {
    it('should create operation input/output label', () => {
      const inputProp = new DefaultProperty({name: 'In', aspectModelUrn: 'urn:test#In', metaModelVersion: '2.1.0'});
      const outputProp = new DefaultProperty({name: 'Out', aspectModelUrn: 'urn:test#Out', metaModelVersion: '2.1.0'});
      const op = new DefaultOperation({
        name: 'Op',
        aspectModelUrn: 'urn:test#Op',
        input: [inputProp],
        output: outputProp,
        metaModelVersion: '2.1.0',
      });

      const sourceCell = new Cell();
      MaxGraphHelper.setElementNode(sourceCell, {element: op} as any);

      const targetCellIn = new Cell();
      MaxGraphHelper.setElementNode(targetCellIn, {element: inputProp} as any);

      const edgeIn = new Cell();
      edgeIn.source = sourceCell;
      edgeIn.target = targetCellIn;

      const labelIn = MaxGraphHelper.createEdgeLabel(edgeIn, {} as Graph);
      expect(labelIn?.innerText).toBe('input');

      const targetCellOut = new Cell();
      MaxGraphHelper.setElementNode(targetCellOut, {element: outputProp} as any);

      const edgeOut = new Cell();
      edgeOut.source = sourceCell;
      edgeOut.target = targetCellOut;

      const labelOut = MaxGraphHelper.createEdgeLabel(edgeOut, {} as Graph);
      expect(labelOut?.innerText).toBe('output');
    });

    it('should create either left/right label', () => {
      const leftChar = new DefaultCharacteristic({name: 'Left', aspectModelUrn: 'urn:test#Left', metaModelVersion: '2.1.0'});
      const rightChar = new DefaultCharacteristic({name: 'Right', aspectModelUrn: 'urn:test#Right', metaModelVersion: '2.1.0'});
      const either = new DefaultEither({
        name: 'Either',
        aspectModelUrn: 'urn:test#Either',
        left: leftChar,
        right: rightChar,
        metaModelVersion: '2.1.0',
      });

      const sourceCell = new Cell();
      MaxGraphHelper.setElementNode(sourceCell, {element: either} as any);

      const targetCellLeft = new Cell();
      MaxGraphHelper.setElementNode(targetCellLeft, {element: leftChar} as any);

      const edgeLeft = new Cell();
      edgeLeft.source = sourceCell;
      edgeLeft.target = targetCellLeft;

      const labelLeft = MaxGraphHelper.createEdgeLabel(edgeLeft, {} as Graph);
      expect(labelLeft?.innerText).toBe('left');
    });
  });

  describe('createPropertiesLabel', () => {
    it('should return null if cell has no model element', () => {
      const cell = new Cell();
      expect(MaxGraphHelper.createPropertiesLabel(cell)).toBeNull();
    });

    it('should create label div for element with configuration fields', () => {
      const trait = new DefaultTrait({name: 'TestTrait', aspectModelUrn: 'urn:test#TestTrait', metaModelVersion: '2.1.0'});
      const cell = new Cell();
      cell.geometry = {width: 100, height: 50} as any;
      MaxGraphHelper.setElementNode(cell, {element: trait, filterType: 'default'} as any);
      cell['configuration'] = {fields: []};

      const label = MaxGraphHelper.createPropertiesLabel(cell);
      expect(label).toBeDefined();
      expect(label?.classList.contains('cell-label')).toBe(true);
    });

    it('should render anonymous node label with brackets and anonymous-node class', () => {
      const anonChar = new DefaultCharacteristic({
        name: '[Characteristic]',
        aspectModelUrn: 'urn:test#[Characteristic]_123',
        metaModelVersion: '2.1.0',
        isAnonymous: true,
      });
      const cell = new Cell();
      cell.geometry = {width: 100, height: 50} as any;
      MaxGraphHelper.setElementNode(cell, {element: anonChar, filterType: 'default'} as any);
      cell['configuration'] = {fields: []};

      const label = MaxGraphHelper.createPropertiesLabel(cell);
      expect(label).toBeDefined();
      const titleSpan = label.querySelector('.element-name');
      expect(titleSpan).toBeDefined();
      expect(titleSpan.textContent).toBe('[Characteristic]');
      expect(titleSpan.classList.contains('anonymous-node')).toBe(true);
    });
  });
});
