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

import {
  DefaultAspect,
  DefaultCharacteristic,
  DefaultCollection,
  DefaultConstraint,
  DefaultEither,
  DefaultEntity,
  DefaultEnumeration,
  DefaultEvent,
  DefaultOperation,
  DefaultProperty,
  DefaultQuantifiable,
  DefaultScalar,
  DefaultStructuredValue,
  DefaultTrait,
  DefaultUnit,
  DefaultValue,
} from '@esmf/aspect-model-loader';
import {describe, expect, it} from 'vitest';
import {useUpdater} from './element-updater';

describe('element-updater', () => {
  describe('DefaultCharacteristic', () => {
    it('should update and delete dataType for characteristic', () => {
      const char = new DefaultCharacteristic();
      char.isPredefined = false;
      const updater = useUpdater(char);
      const scalar = new DefaultScalar();

      updater.update(scalar);
      expect(char.dataType).toBe(scalar);

      updater.delete(scalar);
      expect(char.dataType).toBeNull();
    });
  });

  describe('DefaultEntity', () => {
    it('should remove property and extends from entity', () => {
      const entity = new DefaultEntity();
      const prop = new DefaultProperty();
      prop.aspectModelUrn = 'urn:prop1';
      entity.properties = [prop];

      const parentEntity = new DefaultEntity();
      parentEntity.aspectModelUrn = 'urn:parent';
      entity.extends_ = parentEntity;

      const updater = useUpdater(entity);

      updater.delete(prop);
      expect(entity.properties.length).toBe(0);

      updater.delete(parentEntity);
      expect(entity.extends_).toBeNull();
    });

    it('should remove property and abstract extends from abstract entity', () => {
      const absEntity = new DefaultEntity();
      absEntity.isAbstract = true;
      const prop = new DefaultProperty();
      prop.aspectModelUrn = 'urn:prop1';
      absEntity.properties = [prop];

      const parentEntity = new DefaultEntity();
      parentEntity.isAbstract = true;
      parentEntity.aspectModelUrn = 'urn:parent';
      absEntity.extends_ = parentEntity;

      const updater = useUpdater(absEntity);

      updater.delete(prop);
      expect(absEntity.properties.length).toBe(0);

      updater.delete(parentEntity);
      expect(absEntity.extends_).toBeNull();
    });
  });

  describe('DefaultAspect', () => {
    it('should delete property, operation, and event from aspect', () => {
      const aspect = new DefaultAspect();
      const prop = new DefaultProperty();
      prop.aspectModelUrn = 'urn:prop1';
      const op = new DefaultOperation();
      const event = new DefaultEvent();

      aspect.properties = [prop];
      aspect.operations = [op];
      aspect.events = [event];

      const updater = useUpdater(aspect);

      updater.delete(prop);
      expect(aspect.properties.length).toBe(0);

      updater.delete(op);
      expect(aspect.operations.length).toBe(0);

      updater.delete(event);
      expect(aspect.events.length).toBe(0);
    });
  });

  describe('DefaultCollection', () => {
    it('should update and delete elementCharacteristic and dataType', () => {
      const col = new DefaultCollection();
      const elementChar = new DefaultCharacteristic();
      elementChar.aspectModelUrn = 'urn:elemChar';
      const scalar = new DefaultScalar();

      const updater = useUpdater(col);

      updater.update(elementChar);
      expect(col.elementCharacteristic).toBe(elementChar);

      updater.update(scalar);
      expect(col.dataType).toBe(scalar);

      updater.delete(elementChar);
      expect(col.elementCharacteristic).toBeNull();

      updater.delete(scalar);
      expect(col.dataType).toBeNull();
    });
  });

  describe('DefaultEither', () => {
    it('should delete left or right branch', () => {
      const either = new DefaultEither();
      const leftChar = new DefaultCharacteristic();
      leftChar.aspectModelUrn = 'urn:left';
      const rightChar = new DefaultCharacteristic();
      rightChar.aspectModelUrn = 'urn:right';

      either.left = leftChar;
      either.right = rightChar;

      const updater = useUpdater(either);

      updater.delete(leftChar);
      expect(either.left).toBeNull();
      expect(either.right).toBe(rightChar);

      updater.delete(rightChar);
      expect(either.right).toBeNull();
    });
  });

  describe('DefaultEnumeration', () => {
    it('should delete entity dataType or values', () => {
      const enumeration = new DefaultEnumeration();
      const entity = new DefaultEntity();
      const val1 = new DefaultValue();
      val1.aspectModelUrn = 'urn:val1';
      const val2 = new DefaultValue();
      val2.aspectModelUrn = 'urn:val2';

      enumeration.dataType = entity;
      enumeration.values = [val1, val2];

      const updater = useUpdater(enumeration);

      updater.delete(val1);
      expect(enumeration.values).toEqual([val2]);

      updater.delete(entity);
      expect(enumeration.dataType).toBeNull();
      expect(enumeration.values).toEqual([]);
    });
  });

  describe('DefaultEvent & DefaultOperation', () => {
    it('should delete property from event', () => {
      const event = new DefaultEvent();
      const prop = new DefaultProperty();
      prop.aspectModelUrn = 'urn:prop';
      event.properties = [prop];

      const updater = useUpdater(event);
      updater.delete(prop);
      expect(event.properties.length).toBe(0);
    });

    it('should delete input property and output from operation', () => {
      const op = new DefaultOperation();
      const inProp = new DefaultProperty();
      inProp.aspectModelUrn = 'urn:in';
      const outProp = new DefaultProperty();
      outProp.aspectModelUrn = 'urn:out';

      op.input = [inProp];
      op.output = outProp;

      const updater = useUpdater(op);
      updater.delete(inProp);
      expect(op.input.length).toBe(0);

      updater.delete(outProp);
      expect(op.output).toBeNull();
    });
  });

  describe('DefaultProperty', () => {
    it('should update characteristic and scalar dataType', () => {
      const prop = new DefaultProperty();
      const char = new DefaultCharacteristic();
      char.aspectModelUrn = 'urn:char';
      const scalar = new DefaultScalar();

      const updater = useUpdater(prop);
      updater.update(char);
      expect(prop.characteristic).toBe(char);

      updater.update(scalar);
      expect(prop.characteristic.dataType).toBe(scalar);

      const val = new DefaultValue();
      prop.exampleValue = val;
      updater.delete(val);
      expect(prop.exampleValue).toBeNull();

      updater.delete(char);
      expect(prop.characteristic).toBeNull();
    });
  });

  describe('DefaultQuantifiable', () => {
    it('should update and delete unit and dataType', () => {
      const quantifiable = new DefaultQuantifiable();
      const unit = new DefaultUnit();
      unit.aspectModelUrn = 'urn:unit';
      const scalar = new DefaultScalar();

      const updater = useUpdater(quantifiable);
      updater.update(unit);
      expect(quantifiable.unit).toBe(unit);

      updater.update(scalar);
      expect(quantifiable.dataType).toBe(scalar);

      updater.delete(unit);
      expect(quantifiable.unit).toBeNull();
    });
  });

  describe('DefaultStructuredValue', () => {
    it('should remove elements', () => {
      const sv = new DefaultStructuredValue();
      const prop1 = new DefaultProperty();
      prop1.aspectModelUrn = 'urn:p1';
      const prop2 = new DefaultProperty();
      prop2.aspectModelUrn = 'urn:p2';

      sv.elements = [prop1, prop2, 'delimiter' as any];

      const updater = useUpdater(sv);
      updater.delete(prop1);
      expect(sv.elements).toEqual([prop2, 'delimiter']);
    });
  });

  describe('DefaultTrait', () => {
    it('should update and delete baseCharacteristic and constraints', () => {
      const trait = new DefaultTrait();
      const char = new DefaultCharacteristic();
      char.aspectModelUrn = 'urn:baseChar';
      const constraint = new DefaultConstraint();
      constraint.aspectModelUrn = 'urn:constraint';

      trait.constraints = [];

      const updater = useUpdater(trait);
      updater.update(char);
      expect(trait.baseCharacteristic).toBe(char);

      updater.update(constraint);
      expect(trait.constraints).toContain(constraint);

      updater.delete(constraint);
      expect(trait.constraints).not.toContain(constraint);

      updater.delete(char);
      expect(trait.baseCharacteristic).toBeNull();
    });
  });

  describe('fallback', () => {
    it('should provide no-op updater for unhandled types', () => {
      const updater = useUpdater({} as any);
      expect(typeof updater.update).toBe('function');
      expect(typeof updater.delete).toBe('function');
      expect(() => updater.update(new DefaultProperty())).not.toThrow();
      expect(() => updater.delete(new DefaultProperty())).not.toThrow();
    });
  });
});
