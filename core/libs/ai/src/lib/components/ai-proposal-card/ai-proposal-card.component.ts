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

import {AiProposal, AiProposalStatus, AiProposalValidation, AiReviewFinding} from '@ame/domain';
import {ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {AiDiffViewComponent} from '../ai-diff-view/ai-diff-view.component';
import {AiMarkdownComponent} from '../ai-markdown/ai-markdown.component';
import {AiPayloadViewComponent} from '../ai-payload-view/ai-payload-view.component';
import {AiReviewFindingsComponent} from '../ai-review-findings/ai-review-findings.component';

/** A proposal of the assistant; nothing is changed until the user applies it. */
@Component({
  selector: 'ame-ai-proposal-card',
  templateUrl: './ai-proposal-card.component.html',
  styleUrls: ['./ai-proposal-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AiDiffViewComponent,
    AiMarkdownComponent,
    AiPayloadViewComponent,
    AiReviewFindingsComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinner,
    MatTooltip,
    TranslocoDirective,
  ],
})
export class AiProposalCardComponent {
  readonly proposal = input.required<AiProposal>();
  readonly status = input<AiProposalStatus>('open');
  /** Result of validating the edited Turtle; replaces the validation of the proposal. */
  readonly validation = input<AiProposalValidation | null>(null);
  readonly readOnly = input(false);
  readonly validating = input(false);

  readonly applyRequested = output<string>();
  readonly createRequested = output<string>();
  readonly renameRequested = output<void>();
  readonly validateRequested = output<string>();
  readonly discardRequested = output<void>();
  readonly elementSelected = output<string>();
  readonly fixRequested = output<AiReviewFinding>();

  readonly editing = signal(false);
  readonly previewOpen = signal(false);
  readonly turtle = linkedSignal(() => this.proposal().turtle ?? '');
  /** The edited Turtle was not validated yet. */
  readonly edited = signal(false);

  readonly open = computed(() => this.status() === 'open');
  readonly result = computed<AiProposalValidation | null>(() => {
    const validation = this.validation();
    if (validation) return validation;
    const proposal = this.proposal();
    if (proposal.valid === undefined) return null;
    return {valid: proposal.valid, validationErrors: proposal.validationErrors ?? []};
  });
  readonly icon = computed(() => KIND_ICONS[this.proposal().kind] ?? 'lightbulb');
  readonly fileBaseName = computed(() => this.proposal().fileName?.replace(/\.ttl$/, '') ?? 'payload');

  edit(): void {
    this.editing.set(true);
  }

  onTurtleInput(event: Event): void {
    this.turtle.set((event.target as HTMLTextAreaElement).value);
    this.edited.set(true);
  }

  validate(): void {
    this.edited.set(false);
    this.validateRequested.emit(this.turtle());
  }

  apply(): void {
    this.applyRequested.emit(this.turtle());
  }

  create(): void {
    this.createRequested.emit(this.turtle());
  }
}

const KIND_ICONS: Record<string, string> = {
  modelChange: 'edit_note',
  newModel: 'note_add',
  refactoring: 'drive_file_rename_outline',
  payload: 'data_object',
  review: 'fact_check',
};
