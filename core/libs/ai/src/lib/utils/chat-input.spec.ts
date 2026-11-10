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

import {AiContextCandidate, AiModelElement} from '@ame/domain';
import {describe, expect, it} from 'vitest';
import {
  activeToken,
  commandName,
  commandOf,
  commandSuggestions,
  contextSuggestions,
  insertSuggestion,
  mentionSuggestions,
  parseChatInput,
  removeToken,
} from './chat-input';

const elements: AiModelElement[] = [
  {urn: 'urn:samm:org.example:1.0.0#Movement', name: 'Movement', type: 'Aspect'},
  {urn: 'urn:samm:org.example:1.0.0#speed', name: 'speed', type: 'Property'},
  {urn: 'urn:samm:org.example:1.0.0#isMoving', name: 'isMoving', type: 'Property'},
] as AiModelElement[];

describe('chat-input', () => {
  it('maps German and English command names', () => {
    expect(commandOf('erklären')).toBe('explain');
    expect(commandOf('Explain')).toBe('explain');
    expect(commandOf('prüfen')).toBe('review');
    expect(commandOf('beheben')).toBe('fix');
    expect(commandOf('unknown')).toBeUndefined();
    expect(commandName('translate', 'de')).toBe('übersetzen');
    expect(commandName('translate', 'en')).toBe('translate');
  });

  it('parses commands and mentions', () => {
    expect(parseChatInput('/erklären @speed und @Movement bitte', elements)).toEqual({
      command: 'explain',
      message: '@speed und @Movement bitte',
      mentionedElementUrns: ['urn:samm:org.example:1.0.0#speed', 'urn:samm:org.example:1.0.0#Movement'],
    });
    expect(parseChatInput('/unknown text', elements)).toEqual({message: '/unknown text', mentionedElementUrns: []});
    expect(parseChatInput('mail@speed @nothing', elements).mentionedElementUrns).toEqual([]);
    expect(parseChatInput('@urn:samm:org.example:1.0.0#isMoving', elements).mentionedElementUrns).toEqual([
      'urn:samm:org.example:1.0.0#isMoving',
    ]);
  });

  it('finds the token at the caret', () => {
    expect(activeToken('/erk', 4)).toEqual({kind: 'command', query: 'erk', start: 0, end: 4});
    expect(activeToken('hello @sp more', 9)).toEqual({kind: 'mention', query: 'sp', start: 6, end: 9});
    expect(activeToken('hello @sp', 8)).toEqual({kind: 'mention', query: 's', start: 6, end: 9});
    expect(activeToken('hello', 5)).toBeNull();
    expect(activeToken('/explain now', 12)).toBeNull();
  });

  it('suggests commands and elements', () => {
    expect(commandSuggestions('e', 'de').map(s => s.command)).toEqual(['explain', 'generate', 'examples']);
    expect(commandSuggestions('', 'en')).toHaveLength(7);
    expect(mentionSuggestions('m', elements).map(e => e.name)).toEqual(['Movement', 'isMoving']);
    expect(mentionSuggestions('', elements, 2)).toHaveLength(2);
  });

  it('inserts a suggestion', () => {
    const token = activeToken('hello @sp more', 9);
    expect(token).not.toBeNull();
    if (token) expect(insertSuggestion('hello @sp more', token, 'speed')).toEqual({text: 'hello @speed more', caret: 13});
    expect(insertSuggestion('/er', {kind: 'command', query: 'er', start: 0, end: 3}, 'erklären')).toEqual({text: '/erklären ', caret: 10});
  });

  describe('context with #', () => {
    const candidate = (kind: AiContextCandidate['kind'], label: string, detail: string): AiContextCandidate => ({
      kind,
      label,
      name: label,
      depth: kind === 'model' ? 2 : 1,
      detail,
      contextModel: {namespace: 'org.example'},
      sourceType: 'workspace',
      readOnly: false,
    });
    const candidates = [
      candidate('namespace', 'org.example', 'ws'),
      candidate('namespace', 'org.example:1.0.0', 'ws'),
      candidate('model', 'Movement.ttl', 'org.example:1.0.0'),
      candidate('model', 'AxisMovement.ttl', 'org.example:1.0.0'),
    ];

    it('finds the # token', () => {
      expect(activeToken('compare #mov', 12)).toEqual({kind: 'context', query: 'mov', start: 8, end: 12});
      expect(activeToken('#', 1)).toEqual({kind: 'context', query: '', start: 0, end: 1});
      expect(activeToken('urn:samm:x:1.0.0#speed', 22)).toBeNull();
      expect(activeToken('@speed#x', 8)?.kind).toBe('mention');
    });

    it('removes the token', () => {
      expect(removeToken('compare #mov with', {kind: 'context', query: 'mov', start: 8, end: 12})).toEqual({
        text: 'compare with',
        caret: 8,
      });
      expect(removeToken('#mov', {kind: 'context', query: 'mov', start: 0, end: 4})).toEqual({text: '', caret: 0});
    });

    it('suggests files first and those starting with the query', () => {
      expect(contextSuggestions('mov', candidates).map(c => c.label)).toEqual(['Movement.ttl', 'AxisMovement.ttl']);
      expect(contextSuggestions('org', candidates).map(c => c.label)).toEqual([
        'org.example',
        'org.example:1.0.0',
        'Movement.ttl',
        'AxisMovement.ttl',
      ]);
      expect(contextSuggestions('', candidates, 2)).toHaveLength(2);
    });
  });
});
