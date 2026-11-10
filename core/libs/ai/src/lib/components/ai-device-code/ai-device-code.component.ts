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

import {CopilotLoginFlow} from '@ame/domain';
import {ClipboardService, ExternalLinkDirective} from '@ame/shared';
import {ChangeDetectionStrategy, Component, inject, input, output, signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {TranslocoDirective} from '@jsverse/transloco';

/** The code of the GitHub device login: copy it, open GitHub, enter it there; the app waits meanwhile. */
@Component({
  selector: 'ame-ai-device-code',
  templateUrl: './ai-device-code.component.html',
  styleUrls: ['./ai-device-code.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ExternalLinkDirective, MatButtonModule, MatIconModule, MatProgressSpinner, TranslocoDirective],
})
export class AiDeviceCodeComponent {
  private readonly clipboard = inject(ClipboardService);

  readonly flow = input.required<CopilotLoginFlow>();
  readonly cancelled = output<void>();

  readonly copied = signal(false);

  copy(): void {
    this.clipboard.copy(this.flow().userCode);
    this.copied.set(true);
  }
}
