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
  AiStore,
  ConfigurationService,
  EditorValidationPort,
  GraphSettingsPort,
  ModelSaverPort,
  ModelSessionFacade,
  SammLanguageSettingsService,
} from '@ame/domain';
import {LanguageTranslationService, TauriTunnelPort, TitleService} from '@ame/shared';
import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SettingsFormService} from '../../../services';
import {AI_ASSISTANT_DOCS_URL, AiConfigurationComponent} from './ai-configuration.component';

describe('AiConfigurationComponent', () => {
  let fixture: ComponentFixture<AiConfigurationComponent>;
  let formService: SettingsFormService;
  const settings = signal<Record<string, unknown>>({});
  const enabled = signal(true);
  const configured = signal(true);
  const requiresKey = signal(false);
  const keyInfo = signal({stored: false, persistent: false});
  const copilotStatus = signal<{available: boolean; authenticated: boolean; login?: string} | null>(null);
  const aiStore = {
    settings,
    enabled,
    configured,
    requiresKey,
    keyInfo,
    copilotStatus,
    loadSetup: vi.fn(),
    resetConsent: vi.fn(() => settings.update(value => ({...value, cloudConsent: []}))),
  };

  const element = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const component = (): AiConfigurationComponent => fixture.componentInstance;

  const enableInForm = (value = true) => {
    formService.settingsModel.update(m => ({...m, aiConfiguration: {...m.aiConfiguration, enabled: value}}));
    fixture.detectChanges();
  };

  const create = () => {
    fixture = TestBed.createComponent(AiConfigurationComponent);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    localStorage.clear();
    settings.set({enabled: true, provider: 'copilot', onlyLocal: false, languages: ['en'], cloudConsent: ['copilot']});
    enabled.set(true);
    configured.set(true);
    requiresKey.set(false);
    keyInfo.set({stored: false, persistent: false});
    copilotStatus.set(null);
    aiStore.loadSetup.mockClear();
    aiStore.resetConsent.mockClear();

    await TestBed.configureTestingModule({
      imports: [
        AiConfigurationComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        SettingsFormService,
        ConfigurationService,
        SammLanguageSettingsService,
        {provide: AiStore, useValue: aiStore},
        {provide: ModelSessionFacade, useValue: {currentLoadedFile: null}},
        {provide: LanguageTranslationService, useValue: {translateService: {getActiveLang: () => 'en', setActiveLang: vi.fn()}}},
        {provide: TitleService, useValue: {updateTitle: vi.fn()}},
        {provide: TauriTunnelPort, useValue: {sendTranslationsToTauri: vi.fn()}},
        {provide: GraphSettingsPort, useValue: {formatShapes: vi.fn()}},
        {provide: ModelSaverPort, useValue: {enableAutoSave: vi.fn()}},
        {provide: EditorValidationPort, useValue: {enableAutoValidation: vi.fn()}},
      ],
    }).compileComponents();

    formService = TestBed.inject(SettingsFormService);
    formService.initializeForm();
    create();
  });

  it('explains what the assistant can do and links the documentation', () => {
    expect(element('aiIntro')).not.toBeNull();
    for (const capability of ['ask', 'fix', 'describe', 'review', 'examples', 'generate']) {
      expect(element(`aiCapability-${capability}`)).not.toBeNull();
    }
    expect(element('aiDocsLink')?.getAttribute('href')).toBe(AI_ASSISTANT_DOCS_URL);
  });

  it('shows the four steps and only the enable toggle while disabled', () => {
    enableInForm(false);

    for (const id of ['aiStepEnable', 'aiStepProvider', 'aiStepPrivacy', 'aiStepLanguages']) {
      expect(element(id)).not.toBeNull();
    }
    expect(element('aiEnabledToggle')).not.toBeNull();
    for (const id of ['aiOpenSetup', 'aiOnlyLocalToggle', 'aiLanguagesInput', 'aiConsentReset']) {
      expect(element(id)).toBeNull();
    }
    expect(element('aiStepProvider')?.textContent).toContain('settingsDialog.ai.steps.enableFirst');
    expect(element('aiProviderSelect')).toBeNull();
  });

  it('shows all fields once enabled in the form', () => {
    enableInForm();

    for (const id of ['aiEnabledToggle', 'aiOpenSetup', 'aiOnlyLocalToggle', 'aiLanguagesInput', 'aiConsentReset', 'aiConnectionSummary']) {
      expect(element(id)).not.toBeNull();
    }
  });

  it('writes typed values into the form when enabled', () => {
    enableInForm();
    const input = element('aiLanguagesInput') as HTMLInputElement;
    input.value = 'en, fr';
    input.dispatchEvent(new Event('input'));
    expect(formService.settingsModel().aiConfiguration.languages).toBe('en, fr');
  });

  it('asks the dialog to open the setup', () => {
    enableInForm();
    const openSetup = vi.fn();
    component().openSetup.subscribe(openSetup);

    (element('aiOpenSetup') as HTMLButtonElement).click();

    expect(openSetup).toHaveBeenCalledTimes(1);
    expect(element('aiOpenSetup')?.textContent).toContain('settingsDialog.ai.steps.provider.change');

    settings.update(value => ({...value, provider: null}));
    fixture.detectChanges();
    expect(element('aiOpenSetup')?.textContent).toContain('settingsDialog.ai.steps.provider.setup');
  });

  it('loads the connection status only while the assistant is active', () => {
    expect(aiStore.loadSetup).toHaveBeenCalledTimes(1);

    enabled.set(false);
    aiStore.loadSetup.mockClear();
    fixture.destroy();
    create();
    expect(aiStore.loadSetup).not.toHaveBeenCalled();
  });

  it('derives the connection state from the store', () => {
    expect(component().connectionState()).toBe('ready');
    configured.set(false);
    expect(component().connectionState()).toBe('incomplete');
    settings.update(value => ({...value, provider: null}));
    expect(component().connectionState()).toBe('none');
    expect(component().provider()).toBeNull();
  });

  it('derives the key state for providers with a key', () => {
    expect(component().keyState()).toBe('notNeeded');

    settings.update(value => ({...value, provider: 'openai', model: 'gpt-x'}));
    requiresKey.set(true);
    expect(component().keyState()).toBe('missing');
    keyInfo.set({stored: true, persistent: false});
    expect(component().keyState()).toBe('session');
    keyInfo.set({stored: true, persistent: true});
    expect(component().keyState()).toBe('persistent');
    expect(component().model()).toBe('gpt-x');
  });

  it('shows the GitHub account only for Copilot', () => {
    expect(component().copilotLogin()).toBeNull();
    copilotStatus.set({available: true, authenticated: true, login: 'octocat'});
    expect(component().copilotLogin()).toBe('octocat');

    settings.update(value => ({...value, provider: 'openai'}));
    expect(component().copilotLogin()).toBeNull();
  });

  it('resets the cloud consent immediately', () => {
    enableInForm();
    expect(element('aiConsentState')?.textContent).toContain('settingsDialog.ai.consentGiven');
    const reset = element('aiConsentReset') as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    reset.click();
    fixture.detectChanges();
    expect(aiStore.resetConsent).toHaveBeenCalled();
    expect(reset.disabled).toBe(true);
    expect(element('aiConsentState')?.textContent).toContain('settingsDialog.ai.consentNone');
  });
});
