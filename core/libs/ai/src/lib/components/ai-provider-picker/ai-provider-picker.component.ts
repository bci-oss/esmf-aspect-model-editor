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

import {AiLocalServer, AiProviderChoice, AiProviderKind} from '@ame/domain';
import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoDirective} from '@jsverse/transloco';

/** The providers to choose from as cards, and the model servers found on this computer. */
@Component({
  selector: 'ame-ai-provider-picker',
  templateUrl: './ai-provider-picker.component.html',
  styleUrls: ['./ai-provider-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, TranslocoDirective],
})
export class AiProviderPickerComponent {
  readonly choices = input.required<AiProviderChoice[]>();
  readonly selected = input<AiProviderKind | null>(null);
  readonly localServers = input<AiLocalServer[]>([]);
  /** Shows a short description on each card, e.g. in the settings. */
  readonly detailed = input(false);

  readonly providerSelected = output<AiProviderKind>();
  readonly localServerSelected = output<AiLocalServer>();
}
