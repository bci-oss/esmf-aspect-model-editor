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

import {AiProviderKind} from '@ame/shared';

export type {AiProviderKind, AiSettings} from '@ame/shared';

/** Stable error codes of the AI endpoints and of the `error` event of the chat stream. */
export type AiErrorCode =
  | 'invalid_key'
  | 'quota_exceeded'
  | 'offline'
  | 'timeout'
  | 'not_authenticated'
  | 'model_not_found'
  | 'provider_error'
  | 'local_only'
  | 'read_only'
  | 'attachment_unsupported'
  | 'attachment_too_large'
  | 'attachment_unreadable'
  | 'attachment_empty';

export const AI_ERROR_CODES: readonly AiErrorCode[] = [
  'invalid_key',
  'quota_exceeded',
  'offline',
  'timeout',
  'not_authenticated',
  'model_not_found',
  'provider_error',
  'local_only',
  'read_only',
  'attachment_unsupported',
  'attachment_too_large',
  'attachment_unreadable',
  'attachment_empty',
];

export interface AiError {
  /** One of {@link AiErrorCode}; unknown codes of newer backends are passed through. */
  code: string;
  message: string;
}

export interface AiProviderConfig {
  kind: AiProviderKind;
  /** The backend picks a sensible default when missing. */
  model?: string;
  /** Required for `azure-openai` and `openai-compatible`. */
  baseUrl?: string;
  /** `azure-openai` only. */
  apiVersion?: string;
}

export interface AiProviderInfo {
  kind: AiProviderKind;
  label: string;
  requiresKey: boolean;
  requiresBaseUrl: boolean;
  defaultBaseUrl?: string;
  local: boolean;
  /** Copilot: whether its runtime is bundled. */
  available: boolean;
  defaultModel?: string;
}

/** What the UI knows about a provider before the backend answered; the {@link AiProviderInfo} of the backend wins. */
export interface AiProviderTraits {
  requiresKey: boolean;
  requiresBaseUrl: boolean;
  /** Runs on this computer, the model data does not leave it. */
  local: boolean;
  recommended: boolean;
}

export const AI_PROVIDER_TRAITS: Readonly<Record<AiProviderKind, AiProviderTraits>> = {
  copilot: {requiresKey: false, requiresBaseUrl: false, local: false, recommended: true},
  openai: {requiresKey: true, requiresBaseUrl: false, local: false, recommended: false},
  anthropic: {requiresKey: true, requiresBaseUrl: false, local: false, recommended: false},
  'azure-openai': {requiresKey: true, requiresBaseUrl: true, local: false, recommended: false},
  ollama: {requiresKey: false, requiresBaseUrl: false, local: true, recommended: false},
  lmstudio: {requiresKey: false, requiresBaseUrl: false, local: true, recommended: false},
  'openai-compatible': {requiresKey: false, requiresBaseUrl: true, local: false, recommended: false},
};

/** A local model server found on `localhost`. */
export interface AiLocalServer {
  kind: 'ollama' | 'lmstudio';
  baseUrl: string;
  models: string[];
}

export interface AiModelInfo {
  id: string;
  name: string;
}

export interface AiTestResult {
  ok: boolean;
  code?: string;
  message?: string;
  models?: AiModelInfo[];
}

export interface CopilotStatus {
  available: boolean;
  authenticated: boolean;
  login?: string;
  host?: string;
}

/** A started GitHub device flow. */
export interface CopilotLoginFlow {
  flowId: string;
  userCode: string;
  verificationUri: string;
  /** Seconds. */
  expiresIn: number;
}

export type AiCommand = 'explain' | 'describe' | 'translate' | 'generate' | 'review' | 'examples' | 'fix';

export const AI_COMMANDS: readonly AiCommand[] = ['explain', 'describe', 'translate', 'generate', 'review', 'examples', 'fix'];

export interface AiValidationError {
  message: string;
  focusNode?: string;
  resultPath?: string;
  errorCode?: string;
}

/** File extensions the backend extracts text from. */
export const AI_ATTACHMENT_EXTENSIONS: readonly string[] = [
  'pdf',
  'docx',
  'xlsx',
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'tsv',
  'ttl',
  'yaml',
  'yml',
  'xml',
];

/** Largest file that can be attached (20 MB). */
export const AI_ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024;

/** A file uploaded as context; only its extracted text is kept, in the memory of the backend. */
export interface AiAttachment {
  id: string;
  /** The original file name. */
  name: string;
  kind: 'pdf' | 'docx' | 'xlsx' | 'text';
  /** Bytes of the uploaded file. */
  size: number;
  /** Length of the extracted text. */
  characters: number;
  /** Pages of a PDF, sheets of a workbook. */
  pages?: number;
  /** The text was cut at the limit. */
  truncated: boolean;
  /** E.g. `no_text` for a scanned PDF without text layer. */
  warning?: string;
}

/** Models of the workspace or of a GitHub source sent as context; at least the source or the namespace is set. */
export interface AiContextModel {
  /** The root path of the source; missing means all sources. */
  sourcePath?: string;
  /** Missing means the whole source. */
  namespace?: string;
  /** Missing means all versions of the namespace. */
  version?: string;
  /** Missing means all files of namespace:version. */
  fileName?: string;
}

export type AiContextKind = 'file' | 'model' | 'namespace' | 'source';

/** What was attached to a user message, as shown in the conversation. */
export interface AiMessageContextRef {
  kind: AiContextKind;
  label: string;
}

/** The extension of a file name in lower case, e.g. `pdf`. */
export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

export interface AiChatContext {
  /** The opened (possibly unsaved) model as Turtle. */
  modelTurtle?: string;
  modelUrn?: string;
  namespace?: string;
  version?: string;
  fileName?: string;
  workspaceId?: string;
  /** The open model comes from a read-only (GitHub) source. */
  readOnly?: boolean;
  selectedElementUrn?: string;
  mentionedElementUrns?: string[];
  validationErrors?: AiValidationError[];
  /** Target languages for describe/translate. */
  languages?: string[];
  /** Ids of the uploaded {@link AiAttachment}s. */
  attachmentIds?: string[];
  contextModels?: AiContextModel[];
}

export interface AiChatRequest {
  /** Missing → a new conversation is created. */
  conversationId?: string;
  /** Generated by the client, used for cancel. */
  requestId: string;
  provider: AiProviderConfig;
  message: string;
  command?: AiCommand;
  context: AiChatContext;
}

export type AiProposalKind = 'modelChange' | 'newModel' | 'refactoring' | 'payload' | 'review';
export type AiFindingSeverity = 'info' | 'warning' | 'error';
export type AiFindingCategory = 'naming' | 'unit' | 'description' | 'characteristic' | 'reuse' | 'other';

export interface AiProposalValidationError {
  message: string;
  focusNode?: string;
}

export interface AiRenameRefactoring {
  kind: 'renameElement';
  urn: string;
  newName: string;
}

export interface AiPayloadVariant {
  name: string;
  json: string;
}

export interface AiReviewFinding {
  id: string;
  severity: AiFindingSeverity;
  category: AiFindingCategory;
  elementUrn?: string;
  message: string;
  suggestion?: string;
  reuseUrn?: string;
  fixable: boolean;
}

export interface AiProposal {
  id: string;
  kind: AiProposalKind;
  title: string;
  /** Markdown. */
  summary?: string;
  /** modelChange / newModel: the complete new Turtle of the model file. */
  turtle?: string;
  /** modelChange: the Turtle the change is based on (for the diff). */
  originalTurtle?: string;
  namespace?: string;
  version?: string;
  fileName?: string;
  valid?: boolean;
  validationErrors?: AiProposalValidationError[];
  refactoring?: AiRenameRefactoring;
  payload?: AiPayloadVariant[];
  findings?: AiReviewFinding[];
}

export interface AiProposalValidation {
  valid: boolean;
  validationErrors: AiProposalValidationError[];
}

export type AiToolStatus = 'started' | 'done' | 'failed';

export interface AiToolActivity {
  callId: string;
  name: string;
  status: AiToolStatus;
  summary?: string;
}

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** The typed events of the chat stream; `done` or `error` is always the last one. */
export type AiChatEvent =
  | {type: 'conversation'; data: {id: string; title: string}}
  | {type: 'delta'; data: {text: string}}
  | {type: 'tool'; data: AiToolActivity}
  | {type: 'proposal'; data: AiProposal}
  | {type: 'done'; data: {messageId: string; usage?: AiUsage}}
  | {type: 'error'; data: AiError};

export interface AiConversationSummary {
  id: string;
  title: string;
  /** ISO timestamp. */
  updatedAt: string;
  providerKind?: string;
  model?: string;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  command?: string;
  proposals?: AiProposal[];
  createdAt: string;
  error?: AiError;
  /** User messages: the files and models attached to it. */
  context?: AiMessageContextRef[];
}

export interface AiConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  providerKind?: string;
  model?: string;
  messages: AiMessage[];
}

/** Whether the error is an AI error body `{code, message}`. */
export function isAiError(value: unknown): value is AiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AiError).code === 'string' &&
    typeof (value as AiError).message === 'string'
  );
}

/** Any failure as {@link AiError}; failures without a code are provider errors. */
export function asAiError(error: unknown): AiError {
  if (isAiError(error)) return error;
  return {code: 'provider_error', message: error instanceof Error ? error.message : String(error ?? '')};
}

/** Cloud providers send the model data to a third party; local ones keep it on the computer. */
export function isLocalProvider(kind: AiProviderKind | null | undefined, baseUrl?: string): boolean {
  if (!kind) return false;
  if (AI_PROVIDER_TRAITS[kind]?.local) return true;
  if (kind !== 'openai-compatible' || !baseUrl) return false;
  try {
    const host = new URL(baseUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}
