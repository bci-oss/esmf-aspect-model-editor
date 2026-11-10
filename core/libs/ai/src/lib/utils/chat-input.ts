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

import {AI_COMMANDS, AiCommand, AiContextCandidate, AiModelElement} from '@ame/domain';

/** The slash commands in German and English; the first German and English names are shown. */
export const AI_COMMAND_ALIASES: Readonly<Record<AiCommand, {de: string[]; en: string[]}>> = {
  explain: {de: ['erklären', 'erklaeren'], en: ['explain']},
  describe: {de: ['beschreiben'], en: ['describe']},
  translate: {de: ['übersetzen', 'uebersetzen'], en: ['translate']},
  generate: {de: ['erzeugen'], en: ['generate']},
  review: {de: ['prüfen', 'pruefen'], en: ['review']},
  examples: {de: ['beispiele'], en: ['examples']},
  fix: {de: ['beheben'], en: ['fix']},
};

export interface ParsedChatInput {
  command?: AiCommand;
  /** The text without the command. */
  message: string;
  mentionedElementUrns: string[];
}

export interface InputToken {
  kind: 'command' | 'mention' | 'context';
  /** Text after `/`, `@` or `#` up to the caret. */
  query: string;
  /** Index of `/`, `@` or `#`. */
  start: number;
  /** Index after the token. */
  end: number;
}

export interface CommandSuggestion {
  command: AiCommand;
  /** The name shown and inserted, e.g. `erklären`. */
  name: string;
}

const MENTION = /(^|\s)@([\w.:#-]+)/;

/** The command for a name in any language, e.g. `erklären` and `explain` are `explain`. */
export function commandOf(name: string): AiCommand | undefined {
  const lower = name.toLowerCase();
  return AI_COMMANDS.find(command => [...AI_COMMAND_ALIASES[command].de, ...AI_COMMAND_ALIASES[command].en].includes(lower));
}

export function commandName(command: AiCommand, language: string): string {
  const aliases = AI_COMMAND_ALIASES[command];
  return (language === 'de' ? aliases.de[0] : aliases.en[0]) ?? command;
}

/** Splits the input into the command, the message and the mentioned elements. */
export function parseChatInput(text: string, elements: AiModelElement[]): ParsedChatInput {
  let message = text.trim();
  let command: AiCommand | undefined;

  const commandMatch = /^\/(\S+)\s*/.exec(message);
  if (commandMatch) {
    command = commandOf(commandMatch[1]);
    if (command) message = message.slice(commandMatch[0].length).trim();
  }

  const urns = new Set<string>();
  const mention = new RegExp(MENTION.source, 'g');
  for (let match = mention.exec(message); match; match = mention.exec(message)) {
    const element = findElement(match[2], elements);
    if (element) urns.add(element.urn);
  }

  return {...(command ? {command} : {}), message, mentionedElementUrns: [...urns]};
}

function findElement(reference: string, elements: AiModelElement[]): AiModelElement | undefined {
  return elements.find(element => element.urn === reference) ?? elements.find(element => element.name === reference);
}

/** The command or mention the caret is in, used for the autocompletion. */
export function activeToken(text: string, caret: number): InputToken | null {
  const before = text.slice(0, caret);
  const command = /^\/(\S*)$/.exec(before);
  if (command) return {kind: 'command', query: command[1], start: 0, end: tokenEnd(text, caret)};

  const mention = /(^|\s)@([\w.:#-]*)$/.exec(before);
  if (mention) {
    const start = caret - mention[2].length - 1;
    return {kind: 'mention', query: mention[2], start, end: tokenEnd(text, caret)};
  }

  const context = /(^|\s)#([^\s#]*)$/.exec(before);
  if (context) {
    const start = caret - context[2].length - 1;
    return {kind: 'context', query: context[2], start, end: tokenEnd(text, caret)};
  }
  return null;
}

function tokenEnd(text: string, caret: number): number {
  const rest = /^\S*/.exec(text.slice(caret));
  return caret + (rest ? rest[0].length : 0);
}

export function commandSuggestions(query: string, language: string): CommandSuggestion[] {
  const lower = query.toLowerCase();
  return AI_COMMANDS.filter(command => {
    const aliases = AI_COMMAND_ALIASES[command];
    return [...aliases.de, ...aliases.en].some(alias => alias.startsWith(lower));
  }).map(command => ({command, name: commandName(command, language)}));
}

export function mentionSuggestions(query: string, elements: AiModelElement[], limit = 8): AiModelElement[] {
  const lower = query.toLowerCase();
  const matching = elements.filter(element => element.name.toLowerCase().includes(lower));
  // names starting with the query first
  return matching
    .sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(lower)) - Number(!b.name.toLowerCase().startsWith(lower)) || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** Replaces the token by the chosen suggestion and returns the new text and caret position. */
export function insertSuggestion(text: string, token: InputToken, value: string): {text: string; caret: number} {
  const prefix = token.kind === 'command' ? '/' : '@';
  const insert = `${prefix}${value} `;
  const rest = text.slice(token.end).replace(/^ /, '');
  return {text: text.slice(0, token.start) + insert + rest, caret: token.start + insert.length};
}

/** Removes the token, e.g. `#query` after a context candidate was chosen, and returns the new text and caret position. */
export function removeToken(text: string, token: InputToken): {text: string; caret: number} {
  const rest = text.slice(token.end);
  const before = text.slice(0, token.start);
  const joined = before.endsWith(' ') || !before ? rest.replace(/^ /, '') : rest;
  return {text: before + joined, caret: token.start};
}

/** The candidates for `#` whose label or detail contains the query; files and labels starting with the query first. */
export function contextSuggestions(query: string, candidates: AiContextCandidate[], limit = 8): AiContextCandidate[] {
  const lower = query.toLowerCase();
  const rank = (candidate: AiContextCandidate) =>
    Number(!candidate.label.toLowerCase().startsWith(lower)) * 2 + Number(candidate.kind !== 'model');
  return candidates
    .filter(candidate => candidate.label.toLowerCase().includes(lower) || candidate.detail.toLowerCase().includes(lower))
    .map((candidate, index) => ({candidate, index}))
    .sort((a, b) => rank(a.candidate) - rank(b.candidate) || a.index - b.index)
    .slice(0, limit)
    .map(({candidate}) => candidate);
}
