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

import {AiCopilotLoginState, AiError, CopilotLoginFlow, CopilotStatus} from '@ame/domain';
import {ChangeDetectionStrategy, Component, computed, input, output, signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {TranslocoDirective} from '@jsverse/transloco';
import {aiErrorView} from '../../utils';
import {AiDeviceCodeComponent} from '../ai-device-code/ai-device-code.component';

/** Signing in to GitHub Copilot: the device flow, or pasting a token where the flow is not supported. */
@Component({
  selector: 'ame-ai-copilot-login',
  templateUrl: './ai-copilot-login.component.html',
  styleUrls: ['./ai-copilot-login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiDeviceCodeComponent, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, TranslocoDirective],
})
export class AiCopilotLoginComponent {
  readonly status = input<CopilotStatus | null>(null);
  readonly flow = input<CopilotLoginFlow | null>(null);
  readonly state = input<AiCopilotLoginState>('idle');
  readonly error = input<AiError | null>(null);

  readonly loginRequested = output<void>();
  readonly logoutRequested = output<void>();
  readonly loginCancelled = output<void>();
  readonly tokenSubmitted = output<string>();

  readonly tokenInput = signal('');
  readonly tokenPasteOpen = signal(false);

  readonly showTokenPaste = computed(() => this.tokenPasteOpen() || this.state() === 'unsupported');
  readonly errorView = computed(() => {
    const error = this.error();
    return error ? aiErrorView(error) : null;
  });

  onTokenInput(event: Event): void {
    this.tokenInput.set((event.target as HTMLInputElement).value);
  }

  saveToken(): void {
    const token = this.tokenInput().trim();
    if (!token) return;
    this.tokenSubmitted.emit(token);
    this.tokenInput.set('');
  }
}
