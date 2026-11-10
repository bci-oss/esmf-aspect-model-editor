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
import {aiErrorView} from './ai-error';

describe('aiErrorView', () => {
  it('maps codes to messages and actions', () => {
    expect(aiErrorView({code: 'invalid_key', message: 'bad'})).toEqual({
      messageKey: 'ai.errors.invalid_key',
      actions: ['openSetup'],
      detail: 'bad',
    });
    expect(aiErrorView({code: 'not_authenticated', message: ''}).actions).toEqual(['login']);
    expect(aiErrorView({code: 'read_only', message: ''}).actions).toEqual([]);
  });

  it('maps the errors of attachments without actions', () => {
    for (const code of ['attachment_unsupported', 'attachment_too_large', 'attachment_unreadable', 'attachment_empty']) {
      expect(aiErrorView({code, message: 'x'})).toEqual({messageKey: `ai.errors.${code}`, actions: [], detail: 'x'});
    }
  });

  it('treats unknown codes as provider errors', () => {
    expect(aiErrorView({code: 'something_new', message: 'x'}).messageKey).toBe('ai.errors.provider_error');
  });
});
