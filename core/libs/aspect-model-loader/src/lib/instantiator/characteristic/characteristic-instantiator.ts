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

import {Quad, Util} from 'n3';
import {Characteristic, DefaultCharacteristic, DefaultScalar, Entity, Type} from '../../aspect-meta-model';
import {getElementsCache} from '../../shared/model-element-cache.service';
import {NamedElementProps} from '../../shared/props';
import {getRdfModel, getStore} from '../../shared/rdf-model';
import {createEntity} from '../entity-instantiator';
import {getBaseProperties} from '../meta-model-element-instantiator';
import {createPredefinedCharacteristic} from './predefined-characteristic-instantiator';

function getPredefinedCharacteristic(quad: Quad): DefaultCharacteristic {
  const rdfModel = getRdfModel();
  const {sammC} = rdfModel;

  // resolve actual element quad in case of a blank node which is most likely the case
  // for characteristics
  const elementQuad = Util.isBlankNode(quad.object) ? rdfModel.resolveBlankNodes(quad.object.value).shift() : quad;

  // check if the found quad target a default SAMM characteristic e.g. Text or Code in this case
  // return the exiting default characteristic
  return elementQuad.object.value.startsWith(sammC.getNamespace()) ? createPredefinedCharacteristic(elementQuad.object.value) : null;
}

function getEffectiveType(quad: Quad): Quad {
  const rdfModel = getRdfModel();
  const store = getStore();
  const {samm} = rdfModel;

  if (Util.isBlankNode(quad.subject)) {
    const resolvedQuads: Quad[] = samm.isDataTypeProperty(quad.predicate.value) ? [quad] : store.getQuads(quad.subject, null, null, null);
    return resolvedQuads.find(propertyQuad => samm.isDataTypeProperty(propertyQuad.predicate.value));
  }

  if (quad.predicate.value === `${samm.getRdfSyntaxNameSpace()}type`) {
    const resolvedQuad = store.getQuads(quad.subject, null, null, null);
    return resolvedQuad.find(propertyQuad => samm.isDataTypeProperty(propertyQuad.predicate.value));
  }

  return quad;
}

function isEntity(quad: Quad): boolean {
  const rdfModel = getRdfModel();
  const {samm} = rdfModel;

  if (samm.Entity().equals(quad.object) || samm.AbstractEntity().equals(quad.object)) {
    return true;
  }

  const propertyFound = rdfModel.findAnyProperty(quad).find(quadProperty => samm.Entity().equals(quadProperty.subject));

  return !!propertyFound;
}

export function generateCharacteristicName(characteristic: Characteristic) {
  const modelElementCache = getElementsCache();
  const rdfModel = getRdfModel();

  const initialName: string = characteristic.name;

  // assign a unique random name
  characteristic.name = characteristic.name ? characteristic.name : 'characteristic_' + Math.random().toString(36).substring(2, 9);
  characteristic.aspectModelUrn = `${rdfModel.getAspectModelUrn()}${characteristic.name}`;
  characteristic.syntheticName = true;
  modelElementCache.addElement(initialName, characteristic);
}

export function getDataType(quad: Quad): Type {
  const modelElementCache = getElementsCache();
  const rdfModel = getRdfModel();
  const store = getStore();
  const {samm} = rdfModel;

  // Not every characteristic has a dataType e.g. the Either characteristic.
  // Thus, null is a valid value and needs to be considered.
  if (!quad) {
    return null;
  }

  if (Util.isBlankNode(quad.object)) {
    quad = rdfModel.resolveBlankNodes(quad.object.value).shift();
  }

  const typeQuad: Quad = quad ? getEffectiveType(quad) : null;

  if (!typeQuad) {
    return null;
  }

  const quadEntity = store.getQuads(typeQuad.object, null, null, null);
  if (quadEntity && quadEntity.length > 0 && isEntity(quadEntity[0])) {
    const entity = createEntity(
      quadEntity,
      quadEntity.find(quad => samm.isRdfTypeProperty(quad.predicate.value) && samm.isAbstractEntity(quad.object.value)) !== undefined,
    );
    return modelElementCache.resolveInstance(entity);
  }

  return new DefaultScalar({urn: typeQuad.object.value, metaModelVersion: samm.version});
}

export function createDefaultCharacteristic(quad: Quad): DefaultCharacteristic {
  const predefinedCharacteristic = getPredefinedCharacteristic(quad);
  if (predefinedCharacteristic) return predefinedCharacteristic;

  return generateCharacteristic<DefaultCharacteristic>(quad, (baseProperties, propertyQuads) => {
    const {samm} = getRdfModel();
    return new DefaultCharacteristic({
      ...baseProperties,
      dataType: getDataType(propertyQuads.find(propertyQuad => samm.isDataTypeProperty(propertyQuad.predicate.value))),
    });
  });
}

export function generateCharacteristic<C extends Characteristic>(
  quad: Quad,
  characteristicTypeFactory: (baseProperties: NamedElementProps, propertyQuads: Quad[]) => C,
): C {
  const modelElementCache = getElementsCache();
  if (modelElementCache.get(quad.object.value)) return modelElementCache.get(quad.object.value);

  const rdfModel = getRdfModel();

  const isAnonymous = Util.isBlankNode(quad.object);
  const propertyQuads: Quad[] = rdfModel.findAnyProperty(quad);
  const elementQuad = isAnonymous ? rdfModel.resolveBlankNodes(quad.object.value).shift() : propertyQuads.shift();
  const baseProperties = getBaseProperties(elementQuad.subject);

  const characteristic: C = characteristicTypeFactory(baseProperties, propertyQuads);

  characteristic.anonymous = isAnonymous;
  if (characteristic.dataType?.isComplexType()) {
    (characteristic.dataType as Entity).addParent(characteristic);
  }

  if (characteristic.isAnonymous()) {
    generateCharacteristicName(characteristic);
  }

  return modelElementCache.resolveInstance(characteristic);
}
