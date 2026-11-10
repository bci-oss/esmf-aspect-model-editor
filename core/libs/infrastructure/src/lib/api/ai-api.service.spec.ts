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

import {AiChatEvent, AiChatRequest, AiError} from '@ame/domain';
import {APP_CONFIG, AppConfig, BackendStatusService} from '@ame/shared';
import {HttpErrorResponse, provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {firstValueFrom, Subscription, TimeoutError} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AI_KEY_HEADER, AiApiService, aiErrorOfBody, toAiError, toChatEvent} from './ai-api.service';
import {BACKEND_TOKEN_HEADER} from './backend-auth.interceptor';

const aiUrl = 'http://localhost:9090/ame/api/ai';
const request: AiChatRequest = {requestId: 'req-1', provider: {kind: 'openai'}, message: 'Hello', context: {}};

function streamResponse(status = 200) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({start: c => (controller = c)});
  return {
    response: new Response(body, {status, headers: {'Content-Type': 'text/event-stream'}}),
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe('AiApiService', () => {
  let service: AiApiService;
  let http: HttpTestingController;
  let fetchMock: ReturnType<typeof vi.fn>;
  let subscription: Subscription | undefined;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {provide: APP_CONFIG, useValue: {api: {ai: '/ame/api/ai'}} as AppConfig},
        {provide: BackendStatusService, useValue: {serviceUrl: () => 'http://localhost:9090', authToken: () => 'token-1'}},
      ],
    });
    service = TestBed.inject(AiApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    subscription?.unsubscribe();
    http.verify();
    vi.unstubAllGlobals();
  });

  describe('REST endpoints', () => {
    it('loads providers and local servers', async () => {
      const providers = firstValueFrom(service.getProviders());
      http.expectOne({method: 'GET', url: `${aiUrl}/providers`}).flush([{kind: 'openai'}]);
      expect(await providers).toEqual([{kind: 'openai'}]);

      const local = firstValueFrom(service.getLocalServers());
      http.expectOne({method: 'GET', url: `${aiUrl}/local`}).flush([]);
      expect(await local).toEqual([]);
    });

    it('sends the key only in the header for models and test', async () => {
      const models = firstValueFrom(service.getModels({kind: 'openai'}, 'sk-secret'));
      const modelsRequest = http.expectOne({method: 'POST', url: `${aiUrl}/models`});
      expect(modelsRequest.request.body).toEqual({provider: {kind: 'openai'}});
      expect(modelsRequest.request.headers.get(AI_KEY_HEADER)).toBe('sk-secret');
      modelsRequest.flush([{id: 'gpt', name: 'GPT'}]);
      expect(await models).toEqual([{id: 'gpt', name: 'GPT'}]);

      const test = firstValueFrom(service.test({kind: 'ollama', baseUrl: 'http://localhost:11434'}));
      const testRequest = http.expectOne({method: 'POST', url: `${aiUrl}/test`});
      expect(testRequest.request.headers.has(AI_KEY_HEADER)).toBe(false);
      testRequest.flush({ok: false, code: 'offline', message: 'down'});
      expect(await test).toEqual({ok: false, code: 'offline', message: 'down'});
    });

    it('calls the copilot endpoints', async () => {
      const status = firstValueFrom(service.getCopilotStatus());
      http.expectOne({method: 'GET', url: `${aiUrl}/copilot/status`}).flush({available: true, authenticated: false});
      expect(await status).toEqual({available: true, authenticated: false});

      const login = firstValueFrom(service.startCopilotLogin());
      http.expectOne({method: 'POST', url: `${aiUrl}/copilot/login`}).flush({flowId: 'f/1', userCode: 'AB-CD'});
      expect((await login).userCode).toBe('AB-CD');

      const complete = firstValueFrom(service.completeCopilotLogin('f/1'));
      http.expectOne({method: 'POST', url: `${aiUrl}/copilot/login/f%2F1/complete`}).flush({available: true, authenticated: true});
      expect((await complete).authenticated).toBe(true);

      const cancel = firstValueFrom(service.cancelCopilotLogin('f1'), {defaultValue: undefined});
      http.expectOne({method: 'DELETE', url: `${aiUrl}/copilot/login/f1`}).flush(null, {status: 204, statusText: 'No Content'});
      await cancel;

      const token = firstValueFrom(service.setCopilotToken('gho_x'));
      const tokenRequest = http.expectOne({method: 'POST', url: `${aiUrl}/copilot/token`});
      expect(tokenRequest.request.body).toEqual({token: 'gho_x'});
      tokenRequest.flush({available: true, authenticated: true});
      await token;

      const logout = firstValueFrom(service.logoutCopilot());
      http.expectOne({method: 'POST', url: `${aiUrl}/copilot/logout`}).flush({available: true, authenticated: false});
      expect((await logout).authenticated).toBe(false);
    });

    it('manages conversations', async () => {
      const list = firstValueFrom(service.getConversations());
      http.expectOne({method: 'GET', url: `${aiUrl}/conversations`}).flush([{id: 'c1', title: 'A', updatedAt: ''}]);
      expect(await list).toHaveLength(1);

      const one = firstValueFrom(service.getConversation('c1'));
      http.expectOne({method: 'GET', url: `${aiUrl}/conversations/c1`}).flush({id: 'c1', messages: []});
      expect((await one).id).toBe('c1');

      const rename = firstValueFrom(service.renameConversation('c1', 'B'));
      const renameRequest = http.expectOne({method: 'PATCH', url: `${aiUrl}/conversations/c1`});
      expect(renameRequest.request.body).toEqual({title: 'B'});
      renameRequest.flush({id: 'c1', title: 'B', updatedAt: ''});
      expect((await rename).title).toBe('B');

      const remove = firstValueFrom(service.deleteConversation('c1'), {defaultValue: undefined});
      http.expectOne({method: 'DELETE', url: `${aiUrl}/conversations/c1`}).flush(null, {status: 204, statusText: 'No Content'});
      await remove;

      const clear = firstValueFrom(service.deleteAllConversations(), {defaultValue: undefined});
      http.expectOne({method: 'DELETE', url: `${aiUrl}/conversations`}).flush(null, {status: 204, statusText: 'No Content'});
      await clear;
    });

    it('validates proposals and defaults missing errors', async () => {
      const result = firstValueFrom(service.validateProposal('@prefix : <urn:samm:a:1.0.0#> .'));
      const validateRequest = http.expectOne({method: 'POST', url: `${aiUrl}/proposals/validate`});
      expect(validateRequest.request.body).toEqual({turtle: '@prefix : <urn:samm:a:1.0.0#> .'});
      validateRequest.flush({valid: true});
      expect(await result).toEqual({valid: true, validationErrors: []});
    });

    it('uploads an attachment as multipart file and deletes it', async () => {
      const file = new File(['hello'], 'notes.txt', {type: 'text/plain'});
      const upload = firstValueFrom(service.uploadAttachment(file));
      const uploadRequest = http.expectOne({method: 'POST', url: `${aiUrl}/attachments`});
      const body = uploadRequest.request.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect((body.get('file') as File).name).toBe('notes.txt');
      const attachment = {id: 'a1', name: 'notes.txt', kind: 'text', size: 5, characters: 5, truncated: false};
      uploadRequest.flush(attachment);
      expect(await upload).toEqual(attachment);

      const remove = firstValueFrom(service.deleteAttachment('a/1'), {defaultValue: undefined});
      http.expectOne({method: 'DELETE', url: `${aiUrl}/attachments/a%2F1`}).flush(null, {status: 204, statusText: 'No Content'});
      await remove;
    });

    it('maps refused attachments to AI errors', async () => {
      const upload = firstValueFrom(service.uploadAttachment(new File(['x'], 'big.pdf')));
      http
        .expectOne(`${aiUrl}/attachments`)
        .flush({code: 'attachment_too_large', message: 'Too large'}, {status: 413, statusText: 'Payload Too Large'});
      await expect(upload).rejects.toEqual({code: 'attachment_too_large', message: 'Too large'});
    });

    it('converts error responses to AI errors', async () => {
      const providers = firstValueFrom(service.getProviders());
      http
        .expectOne(`${aiUrl}/providers`)
        .flush({code: 'local_only', message: 'Only local providers'}, {status: 400, statusText: 'Bad Request'});
      await expect(providers).rejects.toEqual({code: 'local_only', message: 'Only local providers'});
    });

    it('maps a missing key sent as HTTP 400 with the error object of the backend by its code', async () => {
      const test = firstValueFrom(service.test({kind: 'openai'}));
      http
        .expectOne(`${aiUrl}/test`)
        .flush(
          {code: 'invalid_key', error: {message: 'No API key', path: '/ai/test', code: 400}},
          {status: 400, statusText: 'Bad Request'},
        );
      await expect(test).rejects.toEqual({code: 'invalid_key', message: 'No API key'});
    });

    it('tolerates missing lists of the backend', async () => {
      const test = firstValueFrom(service.test({kind: 'ollama'}));
      http.expectOne(`${aiUrl}/test`).flush({ok: true, models: null});
      expect(await test).toEqual({ok: true, models: undefined});

      const failed = firstValueFrom(service.test({kind: 'openai'}));
      http.expectOne(`${aiUrl}/test`).flush({ok: false, models: null, error: {code: 'invalid_key', message: 'Wrong key'}});
      expect(await failed).toEqual({ok: false, code: 'invalid_key', message: 'Wrong key', models: undefined});

      const models = firstValueFrom(service.getModels({kind: 'openai'}));
      http.expectOne(`${aiUrl}/models`).flush(null);
      expect(await models).toEqual([]);

      const local = firstValueFrom(service.getLocalServers());
      http.expectOne(`${aiUrl}/local`).flush([{kind: 'ollama', baseUrl: 'http://localhost:11434', models: null}]);
      expect(await local).toEqual([{kind: 'ollama', baseUrl: 'http://localhost:11434', models: []}]);
    });
  });

  describe('chat', () => {
    const collect = () => {
      const events: AiChatEvent[] = [];
      let completed = false;
      subscription = service.chat(request, 'sk-secret').subscribe({next: event => events.push(event), complete: () => (completed = true)});
      return {events, completed: () => completed};
    };
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    it('posts the request with the key and the token and streams typed events', async () => {
      const stream = streamResponse();
      fetchMock.mockResolvedValue(stream.response);

      const {events, completed} = collect();
      stream.send(sse('conversation', {id: 'c1', title: 'Hello'}) + sse('delta', {text: 'Hi'}) + ': heartbeat\n\n');
      stream.send('event: delta\ndata: {"text":" there"}\n');
      stream.send('\n' + sse('tool', {callId: 't1', name: 'validate', status: 'started'}) + sse('heartbeat', {}));
      stream.send(sse('proposal', {id: 'p1', kind: 'payload', title: 'Payload'}) + sse('done', {messageId: 'm1'}));
      await flush();

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${aiUrl}/chat`);
      expect(init.method).toBe('POST');
      expect(init.headers[AI_KEY_HEADER]).toBe('sk-secret');
      expect(init.headers[BACKEND_TOKEN_HEADER]).toBe('token-1');
      expect(init.headers.Accept).toBe('text/event-stream');
      expect(JSON.parse(init.body)).toEqual(request);
      expect(events.map(event => event.type)).toEqual(['conversation', 'delta', 'delta', 'tool', 'proposal', 'done']);
      expect(events[2]).toEqual({type: 'delta', data: {text: ' there'}});
      expect(completed()).toBe(true);
    });

    it('completes after an error event', async () => {
      const stream = streamResponse();
      fetchMock.mockResolvedValue(stream.response);

      const {events, completed} = collect();
      stream.send(sse('conversation', {id: 'c1', title: 'x'}) + sse('error', {code: 'invalid_key', message: 'bad key'}));
      await flush();

      expect(events[events.length - 1]).toEqual({type: 'error', data: {code: 'invalid_key', message: 'bad key'}});
      expect(completed()).toBe(true);
    });

    it('emits the error of a rejected request', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({code: 'local_only', message: 'Only local'}), {
          status: 403,
          headers: {'Content-Type': 'application/json'},
        }),
      );
      const {events} = collect();
      await flush();
      expect(events).toEqual([{type: 'error', data: {code: 'local_only', message: 'Only local'}}]);
    });

    it('maps a rejected request by the code of the body', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({code: 'invalid_key', error: {message: 'Missing key', code: 400}}), {
          status: 400,
          headers: {'Content-Type': 'application/json'},
        }),
      );
      const {events} = collect();
      await flush();
      expect(events).toEqual([{type: 'error', data: {code: 'invalid_key', message: 'Missing key'}}]);
    });

    it('emits offline when the backend is not reachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const {events} = collect();
      await flush();
      expect(events).toEqual([{type: 'error', data: {code: 'offline', message: 'Failed to fetch'}}]);
    });

    it('emits an error when the stream ends without done', async () => {
      const stream = streamResponse();
      fetchMock.mockResolvedValue(stream.response);
      const {events, completed} = collect();
      stream.send(sse('delta', {text: 'Hi'}));
      stream.close();
      await flush();
      expect(events[events.length - 1]?.type).toBe('error');
      expect(completed()).toBe(true);
    });

    it('aborts the stream and cancels the request when unsubscribed', async () => {
      const stream = streamResponse();
      fetchMock.mockResolvedValue(stream.response);
      const {events} = collect();
      stream.send(sse('delta', {text: 'Hi'}));
      await flush();

      subscription?.unsubscribe();
      const [, init] = fetchMock.mock.calls[0];
      expect((init.signal as AbortSignal).aborted).toBe(true);
      http.expectOne({method: 'POST', url: `${aiUrl}/chat/req-1/cancel`}).flush(null, {status: 204, statusText: 'No Content'});
      expect(events).toHaveLength(1);
    });

    it('does not cancel a finished request', async () => {
      const stream = streamResponse();
      fetchMock.mockResolvedValue(stream.response);
      collect();
      stream.send(sse('done', {messageId: 'm1'}));
      await flush();
      subscription?.unsubscribe();
      http.expectNone(`${aiUrl}/chat/req-1/cancel`);
    });
  });

  describe('helpers', () => {
    it('maps errors', () => {
      const aiError: AiError = {code: 'quota_exceeded', message: 'quota'};
      expect(toAiError(aiError)).toBe(aiError);
      expect(toAiError(new TimeoutError()).code).toBe('timeout');
      expect(toAiError(new HttpErrorResponse({status: 0})).code).toBe('offline');
      expect(toAiError(new HttpErrorResponse({status: 500, error: aiError}))).toEqual(aiError);
      expect(toAiError(new HttpErrorResponse({status: 500})).code).toBe('provider_error');
      expect(toAiError('boom')).toEqual({code: 'provider_error', message: 'boom'});
      expect(toAiError(new HttpErrorResponse({status: 400, error: {code: 'invalid_key'}}))).toEqual({
        code: 'invalid_key',
        message: 'invalid_key',
      });
    });

    it('reads the error of a response body', () => {
      expect(aiErrorOfBody({code: 'quota_exceeded', message: 'quota', error: {message: 'ignored'}})).toEqual({
        code: 'quota_exceeded',
        message: 'quota',
      });
      expect(aiErrorOfBody({error: {code: 'not_authenticated', message: 'login'}})).toEqual({code: 'not_authenticated', message: 'login'});
      expect(aiErrorOfBody({error: {message: 'Internal', code: 500}})).toEqual({code: 'provider_error', message: 'Internal'});
      expect(aiErrorOfBody('{"code":"offline","message":"down"}')).toEqual({code: 'offline', message: 'down'});
      expect(aiErrorOfBody('not json')).toBeNull();
      expect(aiErrorOfBody({error: null})).toBeNull();
      expect(aiErrorOfBody(null)).toBeNull();
    });

    it('ignores unknown and malformed events', () => {
      expect(toChatEvent({event: 'heartbeat', data: '{}'})).toBeNull();
      expect(toChatEvent({event: 'delta', data: '{broken'})).toBeNull();
      expect(toChatEvent({event: 'delta', data: '{"text":"a"}'})).toEqual({type: 'delta', data: {text: 'a'}});
    });
  });
});
