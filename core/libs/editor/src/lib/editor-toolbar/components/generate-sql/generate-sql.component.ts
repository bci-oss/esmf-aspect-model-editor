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

import {SqlDialect} from '@ame/domain';
import {DialogCloseButtonComponent} from '@ame/shared';
import {Component, inject, signal} from '@angular/core';
import {form, FormField} from '@angular/forms/signals';
import {MatButtonModule} from '@angular/material/button';
import {MatOptionModule} from '@angular/material/core';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoDirective} from '@jsverse/transloco';

export interface GenerateSqlData {
  dialect: SqlDialect;
}

export const SQL_DIALECTS: readonly SqlDialect[] = ['POSTGRESQL', 'DATABRICKS'];

/**
 * Asks for the SQL dialect and closes with it. The language of the column comments is not asked for here:
 * the preview offers a switch, just like for the JSON Schema.
 */
@Component({
  selector: 'ame-generate-sql',
  templateUrl: './generate-sql.component.html',
  styleUrls: ['./generate-sql.component.scss'],
  imports: [
    DialogCloseButtonComponent,
    MatDialogModule,
    TranslocoDirective,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    FormField,
    MatButtonModule,
  ],
})
export class GenerateSqlComponent {
  private dialogRef = inject<MatDialogRef<GenerateSqlComponent, SqlDialect>>(MatDialogRef);

  public readonly dialects = SQL_DIALECTS;
  public sqlModel = signal<GenerateSqlData>({dialect: 'POSTGRESQL'});
  public sqlForm = form(this.sqlModel);

  generate(): void {
    this.dialogRef.close(this.sqlModel().dialect);
  }
}
