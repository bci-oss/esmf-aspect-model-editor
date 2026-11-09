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

import {WorkspaceEvent} from '@ame/domain';
import {APP_CONFIG, AppConfig, BackendStatusService} from '@ame/shared';
import {TestBed} from '@angular/core/testing';
import {Subscription} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BACKEND_TOKEN_HEADER} from './backend-auth.interceptor';
import {WORKSPACE_EVENTS_IDLE_TIMEOUT, WorkspaceEventsApiService, workspaceEventsRetryDelay} from './workspace-events-api.service';

const eventsUrl = 'http://localhost:9090/ame/api/workspaces/events';
const changedFile = {namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl', path: '/ws/Movement.ttl', readOnly: false};

/** A response whose body stays open until `close` is called, like the stream of the backend. */
function streamResponse() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({start: c => (controller = c)});
  return {
    response: new Response(body, {status: 200, headers: {'Content-Type': 'text/event-stream'}}),
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}

describe('WorkspaceEventsApiService', () => {
  let service: WorkspaceEventsApiService;
  let fetchMock: ReturnType<typeof vi.fn>;
  let token: string | null;
  let subscription: Subscription | undefined;
  let events: WorkspaceEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    token = null;
    events = [];
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    TestBed.configureTestingModule({
      providers: [
        {provide: APP_CONFIG, useValue: {api: {workspaces: '/ame/api/workspaces'}} as AppConfig},
        {provide: BackendStatusService, useValue: {serviceUrl: () => 'http://localhost:9090', authToken: () => token}},
      ],
    });
    service = TestBed.inject(WorkspaceEventsApiService);
  });

  afterEach(() => {
    subscription?.unsubscribe();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const subscribe = () => (subscription = service.events().subscribe(event => events.push(event)));
  const flush = () => vi.advanceTimersByTimeAsync(0);

  it('emits ready and file changes and skips heartbeats', async () => {
    const stream = streamResponse();
    fetchMock.mockResolvedValue(stream.response);

    subscribe();
    stream.send('event: ready\ndata: {}\n\nevent: heartbeat\ndata: {}\n\n');
    stream.send(`event: files-changed\ndata: ${JSON.stringify({created: [], modified: [changedFile], removed: []})}\n\n`);
    await flush();

    expect(events).toEqual([{type: 'ready'}, {type: 'files-changed', change: {created: [], modified: [changedFile], removed: []}}]);
  });

  it('requests the event stream with the backend token', async () => {
    token = 'secret';
    fetchMock.mockResolvedValue(streamResponse().response);

    subscribe();
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(eventsUrl, expect.objectContaining({cache: 'no-store'}));
    expect(fetchMock.mock.calls[0][1].headers).toEqual({Accept: 'text/event-stream', [BACKEND_TOKEN_HEADER]: 'secret'});
  });

  it('sends no token header when the backend does not need one', async () => {
    fetchMock.mockResolvedValue(streamResponse().response);

    subscribe();
    await flush();

    expect(fetchMock.mock.calls[0][1].headers).toEqual({Accept: 'text/event-stream'});
  });

  it('aborts the request on unsubscribe', async () => {
    fetchMock.mockResolvedValue(streamResponse().response);

    subscribe();
    await flush();
    subscription!.unsubscribe();

    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  });

  it('reconnects with backoff after failures', async () => {
    const stream = streamResponse();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('unauthorized', {status: 401}))
      .mockResolvedValueOnce(stream.response);

    subscribe();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(workspaceEventsRetryDelay(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(workspaceEventsRetryDelay(2));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    stream.send('event: ready\ndata: {}\n\n');
    await flush();
    expect(events).toEqual([{type: 'ready'}]);
  });

  it('reconnects when the backend closes the stream', async () => {
    const first = streamResponse();
    const second = streamResponse();
    fetchMock.mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);

    subscribe();
    first.send('event: ready\ndata: {}\n\n');
    first.close();
    await flush();
    await vi.advanceTimersByTimeAsync(workspaceEventsRetryDelay(1));
    second.send('event: ready\ndata: {}\n\n');
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toEqual([{type: 'ready'}, {type: 'ready'}]);
  });

  it('reconnects when the connection stays silent', async () => {
    const silent = streamResponse();
    fetchMock.mockResolvedValueOnce(silent.response).mockResolvedValueOnce(streamResponse().response);

    subscribe();
    await vi.advanceTimersByTimeAsync(WORKSPACE_EVENTS_IDLE_TIMEOUT);
    await vi.advanceTimersByTimeAsync(workspaceEventsRetryDelay(1));

    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('limits the backoff', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(workspaceEventsRetryDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});
