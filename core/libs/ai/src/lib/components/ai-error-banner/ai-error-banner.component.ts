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

import {AiError} from '@ame/domain';
import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoDirective} from '@jsverse/transloco';
import {AiErrorAction, aiErrorView} from '../../utils';

/** A friendly message for an error of the assistant with the actions that may help. */
@Component({
  selector: 'ame-ai-error-banner',
  templateUrl: './ai-error-banner.component.html',
  styleUrls: ['./ai-error-banner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, TranslocoDirective],
})
export class AiErrorBannerComponent {
  readonly error = input.required<AiError>();
  readonly dismissible = input(true);

  readonly action = output<AiErrorAction>();
  readonly dismissed = output<void>();

  readonly view = computed(() => aiErrorView(this.error()));
}
