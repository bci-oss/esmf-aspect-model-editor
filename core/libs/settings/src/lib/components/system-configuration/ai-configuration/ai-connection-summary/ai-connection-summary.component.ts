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

import {AiProviderKind} from '@ame/shared';
import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoDirective} from '@jsverse/transloco';

/** How far the connection of the assistant is set up. */
export type AiConnectionState = 'none' | 'incomplete' | 'ready';
/** Where the API key of the provider is; "notNeeded" for Copilot and local providers. */
export type AiKeyState = 'notNeeded' | 'missing' | 'persistent' | 'session';

/** Shows the provider, the model and whether the assistant can answer, as set up in the assistant panel. */
@Component({
  selector: 'ame-ai-connection-summary',
  templateUrl: './ai-connection-summary.component.html',
  styleUrls: ['./ai-connection-summary.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoDirective],
})
export class AiConnectionSummaryComponent {
  readonly provider = input<AiProviderKind | null>(null);
  readonly model = input<string | null>(null);
  readonly state = input<AiConnectionState>('none');
  readonly keyState = input<AiKeyState>('notNeeded');
  /** GitHub login while Copilot is the provider; null if not signed in or not known. */
  readonly copilotLogin = input<string | null>(null);
}
