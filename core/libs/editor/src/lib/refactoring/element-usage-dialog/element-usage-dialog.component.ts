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

import {ElementUsage, ElementUsageReport, ModelApiPort, ModelOpenerPort} from '@ame/domain';
import {DialogCloseButtonComponent} from '@ame/shared';
import {HttpErrorResponse, HttpStatusCode} from '@angular/common/http';
import {Component, computed, inject, signal} from '@angular/core';
import {rxResource} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {parseElementUrn} from '../refactoring-urns';

export interface ElementUsageDialogData {
  urn: string;
}

/** The usages within one file. */
export interface ElementUsageGroup {
  file: string;
  readOnly: boolean;
  external: boolean;
  usages: ElementUsage[];
}

/** `namespace:version/file.ttl`, the way files are shown in the workspace. */
export function usageFileLabel(file: {namespace: string; version: string; fileName: string}): string {
  return `${file.namespace}:${file.version}/${file.fileName}`;
}

/** Lists the elements referring to an element across all workspaces and sources. */
@Component({
  selector: 'ame-element-usage-dialog',
  templateUrl: './element-usage-dialog.component.html',
  styleUrls: ['./element-usage-dialog.component.scss'],
  imports: [
    DialogCloseButtonComponent,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoDirective,
  ],
})
export class ElementUsageDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ElementUsageDialogComponent>);
  private readonly modelApi = inject(ModelApiPort);
  private readonly modelOpener = inject(ModelOpenerPort);

  readonly data: ElementUsageDialogData = inject(MAT_DIALOG_DATA);
  readonly element = parseElementUrn(this.data.urn);

  readonly report = rxResource<ElementUsageReport, string>({
    params: () => this.data.urn,
    stream: ({params}) => this.modelApi.getElementUsage(params),
  });
  readonly usages = computed(() => this.report.value()?.usages ?? []);
  readonly fileCount = computed(() => new Set(this.usages().map(usageFileLabel)).size);
  readonly filter = signal('');

  /** Usages grouped by file; files of other models first, as a local change would break them. */
  readonly groups = computed<ElementUsageGroup[]>(() => {
    const term = this.filter().trim().toLowerCase();
    const groups = new Map<string, ElementUsageGroup>();
    for (const usage of this.usages()) {
      const file = usageFileLabel(usage);
      if (term && !`${this.name(usage)} ${file}`.toLowerCase().includes(term)) continue;

      const group = groups.get(file) ?? {file, readOnly: usage.readOnly, external: usage.external, usages: []};
      group.usages.push(usage);
      groups.set(file, group);
    }
    return [...groups.values()]
      .sort((a, b) => Number(b.external) - Number(a.external) || a.file.localeCompare(b.file))
      .map(group => ({...group, usages: group.usages.sort((a, b) => this.name(a).localeCompare(this.name(b)))}));
  });

  readonly unreadable = computed(() => this.report.value()?.unreadable ?? []);
  /** The backend only knows saved elements, so a new element or one of an unsaved model is not found. */
  readonly notSaved = computed(() => {
    const error = this.report.error();
    return error instanceof HttpErrorResponse && error.status === HttpStatusCode.NotFound;
  });

  requestClose(): void {
    this.dialogRef.close();
  }

  name(usage: ElementUsage): string {
    return parseElementUrn(usage.urn)?.name ?? usage.urn;
  }

  fileLabel(file: {namespace: string; version: string; fileName: string}): string {
    return usageFileLabel(file);
  }

  open(usage: ElementUsage): void {
    if (usage.readOnly) return;

    this.dialogRef.close();
    this.modelOpener
      .promptAndOpen({file: usage.fileName, namespace: `${usage.namespace}:${usage.version}`, editElementUrn: usage.urn})
      .subscribe();
  }
}
