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

import {Quad, Quad_Subject} from 'n3';
import {DefaultOperation, Operation} from '../aspect-meta-model/default-operation';
import {getElementsCache} from '../shared/model-element-cache.service';
import {getRdfModel, getStore} from '../shared/rdf-model';
import {getBaseProperties} from './meta-model-element-instantiator';
import {createProperty} from './property-instantiator';

export function createOperation(quad: Quad): DefaultOperation {
  const rdfModel = getRdfModel();
  const {samm} = rdfModel;
  const modelElementCache = getElementsCache();

  if (modelElementCache.get(quad.subject.value)) {
    return modelElementCache.get(quad.subject.value);
  }

  const quads = rdfModel.findAnyProperty(quad);
  const baseProperties = getBaseProperties(quad.subject);
  const operation = new DefaultOperation({
    ...baseProperties,
    input: [],
    output: null,
  });

  for (const quad of quads) {
    if (samm.isInputProperty(quad.predicate.value)) {
      const inputQuads = rdfModel.resolveBlankNodes(quad.object.value);
      operation.input = inputQuads.map(input => {
        const property = createProperty(input);
        property.addParent(operation);
        return property;
      });
      continue;
    }

    if (samm.isOutputProperty(quad.predicate.value)) {
      operation.output = createProperty(quad);
      operation.output?.addParent(operation);
    }
  }

  return modelElementCache.resolveInstance(operation);
}

export function getOperations(subject: Quad_Subject): Array<Operation> {
  const operations: Array<Operation> = [];

  const rdfModel = getRdfModel();
  const store = getStore();
  const {samm} = rdfModel;

  store.getQuads(subject, samm.OperationsProperty(), null, null).forEach(operationQuad => {
    rdfModel
      .resolveBlankNodes(operationQuad.object.value)
      .forEach(resolvedOperationQuad => operations.push(createOperation(resolvedOperationQuad)));
  });

  return operations;
}
