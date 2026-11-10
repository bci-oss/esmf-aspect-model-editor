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

import {AiChatMessage, AiMessageContextRef, AiToolActivity} from '@ame/domain';
import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {TranslocoDirective} from '@jsverse/transloco';
import {aiContextIcon, AiErrorAction} from '../../utils';
import {AiErrorBannerComponent} from '../ai-error-banner/ai-error-banner.component';
import {AiMarkdownComponent} from '../ai-markdown/ai-markdown.component';

/** A message of the chat; the proposals of the message are projected below the text. */
@Component({
  selector: 'ame-ai-message',
  templateUrl: './ai-message.component.html',
  styleUrls: ['./ai-message.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiErrorBannerComponent, AiMarkdownComponent, MatIconModule, MatProgressSpinner, TranslocoDirective],
})
export class AiMessageComponent {
  readonly message = input.required<AiChatMessage>();

  readonly elementSelected = output<string>();
  readonly errorAction = output<AiErrorAction>();

  /** The tool that runs now, otherwise the last one. */
  readonly tool = computed<AiToolActivity | null>(() => {
    const tools = this.message().tools;
    return tools.find(tool => tool.status === 'started') ?? tools[tools.length - 1] ?? null;
  });
  readonly waiting = computed(() => !!this.message().streaming && !this.message().content && !this.tool());

  contextIcon(ref: AiMessageContextRef): string {
    return aiContextIcon(ref.kind, {fileName: ref.label});
  }
}
