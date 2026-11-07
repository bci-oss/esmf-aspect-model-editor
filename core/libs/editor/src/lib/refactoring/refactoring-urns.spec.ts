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

import {RefactoringHistoryEntry} from '@ame/domain';
import {describe, expect, it} from 'vitest';
import {elementUrn, inverseChange, inverseRequest, parseElementUrn, relocatedUrn} from './refactoring-urns';

const SPEED = 'urn:samm:org.example:1.0.0#speed';

describe('refactoring URNs', () => {
  it('parses and builds element URNs', () => {
    expect(parseElementUrn(SPEED)).toEqual({namespace: 'org.example', version: '1.0.0', name: 'speed'});
    expect(parseElementUrn('urn:samm:org.example:1.0.0')).toBeNull();
    expect(parseElementUrn(undefined)).toBeNull();
    expect(elementUrn({namespace: 'org.example', version: '1.0.0', name: 'speed'})).toBe(SPEED);
  });

  describe('relocatedUrn', () => {
    it('renames only the renamed element', () => {
      const request = {type: 'RENAME_ELEMENT' as const, urn: SPEED, newName: 'velocity'};

      expect(relocatedUrn(SPEED, request)).toBe('urn:samm:org.example:1.0.0#velocity');
      expect(relocatedUrn('urn:samm:org.example:1.0.0#Movement', request)).toBe('urn:samm:org.example:1.0.0#Movement');
    });

    it('moves the moved element into the target namespace', () => {
      const request = {type: 'MOVE_ELEMENT' as const, urn: SPEED, targetFileName: 'Shared.ttl', targetNamespace: 'org.shared'};

      expect(relocatedUrn(SPEED, request)).toBe('urn:samm:org.shared:1.0.0#speed');
    });

    it('moves all elements of a renamed namespace version', () => {
      const request = {
        type: 'RENAME_NAMESPACE' as const,
        namespace: 'org.example',
        version: '1.0.0',
        targetNamespace: 'com.example',
        targetVersion: '2.0.0',
      };

      expect(relocatedUrn(SPEED, request)).toBe('urn:samm:com.example:2.0.0#speed');
      expect(relocatedUrn('urn:samm:org.example:1.1.0#speed', request)).toBe('urn:samm:org.example:1.1.0#speed');
    });

    it('keeps URNs of refactorings that do not change URNs', () => {
      expect(
        relocatedUrn(SPEED, {type: 'RENAME_FILE', namespace: 'org.example', version: '1.0.0', fileName: 'A.ttl', newName: 'B.ttl'}),
      ).toBe(SPEED);
    });
  });

  describe('inverseRequest', () => {
    it('renames the element back', () => {
      expect(inverseRequest({type: 'RENAME_ELEMENT', urn: SPEED, newName: 'velocity'})).toEqual({
        type: 'RENAME_ELEMENT',
        urn: 'urn:samm:org.example:1.0.0#velocity',
        newName: 'speed',
      });
    });

    it('moves the element back', () => {
      expect(inverseRequest({type: 'MOVE_ELEMENT', urn: SPEED, targetFileName: 'Shared.ttl', targetNamespace: 'org.shared'})).toEqual({
        type: 'MOVE_ELEMENT',
        urn: 'urn:samm:org.shared:1.0.0#speed',
        targetNamespace: 'org.example',
        targetVersion: '1.0.0',
      });
    });

    it('renames the namespace back', () => {
      expect(
        inverseRequest({
          type: 'RENAME_NAMESPACE',
          namespace: 'org.example',
          version: '1.0.0',
          targetNamespace: 'com.example',
          targetVersion: '2.0.0',
        }),
      ).toEqual({
        type: 'RENAME_NAMESPACE',
        namespace: 'com.example',
        version: '2.0.0',
        targetNamespace: 'org.example',
        targetVersion: '1.0.0',
      });
    });
  });

  it('swaps created and removed files of a reverted refactoring', () => {
    const file = (fileName: string) => ({namespace: 'org.example', version: '1.0.0', fileName, path: fileName, readOnly: false});
    const entry: RefactoringHistoryEntry = {
      id: '1',
      description: 'Rename file',
      timestamp: 1,
      created: [file('New.ttl')],
      modified: [file('Other.ttl')],
      removed: [file('Old.ttl')],
    };

    expect(inverseChange(entry)).toEqual({...entry, created: [file('Old.ttl')], removed: [file('New.ttl')]});
  });
});
