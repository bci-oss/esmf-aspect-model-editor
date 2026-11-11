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

import {AI_PROVIDER_KINDS, AiSecretInfo, DEFAULT_AI_SETTINGS} from '@ame/shared';
import {computed, inject, Injectable, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {catchError, defaultIfEmpty, finalize, forkJoin, from, map, Observable, of, Subscription, switchMap, tap} from 'rxjs';
import {
  AI_PROVIDER_TRAITS,
  AiError,
  AiLocalServer,
  AiModelInfo,
  AiProviderConfig,
  AiProviderInfo,
  AiProviderKind,
  AiSettings,
  AiTestResult,
  asAiError,
  CopilotLoginFlow,
  CopilotStatus,
  isLocalProvider,
} from '../../model-api';
import {AiSecretStorePort} from '../../ports/ai-secret-store.port';
import {AiPort} from '../../ports/ai.port';
import {ConfigurationService} from '../settings/configuration.service';
import {AiErrorStore} from './ai-error.store';
import {AiCopilotLoginState, AiProviderChoice} from './ai.models';

const NO_KEY: AiSecretInfo = {stored: false, persistent: false};

/**
 * Settings and setup of the assistant: the provider, its API key or Copilot account, the models and the connection test.
 * Everything is inactive while the assistant is disabled in the settings.
 */
@Injectable({providedIn: 'root'})
export class AiSetupStore {
  private readonly api = inject(AiPort, {optional: true});
  private readonly secrets = inject(AiSecretStorePort, {optional: true});
  private readonly configuration = inject(ConfigurationService);
  private readonly errors = inject(AiErrorStore);

  private readonly allSettings = toSignal(this.configuration.settings$, {initialValue: this.configuration.getSettings()});
  private loginSubscription: Subscription | null = null;

  private readonly providersState = signal<AiProviderInfo[]>([]);
  private readonly localServersState = signal<AiLocalServer[]>([]);
  private readonly modelsState = signal<AiModelInfo[]>([]);
  private readonly copilotStatusState = signal<CopilotStatus | null>(null);
  private readonly keyInfoState = signal<AiSecretInfo>(NO_KEY);
  private readonly setupLoadingState = signal(false);
  private readonly savingKeyState = signal(false);
  private readonly testingState = signal(false);
  private readonly testResultState = signal<AiTestResult | null>(null);
  private readonly loginFlowState = signal<CopilotLoginFlow | null>(null);
  private readonly loginStateState = signal<AiCopilotLoginState>('idle');
  private readonly loginErrorState = signal<AiError | null>(null);
  private readonly setupRequestedState = signal(false);

  readonly providers = this.providersState.asReadonly();
  readonly localServers = this.localServersState.asReadonly();
  readonly models = this.modelsState.asReadonly();
  readonly copilotStatus = this.copilotStatusState.asReadonly();
  readonly keyInfo = this.keyInfoState.asReadonly();
  readonly setupLoading = this.setupLoadingState.asReadonly();
  readonly savingKey = this.savingKeyState.asReadonly();
  readonly testing = this.testingState.asReadonly();
  readonly testResult = this.testResultState.asReadonly();
  readonly loginFlow = this.loginFlowState.asReadonly();
  readonly loginState = this.loginStateState.asReadonly();
  readonly loginError = this.loginErrorState.asReadonly();
  /** The user opened the setup although the assistant is configured, e.g. to change the provider. */
  readonly setupRequested = this.setupRequestedState.asReadonly();

  readonly settings = computed<AiSettings>(() => ({...DEFAULT_AI_SETTINGS, ...(this.allSettings()?.ai ?? {})}));
  readonly enabled = computed(() => this.settings().enabled);
  readonly providerKind = computed(() => this.settings().provider);
  readonly providerConfig = computed<AiProviderConfig | null>(() => {
    const {provider, model, baseUrl, apiVersion} = this.settings();
    if (!provider) return null;
    return {
      kind: provider,
      ...(model ? {model} : {}),
      ...(baseUrl ? {baseUrl} : {}),
      ...(provider === 'azure-openai' && apiVersion ? {apiVersion} : {}),
    };
  });
  readonly isLocal = computed(() => isLocalProvider(this.settings().provider, this.settings().baseUrl));
  /** Model data would leave the computer and the user has not agreed yet. */
  readonly consentRequired = computed(() => {
    const {provider, cloudConsent} = this.settings();
    return !!provider && !this.isLocal() && !cloudConsent.includes(provider);
  });
  /** The providers offered in the setup; with "only local" just the local ones. */
  readonly providerChoices = computed<AiProviderChoice[]>(() => {
    const infos = this.providers();
    const onlyLocal = this.settings().onlyLocal;
    const kinds = infos.length ? infos.map(info => info.kind) : [...AI_PROVIDER_KINDS];
    return kinds
      .map(kind => {
        const info = infos.find(provider => provider.kind === kind);
        return {
          kind,
          recommended: !!AI_PROVIDER_TRAITS[kind]?.recommended,
          local: info?.local ?? !!AI_PROVIDER_TRAITS[kind]?.local,
          available: info?.available ?? (kind !== 'copilot' || !!this.copilotStatus()?.available),
        };
      })
      .filter(choice => !onlyLocal || choice.local || choice.kind === 'openai-compatible');
  });
  readonly providerInfo = computed(() => this.providers().find(info => info.kind === this.providerKind()) ?? null);
  readonly requiresKey = computed(() => {
    const kind = this.providerKind();
    return this.providerInfo()?.requiresKey ?? !!(kind && AI_PROVIDER_TRAITS[kind]?.requiresKey);
  });
  readonly requiresBaseUrl = computed(() => {
    const kind = this.providerKind();
    return this.providerInfo()?.requiresBaseUrl ?? !!(kind && AI_PROVIDER_TRAITS[kind]?.requiresBaseUrl);
  });
  /** The provider is chosen and has everything it needs to answer. */
  readonly configured = computed(() => {
    const kind = this.providerKind();
    if (!kind) return false;
    if (kind === 'copilot') return !!this.copilotStatus()?.authenticated;
    if (this.requiresKey() && !this.keyInfo().stored) return false;
    return !this.requiresBaseUrl() || !!this.settings().baseUrl;
  });
  readonly showSetup = computed(() => !this.configured() || this.setupRequested());

  /**
   * Loads everything the setup needs; the requests that fail leave their part empty.
   * Calls while the setup is loaded are ignored, so every part that needs the setup may ask for it.
   */
  loadSetup(): void {
    if (!this.api || this.setupLoading()) return;
    this.setupLoadingState.set(true);
    const load = <T>(request: Observable<T>, apply: (value: T) => void) =>
      request.pipe(
        tap(apply),
        catchError(() => of(null)),
        defaultIfEmpty(null),
      );
    forkJoin([
      load(this.api.getProviders(), providers => this.providersState.set(providers ?? [])),
      load(this.api.getLocalServers(), servers => this.localServersState.set(servers ?? [])),
      load(this.api.getCopilotStatus(), status => this.copilotStatusState.set(status)),
    ])
      .pipe(finalize(() => this.setupLoadingState.set(false)))
      .subscribe();
    this.refreshKeyInfo();
  }

  /** The status of the connection (key, Copilot account) is only loaded while the assistant is enabled. */
  loadSetupIfEnabled(): void {
    if (this.enabled()) this.loadSetup();
  }

  updateSettings(patch: Partial<AiSettings>): void {
    const settings = this.configuration.getSettings();
    this.configuration.setSettings({...settings, ai: {...this.settings(), ...patch}});
  }

  setEnabled(enabled: boolean): void {
    this.updateSettings({enabled});
  }

  /** Chooses the provider; the model of the previous provider is not taken over. */
  selectProvider(kind: AiProviderKind, options: {baseUrl?: string; model?: string} = {}): void {
    const info = this.providers().find(provider => provider.kind === kind);
    this.updateSettings({
      provider: kind,
      model: options.model ?? info?.defaultModel,
      baseUrl: options.baseUrl ?? info?.defaultBaseUrl,
    });
    this.testResultState.set(null);
    this.modelsState.set([]);
    this.refreshKeyInfo();
  }

  selectModel(model: string): void {
    this.updateSettings({model});
  }

  setBaseUrl(baseUrl: string | undefined): void {
    this.updateSettings({baseUrl});
  }

  openSetup(): void {
    this.setupRequestedState.set(true);
    this.loadSetup();
  }

  closeSetup(): void {
    this.setupRequestedState.set(false);
  }

  /** Keeps the setup open once the user changed it, so that the connection can still be tested when it is complete. */
  keepSetupOpen(): void {
    this.setupRequestedState.set(true);
  }

  /** The user agrees to send model data to the chosen cloud provider. */
  grantCloudConsent(): void {
    const kind = this.providerKind();
    if (kind) this.updateSettings({cloudConsent: [...new Set([...this.settings().cloudConsent, kind])]});
  }

  resetConsent(): void {
    this.updateSettings({cloudConsent: []});
  }

  /** Stores the key of the provider and tests the connection with it; `true` once it is stored. */
  async saveKey(key: string): Promise<boolean> {
    const kind = this.providerKind();
    if (!kind || !this.secrets) return false;
    this.savingKeyState.set(true);
    try {
      await this.secrets.set(kind, key.trim());
      this.keyInfoState.set(await this.secrets.info(kind));
    } catch {
      return false;
    } finally {
      this.savingKeyState.set(false);
    }
    this.testConnection();
    return true;
  }

  deleteKey(): void {
    const kind = this.providerKind();
    if (!kind || !this.secrets) return;
    from(this.secrets.delete(kind)).subscribe(() => this.keyInfoState.set(NO_KEY));
  }

  testConnection(): void {
    const provider = this.providerConfig();
    if (!provider || !this.api) return;
    this.testingState.set(true);
    this.testResultState.set(null);
    this.apiKey(provider.kind)
      .pipe(
        switchMap(key => this.api.test(provider, key)),
        catchError(error => of<AiTestResult>({ok: false, ...asAiError(error)})),
        finalize(() => this.testingState.set(false)),
      )
      .subscribe(result => {
        this.testResultState.set(result);
        if (result.models?.length) this.modelsState.set(result.models);
      });
  }

  loadModels(): void {
    const provider = this.providerConfig();
    if (!provider || !this.api) return;
    this.apiKey(provider.kind)
      .pipe(
        switchMap(key => this.api.getModels(provider, key)),
        catchError(() => of<AiModelInfo[]>([])),
      )
      .subscribe(models => this.modelsState.set(models ?? []));
  }

  /** Starts the device flow of GitHub and waits until the user authorized the code. */
  startCopilotLogin(): void {
    if (!this.api) return;
    this.cancelLoginWait();
    this.loginErrorState.set(null);
    this.loginStateState.set('starting');
    this.loginSubscription = this.api
      .startCopilotLogin()
      .pipe(
        tap(flow => {
          this.loginFlowState.set(flow);
          this.loginStateState.set('waiting');
        }),
        switchMap(flow => this.api.completeCopilotLogin(flow.flowId)),
      )
      .subscribe({
        next: status => {
          this.copilotStatusState.set(status);
          this.loginFlowState.set(null);
          this.loginStateState.set('idle');
        },
        error: error => {
          const aiError = asAiError(error);
          this.loginFlowState.set(null);
          // without device flow the user pastes a token instead
          this.loginStateState.set(aiError.code === 'provider_error' && this.loginState() === 'starting' ? 'unsupported' : 'failed');
          this.loginErrorState.set(aiError);
        },
      });
  }

  cancelCopilotLogin(): void {
    const flow = this.loginFlow();
    this.cancelLoginWait();
    this.loginFlowState.set(null);
    this.loginStateState.set('idle');
    if (flow && this.api) this.api.cancelCopilotLogin(flow.flowId).subscribe({error: () => undefined});
  }

  /** The fallback when the device flow is not possible: a GitHub token with Copilot access. */
  setCopilotToken(token: string): void {
    if (!this.api) return;
    this.loginErrorState.set(null);
    this.api.setCopilotToken(token.trim()).subscribe({
      next: status => {
        this.copilotStatusState.set(status);
        this.loginStateState.set('idle');
      },
      error: error => this.loginErrorState.set(asAiError(error)),
    });
  }

  logoutCopilot(): void {
    this.api?.logoutCopilot().subscribe({
      next: status => this.copilotStatusState.set(status),
      error: error => this.errors.report(asAiError(error)),
    });
  }

  /** The stored API key of the provider; Copilot and local providers have none. */
  apiKey(kind: AiProviderKind): Observable<string | undefined> {
    if (!this.secrets || kind === 'copilot') return of(undefined);
    return from(this.secrets.get(kind)).pipe(
      map(key => key ?? undefined),
      catchError(() => of(undefined)),
    );
  }

  private refreshKeyInfo(): void {
    const kind = this.providerKind();
    if (!kind || !this.secrets || kind === 'copilot') {
      this.keyInfoState.set(NO_KEY);
      return;
    }
    from(this.secrets.info(kind))
      .pipe(catchError(() => of<AiSecretInfo>(NO_KEY)))
      .subscribe(info => this.keyInfoState.set(info));
  }

  private cancelLoginWait(): void {
    this.loginSubscription?.unsubscribe();
    this.loginSubscription = null;
  }
}
