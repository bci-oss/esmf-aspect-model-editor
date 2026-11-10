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

import {Component, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {AiSettingsStepComponent} from './ai-settings-step.component';

@Component({
  imports: [AiSettingsStepComponent],
  template: `
    <ame-ai-settings-step [step]="2" [disabled]="disabled()" title="Provider" description="Choose one" disabledHint="Enable first">
      <span data-testid="content">content</span>
    </ame-ai-settings-step>
  `,
})
class HostComponent {
  readonly disabled = signal(false);
}

describe('AiSettingsStepComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const step = (): HTMLElement => fixture.nativeElement.querySelector('ame-ai-settings-step');
  const byTestId = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [HostComponent]}).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('shows the number, title, description and content', () => {
    expect(step().querySelector('.ai-settings-step__number')?.textContent?.trim()).toBe('2');
    expect(step().querySelector('.ai-settings-step__title')?.textContent).toContain('Provider');
    expect(step().querySelector('.ai-settings-step__description')?.textContent).toContain('Choose one');
    expect(byTestId('content')).not.toBeNull();
    expect(step().getAttribute('role')).toBe('group');
    expect(step().getAttribute('aria-label')).toBe('Provider');
  });

  it('replaces the content with the hint while disabled', () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    expect(byTestId('content')).toBeNull();
    expect(byTestId('aiSettingsStepDisabledHint')?.textContent).toContain('Enable first');
    expect(step().classList).toContain('ai-settings-step--disabled');
    expect(step().getAttribute('aria-disabled')).toBe('true');
  });
});
