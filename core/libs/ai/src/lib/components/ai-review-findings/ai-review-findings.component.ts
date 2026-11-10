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

import {aiElementName, AiReviewFinding} from '@ame/domain';
import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoDirective} from '@jsverse/transloco';

const SEVERITY_ORDER = {error: 0, warning: 1, info: 2};
const SEVERITY_ICON = {error: 'error', warning: 'warning', info: 'info'};

/** Findings of a model review, the most severe first; each can be shown in the model or fixed by the assistant. */
@Component({
  selector: 'ame-ai-review-findings',
  templateUrl: './ai-review-findings.component.html',
  styleUrls: ['./ai-review-findings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, TranslocoDirective],
})
export class AiReviewFindingsComponent {
  readonly findings = input<AiReviewFinding[]>([]);
  readonly fixDisabled = input(false);

  readonly elementSelected = output<string>();
  readonly fixRequested = output<AiReviewFinding>();

  readonly sorted = computed(() =>
    [...this.findings()].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)),
  );

  readonly elementName = aiElementName;

  icon(finding: AiReviewFinding): string {
    return SEVERITY_ICON[finding.severity] ?? 'info';
  }
}
