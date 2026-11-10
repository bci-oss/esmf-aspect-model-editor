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

import {AiSecretStorePort} from '@ame/domain';
import {AiSecretInfo, IPC_RENDERER} from '@ame/shared';
import {inject, Injectable} from '@angular/core';

const SESSION_KEY_PREFIX = 'ame.ai.key.';

/**
 * The API keys of the AI providers. The desktop app keeps them in the keychain of the operating system (via Tauri);
 * the browser keeps them only for the session (sessionStorage, or memory if that is not available). Keys are never
 * written to the settings or the local storage.
 */
@Injectable({providedIn: 'root'})
export class AiSecretStoreService implements AiSecretStorePort {
  private readonly ipc = inject(IPC_RENDERER, {optional: true});
  private readonly memory = new Map<string, string>();

  private get keychain(): boolean {
    return !!this.ipc?.aiSecretSet && !!this.ipc.aiSecretGet && !!this.ipc.aiSecretDelete && !!this.ipc.aiSecretInfo;
  }

  async set(provider: string, secret: string): Promise<void> {
    if (this.keychain) {
      await this.ipc.aiSecretSet(provider, secret);
      return;
    }
    this.memory.set(provider, secret);
    this.session(storage => storage.setItem(SESSION_KEY_PREFIX + provider, secret));
  }

  async get(provider: string): Promise<string | null> {
    if (this.keychain) return (await this.ipc.aiSecretGet(provider)) ?? null;
    return this.memory.get(provider) ?? this.session(storage => storage.getItem(SESSION_KEY_PREFIX + provider)) ?? null;
  }

  async delete(provider: string): Promise<void> {
    if (this.keychain) {
      await this.ipc.aiSecretDelete(provider);
      return;
    }
    this.memory.delete(provider);
    this.session(storage => storage.removeItem(SESSION_KEY_PREFIX + provider));
  }

  async info(provider: string): Promise<AiSecretInfo> {
    if (this.keychain) return this.ipc.aiSecretInfo(provider);
    return {stored: !!(await this.get(provider)), persistent: false};
  }

  private session<T>(action: (storage: Storage) => T): T | null {
    try {
      return typeof sessionStorage === 'undefined' ? null : action(sessionStorage);
    } catch {
      // e.g. disabled storage; the memory is used then
      return null;
    }
  }
}
