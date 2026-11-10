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

import {AiConversationSummary} from '@ame/domain';
import {DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, input, output, signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';

/** The saved conversations, the newest first. */
@Component({
  selector: 'ame-ai-conversation-list',
  templateUrl: './ai-conversation-list.component.html',
  styleUrls: ['./ai-conversation-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatTooltip, TranslocoDirective],
})
export class AiConversationListComponent {
  readonly conversations = input<AiConversationSummary[]>([]);
  readonly activeId = input<string | null>(null);

  readonly opened = output<string>();
  readonly created = output<void>();
  readonly renamed = output<{id: string; title: string}>();
  readonly deleted = output<string>();
  readonly cleared = output<void>();

  readonly renamingId = signal<string | null>(null);
  readonly confirmClear = signal(false);

  finishRename(id: string, title: string): void {
    if (this.renamingId() !== id) return;
    this.renamingId.set(null);
    const trimmed = title.trim();
    if (trimmed) this.renamed.emit({id, title: trimmed});
  }

  onRenameKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.finishRename(id, (event.target as HTMLInputElement).value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.renamingId.set(null);
    }
  }

  clear(): void {
    this.confirmClear.set(false);
    this.cleared.emit();
  }
}
