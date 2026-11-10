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

export type DiffLineType = 'same' | 'added' | 'removed';

export interface DiffLine {
  type: DiffLineType;
  text: string;
  /** Line number in the old text (same/removed). */
  oldLine?: number;
  /** Line number in the new text (same/added). */
  newLine?: number;
}

export interface DiffHunkLine extends DiffLine {
  /** Unchanged lines between changes that are not shown. */
  skipped?: number;
}

/** Above this size the diff falls back to replacing the changed middle part to stay fast. */
const MAX_LCS_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Line diff of two texts based on the longest common subsequence. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  // common prefix and suffix are equal anyway; this keeps the LCS table small
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const result: DiffLine[] = [];
  for (let i = 0; i < start; i++) result.push({type: 'same', text: a[i], oldLine: i + 1, newLine: i + 1});
  result.push(...diffMiddle(a, b, start, endA, endB));
  for (let i = endA, j = endB; i < a.length; i++, j++) result.push({type: 'same', text: a[i], oldLine: i + 1, newLine: j + 1});
  return result;
}

function diffMiddle(a: string[], b: string[], start: number, endA: number, endB: number): DiffLine[] {
  const n = endA - start;
  const m = endB - start;
  const removed = (i: number): DiffLine => ({type: 'removed', text: a[i], oldLine: i + 1});
  const added = (j: number): DiffLine => ({type: 'added', text: b[j], newLine: j + 1});

  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) {
    return [...range(start, endA).map(removed), ...range(start, endB).map(added)];
  }

  // lengths[i][j]: LCS of a[start+i..endA) and b[start+j..endB)
  const lengths: Uint32Array[] = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i][j] = a[start + i] === b[start + j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      lines.push({type: 'same', text: a[start + i], oldLine: start + i + 1, newLine: start + j + 1});
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      lines.push(removed(start + i++));
    } else {
      lines.push(added(start + j++));
    }
  }
  while (i < n) lines.push(removed(start + i++));
  while (j < m) lines.push(added(start + j++));
  return lines;
}

function range(from: number, to: number): number[] {
  return Array.from({length: Math.max(0, to - from)}, (_, index) => from + index);
}

/** Only the changed lines with some unchanged lines around them; the others are collapsed into a `skipped` marker. */
export function diffHunks(lines: DiffLine[], context = 3): DiffHunkLine[] {
  const visible = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.type === 'same') return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) visible[k] = true;
  });

  const result: DiffHunkLine[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (visible[index]) {
      if (skipped) result.push({type: 'same', text: '', skipped});
      skipped = 0;
      result.push(line);
    } else {
      skipped++;
    }
  });
  if (skipped && result.length) result.push({type: 'same', text: '', skipped});
  return result;
}

export function diffStats(lines: DiffLine[]): {added: number; removed: number} {
  return {
    added: lines.filter(line => line.type === 'added').length,
    removed: lines.filter(line => line.type === 'removed').length,
  };
}
