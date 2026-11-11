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
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {aiFileStubs, aiTranslocoTesting} from '../../testing/ai-testing';
import {AiCopilotLoginComponent} from './ai-copilot-login.component';

describe('AiCopilotLoginComponent', () => {
  let fixture: ComponentFixture<AiCopilotLoginComponent>;
  let component: AiCopilotLoginComponent;

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const set = (name: string, value: unknown) => {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiCopilotLoginComponent, NoopAnimationsModule, aiTranslocoTesting()],
      providers: aiFileStubs().providers,
    }).compileComponents();
    fixture = TestBed.createComponent(AiCopilotLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('asks to sign in', () => {
    const login = vi.fn();
    component.loginRequested.subscribe(login);
    query('ai-copilot-login').click();
    expect(login).toHaveBeenCalled();

    set('state', 'starting');
    expect(query<HTMLButtonElement>('ai-copilot-login').disabled).toBe(true);
  });

  it('shows the device code while signing in and cancels it', () => {
    const cancel = vi.fn();
    component.loginCancelled.subscribe(cancel);
    set('flow', {flowId: 'f', userCode: 'ABCD', verificationUri: 'https://github.com/login/device', expiresIn: 900});
    expect(query('ai-device-code-value').textContent).toContain('ABCD');
    query('ai-device-code-cancel').click();
    expect(cancel).toHaveBeenCalled();
  });

  it('shows who is signed in and signs out', () => {
    const logout = vi.fn();
    component.logoutRequested.subscribe(logout);
    set('status', {available: true, authenticated: true, login: 'octocat'});
    expect(query('ai-copilot-authenticated')).not.toBeNull();
    query('ai-copilot-logout').click();
    expect(logout).toHaveBeenCalled();
  });

  it('offers to paste a token when the device flow is not supported', () => {
    const tokens: string[] = [];
    component.tokenSubmitted.subscribe(token => tokens.push(token));
    expect(query('ai-copilot-token')).toBeNull();

    set('state', 'unsupported');
    set('error', {code: 'provider_error', message: 'no device flow'});
    expect(query('ai-login-error').textContent).toContain('ai.errors.provider_error');
    expect(query<HTMLButtonElement>('ai-copilot-token-save').disabled).toBe(true);

    component.saveToken();
    expect(tokens).toEqual([]);

    const input = query<HTMLInputElement>('ai-copilot-token');
    input.value = ' gho_token ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    query('ai-copilot-token-save').click();
    expect(tokens).toEqual(['gho_token']);
    expect(component.tokenInput()).toBe('');
  });

  it('opens the token input on request', () => {
    query('ai-copilot-token-open').click();
    fixture.detectChanges();
    expect(query('ai-copilot-token')).not.toBeNull();
  });
});
