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

import {BarItemComponent} from '@ame/shared';
import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';

/** The AI assistant at the right end of the toolbar: a toggle for the panel and a menu with the actions about the model. */
@Component({
  selector: 'ame-ai-toolbar-button',
  templateUrl: './ai-toolbar-button.component.html',
  styleUrls: ['./ai-toolbar-button.component.scss'],
  imports: [BarItemComponent, MatIconModule, MatMenuModule, MatTooltipModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiToolbarButtonComponent {
  readonly panelOpen = input(false);
  readonly modelEmpty = input(false);

  readonly togglePanel = output<void>();
  readonly review = output<void>();
  readonly examples = output<void>();
  readonly explainModel = output<void>();
  readonly newModel = output<void>();
}
