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
import {ServerSentEventParser} from './server-sent-events';

describe('ServerSentEventParser', () => {
  it('parses named events', () => {
    const events = new ServerSentEventParser().push('event: ready\ndata: {}\n\nevent: files-changed\ndata: {"a":1}\n\n');

    expect(events).toEqual([
      {event: 'ready', data: '{}'},
      {event: 'files-changed', data: '{"a":1}'},
    ]);
  });

  it('joins chunks that split lines and events', () => {
    const parser = new ServerSentEventParser();

    expect(parser.push('eve')).toEqual([]);
    expect(parser.push('nt: ready\nda')).toEqual([]);
    expect(parser.push('ta: {}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{event: 'ready', data: '{}'}]);
  });

  it.each([
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ])('accepts %s line endings', (_name, eol) => {
    const events = new ServerSentEventParser().push(`event: ready${eol}data: {}${eol}${eol}`);

    expect(events).toEqual([{event: 'ready', data: '{}'}]);
  });

  it('does not treat a CRLF split between chunks as two line endings', () => {
    const parser = new ServerSentEventParser();

    expect(parser.push('event: ready\r')).toEqual([]);
    expect(parser.push('\ndata: {}\r')).toEqual([]);
    expect(parser.push('\n\r\n')).toEqual([{event: 'ready', data: '{}'}]);
  });

  it('joins multiple data lines and defaults the event name', () => {
    const events = new ServerSentEventParser().push('data: first\ndata:second\n\n');

    expect(events).toEqual([{event: 'message', data: 'first\nsecond'}]);
  });

  it('ignores comments, unknown fields and events without data', () => {
    const events = new ServerSentEventParser().push(': keep-alive\nid: 7\nretry: 100\n\nevent: heartbeat\n\nevent: ready\ndata\n\n');

    expect(events).toEqual([{event: 'ready', data: ''}]);
  });

  it('resets the event name after each event', () => {
    const events = new ServerSentEventParser().push('event: ready\ndata: {}\n\ndata: x\n\n');

    expect(events[1]).toEqual({event: 'message', data: 'x'});
  });
});
