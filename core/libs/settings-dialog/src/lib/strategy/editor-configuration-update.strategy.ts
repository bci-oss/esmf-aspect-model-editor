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

import {MaxGraphService} from '@ame/max-graph';
import {Settings} from '@ame/settings-dialog';
import {inject, Injectable} from '@angular/core';
import {FormGroup} from '@angular/forms';
import {SettingsUpdateStrategy} from './settings-update.strategy';

@Injectable({providedIn: 'root'})
export class EditorConfigurationUpdateStrategy implements SettingsUpdateStrategy {
  private maxgraphService = inject(MaxGraphService);

  updateSettings(form: FormGroup, settings: Settings): void {
    const editorConfiguration = form.get('editorConfiguration');
    if (!editorConfiguration) return;

    settings.enableHierarchicalLayout = editorConfiguration.get('enableHierarchicalLayout')?.value;
    settings.showConnectionLabels = editorConfiguration.get('showConnectionLabels')?.value;

    this.maxgraphService.formatShapes(true);
  }
}
