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

import {describeSourceError, ModelSourcesPort, ModelSourcesStore} from '@ame/domain';
import {NotificationsService} from '@ame/shared';
import {ChangeDetectionStrategy, Component, inject, OnInit, signal} from '@angular/core';
import {MatButton, MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {WorkspacesDraftService} from '../../../services/workspaces-draft.service';

/**
 * Local workspaces: the default `models` folder is always there; more folders can be added. Changes are only queued in
 * the {@link WorkspacesDraftService} and run when the settings dialog is confirmed with Apply or OK.
 */
@Component({
  selector: 'ame-workspaces-settings',
  templateUrl: './workspaces-settings.component.html',
  styleUrls: ['../model-sources.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIconButton, MatIcon, MatTooltip, TranslocoDirective],
})
export class WorkspacesSettingsComponent implements OnInit {
  readonly store = inject(ModelSourcesStore);
  readonly draft = inject(WorkspacesDraftService);
  private readonly api = inject(ModelSourcesPort, {optional: true});
  private readonly notifications = inject(NotificationsService);
  private readonly transloco = inject(TranslocoService);

  readonly canPickDirectory = !!this.api?.canPickDirectory();
  readonly loadError = signal('');

  ngOnInit(): void {
    this.store.refresh().subscribe({
      next: () => this.loadError.set(''),
      error: error => this.loadError.set(describeSourceError(error) || this.transloco.translate('modelSources.loadError')),
    });
  }

  pickDirectory(): void {
    this.api?.pickDirectory(this.transloco.translate('modelSources.workspaces.pickTitle')).subscribe(path => {
      if (!path) return;
      const existing = this.store.workspaces().map(workspace => workspace.path);
      if (!this.draft.add(path, existing)) {
        this.notifications.info({title: this.transloco.translate('modelSources.workspaces.duplicate', {name: path})});
      }
    });
  }
}
