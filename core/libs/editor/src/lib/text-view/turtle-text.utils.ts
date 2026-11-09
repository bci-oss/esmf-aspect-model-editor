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

const PREFIX_DIRECTIVE = /^\s*(?:@prefix|PREFIX)\s+([A-Za-z][\w.-]*)?:\s*<([^>]*)>/gim;
const LOCAL_NAME = /^[\w-][\w.-]*$/;
const TOKEN_START = /[\s(,;[]/;
const TOKEN_END = /[\s;,)\]]/;

/** A part of the Turtle text, given as document offsets (`to` is exclusive). */
export interface TextRange {
  from: number;
  to: number;
}

/** A problem shown in the Turtle text: a validation issue or a reference to an element that is missing in the workspace. */
export interface TextProblem extends TextRange {
  kind: 'violation' | 'unresolved';
  message: string;
}

/** Maps prefix aliases (empty string for the default prefix) to their namespace IRI. */
export function parseTurtlePrefixes(text: string): Record<string, string> {
  const prefixes: Record<string, string> = {};
  for (const [, alias, namespace] of (text ?? '').matchAll(PREFIX_DIRECTIVE)) {
    prefixes[alias ?? ''] = namespace;
  }
  return prefixes;
}

/** All spellings under which `urn` may appear in the Turtle text (`<urn>` or `prefix:local`). */
export function turtleNamesFor(urn: string, prefixes: Record<string, string>): string[] {
  if (!urn) {
    return [];
  }

  const names = [`<${urn}>`];
  for (const [alias, namespace] of Object.entries(prefixes)) {
    const localName = urn.startsWith(namespace) ? urn.slice(namespace.length) : null;
    if (localName && LOCAL_NAME.test(localName)) {
      names.push(`${alias}:${localName}`);
    }
  }
  return names;
}

/**
 * Replaces comments and string literals with spaces, so element names inside them are not found.
 * Offsets and line breaks are kept; IRIs (which may contain `#`) stay untouched.
 */
export function maskTurtleText(text: string): string {
  const masked = text.split('');
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      if (masked[i] !== '\n') {
        masked[i] = ' ';
      }
    }
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '#') {
      const end = text.indexOf('\n', i);
      const to = end === -1 ? text.length : end;
      blank(i, to);
      i = to;
    } else if (char === '<') {
      i++;
      while (i < text.length && text[i] !== '>' && text[i] !== '\n') {
        i++;
      }
      i++;
    } else if (char === '"' || char === "'") {
      const quote = text.startsWith(char.repeat(3), i) ? char.repeat(3) : char;
      let end = i + quote.length;
      while (end < text.length && !text.startsWith(quote, end) && (quote.length === 3 || text[end] !== '\n')) {
        end += text[end] === '\\' ? 2 : 1;
      }
      const to = Math.min(text.length, end + quote.length);
      blank(i, to);
      i = to;
    } else {
      i++;
    }
  }
  return masked.join('');
}

function endsToken(text: string, index: number): boolean {
  if (index >= text.length) {
    return true;
  }
  const next = text[index];
  return TOKEN_END.test(next) || (next === '.' && (index + 1 >= text.length || /\s/.test(text[index + 1])));
}

function startsToken(text: string, index: number): boolean {
  return index === 0 || TOKEN_START.test(text[index - 1]);
}

/** All places where the element `urn` is written in the Turtle text, ignoring comments and string literals. */
export function findElementOccurrences(text: string, urn: string): TextRange[] {
  const names = turtleNamesFor(urn, parseTurtlePrefixes(text));
  if (!text || !names.length) {
    return [];
  }

  const code = maskTurtleText(text);
  const occurrences: TextRange[] = [];
  for (const name of names) {
    for (let index = code.indexOf(name); index !== -1; index = code.indexOf(name, index + 1)) {
      if (startsToken(code, index) && endsToken(code, index + name.length)) {
        occurrences.push({from: index, to: index + name.length});
      }
    }
  }
  return occurrences.sort((a, b) => a.from - b.from);
}

/**
 * Finds the element `urn` where it is defined, i.e. where it starts a statement as subject at the beginning of a line.
 * Falls back to its first reference. Returns null if the element does not occur in the text.
 */
export function findElementRange(text: string, urn: string): TextRange | null {
  const occurrences = findElementOccurrences(text, urn);
  return occurrences.find(({from}) => from === 0 || text[from - 1] === '\n') ?? occurrences[0] ?? null;
}

/** The 1-based line number of the given document offset. */
export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) {
    line++;
  }
  return line;
}

/** The 1-based line on which the element `urn` is defined (see {@link findElementRange}), or null if it does not occur. */
export function findElementLine(text: string, urn: string): number | null {
  const range = findElementRange(text, urn);
  return range ? lineAt(text, range.from) : null;
}

const SAMM_URN = 'urn:samm:';
const META_MODEL_URN = 'urn:samm:org.eclipse.esmf.samm:';
const DIRECTIVE = /^(?:@prefix|@base|PREFIX|BASE)\b/i;

function isModelElement(urn: string): boolean {
  return urn.startsWith(SAMM_URN) && !urn.startsWith(META_MODEL_URN) && urn.includes('#');
}

/** The full IRI of a Turtle name (`<iri>` or `prefix:local`), or null if it is no name or its prefix is unknown. */
function resolveName(name: string, prefixes: Record<string, string>): string | null {
  if (name.startsWith('<') && name.endsWith('>')) {
    return name.slice(1, -1);
  }
  const colon = name.indexOf(':');
  const namespace = colon === -1 ? undefined : prefixes[name.slice(0, colon)];
  return namespace === undefined ? null : namespace + name.slice(colon + 1);
}

export interface ElementRange extends TextRange {
  urn: string;
}

/**
 * The model element written at the document offset, also if the offset is right behind its name. Names in comments and
 * string literals as well as meta model elements (e.g. `samm:Property`) do not count.
 */
export function elementAt(text: string, offset: number): string | null {
  return elementRangeAt(text, offset)?.urn ?? null;
}

/** Like {@link elementAt}, with the range of the name in the text. */
export function elementRangeAt(text: string, offset: number): ElementRange | null {
  return text ? elementRangeIn(maskTurtleText(text), parseTurtlePrefixes(text), offset) : null;
}

/** The offsets of the lines defining a model element, i.e. starting with a model element as subject. */
export function elementDefinitionOffsets(text: string): number[] {
  if (!text) {
    return [];
  }
  const code = maskTurtleText(text);
  const prefixes = parseTurtlePrefixes(text);
  const offsets: number[] = [];
  for (let lineStart = 0; lineStart < code.length; lineStart = code.indexOf('\n', lineStart) + 1 || code.length) {
    if (!/\s/.test(code[lineStart]) && !DIRECTIVE.test(code.slice(lineStart, lineStart + 7)) && elementRangeIn(code, prefixes, lineStart)) {
      offsets.push(lineStart);
    }
  }
  return offsets;
}

function elementRangeIn(code: string, prefixes: Record<string, string>, offset: number): ElementRange | null {
  const inToken = (index: number) => index >= 0 && index < code.length && !/\s/.test(code[index]) && !endsToken(code, index);
  const position = inToken(offset) ? offset : offset - 1;
  if (!inToken(position)) {
    return null;
  }

  let from = position;
  while (!startsToken(code, from)) {
    from--;
  }
  let to = position + 1;
  while (!endsToken(code, to)) {
    to++;
  }

  const urn = resolveName(code.slice(from, to), prefixes);
  return urn && isModelElement(urn) ? {from, to, urn} : null;
}

/** The model element whose statement contains the document offset, i.e. the last subject starting a line before it. */
export function enclosingSubjectAt(text: string, offset: number): string | null {
  if (!text) {
    return null;
  }
  const code = maskTurtleText(text);
  let lineStart = code.lastIndexOf('\n', Math.max(0, Math.min(offset, code.length) - 1)) + 1;
  while (/\s/.test(code[lineStart] ?? ' ')) {
    if (lineStart === 0) {
      return null;
    }
    lineStart = lineStart === 1 ? 0 : code.lastIndexOf('\n', lineStart - 2) + 1;
  }
  return DIRECTIVE.test(code.slice(lineStart)) ? null : elementAt(text, lineStart);
}
