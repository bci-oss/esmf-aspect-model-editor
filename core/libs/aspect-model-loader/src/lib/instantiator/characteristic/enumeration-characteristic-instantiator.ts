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
import {Literal, Quad, Util} from 'n3';
import {Type} from '../../aspect-meta-model';
import {DefaultEnumeration, Enumeration} from '../../aspect-meta-model/characteristic/default-enumeration';
import {DefaultEntityInstance} from '../../aspect-meta-model/default-entity-instance';
import {ScalarValue} from '../../aspect-meta-model/scalar-value';
import {Value} from '../../aspect-meta-model/value';
import {getRdfModel, getStore} from '../../shared/rdf-model';
import {Samm} from '../../vocabulary';
import {createEntity} from '../entity-instantiator';
import {generateCharacteristic, getDataType} from './characteristic-instantiator';
import {CharacteristicInstantiatorUtil, MultiLanguageText} from './characteristic-instantiator-util';

export function createEnumerationCharacteristic(quad: Quad): Enumeration {
  return generateCharacteristic(quad, (baseProperties, propertyQuads) => {
    const {samm, sammC} = getRdfModel();
    const characteristic = new DefaultEnumeration({
      ...baseProperties,
      dataType: getDataType(propertyQuads.find(propertyQuad => samm.isDataTypeProperty(propertyQuad.predicate.value))),
      values: [],
    });

    for (const propertyQuad of propertyQuads) {
      if (samm.isValueProperty(propertyQuad.predicate.value) || sammC.isValuesProperty(propertyQuad.predicate.value)) {
        if (Util.isBlankNode(propertyQuad.object)) {
          characteristic.values = getEnumerationValues(propertyQuad, characteristic.dataType);
        }
      }
    }
    return characteristic;
  });
}

export function getEnumerationValues(quad: Quad, dataType: Type): Value[] {
  const rdfModel = getRdfModel();

  const quads = rdfModel.resolveBlankNodes(quad.object.value);
  return quads.map(quadValue =>
    Util.isLiteral(quadValue.object)
      ? new ScalarValue({
          value: CharacteristicInstantiatorUtil.resolveValues(quadValue, dataType.urn),
          type: dataType,
        })
      : resolveEntityInstance(quadValue),
  );
}

export function resolveEntityInstance(quad: Quad): DefaultEntityInstance {
  const store = getStore();
  const rdfModel = getRdfModel();
  const {samm} = rdfModel;

  const entityInstanceQuads = store.getQuads(quad.object, null, null, null);
  const entityTypeQuad = entityInstanceQuads.find(entityInstanceQuad => entityInstanceQuad.predicate.value === `${Samm.RDF_URI}#type`);

  if (entityTypeQuad) {
    const entity = createEntity(store.getQuads(entityTypeQuad.object, null, null, null));

    // determine the description of the value/instance if defined
    const descriptionQuad = entityInstanceQuads.find(
      quad =>
        quad.predicate.id.toLowerCase().includes('description') &&
        entity.properties.find(property => property.notInPayload === false && quad.predicate.id),
    );
    const descriptions = new Map<string, string>();
    if (descriptionQuad) {
      entityInstanceQuads
        .filter(quad => quad.predicate.id === descriptionQuad.predicate.id)
        .forEach(quad => descriptions.set(rdfModel.getLocale(quad) || 'en', quad.object.value));
    }

    // create the related instance and attach the meta model element to it
    const entityInstance = new DefaultEntityInstance({
      name: quad.object.value.split('#')[1],
      aspectModelUrn: quad.object.value,
      metaModelVersion: samm.version,
      type: entity,
      descriptions,
    });

    entityInstanceQuads.forEach(quad => {
      if (
        rdfModel.store.getQuads(quad.predicate, null, null, null).length ||
        rdfModel.store.getQuads(null, rdfModel.samm.property(), quad.predicate, null).length
      ) {
        // multiple language quads -> push into an array
        const predicateKey = CharacteristicInstantiatorUtil.getPredicateKey(quad);
        if (entityInstance.assertions.has(predicateKey)) {
          const value = entityInstance.assertions.get(predicateKey);
          value.value = Array.isArray(value.value) ? [...value.value, resolveQuadObject(quad)] : [value.value, resolveQuadObject(quad)];
        } else {
          entityInstance.assertions.set(predicateKey, new ScalarValue({value: resolveQuadObject(quad), type: entity}));
        }
      }
    });

    return entityInstance;
  }
  throw new Error(`Could resolve Entity instance ${entityTypeQuad.subject.value}`);
}

function resolveQuadObject(quad: Quad): MultiLanguageText | Array<MultiLanguageText> | string {
  const rdfModel = getRdfModel();

  if (Util.isBlankNode(quad.object)) {
    const resolvedBlankNodes = rdfModel.resolveBlankNodes(quad.object.value);
    return CharacteristicInstantiatorUtil.solveBlankNodeValues([...resolvedBlankNodes]);
  }

  if (
    (quad.object as Literal).datatypeString === Samm.RDF_LANG_STRING ||
    (quad.object as Literal).datatypeString === Samm.XML_LANG_STRING
  ) {
    return CharacteristicInstantiatorUtil.createLanguageObject(quad);
  }

  return quad.object.value;
}
