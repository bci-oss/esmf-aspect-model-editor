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

import {AI_PROVIDER_KINDS, AiSecretInfo, DEFAULT_AI_SETTINGS} from '@ame/shared';
import {computed, inject, Injectable, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {catchError, defer, EMPTY, finalize, from, map, Observable, of, Subscription, switchMap, tap, throwError} from 'rxjs';
import {
  AI_ATTACHMENT_EXTENSIONS,
  AI_ATTACHMENT_MAX_SIZE,
  AI_PROVIDER_TRAITS,
  AiChatContext,
  AiChatEvent,
  AiChatRequest,
  AiContextModel,
  AiConversationSummary,
  AiError,
  AiLocalServer,
  AiMessageContextRef,
  AiModelInfo,
  AiProposal,
  AiProposalValidation,
  AiProviderConfig,
  AiProviderInfo,
  AiProviderKind,
  AiSettings,
  AiTestResult,
  AiValidationError,
  asAiError,
  CopilotLoginFlow,
  CopilotStatus,
  fileExtension,
  isLocalProvider,
} from '../../model-api';
import {AiEditorPort} from '../../ports/ai-editor.port';
import {AiSecretStorePort} from '../../ports/ai-secret-store.port';
import {AiPort} from '../../ports/ai.port';
import {ModelApiPort} from '../../ports/model-api.port';
import {ConfigurationService} from '../settings/configuration.service';
import {UiShellStore} from '../ui-shell/ui-shell.store';
import {AiContextCandidate, AiContextCandidateGroup, aiContextCandidates, AiSourceType, sameContextModel} from './ai-context-candidates';
import {
  AiAskRequest,
  AiChatMessage,
  AiContextItem,
  AiCopilotLoginState,
  AiProposalStatus,
  AiProviderChoice,
  AiSendRequest,
  toChatMessage,
} from './ai.models';

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** The local name of an element, e.g. `speed` of `urn:samm:org.example:1.0.0#speed`. */
export function aiElementName(urn: string): string {
  const index = urn.lastIndexOf('#');
  return index >= 0 ? urn.slice(index + 1) : urn;
}

/**
 * State of the AI assistant: its settings and setup, the conversations, the streamed answer and the proposals.
 * Everything is inactive while the assistant is disabled in the settings.
 */
@Injectable({providedIn: 'root'})
export class AiStore {
  private readonly api = inject(AiPort, {optional: true});
  private readonly secrets = inject(AiSecretStorePort, {optional: true});
  private readonly editor = inject(AiEditorPort, {optional: true});
  private readonly modelApi = inject(ModelApiPort, {optional: true});
  private readonly configuration = inject(ConfigurationService);
  private readonly uiShell = inject(UiShellStore);

  private readonly allSettings = toSignal(this.configuration.settings$, {initialValue: this.configuration.getSettings()});
  private chatSubscription: Subscription | null = null;
  private loginSubscription: Subscription | null = null;

  readonly settings = computed<AiSettings>(() => ({...DEFAULT_AI_SETTINGS, ...(this.allSettings()?.ai ?? {})}));
  readonly enabled = computed(() => this.settings().enabled);
  readonly providerKind = computed(() => this.settings().provider);
  readonly providerConfig = computed<AiProviderConfig | null>(() => {
    const {provider, model, baseUrl, apiVersion} = this.settings();
    if (!provider) return null;
    return {
      kind: provider,
      ...(model ? {model} : {}),
      ...(baseUrl ? {baseUrl} : {}),
      ...(provider === 'azure-openai' && apiVersion ? {apiVersion} : {}),
    };
  });
  readonly isLocal = computed(() => isLocalProvider(this.settings().provider, this.settings().baseUrl));
  /** Model data would leave the computer and the user has not agreed yet. */
  readonly consentRequired = computed(() => {
    const {provider, cloudConsent} = this.settings();
    return !!provider && !this.isLocal() && !cloudConsent.includes(provider);
  });

  readonly providers = signal<AiProviderInfo[]>([]);
  readonly localServers = signal<AiLocalServer[]>([]);
  readonly models = signal<AiModelInfo[]>([]);
  readonly copilotStatus = signal<CopilotStatus | null>(null);
  /** The providers offered in the setup; with "only local" just the local ones. */
  readonly providerChoices = computed<AiProviderChoice[]>(() => {
    const infos = this.providers();
    const onlyLocal = this.settings().onlyLocal;
    const kinds = infos.length ? infos.map(info => info.kind) : [...AI_PROVIDER_KINDS];
    return kinds
      .map(kind => {
        const info = infos.find(provider => provider.kind === kind);
        return {
          kind,
          recommended: !!AI_PROVIDER_TRAITS[kind]?.recommended,
          local: info?.local ?? !!AI_PROVIDER_TRAITS[kind]?.local,
          available: info?.available ?? (kind !== 'copilot' || !!this.copilotStatus()?.available),
        };
      })
      .filter(choice => !onlyLocal || choice.local || choice.kind === 'openai-compatible');
  });
  readonly keyInfo = signal<AiSecretInfo>({stored: false, persistent: false});
  readonly setupLoading = signal(false);
  readonly testing = signal(false);
  readonly testResult = signal<AiTestResult | null>(null);
  readonly loginFlow = signal<CopilotLoginFlow | null>(null);
  readonly loginState = signal<AiCopilotLoginState>('idle');
  readonly loginError = signal<AiError | null>(null);
  /** The user opened the setup although the assistant is configured, e.g. to change the provider. */
  readonly setupRequested = signal(false);

  readonly providerInfo = computed(() => this.providers().find(info => info.kind === this.providerKind()) ?? null);
  readonly requiresKey = computed(() => {
    const kind = this.providerKind();
    return this.providerInfo()?.requiresKey ?? !!(kind && AI_PROVIDER_TRAITS[kind]?.requiresKey);
  });
  readonly requiresBaseUrl = computed(() => {
    const kind = this.providerKind();
    return this.providerInfo()?.requiresBaseUrl ?? !!(kind && AI_PROVIDER_TRAITS[kind]?.requiresBaseUrl);
  });
  /** The provider is chosen and has everything it needs to answer. */
  readonly configured = computed(() => {
    const kind = this.providerKind();
    if (!kind) return false;
    if (kind === 'copilot') return !!this.copilotStatus()?.authenticated;
    if (this.requiresKey() && !this.keyInfo().stored) return false;
    return !this.requiresBaseUrl() || !!this.settings().baseUrl;
  });
  readonly showSetup = computed(() => !this.configured() || this.setupRequested());

  readonly conversations = signal<AiConversationSummary[]>([]);
  readonly activeConversationId = signal<string | null>(null);
  readonly activeConversation = computed(() => this.conversations().find(({id}) => id === this.activeConversationId()) ?? null);
  readonly messages = signal<AiChatMessage[]>([]);
  readonly streaming = signal(false);
  readonly loadingConversation = signal(false);
  /** The last error outside of an answer, e.g. when conversations cannot be loaded. */
  readonly error = signal<AiError | null>(null);
  /** The message waiting for the consent to send model data to a cloud provider. */
  readonly consentPending = signal<AiSendRequest | null>(null);
  /** Text an editor action put into the input because it could not be sent yet. */
  readonly draft = signal<string | null>(null);

  readonly contextItems = signal<AiContextItem[]>([]);
  readonly includeModel = signal(true);
  /** The selected element is not part of the context; reset when another element is selected. */
  readonly excludedSelection = signal<string | null>(null);
  readonly openModel = computed(() => this.editor?.openModel() ?? null);
  readonly selectedElementUrn = computed(() => {
    const urn = this.editor?.selectedElementUrn() ?? null;
    return urn && urn !== this.excludedSelection() ? urn : null;
  });
  readonly readOnly = computed(() => !!this.openModel()?.readOnly);
  /** A file of the context is still uploaded; nothing can be sent meanwhile. */
  readonly uploading = computed(() => this.contextItems().some(item => item.uploading));
  /** The models of the workspace and the GitHub sources that can be added to the context. */
  readonly contextCandidates = signal<AiContextCandidateGroup[]>([]);
  readonly candidatesLoading = signal(false);

  readonly proposalStatus = signal<Readonly<Record<string, AiProposalStatus>>>({});
  /** Validation of proposals the user edited, by proposal id. */
  readonly proposalValidation = signal<Readonly<Record<string, AiProposalValidation>>>({});

  /** Loads everything the setup needs; the requests that fail leave their part empty. */
  loadSetup(): void {
    if (!this.api) return;
    this.setupLoading.set(true);
    let pending = 3;
    const done = () => {
      if (--pending === 0) this.setupLoading.set(false);
    };
    this.api.getProviders().subscribe({next: providers => this.providers.set(providers ?? []), error: done, complete: done});
    this.api.getLocalServers().subscribe({next: servers => this.localServers.set(servers ?? []), error: done, complete: done});
    this.api.getCopilotStatus().subscribe({next: status => this.copilotStatus.set(status), error: done, complete: done});
    this.refreshKeyInfo();
  }

  updateSettings(patch: Partial<AiSettings>): void {
    const settings = this.configuration.getSettings();
    this.configuration.setSettings({...settings, ai: {...this.settings(), ...patch}});
  }

  setEnabled(enabled: boolean): void {
    this.updateSettings({enabled});
  }

  /** Chooses the provider; the model of the previous provider is not taken over. */
  selectProvider(kind: AiProviderKind, options: {baseUrl?: string; model?: string} = {}): void {
    const info = this.providers().find(provider => provider.kind === kind);
    this.updateSettings({
      provider: kind,
      model: options.model ?? info?.defaultModel,
      baseUrl: options.baseUrl ?? info?.defaultBaseUrl,
    });
    this.testResult.set(null);
    this.models.set([]);
    this.refreshKeyInfo();
  }

  selectModel(model: string): void {
    this.updateSettings({model});
  }

  openSetup(): void {
    this.setupRequested.set(true);
    this.loadSetup();
  }

  closeSetup(): void {
    this.setupRequested.set(false);
  }

  /** Keeps the setup open once the user changed it, so that the connection can still be tested when it is complete. */
  keepSetupOpen(): void {
    this.setupRequested.set(true);
  }

  saveKey(key: string): Observable<AiSecretInfo> {
    const kind = this.providerKind();
    if (!kind || !this.secrets) return EMPTY;
    return from(this.secrets.set(kind, key.trim())).pipe(
      switchMap(() => from(this.secrets.info(kind))),
      tap(info => this.keyInfo.set(info)),
    );
  }

  deleteKey(): Observable<void> {
    const kind = this.providerKind();
    if (!kind || !this.secrets) return EMPTY;
    return from(this.secrets.delete(kind)).pipe(tap(() => this.keyInfo.set({stored: false, persistent: false})));
  }

  testConnection(): void {
    const provider = this.providerConfig();
    if (!provider || !this.api) return;
    this.testing.set(true);
    this.testResult.set(null);
    this.withKey(provider.kind)
      .pipe(
        switchMap(key => this.api.test(provider, key)),
        catchError(error => of<AiTestResult>({ok: false, ...asAiError(error)})),
        finalize(() => this.testing.set(false)),
      )
      .subscribe(result => {
        this.testResult.set(result);
        if (result.models?.length) this.models.set(result.models);
      });
  }

  loadModels(): void {
    const provider = this.providerConfig();
    if (!provider || !this.api) return;
    this.withKey(provider.kind)
      .pipe(
        switchMap(key => this.api.getModels(provider, key)),
        catchError(() => of<AiModelInfo[]>([])),
      )
      .subscribe(models => this.models.set(models ?? []));
  }

  /** Starts the device flow of GitHub and waits until the user authorized the code. */
  startCopilotLogin(): void {
    if (!this.api) return;
    this.cancelLoginWait();
    this.loginError.set(null);
    this.loginState.set('starting');
    this.loginSubscription = this.api
      .startCopilotLogin()
      .pipe(
        tap(flow => {
          this.loginFlow.set(flow);
          this.loginState.set('waiting');
        }),
        switchMap(flow => this.api.completeCopilotLogin(flow.flowId)),
      )
      .subscribe({
        next: status => {
          this.copilotStatus.set(status);
          this.loginFlow.set(null);
          this.loginState.set('idle');
        },
        error: error => {
          const aiError = asAiError(error);
          this.loginFlow.set(null);
          // without device flow the user pastes a token instead
          this.loginState.set(aiError.code === 'provider_error' && this.loginState() === 'starting' ? 'unsupported' : 'failed');
          this.loginError.set(aiError);
        },
      });
  }

  cancelCopilotLogin(): void {
    const flow = this.loginFlow();
    this.cancelLoginWait();
    this.loginFlow.set(null);
    this.loginState.set('idle');
    if (flow && this.api) this.api.cancelCopilotLogin(flow.flowId).subscribe({error: () => undefined});
  }

  /** The fallback when the device flow is not possible: a GitHub token with Copilot access. */
  setCopilotToken(token: string): void {
    if (!this.api) return;
    this.loginError.set(null);
    this.api.setCopilotToken(token.trim()).subscribe({
      next: status => {
        this.copilotStatus.set(status);
        this.loginState.set('idle');
      },
      error: error => this.loginError.set(asAiError(error)),
    });
  }

  logoutCopilot(): void {
    this.api?.logoutCopilot().subscribe({next: status => this.copilotStatus.set(status), error: error => this.error.set(asAiError(error))});
  }

  acceptConsent(): void {
    const kind = this.providerKind();
    const pending = this.consentPending();
    if (kind) this.updateSettings({cloudConsent: [...new Set([...this.settings().cloudConsent, kind])]});
    this.consentPending.set(null);
    if (pending) this.send(pending);
  }

  declineConsent(): void {
    const pending = this.consentPending();
    this.consentPending.set(null);
    if (pending) this.draft.set(pending.message);
  }

  resetConsent(): void {
    this.updateSettings({cloudConsent: []});
  }

  /** Opens the panel and asks the assistant on behalf of an action of the editor. */
  ask(request: AiAskRequest): void {
    this.uiShell.openAiPanel();
    this.replaceEditorItems(request);
    if (!this.configured()) {
      // the command names in English are also understood by the input
      this.draft.set(request.command ? `/${request.command} ${request.message}` : request.message);
      this.loadSetup();
      return;
    }
    this.send({message: request.message, command: request.command});
  }

  /** Opens the panel with a prefilled input which the user can complete before sending (e.g. a model description). */
  prepare(request: AiAskRequest): void {
    this.uiShell.openAiPanel();
    this.replaceEditorItems(request);
    this.draft.set(request.command ? `/${request.command} ${request.message}` : request.message);
    if (!this.configured()) this.loadSetup();
  }

  addElementToContext(urn: string): void {
    if (this.contextItems().some(item => item.urn === urn && item.kind === 'element')) return;
    this.contextItems.update(items => [...items, this.elementItem(urn)]);
  }

  addErrorToContext(error: AiValidationError): void {
    this.contextItems.update(items => [...items, this.errorItem(error)]);
  }

  removeContextItem(id: string): void {
    const attachment = this.contextItems().find(item => item.id === id)?.attachment;
    this.contextItems.update(items => items.filter(item => item.id !== id));
    if (attachment) this.deleteAttachment(attachment.id);
  }

  /**
   * Uploads the files as context of the next messages; each is shown as chip while it is uploaded.
   * Files that are too large or of an unsupported type are refused without uploading them.
   */
  attachFiles(files: File[]): void {
    if (!this.api) return;
    for (const file of files) {
      const refused = this.refuseFile(file);
      if (refused) {
        this.error.set(refused);
        continue;
      }
      const id = newId();
      this.contextItems.update(items => [...items, {id, kind: 'file', label: file.name, uploading: true}]);
      this.api.uploadAttachment(file).subscribe({
        next: attachment => {
          if (!this.contextItems().some(item => item.id === id)) {
            // removed while it was uploaded
            this.deleteAttachment(attachment.id);
            return;
          }
          this.contextItems.update(items =>
            items.map(item => (item.id === id ? {id, kind: 'file', label: attachment.name || file.name, attachment} : item)),
          );
        },
        error: error => {
          this.contextItems.update(items => items.filter(item => item.id !== id));
          this.error.set(asAiError(error));
        },
      });
    }
  }

  /** Adds a model file or a namespace folder (also a whole source for stored conversations) to the context; the same models are added only once. */
  addModelToContext(model: AiContextModel, label: string, options: {detail?: string; sourceType?: AiSourceType} = {}): void {
    if (!model.sourcePath && !model.namespace) return;
    if (this.contextItems().some(item => sameContextModel(item.contextModel, model))) return;
    const kind: AiContextItem['kind'] = model.fileName ? 'model' : model.namespace ? 'namespace' : 'source';
    this.contextItems.update(items => [
      ...items,
      {
        id: newId(),
        kind,
        label,
        contextModel: model,
        ...(options.detail ? {detail: options.detail} : {}),
        ...(options.sourceType ? {sourceType: options.sourceType} : {}),
      },
    ]);
  }

  addCandidateToContext(candidate: AiContextCandidate): void {
    this.addModelToContext(candidate.contextModel, candidate.label, {detail: candidate.detail, sourceType: candidate.sourceType});
  }

  /** Loads the models of the workspace and the GitHub sources offered as context. */
  loadContextCandidates(): void {
    if (!this.modelApi || this.candidatesLoading()) return;
    this.candidatesLoading.set(true);
    this.modelApi
      .loadNamespacesStructure()
      .pipe(finalize(() => this.candidatesLoading.set(false)))
      .subscribe({
        next: structure => this.contextCandidates.set(aiContextCandidates(structure)),
        error: () => this.contextCandidates.set([]),
      });
  }

  setIncludeModel(include: boolean): void {
    this.includeModel.set(include);
  }

  excludeSelection(): void {
    this.excludedSelection.set(this.editor?.selectedElementUrn() ?? null);
  }

  clearDraft(): void {
    this.draft.set(null);
  }

  send(request: AiSendRequest): void {
    const provider = this.providerConfig();
    if (!provider || !this.api || this.streaming() || this.uploading() || !request.message.trim()) return;
    if (this.settings().onlyLocal && !this.isLocal()) {
      this.error.set({code: 'local_only', message: 'Only local models may be used.'});
      return;
    }
    if (this.consentRequired()) {
      this.consentPending.set(request);
      return;
    }

    this.error.set(null);
    this.draft.set(null);
    const requestId = newId();
    const answerId = `pending-${requestId}`;
    const contextRefs = this.contextRefs();
    this.messages.update(messages => [
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
    this.streaming.set(true);

    let messageId = answerId;
    this.chatSubscription = this.buildContext(request)
      .pipe(
        switchMap(context =>
          this.withKey(provider.kind).pipe(
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
          this.streaming.set(false);
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
      next: conversations => this.conversations.set(conversations ?? []),
      error: error => this.error.set(asAiError(error)),
    });
  }

  newConversation(): void {
    this.stop();
    this.activeConversationId.set(null);
    this.messages.set([]);
    this.proposalStatus.set({});
    this.proposalValidation.set({});
    this.error.set(null);
  }

  openConversation(id: string): void {
    if (!this.api || id === this.activeConversationId()) return;
    this.stop();
    this.loadingConversation.set(true);
    this.api
      .getConversation(id)
      .pipe(finalize(() => this.loadingConversation.set(false)))
      .subscribe({
        next: conversation => {
          this.activeConversationId.set(conversation.id);
          this.messages.set((conversation.messages ?? []).map(toChatMessage));
          this.proposalStatus.set({});
          this.proposalValidation.set({});
          this.error.set(null);
        },
        error: error => this.error.set(asAiError(error)),
      });
  }

  renameConversation(id: string, title: string): void {
    const trimmed = title.trim();
    if (!this.api || !trimmed) return;
    this.api.renameConversation(id, trimmed).subscribe({
      next: summary =>
        this.conversations.update(conversations =>
          conversations.map(conversation => (conversation.id === id ? {...conversation, ...summary} : conversation)),
        ),
      error: error => this.error.set(asAiError(error)),
    });
  }

  deleteConversation(id: string): void {
    if (!this.api) return;
    this.api.deleteConversation(id).subscribe({
      complete: () => this.removeConversation(id),
      error: error => this.error.set(asAiError(error)),
    });
  }

  clearConversations(): void {
    if (!this.api) return;
    const clear = () => {
      this.conversations.set([]);
      this.newConversation();
    };
    this.api.deleteAllConversations().subscribe({complete: clear, error: error => this.error.set(asAiError(error))});
  }

  proposalStatusOf(id: string): AiProposalStatus {
    return this.proposalStatus()[id] ?? 'open';
  }

  setProposalStatus(id: string, status: AiProposalStatus): void {
    this.proposalStatus.update(statuses => ({...statuses, [id]: status}));
  }

  /** Validates the Turtle of a proposal the user changed. */
  validateProposal(proposalId: string, turtle: string): Observable<AiProposalValidation> {
    if (!this.api) return EMPTY;
    return this.api.validateProposal(turtle).pipe(
      tap(validation => this.proposalValidation.update(validations => ({...validations, [proposalId]: validation}))),
      catchError(error => throwError(() => asAiError(error))),
    );
  }

  /** Applies a change of the open model; it is recorded in the history so it can be undone. */
  applyModelChange(proposal: AiProposal, turtle = proposal.turtle): Observable<boolean> {
    if (!this.editor || !turtle || this.readOnly()) return of(false);
    return this.runProposal(proposal.id, () => this.editor.applyModelChange(turtle));
  }

  createModel(proposal: AiProposal, turtle = proposal.turtle): Observable<boolean> {
    if (!this.editor || !turtle) return of(false);
    return this.runProposal(proposal.id, () => this.editor.openNewModel(turtle));
  }

  applyRefactoring(proposal: AiProposal): void {
    const refactoring = proposal.refactoring;
    if (!this.editor || !refactoring || this.readOnly()) return;
    this.editor.renameElement(refactoring.urn, refactoring.newName);
    this.setProposalStatus(proposal.id, 'applied');
  }

  navigateToElement(urn: string): void {
    this.editor?.navigateToElement(urn);
  }

  modelElements() {
    return this.editor?.modelElements() ?? [];
  }

  private runProposal(id: string, apply: () => Observable<boolean>): Observable<boolean> {
    this.setProposalStatus(id, 'applying');
    return defer(apply).pipe(
      tap(applied => this.setProposalStatus(id, applied ? 'applied' : 'open')),
      catchError(error => {
        this.setProposalStatus(id, 'open');
        return throwError(() => error);
      }),
    );
  }

  private onChatEvent(messageId: string, event: AiChatEvent): void {
    switch (event.type) {
      case 'conversation': {
        const {id, title} = event.data;
        this.activeConversationId.set(id);
        if (!this.conversations().some(conversation => conversation.id === id)) {
          this.conversations.update(conversations => [{id, title, updatedAt: new Date().toISOString()}, ...conversations]);
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
    this.messages.update(messages => messages.map(message => (message.id === id ? update(message) : message)));
  }

  private touchConversation(): void {
    const id = this.activeConversationId();
    this.conversations.update(conversations => {
      const conversation = conversations.find(item => item.id === id);
      if (!conversation) return conversations;
      return [{...conversation, updatedAt: new Date().toISOString()}, ...conversations.filter(item => item.id !== id)];
    });
  }

  private removeConversation(id: string): void {
    this.conversations.update(conversations => conversations.filter(conversation => conversation.id !== id));
    if (this.activeConversationId() === id) this.newConversation();
  }

  private buildContext(request: AiSendRequest): Observable<AiChatContext> {
    const base$ = this.editor && this.includeModel() ? this.editor.currentContext().pipe(catchError(() => of<AiChatContext>({}))) : of({});
    return base$.pipe(
      map(base => {
        const items = this.contextItems();
        const mentioned = [
          ...new Set([
            ...items.filter(item => item.kind === 'element' && item.urn).map(item => item.urn),
            ...(request.mentionedElementUrns ?? []),
          ]),
        ];
        const errors = items.filter(item => item.kind === 'error' && item.error).map(item => item.error);
        const selected = this.selectedElementUrn();
        const context: AiChatContext = {...base, languages: this.settings().languages};
        if (!this.includeModel()) delete context.modelTurtle;
        if (selected) context.selectedElementUrn = selected;
        else delete context.selectedElementUrn;
        if (mentioned.length) context.mentionedElementUrns = mentioned;
        if (errors.length) context.validationErrors = errors;
        const attachmentIds = items.filter(item => item.kind === 'file' && item.attachment).map(item => item.attachment.id);
        if (attachmentIds.length) context.attachmentIds = attachmentIds;
        const contextModels = items.filter(item => item.contextModel).map(item => item.contextModel);
        if (contextModels.length) context.contextModels = contextModels;
        return context;
      }),
    );
  }

  /** The stored API key of the provider; Copilot and local providers have none. */
  private withKey(kind: AiProviderKind): Observable<string | undefined> {
    if (!this.secrets || kind === 'copilot') return of(undefined);
    return from(this.secrets.get(kind)).pipe(
      map(key => key ?? undefined),
      catchError(() => of(undefined)),
    );
  }

  private refreshKeyInfo(): void {
    const kind = this.providerKind();
    if (!kind || !this.secrets || kind === 'copilot') {
      this.keyInfo.set({stored: false, persistent: false});
      return;
    }
    from(this.secrets.info(kind))
      .pipe(catchError(() => of<AiSecretInfo>({stored: false, persistent: false})))
      .subscribe(info => this.keyInfo.set(info));
  }

  private cancelLoginWait(): void {
    this.loginSubscription?.unsubscribe();
    this.loginSubscription = null;
  }

  /** The files and models of the context as shown in the sent message. */
  private contextRefs(): AiMessageContextRef[] {
    return this.contextItems()
      .filter(item => (item.kind === 'file' && item.attachment) || item.contextModel)
      .map(item => ({kind: item.kind as AiMessageContextRef['kind'], label: item.label}));
  }

  private refuseFile(file: File): AiError | null {
    if (!AI_ATTACHMENT_EXTENSIONS.includes(fileExtension(file.name))) {
      return {code: 'attachment_unsupported', message: `The file type of ${file.name} is not supported.`};
    }
    if (file.size > AI_ATTACHMENT_MAX_SIZE) {
      return {code: 'attachment_too_large', message: `${file.name} is larger than 20 MB.`};
    }
    return null;
  }

  private deleteAttachment(id: string): void {
    this.api?.deleteAttachment(id).subscribe({error: () => undefined});
  }

  /** Replaces the elements and errors of the context by those of an editor action; files and models are kept. */
  private replaceEditorItems(request: AiAskRequest): void {
    this.contextItems.update(items => [
      ...items.filter(item => item.kind !== 'element' && item.kind !== 'error'),
      ...(request.elementUrns ?? []).map(urn => this.elementItem(urn)),
      ...(request.validationErrors ?? []).map(error => this.errorItem(error)),
    ]);
  }

  private elementItem(urn: string): AiContextItem {
    return {id: newId(), kind: 'element', label: aiElementName(urn), urn};
  }

  private errorItem(error: AiValidationError): AiContextItem {
    return {id: newId(), kind: 'error', label: error.message, urn: error.focusNode, error};
  }
}
