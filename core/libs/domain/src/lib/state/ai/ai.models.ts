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
  AiAttachment,
  AiCommand,
  AiContextModel,
  AiError,
  AiMessage,
  AiMessageContextRef,
  AiProposal,
  AiProviderKind,
  AiToolActivity,
  AiValidationError,
} from '../../model-api';

/** A message of the chat as shown in the panel. */
export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  command?: string;
  proposals: AiProposal[];
  tools: AiToolActivity[];
  error?: AiError;
  /** The answer is still streamed. */
  streaming?: boolean;
  /** The user stopped the answer. */
  stopped?: boolean;
  /** User messages: the files and models attached to it. */
  context?: AiMessageContextRef[];
}

/** Something the user added to the context of the next message, shown as removable chip. */
export interface AiContextItem {
  id: string;
  kind: 'element' | 'error' | 'file' | 'model' | 'namespace' | 'source';
  label: string;
  urn?: string;
  error?: AiValidationError;
  /** `file`: the uploaded file; missing while it is uploaded. */
  attachment?: AiAttachment;
  /** `model`, `namespace` and `source`: the models sent as context. */
  contextModel?: AiContextModel;
  /** `file`: the file is still uploaded. */
  uploading?: boolean;
  /** `source`: the type of the source, e.g. `github`. */
  sourceType?: 'workspace' | 'github';
  /** Further details shown in the tooltip, e.g. the namespace of a model. */
  detail?: string;
}

export type AiProposalStatus = 'open' | 'applying' | 'applied' | 'discarded';

export type AiCopilotLoginState = 'idle' | 'starting' | 'waiting' | 'unsupported' | 'failed';

/** Actions of the graph context menu that ask the assistant about the selected element. */
export const AiEditorAction = {
  describe: 'ai-describe',
  translate: 'ai-translate',
  explain: 'ai-explain',
} as const;

/** A provider as offered in the setup. */
export interface AiProviderChoice {
  kind: AiProviderKind;
  recommended: boolean;
  local: boolean;
  available: boolean;
}

/** What an action of the editor asks the assistant. */
export interface AiAskRequest {
  message: string;
  command?: AiCommand;
  /** Elements the question is about, e.g. the element of the context menu. */
  elementUrns?: string[];
  validationErrors?: AiValidationError[];
}

export interface AiSendRequest {
  message: string;
  command?: AiCommand;
  /** URNs of the elements mentioned with `@`. */
  mentionedElementUrns?: string[];
}

export function toChatMessage(message: AiMessage): AiChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content ?? '',
    command: message.command,
    proposals: message.proposals ?? [],
    tools: [],
    error: message.error,
    ...(message.context?.length ? {context: message.context} : {}),
  };
}
