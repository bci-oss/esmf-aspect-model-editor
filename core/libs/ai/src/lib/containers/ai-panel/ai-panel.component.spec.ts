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
  AiChatStore,
  AiContextCandidate,
  AiContextCandidateGroup,
  AiContextItem,
  AiContextStore,
  AiConversationSummary,
  AiError,
  AiErrorStore,
  AiModelElement,
  AiProposal,
  AiProposalStatus,
  AiProposalStore,
  AiProposalValidation,
  AiSendRequest,
  AiSetupStore,
  SettingsDialogPort,
  UiShellStore,
} from '@ame/domain';
import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAiSetupStoreMock} from '../../testing/ai-store-mocks';
import {aiFileStubs, aiTranslocoTesting} from '../../testing/ai-testing';
import {AiPanelComponent} from './ai-panel.component';

function createStores() {
  const setup = createAiSetupStoreMock({provider: 'openai', model: 'gpt-4o'});
  setup.providerInfo.set({label: 'OpenAI'});
  setup.configured.set(true);
  const chat = {
    conversations: signal<AiConversationSummary[]>([]),
    activeConversationId: signal<string | null>(null),
    activeConversation: signal<AiConversationSummary | null>(null),
    loadingConversation: signal(false),
    messages: signal<AiChatMessage[]>([]),
    streaming: signal(false),
    consentPending: signal<AiSendRequest | null>(null),
    draft: signal<string | null>(null),
    clearDraft: vi.fn(),
    loadConversations: vi.fn(),
    newConversation: vi.fn(),
    openConversation: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    clearConversations: vi.fn(),
    send: vi.fn(),
    stop: vi.fn(),
    acceptConsent: vi.fn(),
    declineConsent: vi.fn(),
  };
  const context = {
    openModel: signal<{label: string; readOnly: boolean} | null>(null),
    modelElements: signal<AiModelElement[]>([]),
    selectedElementUrn: signal<string | null>(null),
    includeModel: signal(true),
    items: signal<AiContextItem[]>([]),
    candidates: signal<AiContextCandidateGroup[]>([]),
    candidatesLoading: signal(false),
    uploading: signal(false),
    setIncludeModel: vi.fn(),
    excludeSelection: vi.fn(),
    removeItem: vi.fn(),
    attachFiles: vi.fn(),
    addCandidate: vi.fn(),
    loadCandidates: vi.fn(),
    navigateToElement: vi.fn(),
  };
  const proposals = {
    statuses: signal<Record<string, AiProposalStatus>>({}),
    validations: signal<Record<string, AiProposalValidation>>({}),
    validating: signal<ReadonlySet<string>>(new Set()),
    readOnly: signal(false),
    error: signal<AiError | null>(null),
    statusOf: (id: string) => proposals.statuses()[id] ?? 'open',
    apply: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    discard: vi.fn(),
    validate: vi.fn(),
    clearError: vi.fn(() => proposals.error.set(null)),
  };
  const errors = {error: signal<AiError | null>(null), clear: vi.fn(() => errors.error.set(null))};
  return {setup, chat, context, proposals, errors};
}

describe('AiPanelComponent', () => {
  let fixture: ComponentFixture<AiPanelComponent>;
  let setup: ReturnType<typeof createStores>['setup'];
  let chat: ReturnType<typeof createStores>['chat'];
  let context: ReturnType<typeof createStores>['context'];
  let proposals: ReturnType<typeof createStores>['proposals'];
  let errors: ReturnType<typeof createStores>['errors'];
  const uiShell = {closeAiPanel: vi.fn()};
  const settingsDialog = {open: vi.fn()};

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  const change: AiProposal = {id: 'p1', kind: 'modelChange', title: 'Change', originalTurtle: 'a', turtle: 'b'};

  function showMessages(...messages: Partial<AiChatMessage>[]): void {
    chat.messages.set(messages.map((message, i) => ({id: 'm' + i, role: 'assistant', content: '', proposals: [], tools: [], ...message})));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    ({setup, chat, context, proposals, errors} = createStores());
    uiShell.closeAiPanel.mockClear();
    settingsDialog.open.mockClear();
    await TestBed.configureTestingModule({
      imports: [AiPanelComponent, NoopAnimationsModule, aiTranslocoTesting()],
      providers: [
        {provide: AiSetupStore, useValue: setup},
        {provide: AiChatStore, useValue: chat},
        {provide: AiContextStore, useValue: context},
        {provide: AiProposalStore, useValue: proposals},
        {provide: AiErrorStore, useValue: errors},
        {provide: UiShellStore, useValue: uiShell},
        {provide: SettingsDialogPort, useValue: settingsDialog},
        ...aiFileStubs().providers,
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiPanelComponent);
    fixture.detectChanges();
  });

  it('loads the setup and welcomes the user with starters', () => {
    expect(setup.loadSetupIfEnabled).toHaveBeenCalled();
    expect(query('ai-welcome')).not.toBeNull();
    expect(query('ai-provider-menu').textContent).toContain('OpenAI');
    expect(query('ai-provider-menu').textContent).toContain('gpt-4o');
    expect(query<HTMLButtonElement>('ai-starter-explain').disabled).toBe(true);
    expect(query<HTMLButtonElement>('ai-starter-generate').disabled).toBe(false);
  });

  it('starts a conversation with a starter', () => {
    context.openModel.set({label: 'Movement.ttl', readOnly: false});
    fixture.detectChanges();
    query('ai-starter-review').click();
    expect(chat.send).toHaveBeenCalledWith({message: 'ai.starters.review.message', command: 'review'});
  });

  it('sends the input of the user', () => {
    fixture.componentInstance.send({command: 'explain', message: '', mentionedElementUrns: []});
    expect(chat.send).toHaveBeenLastCalledWith({message: 'ai.starters.explain.message', command: 'explain', mentionedElementUrns: []});

    fixture.componentInstance.send({message: 'Hello', mentionedElementUrns: ['urn:x#a']});
    expect(chat.send).toHaveBeenLastCalledWith({message: 'Hello', mentionedElementUrns: ['urn:x#a']});
  });

  it('takes over a draft into the input', () => {
    chat.draft.set('Explain @speed');
    fixture.detectChanges();
    expect(fixture.componentInstance.inputText()).toBe('Explain @speed');
    expect(chat.clearDraft).toHaveBeenCalled();
  });

  it('closes the panel and starts new conversations', () => {
    query('ai-close').click();
    expect(uiShell.closeAiPanel).toHaveBeenCalled();
    query('ai-new-conversation').click();
    expect(chat.newConversation).toHaveBeenCalled();
  });

  it('shows the conversations', () => {
    chat.conversations.set([{id: 'c1', title: 'First', updatedAt: '2026-01-01T00:00:00Z'}]);
    query('ai-conversations-toggle').click();
    fixture.detectChanges();
    expect(chat.loadConversations).toHaveBeenCalled();
    expect(query('ai-welcome')).toBeNull();

    (fixture.nativeElement.querySelector('.ai-conversations__open') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(chat.openConversation).toHaveBeenCalledWith('c1');
    expect(fixture.componentInstance.conversationsOpen()).toBe(false);
  });

  it('shows the setup instead of the chat', () => {
    setup.showSetup.set(true);
    fixture.detectChanges();
    expect(query('ai-setup')).not.toBeNull();
    expect(query('ai-input')).toBeNull();
  });

  it('asks for the consent and disables the input meanwhile', () => {
    chat.consentPending.set({message: 'Hello'});
    fixture.detectChanges();
    expect(query<HTMLTextAreaElement>('ai-input').disabled).toBe(true);
    query('ai-consent-accept').click();
    expect(chat.acceptConsent).toHaveBeenCalled();
    query('ai-consent-local').click();
    expect(chat.declineConsent).toHaveBeenCalled();
    expect(setup.openSetup).toHaveBeenCalled();
  });

  it('shows the messages with their proposals and applies them', () => {
    showMessages({role: 'user', content: 'Add unit'}, {content: 'Here', proposals: [change]});
    expect(query('ai-welcome')).toBeNull();
    expect(query('ai-proposal')).not.toBeNull();

    query('ai-proposal-apply').click();
    expect(proposals.apply).toHaveBeenCalledWith(change, 'b');
    query('ai-proposal-discard').click();
    expect(proposals.discard).toHaveBeenCalledWith(change);
  });

  it('shows the error of a proposal first and dismisses all errors', () => {
    errors.error.set({code: 'offline', message: 'offline'});
    proposals.error.set({code: 'provider_error', message: 'broken'});
    fixture.detectChanges();
    expect(query('ai-error').dataset['code']).toBe('provider_error');
    expect(query('ai-error').textContent).toContain('broken');

    (fixture.nativeElement.querySelector('.ai-error__close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(proposals.clearError).toHaveBeenCalled();
    expect(errors.clear).toHaveBeenCalled();
    expect(query('ai-error')).toBeNull();
  });

  it('shows the status and validation of proposals', () => {
    proposals.statuses.set({p1: 'applied'});
    proposals.validating.set(new Set(['p1']));
    showMessages({content: 'Here', proposals: [change]});
    expect(query('ai-proposal').textContent).toContain('ai.proposal.applied');
  });

  it('clears the error of a proposal when sending or starting a new conversation', () => {
    fixture.componentInstance.send({message: 'Hello', mentionedElementUrns: []});
    fixture.componentInstance.newConversation();
    expect(proposals.clearError).toHaveBeenCalledTimes(2);
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
    expect(chat.send).toHaveBeenCalledWith({message: 'No unit\nUse metre', command: 'fix', mentionedElementUrns: ['urn:x#a']});
  });

  it('handles the actions of errors', () => {
    showMessages({role: 'user', content: 'Explain', command: 'explain'}, {content: '', error: {code: 'offline', message: ''}});
    query('ai-error-action-retry').click();
    expect(chat.send).toHaveBeenCalledWith({message: 'Explain', command: 'explain'});

    fixture.componentInstance.onErrorAction('login');
    expect(setup.openSetup).toHaveBeenCalled();
    expect(setup.startCopilotLogin).toHaveBeenCalled();
    fixture.componentInstance.onErrorAction('openSettings');
    expect(settingsDialog.open).toHaveBeenCalled();
  });

  it('shows the selected element and the model as context', () => {
    context.openModel.set({label: 'Movement.ttl', readOnly: false});
    context.selectedElementUrn.set('urn:samm:org.example:1.0.0#speed');
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
      context.candidates.set([{label: 'ws', path: '/ws', sourceType: 'workspace', readOnly: false, candidates: [candidate]}]);
      query('ai-attach').click();
      fixture.detectChanges();
      await fixture.whenStable();
      (document.querySelector('[data-testid="ai-attach-model"]') as HTMLElement).click();
      fixture.detectChanges();

      expect(context.loadCandidates).toHaveBeenCalled();
      expect(query('ai-context-picker')).not.toBeNull();
      query('ai-context-candidate').click();
      fixture.detectChanges();

      expect(context.addCandidate).toHaveBeenCalledWith(candidate);
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
      expect(context.attachFiles).toHaveBeenCalledWith([file]);

      context.uploading.set(true);
      fixture.componentInstance.inputText.set('Hello');
      fixture.detectChanges();
      expect(query<HTMLButtonElement>('ai-send').disabled).toBe(true);
    });
  });
});
