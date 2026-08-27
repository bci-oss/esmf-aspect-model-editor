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

import {Component, inject, OnInit, signal} from '@angular/core';
import {applyEach, form, required} from '@angular/forms/signals';
import {MatButton} from '@angular/material/button';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable,
  MatTableDataSource,
} from '@angular/material/table';
import {DefaultProperty} from '@esmf/aspect-model-loader';
import {StructuredValuePropertyFieldComponent} from '../structured-value-property-field/structured-value-property-field.component';

interface StructuredValuePropertyRow {
  key: string;
  regex: string;
  property: DefaultProperty | null;
}

@Component({
  selector: 'ame-structured-value-properties',
  templateUrl: './structured-value-properties.component.html',
  styleUrls: ['./structured-value-properties.component.scss'],
  imports: [
    MatTable,
    MatHeaderCell,
    MatHeaderCellDef,
    MatCell,
    MatCellDef,
    MatColumnDef,
    StructuredValuePropertyFieldComponent,
    MatHeaderRow,
    MatHeaderRowDef,
    MatRow,
    MatRowDef,
    MatButton,
  ],
})
export class StructuredValuePropertiesComponent implements OnInit {
  private data = inject(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<StructuredValuePropertiesComponent>);

  public readonly displayedColumns = ['regex', 'property'];
  public dataSource: MatTableDataSource<StructuredValuePropertyRow>;
  public propertiesModel = signal<StructuredValuePropertyRow[]>([]);
  public propertiesForm = form(this.propertiesModel, path => {
    applyEach(path, row => required(row.property));
  });

  ngOnInit() {
    const rows = this.data.groups.map(group => ({
      key: this.getKey(group),
      regex: group.text,
      property: group.property || null,
    }));
    this.propertiesModel.set(rows);
    this.dataSource = new MatTableDataSource(rows);
  }

  getKey(group) {
    return `[${group.start}-${group.end}] -> ` + group.text;
  }

  closeModal(save?: boolean) {
    if (!save) {
      this.dialogRef.close(null);
      return;
    }

    if (this.propertiesForm().valid()) {
      const result = Object.fromEntries(this.propertiesModel().map(row => [row.key, row.property]));
      this.dialogRef.close(result);
    }
  }
}
