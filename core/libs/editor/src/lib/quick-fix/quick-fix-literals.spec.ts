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

import {QuickFix} from '@ame/domain';
import {DataFactory, Literal, Store} from 'n3';
import {beforeEach, describe, expect, it} from 'vitest';
import {applyQuickFix, isLiteralOf, toLiteral} from './quick-fix-literals';

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const XSD_INT = 'http://www.w3.org/2001/XMLSchema#int';
const LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';
const ELEMENT = 'urn:samm:org.example:1.0.0#Movement';
const DESCRIPTION = 'urn:samm:org.eclipse.esmf.samm:meta-model:2.2.0#description';

const {literal, namedNode, quad} = DataFactory;

describe('quick fix literals', () => {
  describe('toLiteral', () => {
    it('creates a literal with language tag', () => {
      const result = toLiteral({value: 'Movement', datatype: LANG_STRING, language: 'en'});
      expect(result.language).toBe('en');
      expect(result.datatype.value).toBe(LANG_STRING);
    });

    it('creates a typed literal', () => {
      expect(toLiteral({value: '5', datatype: XSD_INT, language: ''}).datatype.value).toBe(XSD_INT);
    });

    it('creates a string literal without datatype', () => {
      expect(toLiteral({value: 'text'}).datatype.value).toBe(XSD_STRING);
    });
  });

  describe('isLiteralOf', () => {
    it('compares value and language tag case insensitive', () => {
      const term = literal('Movement', 'en');
      expect(isLiteralOf(term, {value: 'Movement', language: 'EN'})).toBe(true);
      expect(isLiteralOf(term, {value: 'Movement', language: 'de'})).toBe(false);
      expect(isLiteralOf(term, {value: 'Movement', datatype: XSD_STRING, language: ''})).toBe(false);
      expect(isLiteralOf(term, {value: 'Other', language: 'en'})).toBe(false);
    });

    it('compares the datatype of literals without language tag', () => {
      const term = literal('5', namedNode(XSD_INT));
      expect(isLiteralOf(term, {value: '5', datatype: XSD_INT, language: ''})).toBe(true);
      expect(isLiteralOf(term, {value: '5', datatype: XSD_STRING, language: ''})).toBe(false);
      expect(isLiteralOf(term, {value: '5'})).toBe(true);
    });

    it('ignores terms which are no literals', () => {
      expect(isLiteralOf(namedNode('urn:x#y'), {value: 'urn:x#y'})).toBe(false);
    });
  });

  describe('applyQuickFix', () => {
    let store: Store;
    const fix: QuickFix = {
      description: 'Add the language tag',
      element: ELEMENT,
      property: DESCRIPTION,
      oldValue: {value: 'A movement', datatype: XSD_STRING, language: ''},
      newValue: {value: 'A movement', datatype: LANG_STRING, language: 'en'},
    };
    const descriptions = () => store.getQuads(namedNode(ELEMENT), namedNode(DESCRIPTION), null, null).map(q => q.object as Literal);

    beforeEach(() => {
      store = new Store([
        quad(namedNode(ELEMENT), namedNode(DESCRIPTION), literal('A movement')),
        quad(namedNode(ELEMENT), namedNode(DESCRIPTION), literal('Eine Bewegung', 'de')),
      ]);
    });

    it('replaces the old value by the new one and keeps the other values', () => {
      expect(applyQuickFix(store, fix)).toBe(true);

      const values = descriptions().map(value => `${value.value}@${value.language}`);
      expect(values).toEqual(expect.arrayContaining(['A movement@en', 'Eine Bewegung@de']));
      expect(values).toHaveLength(2);
    });

    it('keeps the graph of the replaced value', () => {
      const graph = namedNode('urn:graph');
      store = new Store([quad(namedNode(ELEMENT), namedNode(DESCRIPTION), literal('A movement'), graph)]);

      applyQuickFix(store, fix);
      expect(store.getQuads(null, null, null, graph)).toHaveLength(1);
    });

    it('changes nothing when the model no longer contains the old value', () => {
      applyQuickFix(store, fix);
      expect(applyQuickFix(store, fix)).toBe(false);
      expect(applyQuickFix(store, {...fix, element: 'urn:samm:org.example:1.0.0#Other'})).toBe(false);
      expect(descriptions()).toHaveLength(2);
    });
  });
});
