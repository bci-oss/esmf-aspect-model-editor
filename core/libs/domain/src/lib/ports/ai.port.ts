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

import {Observable} from 'rxjs';
import {
  AiAttachment,
  AiChatEvent,
  AiChatRequest,
  AiConversation,
  AiConversationSummary,
  AiLocalServer,
  AiModelInfo,
  AiProposalValidation,
  AiProviderConfig,
  AiProviderInfo,
  AiTestResult,
  CopilotLoginFlow,
  CopilotStatus,
} from '../model-api';

/**
 * Backend API of the AI assistant. Implemented by infrastructure.
 * The optional `key` is sent in the `X-Ame-Ai-Key` header and never logged; errors are `AiError`s.
 */
export abstract class AiPort {
  abstract getProviders(): Observable<AiProviderInfo[]>;
  /** Ollama and LM Studio servers running on this computer. */
  abstract getLocalServers(): Observable<AiLocalServer[]>;
  abstract getModels(provider: AiProviderConfig, key?: string): Observable<AiModelInfo[]>;
  abstract test(provider: AiProviderConfig, key?: string): Observable<AiTestResult>;

  abstract getCopilotStatus(): Observable<CopilotStatus>;
  abstract startCopilotLogin(): Observable<CopilotLoginFlow>;
  /** Emits once the user authorized the device, or errors when the flow expires. */
  abstract completeCopilotLogin(flowId: string): Observable<CopilotStatus>;
  abstract cancelCopilotLogin(flowId: string): Observable<void>;
  abstract setCopilotToken(token: string): Observable<CopilotStatus>;
  abstract logoutCopilot(): Observable<CopilotStatus>;

  /** Streams the answer; unsubscribing aborts the request and cancels it in the backend. */
  abstract chat(request: AiChatRequest, key?: string): Observable<AiChatEvent>;
  abstract cancelChat(requestId: string): Observable<void>;

  abstract getConversations(): Observable<AiConversationSummary[]>;
  abstract getConversation(id: string): Observable<AiConversation>;
  abstract renameConversation(id: string, title: string): Observable<AiConversationSummary>;
  abstract deleteConversation(id: string): Observable<void>;
  abstract deleteAllConversations(): Observable<void>;

  abstract validateProposal(turtle: string): Observable<AiProposalValidation>;

  /** Uploads a file as context of the chat; the backend extracts its text. */
  abstract uploadAttachment(file: File): Observable<AiAttachment>;
  abstract deleteAttachment(id: string): Observable<void>;
}
