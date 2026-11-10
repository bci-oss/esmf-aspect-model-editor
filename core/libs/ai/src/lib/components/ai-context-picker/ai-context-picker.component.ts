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

import {AiContextCandidate, AiContextCandidateGroup, filterContextCandidates} from '@ame/domain';
import {NgTemplateOutlet} from '@angular/common';
import {afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {aiContextIcon} from '../../utils';

/** Lets the user choose a whole source, a namespace folder, a version folder or a model file of the workspace or of GitHub as context. */
@Component({
  selector: 'ame-ai-context-picker',
  templateUrl: './ai-context-picker.component.html',
  styleUrls: ['./ai-context-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, MatButtonModule, MatIconModule, MatProgressSpinner, MatTooltip, TranslocoDirective],
})
export class AiContextPickerComponent {
  readonly groups = input<AiContextCandidateGroup[]>([]);
  readonly loading = input(false);

  readonly picked = output<AiContextCandidate>();
  readonly closed = output<void>();

  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  /** Indentation per level of the folder tree in pixels. */
  readonly indentWidth = 16;

  readonly query = signal('');
  readonly filtered = computed(() => filterContextCandidates(this.groups(), this.query()));

  constructor() {
    afterNextRender(() => this.search()?.nativeElement.focus());
  }

  icon(candidate: AiContextCandidate): string {
    return candidate.kind === 'namespace' ? (candidate.depth === 0 ? 'folder' : 'folder_open') : aiContextIcon(candidate.kind);
  }
}
