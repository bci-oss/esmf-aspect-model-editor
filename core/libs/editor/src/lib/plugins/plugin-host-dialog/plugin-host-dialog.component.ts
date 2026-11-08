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

import {PluginStatus} from '@ame/domain';
import {DialogCloseButtonComponent} from '@ame/shared';
import {Component, computed, effect, ElementRef, inject, resource, untracked, viewChild} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {TranslocoDirective} from '@jsverse/transloco';
import {PluginHostFactory} from '../plugin-host.factory';
import {PluginElement, PluginHostContext} from '../plugin-host.model';
import {PluginModuleLoader, PluginVersionChangedError} from '../plugin-module-loader.service';

export interface PluginHostDialogData {
  plugin: PluginStatus;
  context: PluginHostContext;
  title: string;
}

type HostState = 'loading' | 'ready' | 'versionChanged' | 'loadError';

/** Shows the custom element of a plugin; the element brings its own content and actions. */
@Component({
  templateUrl: './plugin-host-dialog.component.html',
  styleUrls: ['./plugin-host-dialog.component.scss'],
  imports: [DialogCloseButtonComponent, MatDialogModule, MatProgressSpinnerModule, TranslocoDirective],
})
export class PluginHostDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<PluginHostDialogComponent>);
  private readonly loader = inject(PluginModuleLoader);
  private readonly hostFactory = inject(PluginHostFactory);
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');

  readonly data = inject<PluginHostDialogData>(MAT_DIALOG_DATA);
  /** Ends with the dialog, so a module that finishes loading after the dialog was closed is not mounted. */
  private readonly module = resource({loader: () => this.loader.load(this.data.plugin)});

  readonly state = computed<HostState>(() => {
    switch (this.module.status()) {
      case 'resolved':
        return 'ready';
      case 'error':
        return this.module.error() instanceof PluginVersionChangedError ? 'versionChanged' : 'loadError';
      default:
        return 'loading';
    }
  });
  readonly error = computed(() => this.module.error()?.message ?? '');

  constructor() {
    effect(() => {
      if (this.state() === 'ready') untracked(() => this.mount());
    });
  }

  private mount(): void {
    const {plugin, context} = this.data;
    const element = document.createElement(plugin.frontend!.element!) as PluginElement;
    element.host = this.hostFactory.create(context, () => this.dialogRef.close());
    this.container().nativeElement.appendChild(element);
  }
}
