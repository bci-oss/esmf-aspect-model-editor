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
import {MatButtonModule} from '@angular/material/button';
import {MatDividerModule} from '@angular/material/divider';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';

/** The header of the panel: conversations, title, provider and model, new conversation and close. */
@Component({
  selector: 'ame-ai-panel-header',
  templateUrl: './ai-panel-header.component.html',
  styleUrls: ['./ai-panel-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule, MatTooltip, TranslocoDirective],
})
export class AiPanelHeaderComponent {
  /** The title of the conversation; the panel title when missing. */
  readonly title = input<string | null>(null);
  /** The label of the provider; without one no provider menu is shown. */
  readonly providerLabel = input('');
  readonly model = input<string | undefined>(undefined);
  readonly models = input<AiModelInfo[]>([]);
  readonly conversationsOpen = input(false);

  readonly conversationsToggled = output<void>();
  readonly providerMenuOpened = output<void>();
  readonly modelSelected = output<string>();
  readonly setupRequested = output<void>();
  readonly conversationCreated = output<void>();
  readonly closeRequested = output<void>();
}
