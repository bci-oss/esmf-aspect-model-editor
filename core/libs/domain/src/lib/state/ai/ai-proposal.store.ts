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
import {defer, Observable} from 'rxjs';
import {AiError, AiProposal, AiProposalValidation, asAiError} from '../../model-api';
import {AiEditorPort} from '../../ports/ai-editor.port';
import {AiPort} from '../../ports/ai.port';
import {AiProposalStatus} from './ai.models';

/** The proposals of the assistant: their status, the validation of edited proposals and applying them to the editor. */
@Injectable({providedIn: 'root'})
export class AiProposalStore {
  private readonly api = inject(AiPort, {optional: true});
  private readonly editor = inject(AiEditorPort, {optional: true});

  private readonly statusesState = signal<Readonly<Record<string, AiProposalStatus>>>({});
  private readonly validationsState = signal<Readonly<Record<string, AiProposalValidation>>>({});
  private readonly validatingState = signal<ReadonlySet<string>>(new Set());
  private readonly errorState = signal<AiError | null>(null);

  readonly statuses = this.statusesState.asReadonly();
  /** Validation of proposals the user edited, by proposal id. */
  readonly validations = this.validationsState.asReadonly();
  /** The ids of the proposals that are validated right now. */
  readonly validating = this.validatingState.asReadonly();
  /** An error of an action on a proposal, e.g. applying it failed. */
  readonly error = this.errorState.asReadonly();
  readonly readOnly = computed(() => !!this.editor?.openModel()?.readOnly);

  statusOf(id: string): AiProposalStatus {
    return this.statuses()[id] ?? 'open';
  }

  setStatus(id: string, status: AiProposalStatus): void {
    this.statusesState.update(statuses => ({...statuses, [id]: status}));
  }

  discard(proposal: AiProposal): void {
    this.setStatus(proposal.id, 'discarded');
  }

  /** Validates the Turtle of a proposal the user changed. */
  validate(proposal: AiProposal, turtle: string): void {
    if (!this.api) return;
    this.setValidating(proposal.id, true);
    this.api.validateProposal(turtle).subscribe({
      next: validation => this.validationsState.update(validations => ({...validations, [proposal.id]: validation})),
      complete: () => this.setValidating(proposal.id, false),
      error: error => {
        this.setValidating(proposal.id, false);
        this.errorState.set(asAiError(error));
      },
    });
  }

  /** Applies a change of the open model; it is recorded in the history so it can be undone. */
  apply(proposal: AiProposal, turtle = proposal.turtle): void {
    this.errorState.set(null);
    const editor = this.editor;
    if (!editor || !turtle || this.readOnly()) return;
    this.run(proposal.id, () => editor.applyModelChange(turtle));
  }

  /** Opens the proposed model as a new model. */
  create(proposal: AiProposal, turtle = proposal.turtle): void {
    this.errorState.set(null);
    const editor = this.editor;
    if (!editor || !turtle) return;
    this.run(proposal.id, () => editor.openNewModel(turtle));
  }

  rename(proposal: AiProposal): void {
    const refactoring = proposal.refactoring;
    if (!this.editor || !refactoring || this.readOnly()) return;
    this.editor.renameElement(refactoring.urn, refactoring.newName);
    this.setStatus(proposal.id, 'applied');
  }

  /** Forgets the status and validation of all proposals, e.g. for another conversation. */
  reset(): void {
    this.statusesState.set({});
    this.validationsState.set({});
  }

  clearError(): void {
    this.errorState.set(null);
  }

  private run(id: string, apply: () => Observable<boolean>): void {
    this.setStatus(id, 'applying');
    defer(apply).subscribe({
      next: applied => this.setStatus(id, applied ? 'applied' : 'open'),
      error: error => {
        this.setStatus(id, 'open');
        this.errorState.set(asAiError(error));
      },
    });
  }

  private setValidating(id: string, validating: boolean): void {
    this.validatingState.update(ids => {
      const next = new Set(ids);
      if (validating) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
