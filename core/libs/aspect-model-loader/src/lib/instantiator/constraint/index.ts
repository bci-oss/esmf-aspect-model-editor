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
import {Constraint} from '../../aspect-meta-model';
import {getRdfModel} from '../../shared/rdf-model';
import {createDefaultConstraint} from './constraint-instantiator';
import {createEncodingConstraint} from './encoding-constraint-instantiator';
import {createFixedPointConstraint} from './fixed-point-constraint-instantiator';
import {createLanguageConstraint} from './language-constraint-instantiator';
import {createLengthConstraint} from './length-constraint-instantiator';
import {createLocaleConstraint} from './locale-constraint-instantiator';
import {createRangeConstraint} from './range-constraint-instantiator';
import {createRegularExpressionConstraint} from './regular-expression-constraint-instantiator';

const processors = [
  // Constraint
  {
    process: (quad: Quad) => createDefaultConstraint(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().samm.Constraint().equals(namedNode),
  },
  // EncodingConstraint
  {
    process: (quad: Quad) => createEncodingConstraint(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.EncodingConstraint().equals(namedNode),
  },
  // FixedPointConstraint
  {
    process: (quad: Quad) => createFixedPointConstraint(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.FixedPointConstraint().equals(namedNode),
  },
  // LanguageConstraint
  {
    process: (quad: Quad) => createLanguageConstraint(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.LanguageConstraint().equals(namedNode),
  },
  // LengthConstraint
  {
    process: (quad: Quad) => createLengthConstraint(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.LengthConstraint().equals(namedNode),
  },
  // LocaleConstraint
  {
    process: (quad: Quad) => createLocaleConstraint(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.LocaleConstraint().equals(namedNode),
  },
  // RangeConstraint
  {
    process: (quad: Quad) => createRangeConstraint(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.RangeConstraint().equals(namedNode),
  },
  // RegularExpressionConstraint
  {
    process: (quad: Quad) => createRegularExpressionConstraint(quad),
    shouldProcess: (namedNode: NamedNode) => getRdfModel().sammC.RegularExpressionConstraint().equals(namedNode),
  },
];

export function detectAndCreateConstraint(quad: Quad): Constraint {
  if (!quad || !quad?.object) return null;

  const rdfModel = getRdfModel();
  const constraintQuads = Util.isBlankNode(quad.object)
    ? rdfModel.resolveBlankNodes(quad.object.value)
    : rdfModel.store.getQuads(quad.object, null, null, null);
  const elementDefinitionQuad = constraintQuads.find(q => rdfModel.samm.RdfType().equals(q.predicate));
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

export {createEncodingConstraint} from './encoding-constraint-instantiator';
export {createFixedPointConstraint} from './fixed-point-constraint-instantiator';
export {createLanguageConstraint} from './language-constraint-instantiator';
export {createLengthConstraint} from './length-constraint-instantiator';
export {createLocaleConstraint} from './locale-constraint-instantiator';
export {createRangeConstraint} from './range-constraint-instantiator';
export {createRegularExpressionConstraint} from './regular-expression-constraint-instantiator';
