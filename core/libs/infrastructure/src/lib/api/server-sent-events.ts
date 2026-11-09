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

/** A dispatched event of a `text/event-stream`. */
export interface ServerSentEvent {
  event: string;
  data: string;
}

/**
 * Incremental parser for the `text/event-stream` format of the HTML standard. Chunks may split lines and events at
 * any position; CRLF, CR and LF line endings are accepted. Only the `event` and `data` fields are evaluated.
 *
 * Used instead of `EventSource`, which cannot send the token header the backend requires.
 */
export class ServerSentEventParser {
  private buffer = '';
  private eventName = '';
  private dataLines: string[] = [];
  private pendingCarriageReturn = false;

  /** Parses the next chunk of the stream and returns the events it completed. */
  push(chunk: string): ServerSentEvent[] {
    const events: ServerSentEvent[] = [];
    let text = this.buffer + chunk;
    // A CR at the end of the previous chunk may be the first half of a CRLF
    if (this.pendingCarriageReturn && text.startsWith('\n')) text = text.slice(1);
    this.pendingCarriageReturn = false;

    let start = 0;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char !== '\n' && char !== '\r') continue;

      this.processLine(text.slice(start, index), events);
      if (char === '\r') {
        if (index + 1 === text.length) this.pendingCarriageReturn = true;
        else if (text[index + 1] === '\n') index++;
      }
      start = index + 1;
    }

    this.buffer = text.slice(start);
    return events;
  }

  private processLine(line: string, events: ServerSentEvent[]): void {
    if (!line) {
      this.dispatch(events);
      return;
    }
    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') this.eventName = value;
    else if (field === 'data') this.dataLines.push(value);
  }

  private dispatch(events: ServerSentEvent[]): void {
    if (this.dataLines.length) {
      events.push({event: this.eventName || 'message', data: this.dataLines.join('\n')});
    }
    this.eventName = '';
    this.dataLines = [];
  }
}
