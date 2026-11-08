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
import {Component, DestroyRef, ElementRef, inject, OnInit, signal, viewChild} from '@angular/core';
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
export class PluginHostDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<PluginHostDialogComponent>);
  private readonly loader = inject(PluginModuleLoader);
  private readonly hostFactory = inject(PluginHostFactory);
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');

  readonly data = inject<PluginHostDialogData>(MAT_DIALOG_DATA);
  readonly state = signal<HostState>('loading');
  readonly error = signal('');

  /** The module may finish loading after the user closed the dialog. */
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.loader.load(this.data.plugin).then(
      () => this.mount(),
      error => this.fail(error),
    );
  }

  private mount(): void {
    if (this.destroyRef.destroyed) return;
    const {plugin, context} = this.data;
    const element = document.createElement(plugin.frontend!.element!) as PluginElement;
    element.host = this.hostFactory.create(context, () => this.dialogRef.close());
    this.container().nativeElement.appendChild(element);
    this.state.set('ready');
  }

  private fail(error: unknown): void {
    if (error instanceof PluginVersionChangedError) {
      this.state.set('versionChanged');
      return;
    }
    this.error.set(error instanceof Error ? error.message : String(error ?? ''));
    this.state.set('loadError');
  }
}
