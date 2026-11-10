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
import {AI_PROVIDER_TRAITS, asAiError, isAiError, isLocalProvider} from './ai';

describe('ai models', () => {
  it('recognizes AI errors', () => {
    expect(isAiError({code: 'offline', message: 'down'})).toBe(true);
    expect(isAiError({code: 1, message: 'x'})).toBe(false);
    expect(isAiError(null)).toBe(false);
    expect(isAiError('x')).toBe(false);
  });

  it('turns any failure into an AI error', () => {
    const error = {code: 'offline', message: 'down'};
    expect(asAiError(error)).toBe(error);
    expect(asAiError(new Error('boom'))).toEqual({code: 'provider_error', message: 'boom'});
    expect(asAiError('text')).toEqual({code: 'provider_error', message: 'text'});
  });

  it('knows which providers keep the data local', () => {
    expect(isLocalProvider('ollama')).toBe(true);
    expect(isLocalProvider('lmstudio')).toBe(true);
    expect(isLocalProvider('openai')).toBe(false);
    expect(isLocalProvider(null)).toBe(false);
    expect(isLocalProvider('openai-compatible')).toBe(false);
    expect(isLocalProvider('openai-compatible', 'http://localhost:8000/v1')).toBe(true);
    expect(isLocalProvider('openai-compatible', 'http://127.0.0.1:8000/v1')).toBe(true);
    expect(isLocalProvider('openai-compatible', 'https://example.com/v1')).toBe(false);
    expect(isLocalProvider('openai-compatible', 'not a url')).toBe(false);
  });

  it('describes every provider, Copilot recommended', () => {
    expect(AI_PROVIDER_TRAITS.copilot.recommended).toBe(true);
    expect(AI_PROVIDER_TRAITS.openai.requiresKey).toBe(true);
    expect(AI_PROVIDER_TRAITS['azure-openai'].requiresBaseUrl).toBe(true);
    expect(AI_PROVIDER_TRAITS.ollama.local).toBe(true);
  });
});
