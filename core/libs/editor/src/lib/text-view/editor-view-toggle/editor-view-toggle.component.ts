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

import {Component, inject} from '@angular/core';
import {MatButtonToggleChange, MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {EditorViewMode, EditorViewModeService} from '../services/editor-view-mode.service';

/** Switches the editor between the MaxGraph view and the textual (Turtle) view of the aspect model. */
@Component({
  selector: 'ame-editor-view-toggle',
  templateUrl: './editor-view-toggle.component.html',
  styleUrls: ['./editor-view-toggle.component.scss'],
  imports: [MatButtonToggleModule, MatIconModule, MatTooltipModule, TranslocoDirective],
})
export class EditorViewToggleComponent {
  protected readonly viewMode = inject(EditorViewModeService);

  onChange(event: MatButtonToggleChange): void {
    this.viewMode.setMode(event.value as EditorViewMode);
  }
}
