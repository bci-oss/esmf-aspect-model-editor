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

import {Quad} from 'n3';
import {Aspect, DefaultCollection} from '../aspect-meta-model';
import {DefaultAspect} from '../aspect-meta-model/default-aspect';
import {getElementsCache} from '../shared/model-element-cache.service';
import {getRdfModel, getStore} from '../shared/rdf-model';
import {getEvents} from './event-instantiator';
import {getBaseProperties} from './meta-model-element-instantiator';
import {getOperations} from './operation-instantiator';
import {getProperties} from './property-instantiator';

export function createAspect(aspectModelUrn?: string): Aspect {
  const elementsCache = getElementsCache();
  let aspectQuad: Quad;
  try {
    aspectQuad = getAspectQuad(aspectModelUrn);
  } catch {
    return null;
  }
  const aspectNode = aspectQuad.subject;

  if (elementsCache.get(aspectNode.value)) {
    return elementsCache.get(aspectNode.value);
  }

  const baseProperties = getBaseProperties(aspectNode);
  const properties = getProperties(aspectNode);
  const operations = getOperations(aspectNode);
  const events = getEvents(aspectNode);

  const aspect = new DefaultAspect({
    metaModelVersion: baseProperties.metaModelVersion,
    aspectModelUrn: baseProperties.aspectModelUrn,
    hasSyntheticName: baseProperties.hasSyntheticName,
    properties,
    operations,
    events,
    name: baseProperties.name,
    isCollectionAspect: properties.some(property => property.characteristic instanceof DefaultCollection),
  });

  properties.forEach(property => property.addParent(aspect));
  operations.forEach(operation => operation.addParent(aspect));
  events.forEach(event => event.addParent(aspect));

  return elementsCache.resolveInstance(aspect);
}

function getAspectQuad(aspectModelUrn?: string): Quad {
  const {samm} = getRdfModel();
  const store = getStore();

  const aspectQuad = store.getQuads(null, samm.RdfType(), samm.Aspect(), null).find((quad, index, foundQuads) => {
    if (foundQuads.length > 1 && aspectModelUrn == undefined) {
      throw new Error('More than one aspect found. Please provide the aspectModelUrn to load the desired one.');
    }
    return foundQuads.length == 1 || (aspectModelUrn && quad.subject.value === aspectModelUrn);
  });

  if (!aspectQuad) {
    throw new Error('No aspect found. Please verify if the aspectModelUrn is correct and the ttl includes an aspect definition.');
  }

  return aspectQuad;
}
