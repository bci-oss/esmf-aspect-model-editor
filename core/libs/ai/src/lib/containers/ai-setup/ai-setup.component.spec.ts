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

import {
  AiCopilotLoginState,
  AiError,
  AiLocalServer,
  AiModelInfo,
  AiProviderChoice,
  AiProviderInfo,
  AiStore,
  AiTestResult,
  CopilotLoginFlow,
  CopilotStatus,
} from '@ame/domain';
import {AI_PROVIDER_KINDS, AiProviderKind, AiSettings, ClipboardService, DEFAULT_AI_SETTINGS} from '@ame/shared';
import {computed, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiSetupComponent} from './ai-setup.component';

function createStore() {
  const settings = signal<AiSettings>({...DEFAULT_AI_SETTINGS, enabled: true});
  const providerKind = computed(() => settings().provider);
  return {
    providers: signal<AiProviderInfo[]>([]),
    providerChoices: signal<AiProviderChoice[]>(
      AI_PROVIDER_KINDS.map(kind => ({
        kind,
        recommended: kind === 'copilot',
        local: kind === 'ollama' || kind === 'lmstudio',
        available: true,
      })),
    ),
    localServers: signal<AiLocalServer[]>([]),
    models: signal<AiModelInfo[]>([]),
    copilotStatus: signal<CopilotStatus | null>({available: true, authenticated: false}),
    keyInfo: signal({stored: false, persistent: false}),
    testing: signal(false),
    testResult: signal<AiTestResult | null>(null),
    loginFlow: signal<CopilotLoginFlow | null>(null),
    loginState: signal<AiCopilotLoginState>('idle'),
    loginError: signal<AiError | null>(null),
    settings,
    providerKind,
    requiresKey: computed(() => ['openai', 'anthropic', 'azure-openai'].includes(providerKind() ?? '')),
    requiresBaseUrl: computed(() => providerKind() === 'openai-compatible'),
    isLocal: computed(() => providerKind() === 'ollama' || providerKind() === 'lmstudio'),
    configured: signal(false),
    loadSetup: vi.fn(),
    keepSetupOpen: vi.fn(),
    selectProvider: vi.fn((kind: AiProviderKind, extra: Partial<AiSettings> = {}) =>
      settings.update(s => ({...s, ...extra, provider: kind})),
    ),
    saveKey: vi.fn(() => of(undefined)),
    deleteKey: vi.fn(() => of(undefined)),
    setCopilotToken: vi.fn(),
    startCopilotLogin: vi.fn(),
    cancelCopilotLogin: vi.fn(),
    logoutCopilot: vi.fn(),
    testConnection: vi.fn(),
    updateSettings: vi.fn(),
    selectModel: vi.fn(),
    closeSetup: vi.fn(),
  };
}

describe('AiSetupComponent', () => {
  let fixture: ComponentFixture<AiSetupComponent>;
  let store: ReturnType<typeof createStore>;

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
    store = createStore();
    await TestBed.configureTestingModule({
      imports: [
        AiSetupComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        {provide: AiStore, useValue: store},
        {provide: ClipboardService, useValue: {copy: vi.fn()}},
      ],
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

  it('saves the key and tests the connection', () => {
    choose('openai');
    typeInto('ai-key-input', ' sk-test ');
    query('ai-key-save').click();
    fixture.detectChanges();

    expect(store.saveKey).toHaveBeenCalledWith('sk-test');
    expect(store.testConnection).toHaveBeenCalled();
    expect(fixture.componentInstance.keyInput()).toBe('');
    expect(fixture.componentInstance.savingKey()).toBe(false);
  });

  it('keeps the key input when saving fails', () => {
    store.saveKey.mockReturnValueOnce(throwError(() => new Error('keychain locked')));
    choose('anthropic');
    typeInto('ai-key-input', 'sk-test');
    query('ai-key-save').click();

    expect(store.testConnection).not.toHaveBeenCalled();
    expect(fixture.componentInstance.keyInput()).toBe('sk-test');
    expect(fixture.componentInstance.savingKey()).toBe(false);
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

    expect(store.updateSettings).toHaveBeenCalledWith({baseUrl: 'http://localhost:8000/v1'});
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
