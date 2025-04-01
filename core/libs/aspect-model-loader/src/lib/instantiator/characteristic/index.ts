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

import {NamedNode, Quad, Util} from 'n3';
import {Characteristic} from '../../aspect-meta-model';
import {getRdfModel} from '../../shared/rdf-model';
import {createDefaultCharacteristic} from './characteristic-instantiator';
import {createCodeCharacteristic} from './code-characteristic-instantiator';
import {createCollectionCharacteristic} from './collection-characteristic-instantiator';
import {createDurationCharacteristic} from './duration-characteristic-instantiator';
import {createEitherCharacteristic} from './either-characteristic-instantiator';
import {createEnumerationCharacteristic} from './enumeration-characteristic-instantiator';
import {createListCharacteristic} from './list-characteristic-instantiator';
import {createMeasurementCharacteristic} from './measurement-characteristic-instantiator';
import {createQuantifiableCharacteristic} from './quantifiable-characteristic-instantiator';
import {createSetCharacteristic} from './set-characteristic-instantiator';
import {createSingleEntityCharacteristic} from './single-entity-instantiator';
import {createSortedSetCharacteristic} from './sorted-set-characteristic-instantiator';
import {createTimeSeriesCharacteristic} from './timeseries-characteristic-instantiator';
import {createTraitCharacteristic} from './trait-characteristic-instantiator';

const processors = [
  // CodeCharacteristic
  {
    process: (quad: Quad) => createCodeCharacteristic(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.CodeCharacteristic().equals(namedNode),
  },
  // CollectionCharacteristic
  {
    process: (quad: Quad) => createCollectionCharacteristic(quad, detectAndCreateCharacteristic),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.CollectionCharacteristic().equals(namedNode),
  },
  // DurationCharacteristic
  {
    process: (quad: Quad) => createDurationCharacteristic(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.DurationCharacteristic().equals(namedNode),
  },
  // EitherCharacteristic
  {
    process: (quad: Quad) => createEitherCharacteristic(quad, detectAndCreateCharacteristic),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.EitherCharacteristic().equals(namedNode),
  },
  // EnumerationCharacteristic
  {
    process: (quad: Quad) => createEnumerationCharacteristic(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.EnumerationCharacteristic().equals(namedNode),
  },
  // ListCharacteristic
  {
    process: (quad: Quad) => createListCharacteristic(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.ListCharacteristic().equals(namedNode),
  },
  // MeasurementCharacteristic
  {
    process: (quad: Quad) => createMeasurementCharacteristic(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.MeasurementCharacteristic().equals(namedNode),
  },
  // QuantifiableCharacteristic
  {
    process: (quad: Quad) => createQuantifiableCharacteristic(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.QuantifiableCharacteristic().equals(namedNode),
  },
  // SetCharacteristic
  {
    process: (quad: Quad) => createSetCharacteristic(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.SetCharacteristic().equals(namedNode),
  },
  // SingleEntityCharacteristic
  {
    process: (quad: Quad) => createSingleEntityCharacteristic(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.SingleEntityCharacteristic().equals(namedNode),
  },
  // SortedSetCharacteristic
  {
    process: (quad: Quad) => createSortedSetCharacteristic(quad, detectAndCreateCharacteristic),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.SortedSetCharacteristic().equals(namedNode),
  },
  // TimeSeriesCharacteristic
  {
    process: (quad: Quad) => createTimeSeriesCharacteristic(quad, detectAndCreateCharacteristic),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.TimeSeriesCharacteristic().equals(namedNode),
  },
  // TraitCharacteristic
  {
    process: (quad: Quad) => createTraitCharacteristic(quad, detectAndCreateCharacteristic),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.TraitCharacteristic().equals(namedNode),
  },
  // should always be last
  // DefaultCharacteristic
  {
    process: (quad: Quad) => createDefaultCharacteristic(quad),
    shouldProcess: (_namedNode?: NamedNode) => true,
  },
];

export function detectAndCreateCharacteristic(quad: Quad): Characteristic {
  if (!quad || !quad?.object) return null;

  const rdfModel = getRdfModel();
  let elementDefinitionQuad: Quad;

  if (quad.object.value.startsWith(rdfModel.sammC.getUri())) {
    elementDefinitionQuad = quad;
  } else {
    const characteristicQuads = Util.isBlankNode(quad.object)
      ? rdfModel.resolveBlankNodes(quad.object.value)
      : rdfModel.store.getQuads(quad.object, null, null, null);
    elementDefinitionQuad = characteristicQuads.find(q => rdfModel.samm.RdfType().equals(q.predicate));
  }

  if (!elementDefinitionQuad) {
    return null;
  }

  for (const processor of processors) {
    if (processor.shouldProcess(elementDefinitionQuad.object as NamedNode)) {
      return processor.process(quad);
    }
  }

  return null;
}

export {createDefaultCharacteristic} from './characteristic-instantiator';
export {createCodeCharacteristic} from './code-characteristic-instantiator';
export {createCollectionCharacteristic} from './collection-characteristic-instantiator';
export {createDurationCharacteristic} from './duration-characteristic-instantiator';
export {createEitherCharacteristic} from './either-characteristic-instantiator';
export {createEnumerationCharacteristic, resolveEntityInstance} from './enumeration-characteristic-instantiator';
export {createListCharacteristic} from './list-characteristic-instantiator';
export {createMeasurementCharacteristic} from './measurement-characteristic-instantiator';
export {createQuantifiableCharacteristic} from './quantifiable-characteristic-instantiator';
export {createSetCharacteristic} from './set-characteristic-instantiator';
export {createSingleEntityCharacteristic} from './single-entity-instantiator';
export {createSortedSetCharacteristic} from './sorted-set-characteristic-instantiator';
export {createTimeSeriesCharacteristic} from './timeseries-characteristic-instantiator';
