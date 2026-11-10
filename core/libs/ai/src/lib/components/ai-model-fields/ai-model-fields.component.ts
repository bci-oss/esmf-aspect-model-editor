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

import {AiModelInfo} from '@ame/domain';
import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoDirective} from '@jsverse/transloco';

/** The base URL of the provider, if it needs one, and the model: chosen from the known models or typed in. */
@Component({
  selector: 'ame-ai-model-fields',
  templateUrl: './ai-model-fields.component.html',
  styleUrls: ['./ai-model-fields.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule, TranslocoDirective],
})
export class AiModelFieldsComponent {
  readonly showBaseUrl = input(false);
  readonly baseUrl = input<string | undefined>(undefined);
  readonly model = input<string | undefined>(undefined);
  readonly models = input<AiModelInfo[]>([]);

  /** The trimmed base URL; `undefined` when it was cleared. */
  readonly baseUrlChanged = output<string | undefined>();
  /** The trimmed model id. */
  readonly modelSelected = output<string>();

  onBaseUrlChange(event: Event): void {
    this.baseUrlChanged.emit((event.target as HTMLInputElement).value.trim() || undefined);
  }

  onModelChange(event: Event): void {
    this.selectModel((event.target as HTMLInputElement).value);
  }

  selectModel(model: string): void {
    this.modelSelected.emit(model.trim());
  }
}
