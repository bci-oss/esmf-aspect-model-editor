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

import {describe, expect, it} from 'vitest';
import {diffHunks, diffLines, diffStats} from './line-diff';

describe('line-diff', () => {
  it('returns only same lines for equal texts', () => {
    const lines = diffLines('a\nb\n', 'a\nb\n');
    expect(lines.map(line => line.type)).toEqual(['same', 'same']);
    expect(diffStats(lines)).toEqual({added: 0, removed: 0});
    expect(diffHunks(lines)).toEqual([]);
  });

  it('finds added, removed and changed lines with line numbers', () => {
    const lines = diffLines('a\nb\nc\nd', 'a\nx\nc\nd\ne');
    expect(lines).toEqual([
      {type: 'same', text: 'a', oldLine: 1, newLine: 1},
      {type: 'removed', text: 'b', oldLine: 2},
      {type: 'added', text: 'x', newLine: 2},
      {type: 'same', text: 'c', oldLine: 3, newLine: 3},
      {type: 'same', text: 'd', oldLine: 4, newLine: 4},
      {type: 'added', text: 'e', newLine: 5},
    ]);
    expect(diffStats(lines)).toEqual({added: 2, removed: 1});
  });

  it('uses the longest common subsequence', () => {
    const lines = diffLines('x\na\nb\nc', 'a\nb\nc\nx');
    expect(lines.filter(line => line.type === 'same').map(line => line.text)).toEqual(['a', 'b', 'c']);
  });

  it('handles empty texts and CRLF', () => {
    expect(diffLines('', 'a').map(line => line.type)).toEqual(['added']);
    expect(diffLines('a\r\nb', 'a\nb').every(line => line.type === 'same')).toBe(true);
    expect(diffLines('a', '')).toEqual([{type: 'removed', text: 'a', oldLine: 1}]);
  });

  it('collapses unchanged lines outside the context', () => {
    const old = Array.from({length: 20}, (_, i) => `l${i}`).join('\n');
    const changed = old.replace('l10', 'changed');
    const hunks = diffHunks(diffLines(old, changed), 2);
    expect(hunks[0]).toEqual({type: 'same', text: '', skipped: 8});
    expect(hunks.slice(1, 7).map(line => line.text)).toEqual(['l8', 'l9', 'l10', 'changed', 'l11', 'l12']);
    expect(hunks[hunks.length - 1]).toEqual({type: 'same', text: '', skipped: 7});
  });
});
