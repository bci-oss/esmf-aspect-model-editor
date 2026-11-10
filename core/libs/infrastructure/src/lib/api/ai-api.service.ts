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

import {
  AiAttachment,
  AiChatEvent,
  AiChatRequest,
  AiConversation,
  AiConversationSummary,
  AiError,
  AiLocalServer,
  AiModelInfo,
  AiPort,
  AiProposalValidation,
  AiProviderConfig,
  AiProviderInfo,
  AiTestResult,
  CopilotLoginFlow,
  CopilotStatus,
  isAiError,
} from '@ame/domain';
import {APP_CONFIG, AppConfig, BackendStatusService} from '@ame/shared';
import {HttpClient, HttpErrorResponse, HttpHeaders} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {catchError, map, Observable, throwError, timeout, TimeoutError} from 'rxjs';
import {BACKEND_TOKEN_HEADER} from './backend-auth.interceptor';
import {ServerSentEvent, ServerSentEventParser} from './server-sent-events';

/** The API key of the AI provider; never logged and never stored by the backend. */
export const AI_KEY_HEADER = 'X-Ame-Ai-Key';

const REQUEST_TIMEOUT = 60000;
/** The device flow of GitHub expires after 15 minutes. */
const COPILOT_LOGIN_TIMEOUT = 16 * 60 * 1000;
/** Extracting the text of a large document takes a while. */
const UPLOAD_TIMEOUT = 5 * 60 * 1000;
const CHAT_EVENT_TYPES = new Set<AiChatEvent['type']>(['conversation', 'delta', 'tool', 'proposal', 'done', 'error']);

/**
 * Reads the error of a response body. The error is mapped by its `code` (e.g. a missing or invalid key is sent with HTTP 400);
 * the body may additionally contain the general `error` object of the backend.
 */
export function aiErrorOfBody(body: unknown): AiError | null {
  if (typeof body === 'string') {
    try {
      return aiErrorOfBody(JSON.parse(body));
    } catch {
      return null;
    }
  }
  if (typeof body !== 'object' || body === null) return null;
  const value = body as {code?: unknown; message?: unknown; error?: {code?: unknown; message?: unknown} | null};
  const nested = typeof value.error === 'object' && value.error !== null ? value.error : {};
  const code = [value.code, nested.code].find((candidate): candidate is string => typeof candidate === 'string' && !!candidate);
  const message = [value.message, nested.message].find((candidate): candidate is string => typeof candidate === 'string' && !!candidate);
  if (code) return {code, message: message ?? code};
  return message ? {code: 'provider_error', message} : null;
}

/** Converts every failure of a request to an {@link AiError} of the contract. */
export function toAiError(error: unknown): AiError {
  if (isAiError(error)) return error;
  if (error instanceof TimeoutError) return {code: 'timeout', message: 'The AI service did not answer in time.'};
  if (error instanceof HttpErrorResponse) {
    const bodyError = aiErrorOfBody(error.error);
    if (bodyError) return bodyError;
    if (error.status === 0) return {code: 'offline', message: 'The backend is not reachable.'};
    return {code: 'provider_error', message: error.message};
  }
  if (error instanceof Error) return {code: 'offline', message: error.message};
  return {code: 'provider_error', message: String(error)};
}

/** The REST and SSE API of the AI assistant of the backend (`/ame/api/ai`). */
@Injectable({providedIn: 'root'})
export class AiApiService implements AiPort {
  private readonly http = inject(HttpClient);
  private readonly backendStatus = inject(BackendStatusService);
  private readonly config: AppConfig = inject(APP_CONFIG);

  private get aiUrl(): string {
    return `${this.backendStatus.serviceUrl()}${this.config.api.ai}`;
  }

  getProviders(): Observable<AiProviderInfo[]> {
    return this.request(this.http.get<AiProviderInfo[]>(`${this.aiUrl}/providers`));
  }

  getLocalServers(): Observable<AiLocalServer[]> {
    return this.request(this.http.get<AiLocalServer[]>(`${this.aiUrl}/local`)).pipe(
      map(servers => (servers ?? []).map(server => ({...server, models: server.models ?? []}))),
    );
  }

  getModels(provider: AiProviderConfig, key?: string): Observable<AiModelInfo[]> {
    return this.request(this.http.post<AiModelInfo[]>(`${this.aiUrl}/models`, {provider}, {headers: keyHeaders(key)})).pipe(
      map(models => models ?? []),
    );
  }

  test(provider: AiProviderConfig, key?: string): Observable<AiTestResult> {
    return this.request(this.http.post<AiTestResult>(`${this.aiUrl}/test`, {provider}, {headers: keyHeaders(key)})).pipe(
      map(result => {
        const error = result.ok ? null : aiErrorOfBody(result);
        return {ok: !!result.ok, ...(error ?? {}), models: result.models ?? undefined};
      }),
    );
  }

  getCopilotStatus(): Observable<CopilotStatus> {
    return this.request(this.http.get<CopilotStatus>(`${this.aiUrl}/copilot/status`));
  }

  startCopilotLogin(): Observable<CopilotLoginFlow> {
    return this.request(this.http.post<CopilotLoginFlow>(`${this.aiUrl}/copilot/login`, {}));
  }

  completeCopilotLogin(flowId: string): Observable<CopilotStatus> {
    return this.request(
      this.http.post<CopilotStatus>(`${this.aiUrl}/copilot/login/${encodeURIComponent(flowId)}/complete`, {}),
      COPILOT_LOGIN_TIMEOUT,
    );
  }

  cancelCopilotLogin(flowId: string): Observable<void> {
    return this.request(this.http.delete<void>(`${this.aiUrl}/copilot/login/${encodeURIComponent(flowId)}`));
  }

  setCopilotToken(token: string): Observable<CopilotStatus> {
    return this.request(this.http.post<CopilotStatus>(`${this.aiUrl}/copilot/token`, {token}));
  }

  logoutCopilot(): Observable<CopilotStatus> {
    return this.request(this.http.post<CopilotStatus>(`${this.aiUrl}/copilot/logout`, {}));
  }

  chat(request: AiChatRequest, key?: string): Observable<AiChatEvent> {
    return new Observable<AiChatEvent>(subscriber => {
      const controller = new AbortController();
      let finished = false;
      const url = `${this.aiUrl}/chat`;
      const headers: Record<string, string> = {'Content-Type': 'application/json', Accept: 'text/event-stream', ...this.tokenHeader()};
      if (key) headers[AI_KEY_HEADER] = key;

      const emit = (event: AiChatEvent) => {
        if (finished) return;
        subscriber.next(event);
        if (event.type === 'done' || event.type === 'error') {
          finished = true;
          subscriber.complete();
        }
      };

      readChatStream(url, headers, JSON.stringify(request), controller.signal, emit)
        .then(() => {
          if (!finished) {
            finished = true;
            subscriber.next({type: 'error', data: {code: 'provider_error', message: 'The answer ended unexpectedly.'}});
            subscriber.complete();
          }
        })
        .catch(error => {
          if (finished || controller.signal.aborted) return;
          finished = true;
          subscriber.next({type: 'error', data: toAiError(error)});
          subscriber.complete();
        });

      return () => {
        if (finished) return;
        finished = true;
        controller.abort();
        // the backend cancels as well when the stream is closed; the explicit cancel stops the provider at once
        this.cancelChat(request.requestId).subscribe({error: () => undefined});
      };
    });
  }

  cancelChat(requestId: string): Observable<void> {
    return this.request(this.http.post<void>(`${this.aiUrl}/chat/${encodeURIComponent(requestId)}/cancel`, {}));
  }

  getConversations(): Observable<AiConversationSummary[]> {
    return this.request(this.http.get<AiConversationSummary[]>(`${this.aiUrl}/conversations`));
  }

  getConversation(id: string): Observable<AiConversation> {
    return this.request(this.http.get<AiConversation>(this.conversationUrl(id)));
  }

  renameConversation(id: string, title: string): Observable<AiConversationSummary> {
    return this.request(this.http.patch<AiConversationSummary>(this.conversationUrl(id), {title}));
  }

  deleteConversation(id: string): Observable<void> {
    return this.request(this.http.delete<void>(this.conversationUrl(id)));
  }

  deleteAllConversations(): Observable<void> {
    return this.request(this.http.delete<void>(`${this.aiUrl}/conversations`));
  }

  validateProposal(turtle: string): Observable<AiProposalValidation> {
    return this.request(this.http.post<AiProposalValidation>(`${this.aiUrl}/proposals/validate`, {turtle})).pipe(
      map(result => ({valid: !!result?.valid, validationErrors: result?.validationErrors ?? []})),
    );
  }

  uploadAttachment(file: File): Observable<AiAttachment> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.request(this.http.post<AiAttachment>(`${this.aiUrl}/attachments`, formData), UPLOAD_TIMEOUT);
  }

  deleteAttachment(id: string): Observable<void> {
    return this.request(this.http.delete<void>(`${this.aiUrl}/attachments/${encodeURIComponent(id)}`));
  }

  private conversationUrl(id: string): string {
    return `${this.aiUrl}/conversations/${encodeURIComponent(id)}`;
  }

  private tokenHeader(): Record<string, string> {
    const token = this.backendStatus.authToken();
    return token ? {[BACKEND_TOKEN_HEADER]: token} : {};
  }

  private request<T>(request$: Observable<T>, ms = REQUEST_TIMEOUT): Observable<T> {
    return request$.pipe(
      timeout(ms),
      catchError(error => throwError(() => toAiError(error))),
    );
  }
}

function keyHeaders(key?: string): HttpHeaders {
  return key ? new HttpHeaders({[AI_KEY_HEADER]: key}) : new HttpHeaders();
}

async function readChatStream(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
  emit: (event: AiChatEvent) => void,
): Promise<void> {
  const response = await fetch(url, {method: 'POST', headers, body, signal, cache: 'no-store'});
  if (!response.ok || !response.body) {
    throw await errorOf(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new ServerSentEventParser();
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) return;
      parser
        .push(decoder.decode(value, {stream: true}))
        .map(toChatEvent)
        .filter((event): event is AiChatEvent => !!event)
        .forEach(emit);
    }
  } finally {
    reader.releaseLock();
  }
}

async function errorOf(response: Response): Promise<AiError> {
  try {
    const bodyError = aiErrorOfBody(await response.json());
    if (bodyError) return bodyError;
  } catch {
    // no JSON body
  }
  return {code: 'provider_error', message: `The AI service is not available (HTTP ${response.status}).`};
}

/** Converts a server-sent event of the chat; unknown events (e.g. heartbeats) are ignored. */
export function toChatEvent({event, data}: ServerSentEvent): AiChatEvent | null {
  if (!CHAT_EVENT_TYPES.has(event as AiChatEvent['type'])) return null;
  try {
    return {type: event, data: JSON.parse(data)} as AiChatEvent;
  } catch {
    return null;
  }
}
