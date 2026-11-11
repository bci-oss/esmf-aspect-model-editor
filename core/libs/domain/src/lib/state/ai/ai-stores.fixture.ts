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

import {AiSettings, DEFAULT_AI_SETTINGS, Settings} from '@ame/shared';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {vi} from 'vitest';
import {AiAttachment, AiChatEvent, AiChatRequest, WorkspaceStructure} from '../../model-api';
import {AiEditorPort} from '../../ports/ai-editor.port';
import {AiSecretStorePort} from '../../ports/ai-secret-store.port';
import {AiPort} from '../../ports/ai.port';
import {ModelApiPort} from '../../ports/model-api.port';
import {ConfigurationService} from '../settings/configuration.service';

/** Test doubles of the ports used by the stores of the assistant; shared by their specs. */
export function setupAiStoreTest() {
  const chat$ = new Subject<AiChatEvent>();
  const upload$ = new Subject<AiAttachment>();
  const api = {
    uploadAttachment: vi.fn(() => upload$),
    deleteAttachment: vi.fn(() => of(undefined)),
    getProviders: vi.fn(() =>
      of([
        {
          kind: 'openai',
          label: 'OpenAI',
          requiresKey: true,
          requiresBaseUrl: false,
          local: false,
          available: true,
          defaultModel: 'gpt-x',
        },
        {kind: 'ollama', label: 'Ollama', requiresKey: false, requiresBaseUrl: false, local: true, available: true},
      ]),
    ),
    getLocalServers: vi.fn(() => of([{kind: 'ollama', baseUrl: 'http://localhost:11434', models: ['llama']}])),
    getCopilotStatus: vi.fn(() => of({available: true, authenticated: false})),
    getModels: vi.fn(() => of([{id: 'm', name: 'M'}])),
    test: vi.fn(() => of({ok: true, models: [{id: 'a', name: 'A'}]})),
    startCopilotLogin: vi.fn(() =>
      of({flowId: 'f1', userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', expiresIn: 900}),
    ),
    completeCopilotLogin: vi.fn(() => of({available: true, authenticated: true, login: 'octocat'})),
    cancelCopilotLogin: vi.fn(() => of(undefined)),
    setCopilotToken: vi.fn(() => of({available: true, authenticated: true})),
    logoutCopilot: vi.fn(() => of({available: true, authenticated: false})),
    chat: vi.fn(() => chat$),
    cancelChat: vi.fn(() => of(undefined)),
    getConversations: vi.fn(() => of([{id: 'c1', title: 'One', updatedAt: '2026-01-01'}])),
    getConversation: vi.fn(() =>
      of({id: 'c1', title: 'One', createdAt: '', updatedAt: '', messages: [{id: 'm1', role: 'user', content: 'Hi', createdAt: ''}]}),
    ),
    renameConversation: vi.fn((id: string, title: string) => of({id, title, updatedAt: ''})),
    deleteConversation: vi.fn(() => of(undefined)),
    deleteAllConversations: vi.fn(() => of(undefined)),
    validateProposal: vi.fn(() => of({valid: false, validationErrors: [{message: 'broken'}]})),
  };
  const keys = new Map<string, string>();
  const secrets = {
    set: vi.fn(async (provider: string, key: string) => void keys.set(provider, key)),
    get: vi.fn(async (provider: string) => keys.get(provider) ?? null),
    delete: vi.fn(async (provider: string) => void keys.delete(provider)),
    info: vi.fn(async (provider: string) => ({stored: keys.has(provider), persistent: true})),
  };
  const editor = {
    currentContext: vi.fn(() => of({modelTurtle: '@prefix', modelUrn: 'urn:samm:org.example:1.0.0#Movement'})),
    openModel: signal<{label: string; readOnly: boolean} | null>({label: 'Movement.ttl', readOnly: false}),
    selectedElementUrn: signal<string | null>(null),
    modelElements: vi.fn(() => []),
    applyModelChange: vi.fn(() => of(true)),
    openNewModel: vi.fn(() => of(true)),
    renameElement: vi.fn(),
    navigateToElement: vi.fn(),
  };
  const structure: WorkspaceStructure = {
    'org.example': [
      {
        version: '1.0.0',
        models: [
          {
            name: 'Movement.ttl',
            existing: true,
            version: '1.0.0',
            aspectModelUrn: 'urn:samm:org.example:1.0.0#Movement',
            source: {type: 'workspace', id: '/ws', name: 'ws', path: '/ws', readOnly: false, defaultWorkspace: true},
          },
        ],
      },
    ],
  };
  const modelApi = {loadNamespacesStructure: vi.fn(() => of(structure))};
  const settings$ = new BehaviorSubject<Settings>({ai: {...DEFAULT_AI_SETTINGS}} as Settings);
  const configuration = {
    settings$,
    getSettings: () => settings$.value,
    setSettings: vi.fn((settings: Settings) => settings$.next(settings)),
  };

  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      {provide: AiPort, useValue: api},
      {provide: AiSecretStorePort, useValue: secrets},
      {provide: AiEditorPort, useValue: editor},
      {provide: ModelApiPort, useValue: modelApi},
      {provide: ConfigurationService, useValue: configuration},
    ],
  });

  return {
    api,
    secrets,
    editor,
    modelApi,
    settings$,
    chat$,
    upload$,
    /** Enables the assistant with the given settings. */
    setAi: (ai: Partial<AiSettings>) => settings$.next({...settings$.value, ai: {...DEFAULT_AI_SETTINGS, enabled: true, ...ai}}),
    lastChatRequest: (): AiChatRequest => {
      const calls = api.chat.mock.calls as unknown as AiChatRequest[][];
      return calls[calls.length - 1][0];
    },
  };
}

/** Waits until the pending promises, e.g. of the secret store, are settled. */
export const flushAi = () => new Promise(resolve => setTimeout(resolve));
