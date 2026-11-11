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
import {createAiSetupStoreMock} from './ai-store-mocks';

describe('createAiSetupStoreMock', () => {
  it('derives the provider from the settings', () => {
    const store = createAiSetupStoreMock({provider: 'openai'});
    expect(store.enabled()).toBe(true);
    expect(store.requiresKey()).toBe(true);

    store.selectProvider('ollama', {baseUrl: 'http://localhost:11434'});
    expect(store.providerKind()).toBe('ollama');
    expect(store.settings().baseUrl).toBe('http://localhost:11434');
    expect(store.isLocal()).toBe(true);
    expect(store.requiresKey()).toBe(false);
  });

  it('saves keys successfully by default', async () => {
    await expect(createAiSetupStoreMock().saveKey()).resolves.toBe(true);
  });
});
