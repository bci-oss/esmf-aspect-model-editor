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

import {ModelSource} from '@ame/domain';
import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {MatIcon} from '@angular/material/icon';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';

/** Header of a workspace or GitHub source in the workspace file list: collapses the source and opens its folder. */
@Component({
  selector: 'ame-workspace-source-header',
  templateUrl: './workspace-source-header.component.html',
  styleUrls: ['./workspace-source-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatTooltip, TranslocoDirective],
})
export class WorkspaceSourceHeaderComponent {
  readonly source = input<ModelSource>();
  readonly readOnly = input(false);
  readonly collapsed = input(false);
  /** Name of the external editor the source folder is opened in. */
  readonly editorName = input.required<string>();

  readonly toggleCollapsed = output<void>();
  readonly openInEditor = output<ModelSource>();
}
