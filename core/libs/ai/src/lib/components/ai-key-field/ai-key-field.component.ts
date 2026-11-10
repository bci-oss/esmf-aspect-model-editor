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

import {AiSecretInfo} from '@ame/shared';
import {ChangeDetectionStrategy, Component, input, linkedSignal, model, output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {TranslocoDirective} from '@jsverse/transloco';

/** The API key of a provider: where it is stored, entering, changing or removing it. */
@Component({
  selector: 'ame-ai-key-field',
  templateUrl: './ai-key-field.component.html',
  styleUrls: ['./ai-key-field.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, TranslocoDirective],
})
export class AiKeyFieldComponent {
  readonly info = input<AiSecretInfo>({stored: false, persistent: false});
  readonly saving = input(false);
  /** The key being entered; cleared by the owner once it is stored. */
  readonly key = model('');

  readonly keySubmitted = output<string>();
  readonly keyDeleted = output<void>();

  /** Entering a new key although one is stored; ends whenever the stored key changes. */
  readonly changing = linkedSignal({source: this.info, computation: () => false});

  onKeyInput(event: Event): void {
    this.key.set((event.target as HTMLInputElement).value);
  }

  submit(): void {
    const key = this.key().trim();
    if (!key || this.saving()) return;
    this.keySubmitted.emit(key);
  }

  cancelChange(): void {
    this.changing.set(false);
    this.key.set('');
  }
}
