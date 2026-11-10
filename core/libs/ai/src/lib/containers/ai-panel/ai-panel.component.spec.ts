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
  AiChatMessage,
  AiContextCandidate,
  AiContextCandidateGroup,
  AiContextItem,
  AiConversationSummary,
  AiError,
  AiModelElement,
  AiModelInfo,
  AiProposal,
  AiProposalStatus,
  AiProposalValidation,
  AiStore,
  SettingsDialogPort,
  UiShellStore,
} from '@ame/domain';
import {AiProviderKind, ClipboardService, DEFAULT_AI_SETTINGS, FileSaverService} from '@ame/shared';
import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {of, Subject, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiPanelComponent} from './ai-panel.component';

function createStore() {
  return {
    enabled: signal(true),
    settings: signal({...DEFAULT_AI_SETTINGS, enabled: true, provider: 'openai' as AiProviderKind, model: 'gpt-4o'}),
    providerKind: signal<AiProviderKind | null>('openai'),
    providerInfo: signal<{label: string} | null>({label: 'OpenAI'}),
    models: signal<AiModelInfo[]>([]),
    showSetup: signal(false),
    providers: signal([]),
    providerChoices: signal([]),
    localServers: signal([]),
    copilotStatus: signal(null),
    keyInfo: signal({stored: false, persistent: false}),
    testing: signal(false),
    testResult: signal(null),
    loginFlow: signal(null),
    loginState: signal('idle'),
    loginError: signal(null),
    requiresKey: signal(true),
    requiresBaseUrl: signal(false),
    isLocal: signal(false),
    configured: signal(true),
    conversations: signal<AiConversationSummary[]>([]),
    activeConversationId: signal<string | null>(null),
    activeConversation: signal<AiConversationSummary | null>(null),
    loadingConversation: signal(false),
    messages: signal<AiChatMessage[]>([]),
    openModel: signal<{label: string; readOnly: boolean} | null>(null),
    modelElements: signal<AiModelElement[]>([]),
    selectedElementUrn: signal<string | null>(null),
    includeModel: signal(true),
    contextItems: signal<AiContextItem[]>([]),
    contextCandidates: signal<AiContextCandidateGroup[]>([]),
    candidatesLoading: signal(false),
    uploading: signal(false),
    streaming: signal(false),
    consentPending: signal<AiProviderKind | null>(null),
    readOnly: signal(false),
    proposalStatus: signal<Record<string, AiProposalStatus>>({}),
    proposalValidation: signal<Record<string, AiProposalValidation>>({}),
    error: signal<AiError | null>(null),
    draft: signal<string | null>(null),
    clearDraft: vi.fn(),
    loadSetup: vi.fn(),
    openSetup: vi.fn(),
    loadModels: vi.fn(),
    selectModel: vi.fn(),
    loadConversations: vi.fn(),
    newConversation: vi.fn(),
    openConversation: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    clearConversations: vi.fn(),
    send: vi.fn(),
    stop: vi.fn(),
    startCopilotLogin: vi.fn(),
    acceptConsent: vi.fn(),
    declineConsent: vi.fn(),
    setIncludeModel: vi.fn(),
    excludeSelection: vi.fn(),
    removeContextItem: vi.fn(),
    attachFiles: vi.fn(),
    addCandidateToContext: vi.fn(),
    loadContextCandidates: vi.fn(),
    navigateToElement: vi.fn(),
    applyModelChange: vi.fn(() => of(undefined)),
    createModel: vi.fn(() => of(undefined)),
    applyRefactoring: vi.fn(),
    setProposalStatus: vi.fn(),
    validateProposal: vi.fn(() => of({valid: true, validationErrors: []})),
  };
}

describe('AiPanelComponent', () => {
  let fixture: ComponentFixture<AiPanelComponent>;
  let store: ReturnType<typeof createStore>;
  const uiShell = {closeAiPanel: vi.fn()};
  const settingsDialog = {open: vi.fn()};

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  const change: AiProposal = {id: 'p1', kind: 'modelChange', title: 'Change', originalTurtle: 'a', turtle: 'b'};

  function showMessages(...messages: Partial<AiChatMessage>[]): void {
    store.messages.set(messages.map((message, i) => ({id: 'm' + i, role: 'assistant', content: '', proposals: [], tools: [], ...message})));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    store = createStore();
    uiShell.closeAiPanel.mockClear();
    settingsDialog.open.mockClear();
    await TestBed.configureTestingModule({
      imports: [
        AiPanelComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        {provide: AiStore, useValue: store},
        {provide: UiShellStore, useValue: uiShell},
        {provide: SettingsDialogPort, useValue: settingsDialog},
        {provide: ClipboardService, useValue: {copy: vi.fn()}},
        {provide: FileSaverService, useValue: {download: vi.fn()}},
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiPanelComponent);
    fixture.detectChanges();
  });

  it('loads the setup and welcomes the user with starters', () => {
    expect(store.loadSetup).toHaveBeenCalled();
    expect(query('ai-welcome')).not.toBeNull();
    expect(query('ai-provider-menu').textContent).toContain('OpenAI');
    expect(query('ai-provider-menu').textContent).toContain('gpt-4o');
    expect(query<HTMLButtonElement>('ai-starter-explain').disabled).toBe(true);
    expect(query<HTMLButtonElement>('ai-starter-generate').disabled).toBe(false);
  });

  it('starts a conversation with a starter', () => {
    store.openModel.set({label: 'Movement.ttl', readOnly: false});
    fixture.detectChanges();
    query('ai-starter-review').click();
    expect(store.send).toHaveBeenCalledWith({message: 'ai.starters.review.message', command: 'review'});
  });

  it('sends the input of the user', () => {
    fixture.componentInstance.send({command: 'explain', message: '', mentionedElementUrns: []});
    expect(store.send).toHaveBeenLastCalledWith({message: 'ai.starters.explain.message', command: 'explain', mentionedElementUrns: []});

    fixture.componentInstance.send({message: 'Hello', mentionedElementUrns: ['urn:x#a']});
    expect(store.send).toHaveBeenLastCalledWith({message: 'Hello', mentionedElementUrns: ['urn:x#a']});
  });

  it('takes over a draft into the input', () => {
    store.draft.set('Explain @speed');
    fixture.detectChanges();
    expect(fixture.componentInstance.inputText()).toBe('Explain @speed');
    expect(store.clearDraft).toHaveBeenCalled();
  });

  it('closes the panel and starts new conversations', () => {
    query('ai-close').click();
    expect(uiShell.closeAiPanel).toHaveBeenCalled();
    query('ai-new-conversation').click();
    expect(store.newConversation).toHaveBeenCalled();
  });

  it('shows the conversations', () => {
    store.conversations.set([{id: 'c1', title: 'First', updatedAt: '2026-01-01T00:00:00Z'}]);
    query('ai-conversations-toggle').click();
    fixture.detectChanges();
    expect(store.loadConversations).toHaveBeenCalled();
    expect(query('ai-welcome')).toBeNull();

    (fixture.nativeElement.querySelector('.ai-conversations__open') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.openConversation).toHaveBeenCalledWith('c1');
    expect(fixture.componentInstance.conversationsOpen()).toBe(false);
  });

  it('shows the setup instead of the chat', () => {
    store.showSetup.set(true);
    fixture.detectChanges();
    expect(query('ai-setup')).not.toBeNull();
    expect(query('ai-input')).toBeNull();
  });

  it('asks for the consent and disables the input meanwhile', () => {
    store.consentPending.set('openai');
    fixture.detectChanges();
    expect(query<HTMLTextAreaElement>('ai-input').disabled).toBe(true);
    query('ai-consent-accept').click();
    expect(store.acceptConsent).toHaveBeenCalled();
    query('ai-consent-local').click();
    expect(store.declineConsent).toHaveBeenCalled();
    expect(store.openSetup).toHaveBeenCalled();
  });

  it('shows the messages with their proposals and applies them', () => {
    showMessages({role: 'user', content: 'Add unit'}, {content: 'Here', proposals: [change]});
    expect(query('ai-welcome')).toBeNull();
    expect(query('ai-proposal')).not.toBeNull();

    query('ai-proposal-apply').click();
    expect(store.applyModelChange).toHaveBeenCalledWith(change, 'b');
    query('ai-proposal-discard').click();
    expect(store.setProposalStatus).toHaveBeenCalledWith('p1', 'discarded');
  });

  it('shows the error when applying fails', () => {
    store.applyModelChange.mockReturnValueOnce(throwError(() => new Error('broken')));
    fixture.componentInstance.apply(change, 'b');
    fixture.detectChanges();
    expect(query('ai-error').dataset['code']).toBe('provider_error');
    expect(query('ai-error').textContent).toContain('broken');

    (fixture.nativeElement.querySelector('.ai-error__close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(query('ai-error')).toBeNull();
  });

  it('marks proposals that are validated', () => {
    const result = new Subject<AiProposalValidation>();
    store.validateProposal.mockReturnValueOnce(result);
    fixture.componentInstance.validate(change, 'c');
    expect(fixture.componentInstance.validating().has('p1')).toBe(true);
    result.next({valid: true, validationErrors: []});
    result.complete();
    expect(fixture.componentInstance.validating().has('p1')).toBe(false);
  });

  it('asks the assistant to fix a finding', () => {
    fixture.componentInstance.fix({
      id: 'f',
      severity: 'error',
      category: 'unit',
      message: 'No unit',
      suggestion: 'Use metre',
      elementUrn: 'urn:x#a',
      fixable: true,
    });
    expect(store.send).toHaveBeenCalledWith({message: 'No unit\nUse metre', command: 'fix', mentionedElementUrns: ['urn:x#a']});
  });

  it('handles the actions of errors', () => {
    showMessages({role: 'user', content: 'Explain', command: 'explain'}, {content: '', error: {code: 'offline', message: ''}});
    query('ai-error-action-retry').click();
    expect(store.send).toHaveBeenCalledWith({message: 'Explain', command: 'explain'});

    fixture.componentInstance.onErrorAction('login');
    expect(store.openSetup).toHaveBeenCalled();
    expect(store.startCopilotLogin).toHaveBeenCalled();
    fixture.componentInstance.onErrorAction('openSettings');
    expect(settingsDialog.open).toHaveBeenCalled();
  });

  it('shows the selected element and the model as context', () => {
    store.openModel.set({label: 'Movement.ttl', readOnly: false});
    store.selectedElementUrn.set('urn:samm:org.example:1.0.0#speed');
    fixture.detectChanges();
    expect(query('ai-chip-model').textContent).toContain('Movement.ttl');
    expect(query('ai-chip-selection').textContent).toContain('speed');
  });

  describe('context', () => {
    const candidate: AiContextCandidate = {
      kind: 'model',
      label: 'Movement.ttl',
      name: 'Movement.ttl',
      depth: 2,
      detail: 'org.example:1.0.0',
      contextModel: {sourcePath: '/ws', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl'},
      sourceType: 'workspace',
      readOnly: false,
    };

    it('opens the picker from the attach menu and adds the picked model', async () => {
      store.contextCandidates.set([{label: 'ws', path: '/ws', sourceType: 'workspace', readOnly: false, candidates: [candidate]}]);
      query('ai-attach').click();
      fixture.detectChanges();
      await fixture.whenStable();
      (document.querySelector('[data-testid="ai-attach-model"]') as HTMLElement).click();
      fixture.detectChanges();

      expect(store.loadContextCandidates).toHaveBeenCalled();
      expect(query('ai-context-picker')).not.toBeNull();
      query('ai-context-candidate').click();
      fixture.detectChanges();

      expect(store.addCandidateToContext).toHaveBeenCalledWith(candidate);
      expect(query('ai-context-picker')).toBeNull();
    });

    it('closes the picker', () => {
      fixture.componentInstance.openPicker();
      fixture.detectChanges();
      query('ai-context-picker-close').click();
      fixture.detectChanges();
      expect(query('ai-context-picker')).toBeNull();
    });

    it('passes chosen files to the store and blocks sending while uploading', () => {
      const file = new File(['hello'], 'notes.txt', {type: 'text/plain'});
      const input = query<HTMLInputElement>('ai-file-input');
      Object.defineProperty(input, 'files', {value: [file]});
      input.dispatchEvent(new Event('change'));
      expect(store.attachFiles).toHaveBeenCalledWith([file]);

      store.uploading.set(true);
      fixture.componentInstance.inputText.set('Hello');
      fixture.detectChanges();
      expect(query<HTMLButtonElement>('ai-send').disabled).toBe(true);
    });
  });
});
