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

import {IPC_RENDERER, TauriApi} from '@ame/shared';
import {TestBed} from '@angular/core/testing';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AiSecretStoreService} from './ai-secret-store.service';

describe('AiSecretStoreService', () => {
  afterEach(() => sessionStorage.clear());

  const create = (ipc?: Partial<TauriApi>) => {
    TestBed.configureTestingModule({providers: [{provide: IPC_RENDERER, useValue: ipc}]});
    return TestBed.inject(AiSecretStoreService);
  };

  it('keeps keys only for the session in the browser', async () => {
    const store = create(undefined);

    expect(await store.info('openai')).toEqual({stored: false, persistent: false});
    await store.set('openai', 'sk-1');
    expect(await store.get('openai')).toBe('sk-1');
    expect(sessionStorage.getItem('ame.ai.key.openai')).toBe('sk-1');
    expect(localStorage.getItem('ame.ai.key.openai')).toBeNull();
    expect(await store.info('openai')).toEqual({stored: true, persistent: false});

    await store.delete('openai');
    expect(await store.get('openai')).toBeNull();
    expect(sessionStorage.getItem('ame.ai.key.openai')).toBeNull();
  });

  it('uses the keychain of the desktop app', async () => {
    const ipc = {
      aiSecretSet: vi.fn().mockResolvedValue({stored: true, persistent: true}),
      aiSecretGet: vi.fn().mockResolvedValue('sk-2'),
      aiSecretDelete: vi.fn().mockResolvedValue(undefined),
      aiSecretInfo: vi.fn().mockResolvedValue({stored: true, persistent: true}),
    };
    const store = create(ipc);

    await store.set('anthropic', 'sk-2');
    expect(ipc.aiSecretSet).toHaveBeenCalledWith('anthropic', 'sk-2');
    expect(await store.get('anthropic')).toBe('sk-2');
    expect(await store.info('anthropic')).toEqual({stored: true, persistent: true});
    await store.delete('anthropic');
    expect(ipc.aiSecretDelete).toHaveBeenCalledWith('anthropic');
    expect(sessionStorage.length).toBe(0);
  });
});
