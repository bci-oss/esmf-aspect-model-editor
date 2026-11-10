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

import {AiStore} from '@ame/domain';
import {ExternalLinkDirective} from '@ame/shared';
import {ChangeDetectionStrategy, Component, computed, inject, output} from '@angular/core';
import {FormField} from '@angular/forms/signals';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSlideToggle} from '@angular/material/slide-toggle';
import {TranslocoDirective} from '@jsverse/transloco';
import {SettingsFormService} from '../../../services';
import {AiConnectionState, AiConnectionSummaryComponent, AiKeyState} from './ai-connection-summary/ai-connection-summary.component';
import {AiSettingsStepComponent} from './ai-settings-step/ai-settings-step.component';

export const AI_ASSISTANT_DOCS_URL = 'https://eclipse-esmf.github.io/ame-guide/getting-started/ai-assistant.html';

/** What the assistant can do, as listed in the introduction of the settings. */
export const AI_CAPABILITIES = ['ask', 'fix', 'describe', 'review', 'examples', 'generate'] as const;

/**
 * The AI settings as a guided flow: what the assistant does, then enable it, connect a provider (set up in the assistant
 * panel), decide which data may leave the computer and choose the target languages.
 */
@Component({
  selector: 'ame-ai-configuration',
  templateUrl: './ai-configuration.component.html',
  styleUrls: ['../editor-configuration/editor-configuration.component.scss', './ai-configuration.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AiConnectionSummaryComponent,
    AiSettingsStepComponent,
    ExternalLinkDirective,
    FormField,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggle,
    TranslocoDirective,
  ],
})
export class AiConfigurationComponent {
  private readonly formService = inject(SettingsFormService);
  private readonly aiStore = inject(AiStore);

  /** Saves the settings and opens the setup in the assistant panel; handled by the settings dialog. */
  readonly openSetup = output<void>();

  readonly form = this.formService.settingsForm;
  readonly docsUrl = AI_ASSISTANT_DOCS_URL;
  readonly capabilities = AI_CAPABILITIES;

  /** Enabled in the form, i.e. possibly not saved yet. */
  readonly enabled = computed(() => this.formService.settingsModel().aiConfiguration.enabled);

  readonly provider = computed(() => this.aiStore.settings().provider ?? null);
  readonly model = computed(() => this.aiStore.settings().model || null);
  readonly connectionState = computed<AiConnectionState>(() => {
    if (!this.provider()) return 'none';
    return this.aiStore.configured() ? 'ready' : 'incomplete';
  });
  readonly keyState = computed<AiKeyState>(() => {
    if (!this.provider() || !this.aiStore.requiresKey()) return 'notNeeded';
    const {stored, persistent} = this.aiStore.keyInfo();
    if (!stored) return 'missing';
    return persistent ? 'persistent' : 'session';
  });
  readonly copilotLogin = computed(() => {
    const status = this.aiStore.copilotStatus();
    return this.provider() === 'copilot' && status?.authenticated ? (status.login ?? null) : null;
  });

  /** Cloud providers the user agreed to send model data to; the consent is reset immediately. */
  readonly consentedProviders = computed(() => this.aiStore.settings().cloudConsent);

  constructor() {
    // The status of the connection (key, Copilot account) is only loaded while the assistant is active.
    if (this.aiStore.enabled()) this.aiStore.loadSetup();
  }

  resetConsent(): void {
    this.aiStore.resetConsent();
  }
}
