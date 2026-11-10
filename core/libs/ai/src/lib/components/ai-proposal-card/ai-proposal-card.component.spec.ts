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

import {AiProposal} from '@ame/domain';
import {ClipboardService, FileSaverService} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiProposalCardComponent} from './ai-proposal-card.component';

describe('AiProposalCardComponent', () => {
  let fixture: ComponentFixture<AiProposalCardComponent>;

  const change: AiProposal = {
    id: 'p1',
    kind: 'modelChange',
    title: 'Add unit',
    summary: 'Adds **unit**',
    originalTurtle: 'a\nb',
    turtle: 'a\nB',
    valid: false,
    validationErrors: [{message: 'Missing unit'}],
  };

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const button = (id: string) => query<HTMLButtonElement>(id);

  function show(proposal: AiProposal, inputs: Record<string, unknown> = {}): void {
    fixture.componentRef.setInput('proposal', proposal);
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiProposalCardComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        {provide: ClipboardService, useValue: {copy: vi.fn()}},
        {provide: FileSaverService, useValue: {download: vi.fn()}},
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiProposalCardComponent);
  });

  it('shows a model change with summary, diff and validation errors', () => {
    show(change);
    expect(query('ai-proposal').dataset['kind']).toBe('modelChange');
    expect(query('ai-proposal').querySelector('.ai-proposal__summary strong')?.textContent).toBe('unit');
    expect(query('ai-diff')).not.toBeNull();
    expect(query('ai-proposal-validation').classList).toContain('ai-proposal__badge--invalid');
    expect(query('ai-proposal-errors').textContent).toContain('Missing unit');
  });

  it('applies and discards a model change', () => {
    const applyRequested = vi.fn();
    const discardRequested = vi.fn();
    fixture.componentInstance.applyRequested.subscribe(applyRequested);
    fixture.componentInstance.discardRequested.subscribe(discardRequested);
    show(change);

    button('ai-proposal-apply').click();
    button('ai-proposal-discard').click();

    expect(applyRequested).toHaveBeenCalledWith('a\nB');
    expect(discardRequested).toHaveBeenCalled();
  });

  it('requires a validation after editing before applying', () => {
    const validateRequested = vi.fn();
    const applyRequested = vi.fn();
    fixture.componentInstance.validateRequested.subscribe(validateRequested);
    fixture.componentInstance.applyRequested.subscribe(applyRequested);
    show(change);

    button('ai-proposal-edit').click();
    fixture.detectChanges();
    const editor = query<HTMLTextAreaElement>('ai-proposal-editor');
    editor.value = 'edited';
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(button('ai-proposal-apply').disabled).toBe(true);

    button('ai-proposal-validate').click();
    fixture.detectChanges();
    expect(validateRequested).toHaveBeenCalledWith('edited');
    expect(button('ai-proposal-apply').disabled).toBe(false);

    fixture.componentRef.setInput('validation', {valid: true, validationErrors: []});
    fixture.detectChanges();
    expect(query('ai-proposal-validation').classList).toContain('ai-proposal__badge--valid');
    expect(query('ai-proposal-errors')).toBeNull();

    button('ai-proposal-apply').click();
    expect(applyRequested).toHaveBeenCalledWith('edited');
  });

  it('does not change read-only models', () => {
    show(change, {readOnly: true});
    expect(button('ai-proposal-apply').disabled).toBe(true);
    expect(button('ai-proposal-edit').disabled).toBe(true);
  });

  it('creates a new model and previews the Turtle', () => {
    const createRequested = vi.fn();
    fixture.componentInstance.createRequested.subscribe(createRequested);
    show({id: 'p2', kind: 'newModel', title: 'New', turtle: '@prefix x: <y> .', fileName: 'New.ttl', valid: true});

    expect(query('ai-proposal-preview')).toBeNull();
    (query('ai-proposal').querySelector('button[aria-expanded]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(query('ai-proposal-preview').textContent).toContain('@prefix x: <y> .');

    button('ai-proposal-create').click();
    expect(createRequested).toHaveBeenCalledWith('@prefix x: <y> .');
  });

  it('renames an element unless the model is read-only', () => {
    const renameRequested = vi.fn();
    fixture.componentInstance.renameRequested.subscribe(renameRequested);
    const rename: AiProposal = {
      id: 'p3',
      kind: 'refactoring',
      title: 'Rename',
      refactoring: {kind: 'renameElement', urn: 'urn:x#a', newName: 'b'},
    };
    show(rename);
    button('ai-proposal-rename').click();
    expect(renameRequested).toHaveBeenCalled();

    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    expect(button('ai-proposal-rename').disabled).toBe(true);
  });

  it('shows review findings without actions and forwards fixes', () => {
    const fixRequested = vi.fn();
    fixture.componentInstance.fixRequested.subscribe(fixRequested);
    const finding = {id: 'f', severity: 'error' as const, category: 'unit' as const, message: 'm', fixable: true};
    show({id: 'p4', kind: 'review', title: 'Review', findings: [finding]});

    expect(query('ai-proposal-discard')).toBeNull();
    button('ai-finding-fix').click();
    expect(fixRequested).toHaveBeenCalledWith(finding);
  });

  it('shows the state of applied and discarded proposals', () => {
    show(change, {status: 'applied'});
    expect(query('ai-proposal').classList).toContain('ai-proposal--closed');
    expect(query('ai-proposal-state').textContent).toContain('ai.proposal.applied');
    expect(query('ai-proposal-apply')).toBeNull();

    fixture.componentRef.setInput('status', 'discarded');
    fixture.detectChanges();
    expect(query('ai-proposal-state').textContent).toContain('ai.proposal.discarded');
  });
});
