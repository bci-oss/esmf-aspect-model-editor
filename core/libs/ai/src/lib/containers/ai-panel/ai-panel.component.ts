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
  AiContextCandidate,
  aiElementName,
  AiError,
  AiProposal,
  AiReviewFinding,
  AiStore,
  asAiError,
  SettingsDialogPort,
  UiShellStore,
} from '@ame/domain';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {AiChatInputComponent} from '../../components/ai-chat-input/ai-chat-input.component';
import {AiConsentComponent} from '../../components/ai-consent/ai-consent.component';
import {AiContextChipsComponent} from '../../components/ai-context-chips/ai-context-chips.component';
import {AiContextPickerComponent} from '../../components/ai-context-picker/ai-context-picker.component';
import {AiConversationListComponent} from '../../components/ai-conversation-list/ai-conversation-list.component';
import {AiErrorBannerComponent} from '../../components/ai-error-banner/ai-error-banner.component';
import {AiMessageComponent} from '../../components/ai-message/ai-message.component';
import {AiPanelHeaderComponent} from '../../components/ai-panel-header/ai-panel-header.component';
import {AiProposalCardComponent} from '../../components/ai-proposal-card/ai-proposal-card.component';
import {AiStarter, AiWelcomeComponent} from '../../components/ai-welcome/ai-welcome.component';
import {AiErrorAction, commandOf, ParsedChatInput} from '../../utils';
import {AiSetupComponent} from '../ai-setup/ai-setup.component';

/** The chat with the assistant in a panel next to the editor. */
@Component({
  selector: 'ame-ai-panel',
  templateUrl: './ai-panel.component.html',
  styleUrls: ['./ai-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AiChatInputComponent,
    AiConsentComponent,
    AiContextChipsComponent,
    AiContextPickerComponent,
    AiConversationListComponent,
    AiErrorBannerComponent,
    AiMessageComponent,
    AiPanelHeaderComponent,
    AiProposalCardComponent,
    AiSetupComponent,
    AiWelcomeComponent,
    MatProgressSpinner,
    TranslocoDirective,
  ],
})
export class AiPanelComponent implements OnInit {
  readonly store = inject(AiStore);
  private readonly uiShell = inject(UiShellStore);
  private readonly settingsDialog = inject(SettingsDialogPort, {optional: true});
  private readonly transloco = inject(TranslocoService);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly chatInput = viewChild(AiChatInputComponent);

  readonly language = toSignal(this.transloco.langChanges$, {initialValue: this.transloco.getActiveLang()});
  readonly inputText = signal('');
  readonly conversationsOpen = signal(false);
  readonly pickerOpen = signal(false);
  readonly validating = signal<ReadonlySet<string>>(new Set());
  /** An error of an action in the panel, e.g. applying a proposal failed. */
  readonly actionError = signal<AiError | null>(null);

  readonly elements = computed(() => (this.store.openModel() ? this.store.modelElements() : []));
  readonly selectedElementName = computed(() => {
    const urn = this.store.selectedElementUrn();
    return urn ? aiElementName(urn) : null;
  });
  readonly providerLabel = computed(() => {
    const kind = this.store.providerKind();
    return kind ? (this.store.providerInfo()?.label ?? this.transloco.translate('ai.providers.' + kind)) : '';
  });
  readonly candidates = computed(() => this.store.contextCandidates().flatMap(group => group.candidates));
  readonly panelError = computed(() => this.actionError() ?? this.store.error());

  /** Takes over a draft of an editor action, e.g. "Explain", into the input. */
  private readonly draftEffect = effect(() => {
    const draft = this.store.draft();
    if (draft === null) return;
    untracked(() => {
      this.inputText.set(draft);
      this.store.clearDraft();
      this.chatInput()?.focus();
    });
  });
  private readonly scrollEffect = afterRenderEffect(() => {
    this.store.messages();
    const element = this.scroller()?.nativeElement;
    if (element) element.scrollTop = element.scrollHeight;
  });

  ngOnInit(): void {
    if (this.store.enabled()) this.store.loadSetup();
  }

  close(): void {
    this.uiShell.closeAiPanel();
  }

  toggleConversations(): void {
    const open = !this.conversationsOpen();
    this.conversationsOpen.set(open);
    if (open) this.store.loadConversations();
  }

  newConversation(): void {
    this.store.newConversation();
    this.conversationsOpen.set(false);
    this.actionError.set(null);
  }

  openConversation(id: string): void {
    this.store.openConversation(id);
    this.conversationsOpen.set(false);
  }

  onMenuOpened(): void {
    if (!this.store.models().length) this.store.loadModels();
  }

  openPicker(): void {
    this.pickerOpen.set(true);
    this.store.loadContextCandidates();
  }

  closePicker(): void {
    this.pickerOpen.set(false);
    this.chatInput()?.focus();
  }

  pick(candidate: AiContextCandidate): void {
    this.store.addCandidateToContext(candidate);
    this.closePicker();
  }

  send(input: ParsedChatInput): void {
    this.actionError.set(null);
    this.store.send({
      message: input.message || (input.command ? this.transloco.translate('ai.starters.' + input.command + '.message') : ''),
      ...(input.command ? {command: input.command} : {}),
      mentionedElementUrns: input.mentionedElementUrns,
    });
  }

  start(starter: AiStarter): void {
    this.store.send({message: this.transloco.translate('ai.starters.' + starter.key + '.message'), command: starter.command});
  }

  onErrorAction(action: AiErrorAction): void {
    switch (action) {
      case 'openSetup':
        this.store.openSetup();
        break;
      case 'login':
        this.store.openSetup();
        this.store.startCopilotLogin();
        break;
      case 'openSettings':
        this.settingsDialog?.open();
        break;
      case 'retry':
        this.retry();
        break;
    }
  }

  dismissError(): void {
    this.actionError.set(null);
    this.store.error.set(null);
  }

  navigate(urn: string): void {
    this.store.navigateToElement(urn);
  }

  apply(proposal: AiProposal, turtle: string): void {
    this.actionError.set(null);
    this.store.applyModelChange(proposal, turtle).subscribe({error: error => this.actionError.set(asAiError(error))});
  }

  create(proposal: AiProposal, turtle: string): void {
    this.actionError.set(null);
    this.store.createModel(proposal, turtle).subscribe({error: error => this.actionError.set(asAiError(error))});
  }

  rename(proposal: AiProposal): void {
    this.store.applyRefactoring(proposal);
  }

  discard(proposal: AiProposal): void {
    this.store.setProposalStatus(proposal.id, 'discarded');
  }

  validate(proposal: AiProposal, turtle: string): void {
    this.setValidating(proposal.id, true);
    this.store.validateProposal(proposal.id, turtle).subscribe({
      complete: () => this.setValidating(proposal.id, false),
      error: error => {
        this.setValidating(proposal.id, false);
        this.actionError.set(asAiError(error));
      },
    });
  }

  fix(finding: AiReviewFinding): void {
    const message = [finding.message, finding.suggestion].filter(Boolean).join('\n');
    this.store.send({message, command: 'fix', mentionedElementUrns: finding.elementUrn ? [finding.elementUrn] : []});
  }

  private retry(): void {
    const messages = this.store.messages();
    const last = [...messages].reverse().find(message => message.role === 'user');
    if (!last) return;
    const command = last.command ? commandOf(last.command) : undefined;
    this.store.send({message: last.content, ...(command ? {command} : {})});
  }

  private setValidating(id: string, validating: boolean): void {
    this.validating.update(ids => {
      const next = new Set(ids);
      if (validating) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
