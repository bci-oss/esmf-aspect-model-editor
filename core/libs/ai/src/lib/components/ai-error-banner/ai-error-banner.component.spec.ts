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
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {aiTranslocoTesting} from '../../testing/ai-testing';
import {AiErrorBannerComponent} from './ai-error-banner.component';

describe('AiErrorBannerComponent', () => {
  let fixture: ComponentFixture<AiErrorBannerComponent>;

  const query = <T extends HTMLElement>(selector: string): T => fixture.nativeElement.querySelector(selector);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiErrorBannerComponent, aiTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AiErrorBannerComponent);
  });

  it('shows the friendly message, the detail and the actions of the code', () => {
    fixture.componentRef.setInput('error', {code: 'quota_exceeded', message: 'Rate limit'});
    fixture.detectChanges();

    expect(query('[data-testid="ai-error"]').dataset['code']).toBe('quota_exceeded');
    expect(query('.ai-error__message').textContent).toContain('ai.errors.quota_exceeded');
    expect(query('.ai-error__detail').textContent).toContain('Rate limit');
    expect(query('[data-testid="ai-error-action-retry"]')).not.toBeNull();
    expect(query('[data-testid="ai-error-action-openSetup"]')).not.toBeNull();
  });

  it('emits the action and the dismissal', () => {
    const action = vi.fn();
    const dismissed = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.componentRef.setInput('error', {code: 'not_authenticated', message: ''});
    fixture.detectChanges();

    query('[data-testid="ai-error-action-login"]').click();
    query('.ai-error__close').click();

    expect(action).toHaveBeenCalledWith('login');
    expect(dismissed).toHaveBeenCalled();
    expect(query('.ai-error__detail')).toBeNull();
  });

  it('hides the close button when not dismissible', () => {
    fixture.componentRef.setInput('error', {code: 'read_only', message: ''});
    fixture.componentRef.setInput('dismissible', false);
    fixture.detectChanges();
    expect(query('.ai-error__close')).toBeNull();
    expect(query('.ai-error__actions')).toBeNull();
  });
});
