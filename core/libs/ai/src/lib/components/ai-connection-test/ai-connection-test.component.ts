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

import {AiTestResult} from '@ame/domain';
import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {TranslocoDirective} from '@jsverse/transloco';
import {aiErrorView} from '../../utils';

/** Tests the connection to the provider and shows the result; optionally finishes the setup. */
@Component({
  selector: 'ame-ai-connection-test',
  templateUrl: './ai-connection-test.component.html',
  styleUrls: ['./ai-connection-test.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinner, TranslocoDirective],
})
export class AiConnectionTestComponent {
  readonly testing = input(false);
  readonly result = input<AiTestResult | null>(null);
  /** Offers to finish the setup, e.g. once the provider is configured. */
  readonly finishable = input(false);

  readonly testRequested = output<void>();
  readonly finished = output<void>();

  readonly errorView = computed(() => {
    const result = this.result();
    return result && !result.ok ? aiErrorView({code: result.code ?? 'provider_error', message: result.message ?? ''}) : null;
  });
}
