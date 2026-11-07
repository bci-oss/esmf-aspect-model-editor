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

import {QuickFix, QuickFixLiteral} from '@ame/domain';
import {DataFactory, Literal, Store, Term} from 'n3';

/** Creates the RDF literal of a value of a quick fix. */
export function toLiteral({value, datatype, language}: QuickFixLiteral): Literal {
  if (language) return DataFactory.literal(value, language);
  return DataFactory.literal(value, datatype ? DataFactory.namedNode(datatype) : undefined);
}

/** Whether the term is the literal of the quick fix value; language tags are case insensitive. */
export function isLiteralOf(term: Term, expected: QuickFixLiteral): boolean {
  if (term.termType !== 'Literal' || term.value !== expected.value) return false;

  const literal = term as Literal;
  if (expected.language || literal.language) {
    return literal.language.toLowerCase() === (expected.language ?? '').toLowerCase();
  }
  return !expected.datatype || literal.datatype.value === expected.datatype;
}

/**
 * Replaces the old value of the quick fix by the new one.
 * Returns `false` when the model does not contain the old value (anymore), e.g. because it was changed in the meantime.
 */
export function applyQuickFix(store: Store, fix: QuickFix): boolean {
  const subject = DataFactory.namedNode(fix.element);
  const predicate = DataFactory.namedNode(fix.property);
  const outdated = store.getQuads(subject, predicate, null, null).filter(quad => isLiteralOf(quad.object, fix.oldValue));

  outdated.forEach(quad => {
    store.removeQuad(quad);
    store.addQuad(DataFactory.quad(subject, predicate, toLiteral(fix.newValue), quad.graph));
  });
  return outdated.length > 0;
}
