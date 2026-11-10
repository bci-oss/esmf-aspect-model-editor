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

import {AiPayloadVariant} from '@ame/domain';
import {ClipboardService, FileSaverService} from '@ame/shared';
import {ChangeDetectionStrategy, Component, computed, inject, input, signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoDirective} from '@jsverse/transloco';

/** Example payloads with one tab per variant; each can be copied or saved as JSON file. */
@Component({
  selector: 'ame-ai-payload-view',
  templateUrl: './ai-payload-view.component.html',
  styleUrls: ['./ai-payload-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, TranslocoDirective],
})
export class AiPayloadViewComponent {
  private readonly clipboard = inject(ClipboardService);
  private readonly fileSaver = inject(FileSaverService);

  readonly variants = input<AiPayloadVariant[]>([]);
  /** Base of the file name, e.g. the aspect name. */
  readonly fileBaseName = input('payload');

  readonly selectedIndex = signal(0);
  readonly selected = computed<AiPayloadVariant | null>(() => this.variants()[this.selectedIndex()] ?? this.variants()[0] ?? null);
  readonly formatted = computed(() => formatJson(this.selected()?.json ?? ''));

  copy(): void {
    this.clipboard.copy(this.formatted());
  }

  save(): void {
    const variant = this.selected();
    if (!variant) return;
    const name = `${this.fileBaseName()}-${variant.name}`.replace(/[^\w.-]+/g, '-');
    this.fileSaver.download(new Blob([this.formatted()], {type: 'application/json'}), `${name}.json`);
  }
}

function formatJson(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}
