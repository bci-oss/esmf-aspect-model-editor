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

import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {Component, inject, signal} from '@angular/core';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import {MatOptionModule} from '@angular/material/core';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoDirective} from '@jsverse/transloco';
import * as locale from 'locale-codes';

import {MatButtonModule} from '@angular/material/button';

@Component({
  templateUrl: './language-selector-modal.component.html',
  imports: [MatButtonModule, MatDialogModule, TranslocoDirective, MatSelectModule, MatOptionModule, ReactiveFormsModule],
})
export class LanguageSelectorModalComponent {
  private dialogRef = inject(MatDialogRef<LanguageSelectorModalComponent>);
  private languageService = inject(SammLanguageSettingsService);

  public languages = signal<locale.ILocale[]>([]);
  public languageControl: FormControl;

  constructor() {
    this.languages.set(this.languageService.getSammLanguageCodes().map(tag => locale.getByTag(tag)));
    this.languageControl = new FormControl(this.languages()[0].tag);

    if (this.languages().length === 1) {
      this.dialogRef.close(this.languages()[0].tag);
    }
  }

  cancel() {
    this.dialogRef.close();
  }

  selectLanguage() {
    this.dialogRef.close(this.languageControl.value);
  }
}
