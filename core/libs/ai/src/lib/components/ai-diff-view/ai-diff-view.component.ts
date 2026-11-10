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

import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {TranslocoDirective} from '@jsverse/transloco';
import {diffHunks, diffLines, diffStats} from '../../utils';

/** Line diff of the open model and the proposed model; unchanged parts are collapsed. */
@Component({
  selector: 'ame-ai-diff-view',
  templateUrl: './ai-diff-view.component.html',
  styleUrls: ['./ai-diff-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoDirective],
})
export class AiDiffViewComponent {
  readonly original = input('');
  readonly proposed = input('');

  private readonly lines = computed(() => diffLines(this.original(), this.proposed()));
  readonly hunks = computed(() => diffHunks(this.lines()));
  readonly stats = computed(() => diffStats(this.lines()));
}
