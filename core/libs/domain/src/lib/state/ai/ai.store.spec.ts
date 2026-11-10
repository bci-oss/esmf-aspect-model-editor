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
import {BehaviorSubject, NEVER, of, Subject, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiAttachment, AiChatEvent, AiChatRequest, AiProposal, WorkspaceStructure} from '../../model-api';
import {AiEditorPort} from '../../ports/ai-editor.port';
import {AiSecretStorePort} from '../../ports/ai-secret-store.port';
import {AiPort} from '../../ports/ai.port';
import {ModelApiPort} from '../../ports/model-api.port';
import {ConfigurationService} from '../settings/configuration.service';
import {UiShellStore} from '../ui-shell/ui-shell.store';
import {aiElementName, AiStore} from './ai.store';

const flush = () => new Promise(resolve => setTimeout(resolve));

describe('AiStore', () => {
  let store: AiStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let secrets: Record<string, ReturnType<typeof vi.fn>>;
  let editor: {
    currentContext: ReturnType<typeof vi.fn>;
    openModel: ReturnType<typeof signal>;
    selectedElementUrn: ReturnType<typeof signal<string | null>>;
    modelElements: ReturnType<typeof vi.fn>;
    applyModelChange: ReturnType<typeof vi.fn>;
    openNewModel: ReturnType<typeof vi.fn>;
    renameElement: ReturnType<typeof vi.fn>;
    navigateToElement: ReturnType<typeof vi.fn>;
  };
  let settings$: BehaviorSubject<Settings>;
  let chat$: Subject<AiChatEvent>;
  let upload$: Subject<AiAttachment>;
  let modelApi: {loadNamespacesStructure: ReturnType<typeof vi.fn>};

  const setAi = (ai: Partial<AiSettings>) => settings$.next({...settings$.value, ai: {...DEFAULT_AI_SETTINGS, enabled: true, ...ai}});

  beforeEach(() => {
    chat$ = new Subject();
    upload$ = new Subject();
    api = {
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
    secrets = {
      set: vi.fn(async (provider: string, key: string) => void keys.set(provider, key)),
      get: vi.fn(async (provider: string) => keys.get(provider) ?? null),
      delete: vi.fn(async (provider: string) => void keys.delete(provider)),
      info: vi.fn(async (provider: string) => ({stored: keys.has(provider), persistent: true})),
    };
    editor = {
      currentContext: vi.fn(() => of({modelTurtle: '@prefix', modelUrn: 'urn:samm:org.example:1.0.0#Movement'})),
      openModel: signal({label: 'Movement.ttl', readOnly: false}),
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
    modelApi = {loadNamespacesStructure: vi.fn(() => of(structure))};
    settings$ = new BehaviorSubject<Settings>({ai: {...DEFAULT_AI_SETTINGS}} as Settings);
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
    store = TestBed.inject(AiStore);
  });

  describe('settings and setup', () => {
    it('is disabled and not configured by default', () => {
      expect(store.enabled()).toBe(false);
      expect(store.configured()).toBe(false);
      expect(store.showSetup()).toBe(true);
    });

    it('loads the setup', () => {
      store.loadSetup();
      expect(store.providers()).toHaveLength(2);
      expect(store.localServers()[0].baseUrl).toBe('http://localhost:11434');
      expect(store.copilotStatus()?.authenticated).toBe(false);
      expect(store.setupLoading()).toBe(false);
    });

    it('offers the providers of the backend, Copilot recommended, and only local ones on request', () => {
      expect(store.providerChoices().map(choice => choice.kind)).toHaveLength(7);
      expect(store.providerChoices().find(choice => choice.kind === 'copilot')?.recommended).toBe(true);

      store.loadSetup();
      expect(store.providerChoices()).toEqual([
        {kind: 'openai', recommended: false, local: false, available: true},
        {kind: 'ollama', recommended: false, local: true, available: true},
      ]);

      setAi({onlyLocal: true});
      expect(store.providerChoices().map(choice => choice.kind)).toEqual(['ollama']);
    });

    it('offers Copilot only as available when its runtime is there', () => {
      expect(store.providerChoices().find(choice => choice.kind === 'copilot')?.available).toBe(false);
      store.copilotStatus.set({available: true, authenticated: false});
      expect(store.providerChoices().find(choice => choice.kind === 'copilot')?.available).toBe(true);
    });

    it('knows the needs of a provider before the backend answered', () => {
      setAi({provider: 'azure-openai'});
      expect(store.requiresKey()).toBe(true);
      expect(store.requiresBaseUrl()).toBe(true);
    });

    it('selects a provider with its default model and needs a key for it', async () => {
      store.loadSetup();
      store.selectProvider('openai');
      expect(store.settings().provider).toBe('openai');
      expect(store.settings().model).toBe('gpt-x');
      expect(store.requiresKey()).toBe(true);
      expect(store.configured()).toBe(false);

      store.saveKey(' sk-1 ').subscribe();
      await flush();
      expect(secrets.set).toHaveBeenCalledWith('openai', 'sk-1');
      expect(store.keyInfo().stored).toBe(true);
      expect(store.configured()).toBe(true);
      expect(JSON.stringify(settings$.value)).not.toContain('sk-1');

      store.deleteKey().subscribe();
      await flush();
      expect(store.configured()).toBe(false);
    });

    it('keeps the setup open until it is closed although the provider is configured', () => {
      setAi({provider: 'ollama', baseUrl: 'http://localhost:11434'});
      expect(store.showSetup()).toBe(false);

      store.keepSetupOpen();
      expect(store.showSetup()).toBe(true);

      store.closeSetup();
      expect(store.showSetup()).toBe(false);
    });

    it('treats local providers as configured without key and consent', () => {
      setAi({provider: 'ollama', baseUrl: 'http://localhost:11434'});
      expect(store.configured()).toBe(true);
      expect(store.isLocal()).toBe(true);
      expect(store.consentRequired()).toBe(false);
    });

    it('needs a base url for openai-compatible providers', () => {
      setAi({provider: 'openai-compatible'});
      expect(store.configured()).toBe(false);
      setAi({provider: 'openai-compatible', baseUrl: 'http://localhost:8000/v1'});
      expect(store.configured()).toBe(true);
    });

    it('tests the connection with the stored key and takes over the models', async () => {
      setAi({provider: 'openai', model: 'gpt-x'});
      await (secrets.set as unknown as (p: string, k: string) => Promise<void>)('openai', 'sk-2');
      store.testConnection();
      await flush();
      expect(api.test).toHaveBeenCalledWith({kind: 'openai', model: 'gpt-x'}, 'sk-2');
      expect(store.testResult()?.ok).toBe(true);
      expect(store.models()).toEqual([{id: 'a', name: 'A'}]);
      expect(store.testing()).toBe(false);
    });

    it('reports a failing test as result', async () => {
      setAi({provider: 'ollama'});
      api.test.mockReturnValue(throwError(() => ({code: 'offline', message: 'down'})));
      store.testConnection();
      await flush();
      expect(store.testResult()).toEqual({ok: false, code: 'offline', message: 'down'});
    });
  });

  describe('copilot login', () => {
    beforeEach(() => setAi({provider: 'copilot'}));

    it('runs the device flow', () => {
      const complete = new Subject<{available: boolean; authenticated: boolean}>();
      api.completeCopilotLogin.mockReturnValue(complete);
      store.startCopilotLogin();
      expect(store.loginState()).toBe('waiting');
      expect(store.loginFlow()?.userCode).toBe('ABCD-1234');

      complete.next({available: true, authenticated: true});
      expect(store.copilotStatus()?.authenticated).toBe(true);
      expect(store.loginFlow()).toBeNull();
      expect(store.configured()).toBe(true);
    });

    it('falls back to the token when the device flow is not supported', () => {
      api.startCopilotLogin.mockReturnValue(throwError(() => ({code: 'provider_error', message: 'no device flow'})));
      store.startCopilotLogin();
      expect(store.loginState()).toBe('unsupported');

      store.setCopilotToken(' gho_1 ');
      expect(api.setCopilotToken).toHaveBeenCalledWith('gho_1');
      expect(store.configured()).toBe(true);
    });

    it('cancels the flow', () => {
      api.completeCopilotLogin.mockReturnValue(NEVER);
      store.startCopilotLogin();
      store.cancelCopilotLogin();
      expect(api.cancelCopilotLogin).toHaveBeenCalledWith('f1');
      expect(store.loginState()).toBe('idle');
    });

    it('logs out', () => {
      store.logoutCopilot();
      expect(store.copilotStatus()?.authenticated).toBe(false);
    });
  });

  describe('chat', () => {
    beforeEach(() => setAi({provider: 'ollama', languages: ['en', 'de']}));

    const lastRequest = (): AiChatRequest => api.chat.mock.calls[api.chat.mock.calls.length - 1][0];

    it('streams an answer with tools and proposals', async () => {
      editor.selectedElementUrn.set('urn:samm:org.example:1.0.0#speed');
      store.send({message: 'Explain', command: 'explain', mentionedElementUrns: ['urn:samm:org.example:1.0.0#position']});
      await flush();

      const request = lastRequest();
      expect(request.provider).toEqual({kind: 'ollama'});
      expect(request.command).toBe('explain');
      expect(request.conversationId).toBeUndefined();
      expect(request.context).toEqual({
        modelTurtle: '@prefix',
        modelUrn: 'urn:samm:org.example:1.0.0#Movement',
        languages: ['en', 'de'],
        selectedElementUrn: 'urn:samm:org.example:1.0.0#speed',
        mentionedElementUrns: ['urn:samm:org.example:1.0.0#position'],
      });
      expect(store.streaming()).toBe(true);

      chat$.next({type: 'conversation', data: {id: 'c9', title: 'Explain'}});
      chat$.next({type: 'delta', data: {text: 'The '}});
      chat$.next({type: 'tool', data: {callId: 't', name: 'validate', status: 'started'}});
      chat$.next({type: 'tool', data: {callId: 't', name: 'validate', status: 'done'}});
      chat$.next({type: 'delta', data: {text: 'answer'}});
      chat$.next({type: 'proposal', data: {id: 'p1', kind: 'payload', title: 'Payload'}});
      chat$.next({type: 'done', data: {messageId: 'm2'}});
      chat$.complete();

      const answer = store.messages()[1];
      expect(answer).toMatchObject({id: 'm2', content: 'The answer', streaming: false});
      expect(answer.tools).toEqual([{callId: 't', name: 'validate', status: 'done'}]);
      expect(answer.proposals).toHaveLength(1);
      expect(store.activeConversationId()).toBe('c9');
      expect(store.conversations()[0].id).toBe('c9');
      expect(store.streaming()).toBe(false);

      store.send({message: 'More'});
      await flush();
      expect(lastRequest().conversationId).toBe('c9');
    });

    it('shows the error of an answer', async () => {
      store.send({message: 'Hi'});
      await flush();
      chat$.next({type: 'error', data: {code: 'quota_exceeded', message: 'quota'}});
      chat$.complete();
      expect(store.messages()[1].error?.code).toBe('quota_exceeded');
      expect(store.streaming()).toBe(false);
    });

    it('stops the answer and keeps the text', async () => {
      store.send({message: 'Hi'});
      await flush();
      chat$.next({type: 'delta', data: {text: 'Part'}});
      store.stop();
      expect(chat$.observed).toBe(false);
      expect(store.messages()[1]).toMatchObject({content: 'Part', streaming: false, stopped: true});
      expect(store.streaming()).toBe(false);
    });

    it('leaves out the model and the selection when removed from the context', async () => {
      editor.selectedElementUrn.set('urn:samm:x:1.0.0#a');
      store.setIncludeModel(false);
      store.excludeSelection();
      store.addErrorToContext({message: 'Missing unit', focusNode: 'urn:samm:x:1.0.0#b'});
      store.send({message: 'Fix'});
      await flush();
      expect(editor.currentContext).not.toHaveBeenCalled();
      expect(lastRequest().context).toEqual({
        languages: ['en', 'de'],
        validationErrors: [{message: 'Missing unit', focusNode: 'urn:samm:x:1.0.0#b'}],
      });
    });

    it('asks for consent before sending to a cloud provider', async () => {
      setAi({provider: 'openai'});
      store.send({message: 'Hi'});
      expect(store.consentPending()).toEqual({message: 'Hi'});
      expect(api.chat).not.toHaveBeenCalled();

      store.acceptConsent();
      await flush();
      expect(store.settings().cloudConsent).toEqual(['openai']);
      expect(api.chat).toHaveBeenCalled();

      store.resetConsent();
      expect(store.consentRequired()).toBe(true);
    });

    it('keeps the message as draft when the consent is declined', () => {
      setAi({provider: 'copilot'});
      store.send({message: 'Hi'});
      store.declineConsent();
      expect(store.draft()).toBe('Hi');
      expect(api.chat).not.toHaveBeenCalled();
    });

    it('refuses cloud providers when only local ones are allowed', () => {
      setAi({provider: 'openai', onlyLocal: true});
      store.send({message: 'Hi'});
      expect(store.error()?.code).toBe('local_only');
      expect(api.chat).not.toHaveBeenCalled();
    });

    it('asks on behalf of the editor', async () => {
      const uiShell = TestBed.inject(UiShellStore);
      store.ask({message: 'Describe it', command: 'describe', elementUrns: ['urn:samm:x:1.0.0#speed']});
      await flush();
      expect(uiShell.aiPanelOpen()).toBe(true);
      expect(store.contextItems()[0]).toMatchObject({kind: 'element', label: 'speed'});
      expect(lastRequest().context.mentionedElementUrns).toEqual(['urn:samm:x:1.0.0#speed']);
    });

    it('keeps the question as draft while the assistant is not configured', () => {
      setAi({provider: 'openai', cloudConsent: ['openai']});
      store.ask({message: 'Describe it'});
      expect(store.draft()).toBe('Describe it');
      store.ask({message: 'it', command: 'describe'});
      expect(store.draft()).toBe('/describe it');
      expect(api.chat).not.toHaveBeenCalled();
    });

    it('prepares a command draft without sending it', () => {
      const uiShell = TestBed.inject(UiShellStore);
      store.prepare({message: 'a model for a robot arm', command: 'generate', elementUrns: ['urn:samm:x:1.0.0#speed']});
      expect(uiShell.aiPanelOpen()).toBe(true);
      expect(store.draft()).toBe('/generate a model for a robot arm');
      expect(store.contextItems()[0]).toMatchObject({kind: 'element', label: 'speed'});
      expect(api.chat).not.toHaveBeenCalled();
    });
  });

  describe('files and models as context', () => {
    beforeEach(() => setAi({provider: 'ollama', languages: ['en']}));

    const lastRequest = (): AiChatRequest => api.chat.mock.calls[api.chat.mock.calls.length - 1][0];
    const attachment: AiAttachment = {id: 'a1', name: 'spec.pdf', kind: 'pdf', size: 10, characters: 100, pages: 2, truncated: false};
    const pdf = () => new File(['%PDF'], 'spec.pdf', {type: 'application/pdf'});

    it('shows a chip while a file is uploaded and replaces it by the attachment', () => {
      store.attachFiles([pdf()]);
      expect(api.uploadAttachment).toHaveBeenCalledTimes(1);
      expect(store.contextItems()[0]).toMatchObject({kind: 'file', label: 'spec.pdf', uploading: true});
      expect(store.uploading()).toBe(true);

      store.send({message: 'Hi'});
      expect(api.chat).not.toHaveBeenCalled();

      upload$.next(attachment);
      upload$.complete();
      expect(store.contextItems()[0]).toMatchObject({kind: 'file', label: 'spec.pdf', attachment});
      expect(store.contextItems()[0].uploading).toBeFalsy();
      expect(store.uploading()).toBe(false);
    });

    it('removes the chip and shows the error when the upload fails', () => {
      store.attachFiles([pdf()]);
      upload$.error({code: 'attachment_unreadable', message: 'Broken'});
      expect(store.contextItems()).toEqual([]);
      expect(store.error()).toEqual({code: 'attachment_unreadable', message: 'Broken'});
    });

    it('refuses unsupported and too large files without uploading them', () => {
      store.attachFiles([new File(['x'], 'tool.exe')]);
      expect(store.error()?.code).toBe('attachment_unsupported');
      const large = new File(['x'], 'large.pdf');
      Object.defineProperty(large, 'size', {value: 21 * 1024 * 1024});
      store.attachFiles([large]);
      expect(store.error()?.code).toBe('attachment_too_large');
      expect(api.uploadAttachment).not.toHaveBeenCalled();
      expect(store.contextItems()).toEqual([]);
    });

    it('deletes the attachment when its chip is removed, also while it is uploaded', () => {
      store.attachFiles([pdf()]);
      upload$.next(attachment);
      store.removeContextItem(store.contextItems()[0].id);
      expect(api.deleteAttachment).toHaveBeenCalledWith('a1');

      const second$ = new Subject<AiAttachment>();
      api.uploadAttachment.mockReturnValueOnce(second$);
      store.attachFiles([pdf()]);
      store.removeContextItem(store.contextItems()[0].id);
      second$.next({...attachment, id: 'a2'});
      expect(api.deleteAttachment).toHaveBeenCalledWith('a2');
      expect(store.contextItems()).toEqual([]);
    });

    it('ignores errors when deleting an attachment', () => {
      api.deleteAttachment.mockReturnValueOnce(throwError(() => ({code: 'offline', message: 'x'})));
      store.attachFiles([pdf()]);
      upload$.next(attachment);
      store.removeContextItem(store.contextItems()[0].id);
      expect(store.error()).toBeNull();
    });

    it('adds models, namespaces and sources only once', () => {
      store.addModelToContext({sourcePath: '/ws', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl'}, 'Movement.ttl');
      store.addModelToContext({sourcePath: '/ws', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl'}, 'Movement.ttl');
      store.addModelToContext({sourcePath: '/ws', namespace: 'org.example', version: '1.0.0'}, 'org.example:1.0.0');
      store.addModelToContext({sourcePath: '/ws'}, 'ws', {sourceType: 'workspace', detail: '/ws'});
      store.addModelToContext({}, 'nothing');
      expect(store.contextItems().map(item => item.kind)).toEqual(['model', 'namespace', 'source']);
      expect(store.contextItems()[2]).toMatchObject({sourceType: 'workspace', detail: '/ws'});
    });

    it('sends the attachments and models and shows them at the message', async () => {
      store.attachFiles([pdf()]);
      upload$.next(attachment);
      store.addModelToContext({sourcePath: '/ws', namespace: 'org.example', version: '1.0.0'}, 'org.example:1.0.0');
      store.send({message: 'Compare'});
      await flush();

      expect(lastRequest().context.attachmentIds).toEqual(['a1']);
      expect(lastRequest().context.contextModels).toEqual([{sourcePath: '/ws', namespace: 'org.example', version: '1.0.0'}]);
      expect(store.messages()[0].context).toEqual([
        {kind: 'file', label: 'spec.pdf'},
        {kind: 'namespace', label: 'org.example:1.0.0'},
      ]);
      // the chips stay for the next message
      expect(store.contextItems()).toHaveLength(2);
    });

    it('keeps files and models when an editor action asks', async () => {
      store.addModelToContext({sourcePath: '/ws'}, 'ws');
      store.ask({message: 'Describe it', elementUrns: ['urn:samm:x:1.0.0#speed']});
      expect(store.contextItems().map(item => item.kind)).toEqual(['source', 'element']);
    });

    it('loads the candidates of the workspace', () => {
      store.loadContextCandidates();
      expect(modelApi.loadNamespacesStructure).toHaveBeenCalled();
      expect(store.contextCandidates()[0].candidates.map(candidate => candidate.kind)).toEqual(['namespace', 'namespace', 'model']);
      expect(store.candidatesLoading()).toBe(false);

      store.addCandidateToContext(store.contextCandidates()[0].candidates[2]);
      expect(store.contextItems()[0]).toMatchObject({kind: 'model', label: 'Movement.ttl', detail: 'org.example:1.0.0'});
    });

    it('offers no candidates when the workspace cannot be loaded', () => {
      modelApi.loadNamespacesStructure.mockReturnValueOnce(throwError(() => new Error('down')));
      store.loadContextCandidates();
      expect(store.contextCandidates()).toEqual([]);
    });

    it('takes over the context of stored messages', () => {
      api.getConversation.mockReturnValueOnce(
        of({
          id: 'c2',
          title: 'Two',
          createdAt: '',
          updatedAt: '',
          messages: [{id: 'm1', role: 'user', content: 'Hi', createdAt: '', context: [{kind: 'file', label: 'a.pdf'}]}],
        }),
      );
      store.openConversation('c2');
      expect(store.messages()[0].context).toEqual([{kind: 'file', label: 'a.pdf'}]);
    });
  });

  describe('conversations', () => {
    it('loads, opens, renames and deletes conversations', () => {
      store.loadConversations();
      expect(store.conversations()).toHaveLength(1);

      store.openConversation('c1');
      expect(store.activeConversationId()).toBe('c1');
      expect(store.messages()[0]).toMatchObject({role: 'user', content: 'Hi', proposals: []});

      store.renameConversation('c1', ' New ');
      expect(api.renameConversation).toHaveBeenCalledWith('c1', 'New');
      expect(store.conversations()[0].title).toBe('New');

      store.deleteConversation('c1');
      expect(store.conversations()).toEqual([]);
      expect(store.activeConversationId()).toBeNull();
      expect(store.messages()).toEqual([]);
    });

    it('clears all conversations', () => {
      store.loadConversations();
      store.clearConversations();
      expect(api.deleteAllConversations).toHaveBeenCalled();
      expect(store.conversations()).toEqual([]);
    });

    it('reports errors', () => {
      api.getConversations.mockReturnValue(throwError(() => ({code: 'offline', message: 'down'})));
      store.loadConversations();
      expect(store.error()?.code).toBe('offline');
    });
  });

  describe('proposals', () => {
    const proposal: AiProposal = {id: 'p1', kind: 'modelChange', title: 'Change', turtle: 'new', originalTurtle: 'old'};

    it('applies a model change through the editor', () => {
      store.applyModelChange(proposal).subscribe();
      expect(editor.applyModelChange).toHaveBeenCalledWith('new');
      expect(store.proposalStatusOf('p1')).toBe('applied');
    });

    it('does not change read-only models', () => {
      editor.openModel.set({label: 'x', readOnly: true});
      let applied: boolean | undefined;
      store.applyModelChange(proposal).subscribe(result => (applied = result));
      expect(applied).toBe(false);
      expect(editor.applyModelChange).not.toHaveBeenCalled();
    });

    it('reopens the proposal when applying fails', () => {
      editor.applyModelChange.mockReturnValue(throwError(() => new Error('invalid')));
      store.applyModelChange(proposal, 'edited').subscribe({error: () => undefined});
      expect(editor.applyModelChange).toHaveBeenCalledWith('edited');
      expect(store.proposalStatusOf('p1')).toBe('open');
    });

    it('creates new models, renames and validates', () => {
      store.createModel({...proposal, kind: 'newModel'}).subscribe();
      expect(editor.openNewModel).toHaveBeenCalledWith('new');

      store.applyRefactoring({
        id: 'p2',
        kind: 'refactoring',
        title: 'Rename',
        refactoring: {kind: 'renameElement', urn: 'u', newName: 'n'},
      });
      expect(editor.renameElement).toHaveBeenCalledWith('u', 'n');
      expect(store.proposalStatusOf('p2')).toBe('applied');

      store.validateProposal('p1', 'edited').subscribe();
      expect(store.proposalValidation()['p1'].valid).toBe(false);

      store.setProposalStatus('p1', 'discarded');
      expect(store.proposalStatusOf('p1')).toBe('discarded');
    });
  });

  it('derives the element name from the URN', () => {
    expect(aiElementName('urn:samm:org.example:1.0.0#speed')).toBe('speed');
    expect(aiElementName('speed')).toBe('speed');
  });
});
