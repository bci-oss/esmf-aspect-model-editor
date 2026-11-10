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

import {AiCommand} from '@ame/domain';
import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoDirective} from '@jsverse/transloco';

/** A suggestion to start a conversation with. */
export interface AiStarter {
  command: AiCommand;
  /** Key of `ai.starters`. */
  key: string;
  icon: string;
}

export const AI_STARTERS: readonly AiStarter[] = [
  {command: 'explain', key: 'explain', icon: 'school'},
  {command: 'review', key: 'review', icon: 'fact_check'},
  {command: 'examples', key: 'examples', icon: 'data_object'},
  {command: 'generate', key: 'generate', icon: 'note_add'},
];

/** The welcome of an empty conversation with starters; only generating works without an open model. */
@Component({
  selector: 'ame-ai-welcome',
  templateUrl: './ai-welcome.component.html',
  styleUrls: ['./ai-welcome.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, TranslocoDirective],
})
export class AiWelcomeComponent {
  readonly modelOpen = input(false);
  readonly started = output<AiStarter>();

  readonly starters = AI_STARTERS;
}
