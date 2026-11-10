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

import {ChangeDetectionStrategy, Component, input} from '@angular/core';

/** A numbered block of the AI settings; greyed out with an explanation while it is not available. */
@Component({
  selector: 'ame-ai-settings-step',
  templateUrl: './ai-settings-step.component.html',
  styleUrls: ['./ai-settings-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ai-settings-step',
    role: 'group',
    '[class.ai-settings-step--disabled]': 'disabled()',
    '[attr.aria-disabled]': 'disabled()',
    '[attr.aria-label]': 'title()',
  },
})
export class AiSettingsStepComponent {
  readonly step = input.required<number>();
  readonly title = input.required<string>();
  readonly description = input('');
  readonly disabled = input(false);
  /** Shown instead of the content while the step is disabled. */
  readonly disabledHint = input('');
}
