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

import {AiSetupStore} from '@ame/domain';
import {AiProviderKind} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {beforeEach, describe, expect, it} from 'vitest';
import {createAiSetupStoreMock} from '../../testing/ai-store-mocks';
import {aiFileStubs, aiTranslocoTesting} from '../../testing/ai-testing';
import {AiSetupComponent} from './ai-setup.component';

describe('AiSetupComponent', () => {
  let fixture: ComponentFixture<AiSetupComponent>;
  let store: ReturnType<typeof createAiSetupStoreMock>;

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  function typeInto(id: string, value: string, eventName = 'input'): void {
    const input = query<HTMLInputElement>(id);
    input.value = value;
    input.dispatchEvent(new Event(eventName));
    fixture.detectChanges();
  }

  function choose(kind: AiProviderKind): void {
    query(`ai-provider-${kind}`).click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    store = createAiSetupStoreMock();
    await TestBed.configureTestingModule({
      imports: [AiSetupComponent, NoopAnimationsModule, aiTranslocoTesting()],
      providers: [{provide: AiSetupStore, useValue: store}, ...aiFileStubs().providers],
    }).compileComponents();
    fixture = TestBed.createComponent(AiSetupComponent);
    fixture.detectChanges();
  });

  it('loads the setup and offers all providers, Copilot recommended', () => {
    expect(store.loadSetup).toHaveBeenCalled();
    expect(store.keepSetupOpen).not.toHaveBeenCalled();
    const providers = fixture.nativeElement.querySelectorAll('[role="radio"]');
    expect(providers.length).toBe(7);
    expect(query('ai-provider-copilot').textContent).toContain('ai.setup.recommended');
    expect(query('ai-provider-ollama').textContent).toContain('ai.setup.local');
  });

  it('describes the providers and hides title and "Done" in the settings', () => {
    store.settings.update(s => ({...s, provider: 'ollama'}));
    store.configured.set(true);
    fixture.detectChanges();
    expect(query('ai-setup-done')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.ai-setup__title')).not.toBeNull();
    expect(query('ai-provider-description-copilot')).toBeNull();

    fixture.componentRef.setInput('variant', 'settings');
    fixture.detectChanges();
    expect(query('ai-setup-done')).toBeNull();
    expect(fixture.nativeElement.querySelector('.ai-setup__title')).toBeNull();
    expect(query('ai-provider-description-copilot')).not.toBeNull();
  });

  it('keeps the provider when it is chosen again', () => {
    choose('ollama');
    store.selectProvider.mockClear();
    choose('ollama');
    expect(store.selectProvider).not.toHaveBeenCalled();
  });

  it('uses a found local server', () => {
    store.localServers.set([{kind: 'ollama', baseUrl: 'http://localhost:11434', models: ['llama3']}]);
    fixture.detectChanges();
    query('ai-local-server').click();
    expect(store.selectProvider).toHaveBeenCalledWith('ollama', {baseUrl: 'http://localhost:11434', model: 'llama3'});
    expect(store.keepSetupOpen).toHaveBeenCalled();
  });

  it('signs in to Copilot with the device flow', () => {
    choose('copilot');
    store.keepSetupOpen.mockClear();
    query('ai-copilot-login').click();
    expect(store.startCopilotLogin).toHaveBeenCalled();
    // the setup stays open after the login, so that it can be tested and finished
    expect(store.keepSetupOpen).toHaveBeenCalled();

    store.loginFlow.set({flowId: 'f', userCode: 'ABCD', verificationUri: 'https://github.com/login/device', expiresIn: 900});
    fixture.detectChanges();
    expect(query('ai-device-code-value').textContent).toContain('ABCD');
    query('ai-device-code-cancel').click();
    expect(store.cancelCopilotLogin).toHaveBeenCalled();

    store.loginFlow.set(null);
    store.copilotStatus.set({available: true, authenticated: true, login: 'octocat'});
    fixture.detectChanges();
    expect(query('ai-copilot-authenticated')).not.toBeNull();
    query('ai-copilot-logout').click();
    expect(store.logoutCopilot).toHaveBeenCalled();
  });

  it('offers to paste a token when the device flow is not supported', () => {
    choose('copilot');
    expect(query('ai-copilot-token')).toBeNull();

    store.loginState.set('unsupported');
    store.loginError.set({code: 'provider_error', message: 'no device flow'});
    fixture.detectChanges();
    expect(query('ai-login-error').textContent).toContain('ai.errors.provider_error');
    expect(query<HTMLButtonElement>('ai-copilot-token-save').disabled).toBe(true);

    typeInto('ai-copilot-token', ' gho_token ');
    query('ai-copilot-token-save').click();
    expect(store.setCopilotToken).toHaveBeenCalledWith('gho_token');
    expect(store.keepSetupOpen).toHaveBeenCalled();
  });

  it('opens the token input on request', () => {
    choose('copilot');
    query('ai-copilot-token-open').click();
    fixture.detectChanges();
    expect(query('ai-copilot-token')).not.toBeNull();
  });

  it('saves the key and clears the input', async () => {
    choose('openai');
    typeInto('ai-key-input', ' sk-test ');
    query('ai-key-save').click();
    await fixture.whenStable();

    expect(store.saveKey).toHaveBeenCalledWith('sk-test');
    expect(store.keepSetupOpen).toHaveBeenCalled();
    expect(fixture.componentInstance.keyInput()).toBe('');
  });

  it('keeps the key input when saving fails', async () => {
    store.saveKey.mockResolvedValueOnce(false);
    choose('anthropic');
    typeInto('ai-key-input', 'sk-test');
    query('ai-key-save').click();
    await fixture.whenStable();

    expect(fixture.componentInstance.keyInput()).toBe('sk-test');
  });

  it('shows that the key is saved', () => {
    choose('openai');
    typeInto('ai-key-input', 'sk-test');
    expect(query<HTMLButtonElement>('ai-key-save').disabled).toBe(false);
    store.savingKey.set(true);
    fixture.detectChanges();
    expect(query<HTMLButtonElement>('ai-key-save').disabled).toBe(true);
  });

  it('deletes a stored key', () => {
    choose('openai');
    store.keyInfo.set({stored: true, persistent: true});
    fixture.detectChanges();
    expect(query('ai-key-stored').textContent).toContain('ai.setup.key.storedPersistent');
    query('ai-key-delete').click();
    expect(store.deleteKey).toHaveBeenCalled();
  });

  it('asks for the base URL and the model', () => {
    choose('openai-compatible');
    typeInto('ai-base-url', ' http://localhost:8000/v1 ', 'change');
    typeInto('ai-model-input', ' my-model ', 'change');

    expect(store.setBaseUrl).toHaveBeenCalledWith('http://localhost:8000/v1');
    expect(store.selectModel).toHaveBeenCalledWith('my-model');
  });

  it('offers the models of the provider', () => {
    choose('openai');
    store.models.set([{id: 'gpt-4o', name: 'GPT-4o'}]);
    fixture.detectChanges();
    expect(query('ai-model-select')).not.toBeNull();
    expect(query('ai-model-input')).toBeNull();
    expect(query('ai-base-url')).toBeNull();
  });

  it('tests the connection and finishes the setup', () => {
    choose('ollama');
    query('ai-test-connection').click();
    expect(store.testConnection).toHaveBeenCalled();

    store.testResult.set({ok: false, code: 'invalid_key', message: '401'});
    fixture.detectChanges();
    expect(query('ai-test-error').textContent).toContain('ai.errors.invalid_key');
    expect(query('ai-test-error').textContent).toContain('401');
    expect(query('ai-setup-done')).toBeNull();

    store.testResult.set({ok: true});
    store.configured.set(true);
    fixture.detectChanges();
    expect(query('ai-test-ok')).not.toBeNull();
    query('ai-setup-done').click();
    expect(store.closeSetup).toHaveBeenCalled();
  });
});
