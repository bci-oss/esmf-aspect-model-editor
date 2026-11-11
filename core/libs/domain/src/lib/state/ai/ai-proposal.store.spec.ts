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

import {TestBed} from '@angular/core/testing';
import {Subject, throwError} from 'rxjs';
import {beforeEach, describe, expect, it} from 'vitest';
import {AiProposal, AiProposalValidation} from '../../model-api';
import {AiProposalStore} from './ai-proposal.store';
import {setupAiStoreTest} from './ai-stores.fixture';

describe('AiProposalStore', () => {
  let store: AiProposalStore;
  let fixture: ReturnType<typeof setupAiStoreTest>;
  const proposal: AiProposal = {id: 'p1', kind: 'modelChange', title: 'Change', turtle: 'new', originalTurtle: 'old'};

  beforeEach(() => {
    fixture = setupAiStoreTest();
    store = TestBed.inject(AiProposalStore);
  });

  it('applies a model change through the editor', () => {
    store.apply(proposal);
    expect(fixture.editor.applyModelChange).toHaveBeenCalledWith('new');
    expect(store.statusOf('p1')).toBe('applied');
  });

  it('shows the proposal as applying until the editor is done', () => {
    const applied$ = new Subject<boolean>();
    fixture.editor.applyModelChange.mockReturnValueOnce(applied$ as never);
    store.apply(proposal);
    expect(store.statusOf('p1')).toBe('applying');
    applied$.next(false);
    expect(store.statusOf('p1')).toBe('open');
  });

  it('does not change read-only models', () => {
    fixture.editor.openModel.set({label: 'x', readOnly: true});
    expect(store.readOnly()).toBe(true);
    store.apply(proposal);
    store.rename({...proposal, refactoring: {kind: 'renameElement', urn: 'u', newName: 'n'}});
    expect(fixture.editor.applyModelChange).not.toHaveBeenCalled();
    expect(fixture.editor.renameElement).not.toHaveBeenCalled();
    expect(store.statusOf('p1')).toBe('open');
  });

  it('reopens the proposal and shows the error when applying fails', () => {
    fixture.editor.applyModelChange.mockReturnValue(throwError(() => ({code: 'invalid_turtle', message: 'invalid'})) as never);
    store.apply(proposal, 'edited');
    expect(fixture.editor.applyModelChange).toHaveBeenCalledWith('edited');
    expect(store.statusOf('p1')).toBe('open');
    expect(store.error()).toMatchObject({code: 'invalid_turtle', message: 'invalid'});

    fixture.editor.applyModelChange.mockReturnValue(throwError(() => new Error('again')) as never);
    store.create(proposal);
    expect(store.error()).toBeNull();
    store.clearError();
    expect(store.error()).toBeNull();
  });

  it('creates new models, renames and discards', () => {
    store.create({...proposal, kind: 'newModel'});
    expect(fixture.editor.openNewModel).toHaveBeenCalledWith('new');
    expect(store.statusOf('p1')).toBe('applied');

    store.rename({id: 'p2', kind: 'refactoring', title: 'Rename', refactoring: {kind: 'renameElement', urn: 'u', newName: 'n'}});
    expect(fixture.editor.renameElement).toHaveBeenCalledWith('u', 'n');
    expect(store.statusOf('p2')).toBe('applied');

    store.discard(proposal);
    expect(store.statusOf('p1')).toBe('discarded');
  });

  it('applies nothing without Turtle', () => {
    store.apply({...proposal, turtle: undefined});
    store.create({...proposal, turtle: undefined});
    expect(fixture.editor.applyModelChange).not.toHaveBeenCalled();
    expect(fixture.editor.openNewModel).not.toHaveBeenCalled();
  });

  it('validates an edited proposal', () => {
    const validation$ = new Subject<AiProposalValidation>();
    fixture.api.validateProposal.mockReturnValueOnce(validation$ as never);
    store.validate(proposal, 'edited');
    expect(fixture.api.validateProposal).toHaveBeenCalledWith('edited');
    expect(store.validating().has('p1')).toBe(true);

    validation$.next({valid: false, validationErrors: [{message: 'broken'}]});
    validation$.complete();
    expect(store.validations()['p1'].valid).toBe(false);
    expect(store.validating().has('p1')).toBe(false);
  });

  it('shows the error when the validation fails', () => {
    fixture.api.validateProposal.mockReturnValueOnce(throwError(() => ({code: 'offline', message: 'down'})) as never);
    store.validate(proposal, 'edited');
    expect(store.validating().size).toBe(0);
    expect(store.error()?.code).toBe('offline');
  });

  it('forgets statuses and validations on reset', () => {
    store.discard(proposal);
    store.validate(proposal, 'edited');
    store.reset();
    expect(store.statuses()).toEqual({});
    expect(store.validations()).toEqual({});
  });
});
