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
import {Constraint, DefaultConstraint} from '../../aspect-meta-model';
import {getElementsCache} from '../../shared/model-element-cache.service';
import {NamedElementProps} from '../../shared/props';
import {getRdfModel} from '../../shared/rdf-model';
import {getBaseProperties} from '../meta-model-element-instantiator';

export function createDefaultConstraint(quad: Quad): DefaultConstraint {
  return generateConstraint(quad, baseProperties => {
    return new DefaultConstraint({...baseProperties});
  });
}

export function generateConstraint<C extends Constraint>(
  quad: Quad,
  constraintFactory: (baseProperties: NamedElementProps, propertyQuads: Quad[]) => C,
): C {
  const modelElementCache = getElementsCache();
  if (modelElementCache.get(quad.subject.value)) return modelElementCache.get(quad.subject.value);

  const rdfModel = getRdfModel();

  const isAnonymous = Util.isBlankNode(quad.object);
  const propertyQuads: Quad[] = rdfModel.findAnyProperty(quad);
  const elementQuad = isAnonymous ? rdfModel.resolveBlankNodes(quad.object.value).shift() : propertyQuads.shift();
  const baseProperties = getBaseProperties(elementQuad.subject);

  const constraint: C = constraintFactory(baseProperties, propertyQuads);

  constraint.anonymous = isAnonymous;
  if (constraint.isAnonymous()) {
    generateConstraintName(constraint);
  }

  return modelElementCache.resolveInstance(constraint);
}

export function generateConstraintName(constraint: Constraint) {
  const modelElementCache = getElementsCache();
  const rdfModel = getRdfModel();

  const initialName: string = constraint.name;

  // assign a unique random name
  constraint.name = constraint.name ? constraint.name : 'constraint_' + Math.random().toString(36).substring(2, 9);
  constraint.aspectModelUrn = `${rdfModel.getAspectModelUrn()}${constraint.name}`;
  constraint.syntheticName = true;
  modelElementCache.addElement(initialName, constraint);
}
