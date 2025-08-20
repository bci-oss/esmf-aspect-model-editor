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

import {
  DefaultAspect,
  DefaultCharacteristic,
  DefaultEither,
  DefaultEntity,
  DefaultEnumeration,
  DefaultFixedPointConstraint,
  DefaultLengthConstraint,
  DefaultOperation,
  DefaultProperty,
  DefaultRangeConstraint,
  DefaultState,
  RdfModel,
  Type,
} from '@esmf/aspect-model-loader';
import {describe, expect} from '@jest/globals';
import {Store} from 'n3';
import {RdfModelUtil} from './rdf-model-util';

describe('Test RDF Model Util', () => {
  describe('getDataType', () => {
    test('should return Urn', () => {
      jest.fn().mockRestore();
      const expectedUrnResult = 'expectedUrnResult';
      const dataType = {
        getUrn: () => expectedUrnResult,
      } as Type;
      const result = RdfModelUtil.getDataType(dataType);
      expect(result.id).toBe(expectedUrnResult);
    });

    test('should return null', () => {
      const dataType = {
        getUrn: () => null,
      } as Type;

      const result = RdfModelUtil.getDataType(dataType);

      expect(result.id).toBe(null);
    });

    test('should return null because no dataType', () => {
      expect(RdfModelUtil.getDataType(null)).toBe(null);
    });
  });

  describe('resolveAccurateType', () => {
    let expectedElementUrn: string;
    const rdfModel = new RdfModel(new Store(), '2.1.0', null);
    const sammC = rdfModel.sammC;
    const samm = rdfModel.samm;

    test('should return DefaultLengthConstraint urn', () => {
      expectedElementUrn = sammC.MinValueProperty().value;
      const metaModelElement = new DefaultLengthConstraint({name: '', aspectModelUrn: '', metaModelVersion: ''});

      RdfModelUtil.getDataType = jest.fn().mockReturnValueOnce(expectedElementUrn);

      expect(RdfModelUtil.resolveAccurateType(metaModelElement, expectedElementUrn, rdfModel, null)).toBe(expectedElementUrn);
      expect(RdfModelUtil.getDataType).toBeCalled();
    });

    test('should return DefaultFixedPointConstraint urn', () => {
      expectedElementUrn = sammC.ScaleProperty().value;
      const metaModelElement = new DefaultFixedPointConstraint({name: '', aspectModelUrn: '', metaModelVersion: '', scale: 0, integer: 0});

      RdfModelUtil.getDataType = jest.fn().mockReturnValueOnce(expectedElementUrn);

      expect(RdfModelUtil.resolveAccurateType(metaModelElement, expectedElementUrn, rdfModel, null)).toBe(expectedElementUrn);
      expect(RdfModelUtil.getDataType).toBeCalled();
    });

    test('should return DefaultProperty urn', () => {
      expectedElementUrn = samm.ExampleValueProperty().value;
      const metaModelElement = new DefaultProperty({name: '', aspectModelUrn: '', metaModelVersion: ''});

      RdfModelUtil.getDataType = jest.fn().mockReturnValueOnce(expectedElementUrn);

      expect(RdfModelUtil.resolveAccurateType(metaModelElement, expectedElementUrn, rdfModel, null)).toBe(expectedElementUrn);
      expect(RdfModelUtil.getDataType).toBeCalled();
    });

    test('should return DefaultRangeConstraint urn', () => {
      expectedElementUrn = sammC.MinValueProperty().value;
      const metaModelElement = new DefaultRangeConstraint({name: '', aspectModelUrn: '', metaModelVersion: ''});

      RdfModelUtil.getDataType = jest.fn().mockReturnValueOnce(expectedElementUrn);

      expect(RdfModelUtil.resolveAccurateType(metaModelElement, expectedElementUrn, rdfModel, null)).toBe(expectedElementUrn);
      expect(RdfModelUtil.getDataType).toBeCalled();
    });

    test('should return DefaultEnumeration urn', () => {
      expectedElementUrn = sammC.ValuesProperty().value;
      const metaModelElement = new DefaultEnumeration({name: '', aspectModelUrn: '', metaModelVersion: '', values: []});

      RdfModelUtil.getDataType = jest.fn().mockReturnValueOnce(expectedElementUrn);

      expect(RdfModelUtil.resolveAccurateType(metaModelElement, expectedElementUrn, rdfModel, null)).toBe(expectedElementUrn);
      expect(RdfModelUtil.getDataType).toBeCalled();
    });

    test('should return DefaultState urn', () => {
      expectedElementUrn = sammC.DefaultValueProperty().value;
      const metaModelElement = new DefaultState({name: '', aspectModelUrn: '', metaModelVersion: '', values: [], defaultValue: null});

      RdfModelUtil.getDataType = jest.fn().mockReturnValueOnce(expectedElementUrn);

      expect(RdfModelUtil.resolveAccurateType(metaModelElement, expectedElementUrn, rdfModel, null)).toBe(expectedElementUrn);
      expect(RdfModelUtil.getDataType).toBeCalled();
    });

    test('should return NULL', () => {
      expectedElementUrn = null;
      const metaModelElement = new DefaultState({name: '', aspectModelUrn: '', metaModelVersion: '', values: [], defaultValue: null});

      RdfModelUtil.getDataType = jest.fn().mockReturnValueOnce(null);

      expect(RdfModelUtil.resolveAccurateType(metaModelElement, expectedElementUrn, rdfModel, null)).toBe(null);
      expect(RdfModelUtil.getDataType).toBeCalledTimes(0);
    });
  });

  describe('resolvePredicate', () => {
    const rdfModel = new RdfModel(new Store(), '2.1.0', null);
    const samm = rdfModel.samm;
    const sammC = rdfModel.sammC;
    test('should return properties property', () => {
      const parent = new DefaultAspect({name: '', aspectModelUrn: 'urn#aspect', metaModelVersion: ''});
      const child = new DefaultProperty({name: '', aspectModelUrn: 'urn#property', metaModelVersion: ''});

      expect(RdfModelUtil.resolvePredicate(child, parent, rdfModel)).toEqual(samm.PropertiesProperty());
    });

    test('should return operations property', () => {
      const parent = new DefaultAspect({name: '', aspectModelUrn: 'urn#aspect', metaModelVersion: ''});
      const child = new DefaultOperation({name: '', aspectModelUrn: 'urn#operation', metaModelVersion: '', input: [], output: null});

      expect(RdfModelUtil.resolvePredicate(child, parent, rdfModel)).toEqual(samm.OperationsProperty());
    });

    test('should return characteristic property', () => {
      const parent = new DefaultProperty({name: '', aspectModelUrn: 'urn#property', metaModelVersion: ''});
      const child = new DefaultCharacteristic({name: '', aspectModelUrn: '', metaModelVersion: ''});

      expect(RdfModelUtil.resolvePredicate(child, parent, rdfModel)).toEqual(samm.CharacteristicProperty());
    });

    test('should return type property', () => {
      const parent = new DefaultCharacteristic({name: '', aspectModelUrn: '', metaModelVersion: ''});
      const child = new DefaultEntity({name: '', aspectModelUrn: '', metaModelVersion: ''});

      expect(RdfModelUtil.resolvePredicate(child, parent, rdfModel)).toEqual(samm.DataTypeProperty());
    });

    test('should return properties property', () => {
      const parent = new DefaultEntity({name: '', aspectModelUrn: '', metaModelVersion: ''});
      const child = Object.create(DefaultProperty.prototype);

      expect(RdfModelUtil.resolvePredicate(child, parent, rdfModel)).toEqual(samm.PropertiesProperty());
    });

    test('should return right property', () => {
      const parent = new DefaultEither({name: '', aspectModelUrn: '', metaModelVersion: '', left: null, right: null});
      const rightPropertyUrn = 'rightPropertyUrn';
      parent.right = {aspectModelUrn: rightPropertyUrn} as any;

      const child = new DefaultCharacteristic({name: '', aspectModelUrn: '', metaModelVersion: ''});
      child.aspectModelUrn = rightPropertyUrn;

      expect(RdfModelUtil.resolvePredicate(child, parent, rdfModel)).toEqual(sammC.EitherRightProperty());
    });

    test('should return left property', () => {
      const parent = new DefaultEither({name: '', aspectModelUrn: '', metaModelVersion: '', left: null, right: null});
      const leftPropertyUrn = 'leftPropertyUrn';
      parent.left = {aspectModelUrn: leftPropertyUrn} as any;
      parent.right = null;

      const child = new DefaultCharacteristic({name: '', aspectModelUrn: '', metaModelVersion: ''});
      child.aspectModelUrn = leftPropertyUrn;

      expect(RdfModelUtil.resolvePredicate(child, parent, rdfModel)).toEqual(sammC.EitherLeftProperty());
    });

    test('should return NULL', () => {
      const parent = new DefaultEither({name: '', aspectModelUrn: '', metaModelVersion: '', left: null, right: null});
      const propertyUrn = 'propertyUrn';
      parent.right = null;
      parent.left = null;

      const child = new DefaultCharacteristic({name: '', aspectModelUrn: '', metaModelVersion: ''});
      child.aspectModelUrn = propertyUrn;

      expect(RdfModelUtil.resolvePredicate(child, parent, rdfModel)).toEqual(null);
    });
  });

  describe('getUrnFromFileName', () => {
    test('should construct URN based on passed file name', () => {
      const fileName = 'namespace_name:1.0.0:Aspect1.ttl';
      const expected = 'urn:samm:namespace_name:1.0.0';
      const expectation = RdfModelUtil.getUrnFromFileName(fileName);
      expect(expectation).toEqual(expected);
    });

    test('should throw on incorrect param', () => {
      const fileName = 'namespace_name';
      const expectation = () => RdfModelUtil.getUrnFromFileName(fileName);
      expect(expectation).toThrow();
    });
  });

  describe('getNamespaceFromRdf', () => {
    test('should return namespace', () => {
      const fileName = 'namespace_name:1.0.0:Aspect1.ttl';
      const expected = 'namespace_name:1.0.0';
      const expectation = RdfModelUtil.getNamespaceFromRdf(fileName);
      expect(expectation).toEqual(expected);
    });

    test('should throw on incorrect param', () => {
      const fileName = 'namespace_name';
      const expectation = () => RdfModelUtil.getNamespaceFromRdf(fileName);
      expect(expectation).toThrow();
    });
  });

  describe('getNamespaceNameFromRdf', () => {
    test('should return namespace name', () => {
      const fileName = 'namespace_name:1.0.0:Aspect1.ttl';
      const expected = 'namespace_name';
      const expectation = RdfModelUtil.getNamespaceNameFromRdf(fileName);
      expect(expectation).toEqual(expected);
    });

    test('should throw on incorrect param', () => {
      const fileName = 'namespace_name';
      const expectation = () => RdfModelUtil.getNamespaceNameFromRdf(fileName);
      expect(expectation).toThrow();
    });
  });

  describe('getNamespaceVersionFromRdf', () => {
    test('should return namespace version', () => {
      const fileName = 'namespace_name:1.0.0:Aspect1.ttl';
      const expected = '1.0.0';
      const expectation = RdfModelUtil.getNamespaceVersionFromRdf(fileName);
      expect(expectation).toEqual(expected);
    });

    test('should throw on incorrect param', () => {
      const fileName = 'namespace_name';
      const expectation = () => RdfModelUtil.getNamespaceVersionFromRdf(fileName);
      expect(expectation).toThrow();
    });
  });

  describe('getFileNameFromRdf', () => {
    test('should return file name', () => {
      const fileName = 'namespace_name:1.0.0:Aspect1.ttl';
      const expected = 'Aspect1.ttl';
      const expectation = RdfModelUtil.getFileNameFromRdf(fileName);
      expect(expectation).toEqual(expected);
    });

    test('should throw on incorrect param', () => {
      const fileName = 'namespace_name';
      const expectation = () => RdfModelUtil.getFileNameFromRdf(fileName);
      expect(expectation).toThrow();
    });
  });

  describe('splitRdfIntoChunks', () => {
    test('should return 3 chunks', () => {
      const fileName = 'namespace_name:1.0.0:Aspect1.ttl';
      const expected = ['namespace_name', '1.0.0', 'Aspect1.ttl'];
      const expectation = RdfModelUtil.splitRdfIntoChunks(fileName);
      expect(expectation).toEqual(expected);
    });

    test('should throw on less chunks', () => {
      const fileName = 'namespace_name:1.0.0';
      const expectation = () => RdfModelUtil.splitRdfIntoChunks(fileName);
      expect(expectation).toThrow();
    });

    test('should throw on more chunks', () => {
      const fileName = 'namespace_name:1.0.0:Aspect1.ttl:something';
      const expectation = () => RdfModelUtil.splitRdfIntoChunks(fileName);
      expect(expectation).toThrow();
    });

    test('should throw on no chunks', () => {
      const fileName = 'namespace_name';
      const expectation = () => RdfModelUtil.splitRdfIntoChunks(fileName);
      expect(expectation).toThrow();
    });

    test('should throw on empty string', () => {
      const fileName = '';
      const expectation = () => RdfModelUtil.splitRdfIntoChunks(fileName);
      expect(expectation).toThrow();
    });

    test('should throw on "null"', () => {
      const fileName = null;
      const expectation = () => RdfModelUtil.splitRdfIntoChunks(fileName);
      expect(expectation).toThrow();
    });
  });

  describe('buildAbsoluteFileName', () => {
    test('should return consolidated file name', () => {
      const namespace = 'namespace_name';
      const namespaceVersion = '1.0.0';
      const fileName = 'Aspect1.ttl';
      const expected = 'namespace_name:1.0.0:Aspect1.ttl';
      const expectation = RdfModelUtil.buildAbsoluteFileName(namespace, namespaceVersion, fileName);
      expect(expectation).toEqual(expected);
    });
  });
});
