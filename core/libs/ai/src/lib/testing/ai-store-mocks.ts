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

import {
  AiCopilotLoginState,
  AiError,
  AiLocalServer,
  AiModelInfo,
  AiProviderChoice,
  AiProviderInfo,
  AiTestResult,
  CopilotLoginFlow,
  CopilotStatus,
} from '@ame/domain';
import {AI_PROVIDER_KINDS, AiProviderKind, AiSettings, DEFAULT_AI_SETTINGS} from '@ame/shared';
import {computed, signal} from '@angular/core';
import {vi} from 'vitest';

/** A double of the AiSetupStore whose state the specs set; choosing a provider changes the settings. */
export function createAiSetupStoreMock(initial: Partial<AiSettings> = {}) {
  const settings = signal<AiSettings>({...DEFAULT_AI_SETTINGS, enabled: true, ...initial});
  const providerKind = computed(() => settings().provider);
  return {
    settings,
    enabled: computed(() => settings().enabled),
    providerKind,
    providers: signal<AiProviderInfo[]>([]),
    providerInfo: signal<Pick<AiProviderInfo, 'label'> | null>(null),
    providerChoices: signal<AiProviderChoice[]>(
      AI_PROVIDER_KINDS.map(kind => ({
        kind,
        recommended: kind === 'copilot',
        local: kind === 'ollama' || kind === 'lmstudio',
        available: true,
      })),
    ),
    localServers: signal<AiLocalServer[]>([]),
    models: signal<AiModelInfo[]>([]),
    copilotStatus: signal<CopilotStatus | null>({available: true, authenticated: false}),
    keyInfo: signal({stored: false, persistent: false}),
    savingKey: signal(false),
    testing: signal(false),
    testResult: signal<AiTestResult | null>(null),
    loginFlow: signal<CopilotLoginFlow | null>(null),
    loginState: signal<AiCopilotLoginState>('idle'),
    loginError: signal<AiError | null>(null),
    requiresKey: computed(() => ['openai', 'anthropic', 'azure-openai'].includes(providerKind() ?? '')),
    requiresBaseUrl: computed(() => providerKind() === 'openai-compatible'),
    isLocal: computed(() => providerKind() === 'ollama' || providerKind() === 'lmstudio'),
    configured: signal(false),
    showSetup: signal(false),
    loadSetup: vi.fn(),
    loadSetupIfEnabled: vi.fn(),
    openSetup: vi.fn(),
    closeSetup: vi.fn(),
    keepSetupOpen: vi.fn(),
    selectProvider: vi.fn((kind: AiProviderKind, extra: Partial<AiSettings> = {}) =>
      settings.update(current => ({...current, ...extra, provider: kind})),
    ),
    selectModel: vi.fn(),
    setBaseUrl: vi.fn(),
    loadModels: vi.fn(),
    saveKey: vi.fn(async (): Promise<boolean> => true),
    deleteKey: vi.fn(),
    setCopilotToken: vi.fn(),
    startCopilotLogin: vi.fn(),
    cancelCopilotLogin: vi.fn(),
    logoutCopilot: vi.fn(),
    testConnection: vi.fn(),
  };
}
