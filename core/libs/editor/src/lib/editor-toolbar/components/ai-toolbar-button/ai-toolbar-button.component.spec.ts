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
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AiToolbarButtonComponent} from './ai-toolbar-button.component';

describe('AiToolbarButtonComponent', () => {
  let fixture: ComponentFixture<AiToolbarButtonComponent>;
  let component: AiToolbarButtonComponent;

  const byTestId = <T extends HTMLElement>(testId: string): T => document.querySelector(`[data-testid="${testId}"]`);

  const openMenu = async () => {
    byTestId('tbAiButton').click();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiToolbarButtonComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiToolbarButtonComponent);
    component = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('toggles the panel', () => {
    const toggle = vi.fn();
    component.togglePanel.subscribe(toggle);

    byTestId('tbAiToggleButton').click();

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('shows the pressed state while the panel is open', () => {
    const toggle = byTestId('tbAiToggleButton');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.classList).not.toContain('toolbar-item--active');

    fixture.componentRef.setInput('panelOpen', true);
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.classList).toContain('toolbar-item--active');
  });

  it('emits the actions of the menu', async () => {
    const calls: string[] = [];
    component.review.subscribe(() => calls.push('review'));
    component.examples.subscribe(() => calls.push('examples'));
    component.explainModel.subscribe(() => calls.push('explain'));
    component.newModel.subscribe(() => calls.push('newModel'));

    for (const testId of ['tbAiReview', 'tbAiExamples', 'tbAiExplain', 'tbAiNewModel']) {
      await openMenu();
      byTestId(testId).click();
    }

    expect(calls).toEqual(['review', 'examples', 'explain', 'newModel']);
  });

  it('offers no second entry to open the panel', async () => {
    await openMenu();

    expect(byTestId('tbAiOpenPanel')).toBeNull();
    expect(document.querySelectorAll('.mat-mdc-menu-panel mat-icon')).toHaveLength(4);
  });

  it('disables the actions about the model while it is empty', async () => {
    fixture.componentRef.setInput('modelEmpty', true);
    fixture.detectChanges();
    await openMenu();

    expect(byTestId<HTMLButtonElement>('tbAiReview').disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>('tbAiExamples').disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>('tbAiExplain').disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>('tbAiNewModel').disabled).toBe(false);
  });
});
