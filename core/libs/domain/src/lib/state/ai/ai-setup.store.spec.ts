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
import {NEVER, of, Subject, throwError} from 'rxjs';
import {beforeEach, describe, expect, it} from 'vitest';
import {CopilotStatus} from '../../model-api';
import {AiErrorStore} from './ai-error.store';
import {AiSetupStore} from './ai-setup.store';
import {flushAi, setupAiStoreTest} from './ai-stores.fixture';

describe('AiSetupStore', () => {
  let store: AiSetupStore;
  let fixture: ReturnType<typeof setupAiStoreTest>;

  beforeEach(() => {
    fixture = setupAiStoreTest();
    store = TestBed.inject(AiSetupStore);
  });

  describe('settings and setup', () => {
    it('is disabled and not configured by default', () => {
      expect(store.enabled()).toBe(false);
      expect(store.configured()).toBe(false);
      expect(store.showSetup()).toBe(true);
    });

    it('loads the setup', () => {
      store.loadSetup();
      expect(store.providers()).toHaveLength(2);
      expect(store.localServers()[0].baseUrl).toBe('http://localhost:11434');
      expect(store.copilotStatus()?.authenticated).toBe(false);
      expect(store.setupLoading()).toBe(false);
    });

    it('loads the setup only once while it is loaded', () => {
      const providers$ = new Subject<[]>();
      fixture.api.getProviders.mockReturnValue(providers$ as never);
      store.loadSetup();
      store.loadSetup();
      expect(store.setupLoading()).toBe(true);
      expect(fixture.api.getProviders).toHaveBeenCalledTimes(1);

      providers$.next([]);
      providers$.complete();
      expect(store.setupLoading()).toBe(false);
      store.loadSetup();
      expect(fixture.api.getProviders).toHaveBeenCalledTimes(2);
    });

    it('loads the setup only while the assistant is enabled', () => {
      store.loadSetupIfEnabled();
      expect(fixture.api.getProviders).not.toHaveBeenCalled();

      fixture.setAi({});
      store.loadSetupIfEnabled();
      expect(fixture.api.getProviders).toHaveBeenCalledTimes(1);
    });

    it('leaves the parts empty whose requests fail or return nothing', () => {
      fixture.api.getProviders.mockReturnValue(throwError(() => new Error('down')));
      fixture.api.getLocalServers.mockReturnValue(of(null) as never);
      store.loadSetup();
      expect(store.providers()).toEqual([]);
      expect(store.localServers()).toEqual([]);
      expect(store.copilotStatus()?.available).toBe(true);
      expect(store.setupLoading()).toBe(false);
    });

    it('offers the providers of the backend, Copilot recommended, and only local ones on request', () => {
      expect(store.providerChoices().map(choice => choice.kind)).toHaveLength(7);
      expect(store.providerChoices().find(choice => choice.kind === 'copilot')?.recommended).toBe(true);

      store.loadSetup();
      expect(store.providerChoices()).toEqual([
        {kind: 'openai', recommended: false, local: false, available: true},
        {kind: 'ollama', recommended: false, local: true, available: true},
      ]);

      fixture.setAi({onlyLocal: true});
      expect(store.providerChoices().map(choice => choice.kind)).toEqual(['ollama']);
    });

    it('offers Copilot only as available when its runtime is there', () => {
      fixture.api.getProviders.mockReturnValue(of([]) as never);
      fixture.api.getCopilotStatus.mockReturnValue(of<CopilotStatus>({available: false, authenticated: false}));
      store.loadSetup();
      expect(store.providerChoices().find(choice => choice.kind === 'copilot')?.available).toBe(false);

      fixture.api.getCopilotStatus.mockReturnValue(of<CopilotStatus>({available: true, authenticated: false}));
      store.loadSetup();
      expect(store.providerChoices().find(choice => choice.kind === 'copilot')?.available).toBe(true);
    });

    it('knows the needs of a provider before the backend answered', () => {
      fixture.setAi({provider: 'azure-openai'});
      expect(store.requiresKey()).toBe(true);
      expect(store.requiresBaseUrl()).toBe(true);
    });

    it('selects a provider with its default model and needs a key for it', async () => {
      store.loadSetup();
      store.selectProvider('openai');
      expect(store.settings().provider).toBe('openai');
      expect(store.settings().model).toBe('gpt-x');
      expect(store.requiresKey()).toBe(true);
      expect(store.configured()).toBe(false);

      const saving = store.saveKey(' sk-1 ');
      expect(store.savingKey()).toBe(true);
      expect(await saving).toBe(true);
      expect(store.savingKey()).toBe(false);
      expect(fixture.secrets.set).toHaveBeenCalledWith('openai', 'sk-1');
      expect(store.keyInfo().stored).toBe(true);
      expect(store.configured()).toBe(true);
      expect(JSON.stringify(fixture.settings$.value)).not.toContain('sk-1');
      expect(fixture.api.test).toHaveBeenCalled();

      store.deleteKey();
      await flushAi();
      expect(store.configured()).toBe(false);
    });

    it('reports when the key cannot be stored', async () => {
      fixture.setAi({provider: 'openai'});
      fixture.secrets.set.mockRejectedValueOnce(new Error('locked'));
      expect(await store.saveKey('sk-1')).toBe(false);
      expect(store.savingKey()).toBe(false);
      expect(fixture.api.test).not.toHaveBeenCalled();
    });

    it('stores no key without provider', async () => {
      expect(await store.saveKey('sk-1')).toBe(false);
      expect(fixture.secrets.set).not.toHaveBeenCalled();
    });

    it('changes the base url and the model', () => {
      fixture.setAi({provider: 'openai-compatible'});
      store.setBaseUrl('http://localhost:8000/v1');
      store.selectModel('m');
      expect(store.settings()).toMatchObject({baseUrl: 'http://localhost:8000/v1', model: 'm'});
    });

    it('keeps the setup open until it is closed although the provider is configured', () => {
      fixture.setAi({provider: 'ollama', baseUrl: 'http://localhost:11434'});
      expect(store.showSetup()).toBe(false);

      store.keepSetupOpen();
      expect(store.showSetup()).toBe(true);

      store.closeSetup();
      expect(store.showSetup()).toBe(false);

      store.openSetup();
      expect(store.showSetup()).toBe(true);
      expect(fixture.api.getProviders).toHaveBeenCalled();
    });

    it('treats local providers as configured without key and consent', () => {
      fixture.setAi({provider: 'ollama', baseUrl: 'http://localhost:11434'});
      expect(store.configured()).toBe(true);
      expect(store.isLocal()).toBe(true);
      expect(store.consentRequired()).toBe(false);
    });

    it('grants and resets the consent for cloud providers', () => {
      fixture.setAi({provider: 'openai'});
      expect(store.consentRequired()).toBe(true);
      store.grantCloudConsent();
      store.grantCloudConsent();
      expect(store.settings().cloudConsent).toEqual(['openai']);
      expect(store.consentRequired()).toBe(false);
      store.resetConsent();
      expect(store.consentRequired()).toBe(true);
    });

    it('needs a base url for openai-compatible providers', () => {
      fixture.setAi({provider: 'openai-compatible'});
      expect(store.configured()).toBe(false);
      fixture.setAi({provider: 'openai-compatible', baseUrl: 'http://localhost:8000/v1'});
      expect(store.configured()).toBe(true);
    });

    it('tests the connection with the stored key and takes over the models', async () => {
      fixture.setAi({provider: 'openai', model: 'gpt-x'});
      await fixture.secrets.set('openai', 'sk-2');
      store.testConnection();
      await flushAi();
      expect(fixture.api.test).toHaveBeenCalledWith({kind: 'openai', model: 'gpt-x'}, 'sk-2');
      expect(store.testResult()?.ok).toBe(true);
      expect(store.models()).toEqual([{id: 'a', name: 'A'}]);
      expect(store.testing()).toBe(false);
    });

    it('reports a failing test as result', async () => {
      fixture.setAi({provider: 'ollama'});
      fixture.api.test.mockReturnValue(throwError(() => ({code: 'offline', message: 'down'})));
      store.testConnection();
      await flushAi();
      expect(store.testResult()).toEqual({ok: false, code: 'offline', message: 'down'});
    });

    it('loads the models of the provider', async () => {
      fixture.setAi({provider: 'ollama'});
      store.loadModels();
      await flushAi();
      expect(store.models()).toEqual([{id: 'm', name: 'M'}]);
    });

    it('has no key for Copilot', async () => {
      let key: string | undefined = 'x';
      store.apiKey('copilot').subscribe(value => (key = value));
      await flushAi();
      expect(key).toBeUndefined();
    });
  });

  describe('copilot login', () => {
    beforeEach(() => fixture.setAi({provider: 'copilot'}));

    it('runs the device flow', () => {
      const complete = new Subject<{available: boolean; authenticated: boolean}>();
      fixture.api.completeCopilotLogin.mockReturnValue(complete as never);
      store.startCopilotLogin();
      expect(store.loginState()).toBe('waiting');
      expect(store.loginFlow()?.userCode).toBe('ABCD-1234');

      complete.next({available: true, authenticated: true});
      expect(store.copilotStatus()?.authenticated).toBe(true);
      expect(store.loginFlow()).toBeNull();
      expect(store.configured()).toBe(true);
    });

    it('falls back to the token when the device flow is not supported', () => {
      fixture.api.startCopilotLogin.mockReturnValue(throwError(() => ({code: 'provider_error', message: 'no device flow'})));
      store.startCopilotLogin();
      expect(store.loginState()).toBe('unsupported');

      store.setCopilotToken(' gho_1 ');
      expect(fixture.api.setCopilotToken).toHaveBeenCalledWith('gho_1');
      expect(store.configured()).toBe(true);
    });

    it('cancels the flow', () => {
      fixture.api.completeCopilotLogin.mockReturnValue(NEVER);
      store.startCopilotLogin();
      store.cancelCopilotLogin();
      expect(fixture.api.cancelCopilotLogin).toHaveBeenCalledWith('f1');
      expect(store.loginState()).toBe('idle');
    });

    it('logs out', () => {
      store.logoutCopilot();
      expect(store.copilotStatus()?.authenticated).toBe(false);
    });

    it('reports a failing logout', () => {
      fixture.api.logoutCopilot.mockReturnValue(throwError(() => ({code: 'offline', message: 'down'})));
      store.logoutCopilot();
      expect(TestBed.inject(AiErrorStore).error()?.code).toBe('offline');
    });
  });
});
