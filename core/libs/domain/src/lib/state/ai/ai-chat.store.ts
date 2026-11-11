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

import {computed, inject, Injectable, signal} from '@angular/core';
import {catchError, finalize, of, Subscription, switchMap} from 'rxjs';
import {AiChatEvent, AiChatRequest, AiConversationSummary, asAiError} from '../../model-api';
import {AiPort} from '../../ports/ai.port';
import {UiShellStore} from '../ui-shell/ui-shell.store';
import {AiContextStore} from './ai-context.store';
import {AiErrorStore} from './ai-error.store';
import {AiProposalStore} from './ai-proposal.store';
import {AiSetupStore} from './ai-setup.store';
import {AiAskRequest, AiChatMessage, AiSendRequest, toChatMessage} from './ai.models';
import {newAiId} from './ai.utils';

/** The conversations with the assistant and the streamed answers. */
@Injectable({providedIn: 'root'})
export class AiChatStore {
  private readonly api = inject(AiPort, {optional: true});
  private readonly uiShell = inject(UiShellStore);
  private readonly setup = inject(AiSetupStore);
  private readonly context = inject(AiContextStore);
  private readonly proposals = inject(AiProposalStore);
  private readonly errors = inject(AiErrorStore);

  private chatSubscription: Subscription | null = null;

  private readonly conversationsState = signal<AiConversationSummary[]>([]);
  private readonly activeConversationIdState = signal<string | null>(null);
  private readonly messagesState = signal<AiChatMessage[]>([]);
  private readonly streamingState = signal(false);
  private readonly loadingConversationState = signal(false);
  private readonly consentPendingState = signal<AiSendRequest | null>(null);
  private readonly draftState = signal<string | null>(null);

  readonly conversations = this.conversationsState.asReadonly();
  readonly activeConversationId = this.activeConversationIdState.asReadonly();
  readonly activeConversation = computed(() => this.conversations().find(({id}) => id === this.activeConversationId()) ?? null);
  readonly messages = this.messagesState.asReadonly();
  readonly streaming = this.streamingState.asReadonly();
  readonly loadingConversation = this.loadingConversationState.asReadonly();
  /** A message waits for the consent to send model data to a cloud provider. */
  readonly consentPending = this.consentPendingState.asReadonly();
  /** A text for the input, e.g. of an editor action; taken over and cleared by the panel. */
  readonly draft = this.draftState.asReadonly();

  /** Opens the panel and asks the assistant on behalf of an action of the editor. */
  ask(request: AiAskRequest): void {
    this.uiShell.openAiPanel();
    this.context.replaceEditorItems(request);
    if (!this.setup.configured()) {
      this.draftState.set(draftOf(request));
      this.setup.loadSetup();
      return;
    }
    this.send({message: request.message, command: request.command});
  }

  /** Opens the panel with a prefilled input which the user can complete before sending (e.g. a model description). */
  prepare(request: AiAskRequest): void {
    this.uiShell.openAiPanel();
    this.context.replaceEditorItems(request);
    this.draftState.set(draftOf(request));
    if (!this.setup.configured()) this.setup.loadSetup();
  }

  acceptConsent(): void {
    const pending = this.consentPending();
    this.setup.grantCloudConsent();
    this.consentPendingState.set(null);
    if (pending) this.send(pending);
  }

  declineConsent(): void {
    const pending = this.consentPending();
    this.consentPendingState.set(null);
    if (pending) this.draftState.set(pending.message);
  }

  clearDraft(): void {
    this.draftState.set(null);
  }

  send(request: AiSendRequest): void {
    const provider = this.setup.providerConfig();
    if (!provider || !this.api || this.streaming() || this.context.uploading() || !request.message.trim()) return;
    if (this.setup.settings().onlyLocal && !this.setup.isLocal()) {
      this.errors.report({code: 'local_only', message: 'Only local models may be used.'});
      return;
    }
    if (this.setup.consentRequired()) {
      this.consentPendingState.set(request);
      return;
    }

    this.errors.clear();
    this.draftState.set(null);
    const requestId = newAiId();
    const answerId = `pending-${requestId}`;
    const contextRefs = this.context.refs();
    this.messagesState.update(messages => [
      ...messages,
      {
        id: `user-${requestId}`,
        role: 'user',
        content: request.message,
        command: request.command,
        proposals: [],
        tools: [],
        ...(contextRefs.length ? {context: contextRefs} : {}),
      },
      {id: answerId, role: 'assistant', content: '', proposals: [], tools: [], streaming: true},
    ]);
    this.streamingState.set(true);

    let messageId = answerId;
    this.chatSubscription = this.context
      .build(request, this.setup.settings().languages)
      .pipe(
        switchMap(context =>
          this.setup.apiKey(provider.kind).pipe(
            switchMap(key => {
              const chat: AiChatRequest = {
                ...(this.activeConversationId() ? {conversationId: this.activeConversationId()} : {}),
                requestId,
                provider,
                message: request.message,
                ...(request.command ? {command: request.command} : {}),
                context,
              };
              return this.api.chat(chat, key);
            }),
          ),
        ),
        catchError(error => of<AiChatEvent>({type: 'error', data: asAiError(error)})),
        finalize(() => {
          this.streamingState.set(false);
          this.updateMessage(messageId, message => ({...message, streaming: false}));
          this.chatSubscription = null;
        }),
      )
      .subscribe(event => {
        if (event.type === 'done') {
          this.updateMessage(messageId, message => ({...message, id: event.data.messageId || message.id, streaming: false}));
          messageId = event.data.messageId || messageId;
          this.touchConversation();
          return;
        }
        this.onChatEvent(messageId, event);
      });
  }

  /** Stops the answer; the text received so far is kept. */
  stop(): void {
    if (!this.chatSubscription) return;
    const streamed = this.messages().find(message => message.streaming);
    this.chatSubscription.unsubscribe();
    if (streamed) this.updateMessage(streamed.id, message => ({...message, streaming: false, stopped: true}));
  }

  loadConversations(): void {
    this.api?.getConversations().subscribe({
      next: conversations => this.conversationsState.set(conversations ?? []),
      error: error => this.errors.report(asAiError(error)),
    });
  }

  newConversation(): void {
    this.stop();
    this.activeConversationIdState.set(null);
    this.messagesState.set([]);
    this.proposals.reset();
    this.errors.clear();
  }

  openConversation(id: string): void {
    if (!this.api || id === this.activeConversationId()) return;
    this.stop();
    this.loadingConversationState.set(true);
    this.api
      .getConversation(id)
      .pipe(finalize(() => this.loadingConversationState.set(false)))
      .subscribe({
        next: conversation => {
          this.activeConversationIdState.set(conversation.id);
          this.messagesState.set((conversation.messages ?? []).map(toChatMessage));
          this.proposals.reset();
          this.errors.clear();
        },
        error: error => this.errors.report(asAiError(error)),
      });
  }

  renameConversation(id: string, title: string): void {
    const trimmed = title.trim();
    if (!this.api || !trimmed) return;
    this.api.renameConversation(id, trimmed).subscribe({
      next: summary =>
        this.conversationsState.update(conversations =>
          conversations.map(conversation => (conversation.id === id ? {...conversation, ...summary} : conversation)),
        ),
      error: error => this.errors.report(asAiError(error)),
    });
  }

  deleteConversation(id: string): void {
    if (!this.api) return;
    this.api.deleteConversation(id).subscribe({
      complete: () => this.removeConversation(id),
      error: error => this.errors.report(asAiError(error)),
    });
  }

  clearConversations(): void {
    if (!this.api) return;
    const clear = () => {
      this.conversationsState.set([]);
      this.newConversation();
    };
    this.api.deleteAllConversations().subscribe({complete: clear, error: error => this.errors.report(asAiError(error))});
  }

  private onChatEvent(messageId: string, event: AiChatEvent): void {
    switch (event.type) {
      case 'conversation': {
        const {id, title} = event.data;
        this.activeConversationIdState.set(id);
        if (!this.conversations().some(conversation => conversation.id === id)) {
          this.conversationsState.update(conversations => [{id, title, updatedAt: new Date().toISOString()}, ...conversations]);
        }
        break;
      }
      case 'delta':
        this.updateMessage(messageId, message => ({...message, content: message.content + (event.data.text ?? '')}));
        break;
      case 'tool':
        this.updateMessage(messageId, message => {
          const others = message.tools.filter(tool => tool.callId !== event.data.callId);
          return {...message, tools: [...others, event.data]};
        });
        break;
      case 'proposal':
        this.updateMessage(messageId, message => ({...message, proposals: [...message.proposals, event.data]}));
        break;
      case 'error':
        this.updateMessage(messageId, message => ({...message, error: event.data, streaming: false}));
        break;
    }
  }

  private updateMessage(id: string, update: (message: AiChatMessage) => AiChatMessage): void {
    this.messagesState.update(messages => messages.map(message => (message.id === id ? update(message) : message)));
  }

  private touchConversation(): void {
    const id = this.activeConversationId();
    this.conversationsState.update(conversations => {
      const conversation = conversations.find(item => item.id === id);
      if (!conversation) return conversations;
      return [{...conversation, updatedAt: new Date().toISOString()}, ...conversations.filter(item => item.id !== id)];
    });
  }

  private removeConversation(id: string): void {
    this.conversationsState.update(conversations => conversations.filter(conversation => conversation.id !== id));
    if (this.activeConversationId() === id) this.newConversation();
  }
}

/** The input text for a request; the command names in English are also understood by the input. */
function draftOf(request: AiAskRequest): string {
  return request.command ? `/${request.command} ${request.message}` : request.message;
}
