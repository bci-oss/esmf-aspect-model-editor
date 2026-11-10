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

import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it} from 'vitest';
import {AiDiffViewComponent} from './ai-diff-view.component';

describe('AiDiffViewComponent', () => {
  let fixture: ComponentFixture<AiDiffViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiDiffViewComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiDiffViewComponent);
  });

  it('shows added and removed lines with the stats', () => {
    fixture.componentRef.setInput('original', 'a\nb\nc');
    fixture.componentRef.setInput('proposed', 'a\nB\nc\nd');
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.ai-diff__added')?.textContent).toBe('+2');
    expect(element.querySelector('.ai-diff__removed')?.textContent).toBe('−1');
    const added = Array.from(element.querySelectorAll('.ai-diff__line--added')).map(line => line.textContent);
    const removed = Array.from(element.querySelectorAll('.ai-diff__line--removed')).map(line => line.textContent);
    expect(added).toEqual(['+B', '+d']);
    expect(removed).toEqual(['−b']);
  });

  it('collapses long unchanged parts', () => {
    const lines = Array.from({length: 30}, (_, i) => `line ${i}`);
    fixture.componentRef.setInput('original', lines.join('\n'));
    fixture.componentRef.setInput('proposed', [...lines.slice(0, 29), 'changed'].join('\n'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ai-diff__line--skipped')?.textContent).toContain('ai.proposal.unchangedLines');
  });

  it('says when nothing changed', () => {
    fixture.componentRef.setInput('original', 'same');
    fixture.componentRef.setInput('proposed', 'same');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ai-diff__none')?.textContent).toContain('ai.proposal.noChanges');
  });
});
