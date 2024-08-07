/*
 * Copyright (c) 2024 Robert Bosch Manufacturing Solutions GmbH
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

import {Component, Inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {NamespacesCacheService} from '@ame/cache';
import {MatButtonModule} from '@angular/material/button';

@Component({
  standalone: true,
  templateUrl: './large-file-warning-dialog.html',
  imports: [MatDialogModule, MatButtonModule],
})
export class LargeFileWarningComponent {
  public elementsCount: number;

  constructor(
    private namespacesCacheService: NamespacesCacheService,
    private dialogRef: MatDialogRef<LargeFileWarningComponent>,
    @Inject(MAT_DIALOG_DATA) private data: {elementsCount: number},
  ) {
    this.elementsCount = data?.elementsCount || 0;
  }

  close(response: 'open' | 'cancel') {
    if (response === 'cancel') this.namespacesCacheService.currentCachedFile.clearCache();
    this.dialogRef.close(response);
  }
}
