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

import {ENTER} from '@angular/cdk/keycodes';
import {AsyncPipe} from '@angular/common';
import {Component, OnInit, signal, viewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import {MatAutocomplete, MatAutocompleteTrigger, MatOptgroup, MatOption} from '@angular/material/autocomplete';
import {MatChipGrid, MatChipInput, MatChipRow, MatChipsModule} from '@angular/material/chips';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInput, MatLabel} from '@angular/material/input';
import {DefaultQuantityKind, DefaultUnit} from '@esmf/aspect-model-loader';
import {map, Observable} from 'rxjs';
import {InputFieldComponent} from '../../input-field.component';

declare const sammUDefinition: any;

@Component({
  selector: 'ame-quantity-kinds-input-field',
  templateUrl: './quantity-kinds-input-field.component.html',
  imports: [
    MatFormFieldModule,
    MatLabel,
    MatChipGrid,
    ReactiveFormsModule,
    MatChipRow,
    MatIconModule,
    MatAutocompleteTrigger,
    MatChipInput,
    MatInput,
    MatAutocomplete,
    AsyncPipe,
    MatOptgroup,
    MatOption,
    MatChipsModule,
    MatIconModule,
  ],
})
export class QuantityKindsInputFieldComponent extends InputFieldComponent<DefaultUnit> implements OnInit {
  readonly inputValue = viewChild<any>('input');

  private supportedQuantityKinds = [];

  public filteredQuantityKinds$: Observable<any[]>;
  public inputControl: FormControl;

  readonly separatorKeysCodes = signal([ENTER]);
  public editable = signal(true);
  public quantityKindValues = signal<Array<string>>([]);

  get chipListControl(): FormControl {
    return this.parentForm().get('quantityKindsChipList') as FormControl;
  }

  ngOnInit(): void {
    this.supportedQuantityKinds = Object.keys(sammUDefinition.quantityKinds);
    this.getMetaModelData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.quantityKindValues.set([]);
        this.setInputControl();
      });
  }

  setInputControl() {
    this.editable.set(!this.metaModelDialogService.isReadOnly());
    this.quantityKindValues.set([
      ...((this.metaModelElement?.quantityKinds?.map(value => (value instanceof DefaultQuantityKind ? value.name : value)) as any) || []),
    ]);

    this.inputControl = new FormControl({
      value: '',
      disabled: this.metaModelDialogService.isReadOnly(),
    });

    this.parentForm().setControl(
      'quantityKindsChipList',
      new FormControl({
        value: this.quantityKindValues,
        disabled: this.metaModelDialogService.isReadOnly(),
      }),
    );

    this.filteredQuantityKinds$ = this.initFilteredQuantityKinds(this.inputControl);
  }

  initFilteredQuantityKinds(control: FormControl): Observable<Array<string>> {
    return control?.valueChanges.pipe(
      map((value: string) => {
        return value ? this.supportedQuantityKinds?.filter(qk => qk.startsWith(value)) : this.supportedQuantityKinds;
      }),
    );
  }

  onSelectionChange(newValue: string) {
    this.inputValue().nativeElement.value = '';
    this.inputControl.reset();
    this.inputControl.markAllAsTouched();

    this.quantityKindValues.update(values => [...values, newValue]);
    this.parentForm().get('quantityKindsChipList').setValue(this.quantityKindValues());
  }

  remove(value: string) {
    const index = this.quantityKindValues().indexOf(value);

    if (index >= 0) {
      this.quantityKindValues().splice(index, 1);
      this.parentForm().get('quantityKindsChipList').setValue(this.quantityKindValues());
    }
  }
}
