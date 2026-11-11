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

import {AiLocalServer, AiProviderKind, AiSetupInputs, AiSetupStore} from '@ame/domain';
import {ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal} from '@angular/core';
import {TranslocoDirective} from '@jsverse/transloco';
import {AiConnectionTestComponent} from '../../components/ai-connection-test/ai-connection-test.component';
import {AiCopilotLoginComponent} from '../../components/ai-copilot-login/ai-copilot-login.component';
import {AiKeyFieldComponent} from '../../components/ai-key-field/ai-key-field.component';
import {AiModelFieldsComponent} from '../../components/ai-model-fields/ai-model-fields.component';
import {AiProviderPickerComponent} from '../../components/ai-provider-picker/ai-provider-picker.component';

/** Guides through choosing a provider, signing in or storing the key, and testing the connection. */
@Component({
  selector: 'ame-ai-setup',
  templateUrl: './ai-setup.component.html',
  styleUrls: ['./ai-setup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AiConnectionTestComponent,
    AiCopilotLoginComponent,
    AiKeyFieldComponent,
    AiModelFieldsComponent,
    AiProviderPickerComponent,
    TranslocoDirective,
  ],
})
export class AiSetupComponent implements OnInit {
  readonly store = inject(AiSetupStore);

  /** In the settings the setup is embedded without its title and "Done" button. */
  readonly variant = input<NonNullable<AiSetupInputs['variant']>>('panel');

  readonly keyInput = signal('');

  readonly kind = this.store.providerKind;
  readonly inSettings = computed(() => this.variant() === 'settings');
  readonly showBaseUrl = computed(() => this.store.requiresBaseUrl() || this.store.isLocal() || this.kind() === 'azure-openai');

  ngOnInit(): void {
    this.store.loadSetup();
  }

  choose(kind: AiProviderKind): void {
    if (kind === this.kind()) return;
    this.store.keepSetupOpen();
    this.keyInput.set('');
    this.store.selectProvider(kind);
  }

  useLocalServer(server: AiLocalServer): void {
    this.store.keepSetupOpen();
    this.store.selectProvider(server.kind, {baseUrl: server.baseUrl, model: server.models[0]});
  }

  async saveKey(key: string): Promise<void> {
    this.store.keepSetupOpen();
    if (await this.store.saveKey(key)) this.keyInput.set('');
  }

  login(): void {
    this.store.keepSetupOpen();
    this.store.startCopilotLogin();
  }

  saveToken(token: string): void {
    this.store.keepSetupOpen();
    this.store.setCopilotToken(token);
  }

  updateBaseUrl(baseUrl: string | undefined): void {
    this.store.setBaseUrl(baseUrl);
  }

  finish(): void {
    this.store.closeSetup();
  }
}
