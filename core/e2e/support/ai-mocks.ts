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

import {Page, Request, Route} from '@playwright/test';
import {API_BASE_URL} from './api-mocks';

export const AI_API_URL = `${API_BASE_URL}/ai`;

/** One server-sent event of the chat stream: `[event name, data]`. */
export type SseEvent = [string, unknown];

/** The answer of the mocked chat endpoint: a stream of events or an HTTP error. */
export type ChatReply = SseEvent[] | {status: number; body: unknown};

export interface AiBackendMock {
  /** The bodies of all chat requests. */
  chatRequests: any[];
  /** The requests of the other AI endpoints, e.g. `POST /test`. */
  requests: {method: string; path: string; key: string | null}[];
  /** Answers of the next chat requests in order; the last one is repeated. */
  replyWith(...replies: ChatReply[]): void;
}

const SETTINGS = {
  namespace: '',
  version: '',
  showEditorNav: true,
  showEditorMap: true,
  autoSaveEnabled: true,
  autoValidationEnabled: true,
  autoFormatEnabled: true,
  enableHierarchicalLayout: true,
  darkMode: false,
  validationTimerSeconds: 400,
  saveTimerSeconds: 60,
  showConnectionLabels: true,
  useSaturatedColors: false,
  copyrightHeader: [],
  aspectModelLanguages: ['en'],
  toolbarVisibility: true,
  elementOrderStrategy: 'formatterDefault',
  restoreSession: true,
  externalEditor: 'vscode',
  reloadExternalChanges: false,
};

export const LOCAL_AI = {enabled: true, provider: 'ollama', model: 'llama3', onlyLocal: false, languages: ['en', 'de'], cloudConsent: []};

/** Stores the settings with the given AI settings before the app starts; an API key is kept for the session like in the browser. */
export async function presetAi(page: Page, ai: Record<string, unknown>, key?: {provider: string; value: string}): Promise<void> {
  await page.addInitScript(
    ({settings, key}) => {
      localStorage.setItem('settings', JSON.stringify(settings));
      if (key) sessionStorage.setItem(`ame.ai.key.${key.provider}`, key.value);
    },
    {settings: {...SETTINGS, ai}, key},
  );
}

/** Builds the body of a `text/event-stream` answer. */
export function sse(events: SseEvent[]): string {
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

/** A complete answer: the conversation, the streamed text, the proposals and the end. */
export function answer(text: string[], proposals: unknown[] = []): SseEvent[] {
  return [
    ['conversation', {id: 'c1', title: 'E2E conversation'}],
    ...text.map((chunk): SseEvent => ['delta', {text: chunk}]),
    ...proposals.map((proposal): SseEvent => ['proposal', proposal]),
    ['done', {messageId: `m-${Math.random().toString(36).slice(2)}`}],
  ];
}

const PROVIDERS = [
  {kind: 'copilot', label: 'GitHub Copilot', requiresKey: false, requiresBaseUrl: false, local: false, available: true},
  {kind: 'openai', label: 'OpenAI', requiresKey: true, requiresBaseUrl: false, local: false, available: true, defaultModel: 'gpt-test'},
  {kind: 'anthropic', label: 'Anthropic', requiresKey: true, requiresBaseUrl: false, local: false, available: true},
  {kind: 'azure-openai', label: 'Azure OpenAI', requiresKey: true, requiresBaseUrl: true, local: false, available: true},
  {
    kind: 'ollama',
    label: 'Ollama',
    requiresKey: false,
    requiresBaseUrl: false,
    defaultBaseUrl: 'http://localhost:11434/v1',
    local: true,
    available: true,
  },
  {
    kind: 'lmstudio',
    label: 'LM Studio',
    requiresKey: false,
    requiresBaseUrl: false,
    defaultBaseUrl: 'http://localhost:1234/v1',
    local: true,
    available: true,
  },
  {kind: 'openai-compatible', label: 'OpenAI compatible', requiresKey: false, requiresBaseUrl: true, local: false, available: true},
];

/** Mocks the AI endpoints of the backend (`/ame/api/ai`). */
export async function mockAiBackend(page: Page): Promise<AiBackendMock> {
  let replies: ChatReply[] = [answer(['Hello'])];
  const mock: AiBackendMock = {
    chatRequests: [],
    requests: [],
    replyWith: (...next) => (replies = next),
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
  const keyOf = (request: Request) => request.headers()['x-ame-ai-key'] ?? null;

  await page.route(`${AI_API_URL}/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/ai/, '');
    const method = request.method();

    if (path === '/chat' && method === 'POST') {
      mock.chatRequests.push(request.postDataJSON());
      const reply = replies.length > 1 ? replies.shift() : replies[0];
      if (!reply) return json(route, {code: 'provider_error', message: 'No answer'}, 500);
      if (!Array.isArray(reply)) return json(route, reply.body, reply.status);
      return route.fulfill({status: 200, contentType: 'text/event-stream', body: sse(reply)});
    }

    mock.requests.push({method, path, key: keyOf(request)});
    if (path === '/providers') return json(route, PROVIDERS);
    if (path === '/local') return json(route, []);
    if (path === '/copilot/status') return json(route, {available: true, authenticated: false});
    if (path === '/models') return json(route, [{id: 'gpt-test', name: 'GPT Test'}]);
    // the backend may send `models: null`
    if (path === '/test')
      return json(route, keyOf(request) ? {ok: true, models: null} : {ok: false, code: 'invalid_key', message: 'No key'});
    if (path === '/conversations' && method === 'GET') return json(route, []);
    if (path.startsWith('/conversations/') && method === 'GET') return json(route, {code: 'provider_error', message: 'Unknown'}, 404);
    if (path === '/proposals/validate') return json(route, {valid: true, validationErrors: []});
    if (path === '/attachments' && method === 'POST') {
      const body = request.postData() ?? '';
      const name = /filename="([^"]+)"/.exec(body)?.[1] ?? 'file';
      return json(route, {id: `att-${mock.requests.length}`, name, kind: 'text', size: body.length, characters: 42, truncated: false});
    }
    if (method === 'DELETE' || path.endsWith('/cancel')) return route.fulfill({status: 204});
    return json(route, {});
  });

  return mock;
}
