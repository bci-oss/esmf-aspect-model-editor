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

import {WorkspaceEvent, WorkspaceEventsPort, WorkspaceFilesChange} from '@ame/domain';
import {APP_CONFIG, AppConfig, BackendStatusService} from '@ame/shared';
import {inject, Injectable} from '@angular/core';
import {defer, filter, map, Observable, retry, timeout, timer} from 'rxjs';
import {BACKEND_TOKEN_HEADER} from './backend-auth.interceptor';
import {ServerSentEvent, ServerSentEventParser} from './server-sent-events';

/** The backend sends a heartbeat every 15 seconds; a silent connection is considered dead after three missed ones. */
export const WORKSPACE_EVENTS_IDLE_TIMEOUT = 45000;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

/** Exponential backoff between reconnects: 1s, 2s, 4s, ... up to 30s. */
export function workspaceEventsRetryDelay(attempt: number): number {
  return Math.min(INITIAL_RETRY_DELAY * 2 ** (attempt - 1), MAX_RETRY_DELAY);
}

/** Reads the server-sent events of the workspace watcher of the backend. */
@Injectable({providedIn: 'root'})
export class WorkspaceEventsApiService implements WorkspaceEventsPort {
  private readonly backendStatus = inject(BackendStatusService);
  private readonly config: AppConfig = inject(APP_CONFIG);

  events(): Observable<WorkspaceEvent> {
    return defer(() => this.connect()).pipe(
      timeout({each: WORKSPACE_EVENTS_IDLE_TIMEOUT}),
      map(toWorkspaceEvent),
      filter((event): event is WorkspaceEvent => !!event),
      // A successful (re)connect always emits `ready` first, which resets the backoff
      retry({resetOnSuccess: true, delay: (_error, attempt) => timer(workspaceEventsRetryDelay(attempt))}),
    );
  }

  private connect(): Observable<ServerSentEvent> {
    // Read on every connect: the port and the token change when the backend is restarted
    const url = `${this.backendStatus.serviceUrl()}${this.config.api.workspaces}/events`;
    const headers: Record<string, string> = {Accept: 'text/event-stream'};
    const token = this.backendStatus.authToken();
    if (token) headers[BACKEND_TOKEN_HEADER] = token;

    return new Observable<ServerSentEvent>(subscriber => {
      const controller = new AbortController();
      readEventStream(url, headers, controller.signal, event => subscriber.next(event))
        .then(() => subscriber.error(new Error('The workspace event stream was closed by the backend.')))
        .catch(error => {
          if (!controller.signal.aborted) subscriber.error(error);
        });
      return () => controller.abort();
    });
  }
}

async function readEventStream(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  emit: (event: ServerSentEvent) => void,
): Promise<void> {
  const response = await fetch(url, {headers, signal, cache: 'no-store'});
  if (!response.ok || !response.body) {
    throw new Error(`The workspace event stream is not available (HTTP ${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new ServerSentEventParser();
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) return;
      parser.push(decoder.decode(value, {stream: true})).forEach(emit);
    }
  } finally {
    reader.releaseLock();
  }
}

function toWorkspaceEvent({event, data}: ServerSentEvent): WorkspaceEvent | null {
  switch (event) {
    case 'ready':
      return {type: 'ready'};
    case 'files-changed': {
      const change = JSON.parse(data) as Partial<WorkspaceFilesChange>;
      return {
        type: 'files-changed',
        change: {created: change.created ?? [], modified: change.modified ?? [], removed: change.removed ?? []},
      };
    }
    default:
      // Heartbeats only keep the connection alive
      return null;
  }
}
