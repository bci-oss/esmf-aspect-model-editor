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

import {AiReviewFinding} from '@ame/domain';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiReviewFindingsComponent} from './ai-review-findings.component';

describe('AiReviewFindingsComponent', () => {
  let fixture: ComponentFixture<AiReviewFindingsComponent>;

  const findings: AiReviewFinding[] = [
    {id: 'i', severity: 'info', category: 'naming', message: 'info message', fixable: false},
    {id: 'e', severity: 'error', category: 'unit', message: 'error message', elementUrn: 'urn:samm:org.example:1.0.0#speed', fixable: true},
    {
      id: 'w',
      severity: 'warning',
      category: 'reuse',
      message: 'warning message',
      reuseUrn: 'urn:samm:org.eclipse.esmf.samm:unit:2.2.0#metre',
      fixable: false,
    },
  ];

  const queryAll = (id: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${id}"]`));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiReviewFindingsComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiReviewFindingsComponent);
  });

  it('says when there are no findings', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ai.review.none');
  });

  it('shows the most severe findings first', () => {
    fixture.componentRef.setInput('findings', findings);
    fixture.detectChanges();
    const items = queryAll('ai-finding');
    expect(items.map(item => item.querySelector('.ai-finding__message')?.textContent)).toEqual([
      'error message',
      'warning message',
      'info message',
    ]);
    expect(items[0].classList).toContain('ai-finding--error');
    expect(items[1].textContent).toContain('#metre');
  });

  it('jumps to the element and requests a fix', () => {
    const elementSelected = vi.fn();
    const fixRequested = vi.fn();
    fixture.componentInstance.elementSelected.subscribe(elementSelected);
    fixture.componentInstance.fixRequested.subscribe(fixRequested);
    fixture.componentRef.setInput('findings', findings);
    fixture.detectChanges();

    const jump = queryAll('ai-finding-jump');
    expect(jump.length).toBe(1);
    expect(jump[0].textContent?.trim()).toBe('speed');
    jump[0].click();
    queryAll('ai-finding-fix')[0].click();

    expect(elementSelected).toHaveBeenCalledWith('urn:samm:org.example:1.0.0#speed');
    expect(fixRequested).toHaveBeenCalledWith(findings[1]);
  });

  it('disables the fix while the assistant answers', () => {
    fixture.componentRef.setInput('findings', findings);
    fixture.componentRef.setInput('fixDisabled', true);
    fixture.detectChanges();
    expect((queryAll('ai-finding-fix')[0] as HTMLButtonElement).disabled).toBe(true);
  });
});
