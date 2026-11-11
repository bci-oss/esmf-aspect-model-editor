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

import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it} from 'vitest';
import {AiAttachment} from '../../model-api';
import {UiShellStore} from '../ui-shell/ui-shell.store';
import {AiChatStore} from './ai-chat.store';
import {AiContextStore} from './ai-context.store';
import {AiErrorStore} from './ai-error.store';
import {AiProposalStore} from './ai-proposal.store';
import {AiSetupStore} from './ai-setup.store';
import {flushAi, setupAiStoreTest} from './ai-stores.fixture';

describe('AiChatStore', () => {
  let store: AiChatStore;
  let context: AiContextStore;
  let errors: AiErrorStore;
  let fixture: ReturnType<typeof setupAiStoreTest>;

  beforeEach(() => {
    fixture = setupAiStoreTest();
    store = TestBed.inject(AiChatStore);
    context = TestBed.inject(AiContextStore);
    errors = TestBed.inject(AiErrorStore);
  });

  describe('chat', () => {
    beforeEach(() => fixture.setAi({provider: 'ollama', languages: ['en', 'de']}));

    it('streams an answer with tools and proposals', async () => {
      fixture.editor.selectedElementUrn.set('urn:samm:org.example:1.0.0#speed');
      store.send({message: 'Explain', command: 'explain', mentionedElementUrns: ['urn:samm:org.example:1.0.0#position']});
      await flushAi();

      const request = fixture.lastChatRequest();
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

      fixture.chat$.next({type: 'conversation', data: {id: 'c9', title: 'Explain'}});
      fixture.chat$.next({type: 'delta', data: {text: 'The '}});
      fixture.chat$.next({type: 'tool', data: {callId: 't', name: 'validate', status: 'started'}});
      fixture.chat$.next({type: 'tool', data: {callId: 't', name: 'validate', status: 'done'}});
      fixture.chat$.next({type: 'delta', data: {text: 'answer'}});
      fixture.chat$.next({type: 'proposal', data: {id: 'p1', kind: 'payload', title: 'Payload'}});
      fixture.chat$.next({type: 'done', data: {messageId: 'm2'}});
      fixture.chat$.complete();

      const answer = store.messages()[1];
      expect(answer).toMatchObject({id: 'm2', content: 'The answer', streaming: false});
      expect(answer.tools).toEqual([{callId: 't', name: 'validate', status: 'done'}]);
      expect(answer.proposals).toHaveLength(1);
      expect(store.activeConversationId()).toBe('c9');
      expect(store.activeConversation()?.title).toBe('Explain');
      expect(store.conversations()[0].id).toBe('c9');
      expect(store.streaming()).toBe(false);

      store.send({message: 'More'});
      await flushAi();
      expect(fixture.lastChatRequest().conversationId).toBe('c9');
    });

    it('shows the error of an answer', async () => {
      store.send({message: 'Hi'});
      await flushAi();
      fixture.chat$.next({type: 'error', data: {code: 'quota_exceeded', message: 'quota'}});
      fixture.chat$.complete();
      expect(store.messages()[1].error?.code).toBe('quota_exceeded');
      expect(store.streaming()).toBe(false);
    });

    it('stops the answer and keeps the text', async () => {
      store.send({message: 'Hi'});
      await flushAi();
      fixture.chat$.next({type: 'delta', data: {text: 'Part'}});
      store.stop();
      expect(fixture.chat$.observed).toBe(false);
      expect(store.messages()[1]).toMatchObject({content: 'Part', streaming: false, stopped: true});
      expect(store.streaming()).toBe(false);
    });

    it('sends nothing while a file is uploaded or without text', () => {
      context.attachFiles([new File(['%PDF'], 'spec.pdf')]);
      store.send({message: 'Hi'});
      fixture.upload$.next({id: 'a1', name: 'spec.pdf', kind: 'pdf', size: 1, characters: 1, truncated: false} as AiAttachment);
      store.send({message: '  '});
      expect(fixture.api.chat).not.toHaveBeenCalled();
    });

    it('sends the attachments and models and shows them at the message', async () => {
      context.attachFiles([new File(['%PDF'], 'spec.pdf')]);
      fixture.upload$.next({id: 'a1', name: 'spec.pdf', kind: 'pdf', size: 10, characters: 100, pages: 2, truncated: false});
      context.addModel({sourcePath: '/ws', namespace: 'org.example', version: '1.0.0'}, 'org.example:1.0.0');
      store.send({message: 'Compare'});
      await flushAi();

      expect(fixture.lastChatRequest().context.attachmentIds).toEqual(['a1']);
      expect(store.messages()[0].context).toEqual([
        {kind: 'file', label: 'spec.pdf'},
        {kind: 'namespace', label: 'org.example:1.0.0'},
      ]);
      // the chips stay for the next message
      expect(context.items()).toHaveLength(2);
    });

    it('asks for consent before sending to a cloud provider', async () => {
      fixture.setAi({provider: 'openai'});
      store.send({message: 'Hi'});
      expect(store.consentPending()).toEqual({message: 'Hi'});
      expect(fixture.api.chat).not.toHaveBeenCalled();

      store.acceptConsent();
      await flushAi();
      expect(TestBed.inject(AiSetupStore).settings().cloudConsent).toEqual(['openai']);
      expect(store.consentPending()).toBeNull();
      expect(fixture.api.chat).toHaveBeenCalled();
    });

    it('keeps the message as draft when the consent is declined', () => {
      fixture.setAi({provider: 'copilot'});
      store.send({message: 'Hi'});
      store.declineConsent();
      expect(store.draft()).toBe('Hi');
      expect(fixture.api.chat).not.toHaveBeenCalled();
      store.clearDraft();
      expect(store.draft()).toBeNull();
    });

    it('refuses cloud providers when only local ones are allowed', () => {
      fixture.setAi({provider: 'openai', onlyLocal: true});
      store.send({message: 'Hi'});
      expect(errors.error()?.code).toBe('local_only');
      expect(fixture.api.chat).not.toHaveBeenCalled();
    });

    it('asks on behalf of the editor', async () => {
      const uiShell = TestBed.inject(UiShellStore);
      store.ask({message: 'Describe it', command: 'describe', elementUrns: ['urn:samm:x:1.0.0#speed']});
      await flushAi();
      expect(uiShell.aiPanelOpen()).toBe(true);
      expect(context.items()[0]).toMatchObject({kind: 'element', label: 'speed'});
      expect(fixture.lastChatRequest().context.mentionedElementUrns).toEqual(['urn:samm:x:1.0.0#speed']);
    });

    it('keeps files and models when an editor action asks', () => {
      context.addModel({sourcePath: '/ws'}, 'ws');
      store.ask({message: 'Describe it', elementUrns: ['urn:samm:x:1.0.0#speed']});
      expect(context.items().map(item => item.kind)).toEqual(['source', 'element']);
    });

    it('keeps the question as draft while the assistant is not configured', () => {
      fixture.setAi({provider: 'openai', cloudConsent: ['openai']});
      store.ask({message: 'Describe it'});
      expect(store.draft()).toBe('Describe it');
      store.ask({message: 'it', command: 'describe'});
      expect(store.draft()).toBe('/describe it');
      expect(fixture.api.chat).not.toHaveBeenCalled();
      expect(fixture.api.getProviders).toHaveBeenCalled();
    });

    it('prepares a command draft without sending it', () => {
      const uiShell = TestBed.inject(UiShellStore);
      store.prepare({message: 'a model for a robot arm', command: 'generate', elementUrns: ['urn:samm:x:1.0.0#speed']});
      expect(uiShell.aiPanelOpen()).toBe(true);
      expect(store.draft()).toBe('/generate a model for a robot arm');
      expect(context.items()[0]).toMatchObject({kind: 'element', label: 'speed'});
      expect(fixture.api.chat).not.toHaveBeenCalled();
    });
  });

  describe('conversations', () => {
    it('loads, opens, renames and deletes conversations', () => {
      store.loadConversations();
      expect(store.conversations()).toHaveLength(1);

      store.openConversation('c1');
      expect(store.activeConversationId()).toBe('c1');
      expect(store.loadingConversation()).toBe(false);
      expect(store.messages()[0]).toMatchObject({role: 'user', content: 'Hi', proposals: []});

      store.renameConversation('c1', ' New ');
      expect(fixture.api.renameConversation).toHaveBeenCalledWith('c1', 'New');
      expect(store.conversations()[0].title).toBe('New');

      store.deleteConversation('c1');
      expect(store.conversations()).toEqual([]);
      expect(store.activeConversationId()).toBeNull();
      expect(store.messages()).toEqual([]);
    });

    it('takes over the context of stored messages', () => {
      fixture.api.getConversation.mockReturnValueOnce(
        of({
          id: 'c2',
          title: 'Two',
          createdAt: '',
          updatedAt: '',
          messages: [{id: 'm1', role: 'user', content: 'Hi', createdAt: '', context: [{kind: 'file', label: 'a.pdf'}]}],
        }) as never,
      );
      store.openConversation('c2');
      expect(store.messages()[0].context).toEqual([{kind: 'file', label: 'a.pdf'}]);
    });

    it('forgets the proposals and the error of the previous conversation', () => {
      const proposals = TestBed.inject(AiProposalStore);
      proposals.setStatus('p1', 'applied');
      errors.report({code: 'offline', message: 'down'});
      store.openConversation('c1');
      expect(proposals.statuses()).toEqual({});
      expect(errors.error()).toBeNull();

      proposals.setStatus('p1', 'applied');
      errors.report({code: 'offline', message: 'down'});
      store.newConversation();
      expect(proposals.statuses()).toEqual({});
      expect(errors.error()).toBeNull();
    });

    it('clears all conversations', () => {
      store.loadConversations();
      store.clearConversations();
      expect(fixture.api.deleteAllConversations).toHaveBeenCalled();
      expect(store.conversations()).toEqual([]);
    });

    it('reports errors', () => {
      fixture.api.getConversations.mockReturnValue(throwError(() => ({code: 'offline', message: 'down'})));
      store.loadConversations();
      expect(errors.error()?.code).toBe('offline');
    });
  });
});
