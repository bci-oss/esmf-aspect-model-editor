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
import {AfterViewInit, ChangeDetectorRef, Component, inject, input, OnDestroy, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {TranslocoDirective} from '@jsverse/transloco';
import {EditorModelService} from '../../editor-model.service';
import {EditorFormModel, EditorSignalFormContext} from '../../forms/editor-signal-form-context';
import {PreviousFormDataSnapshot} from '../../interfaces';
import {ElementListComponent} from '../element-list';
import {
  BaseInputComponent,
  ConstraintNameDropdownFieldComponent,
  EncodingInputFieldComponent,
  IntegerInputFieldComponent,
  LanguageCodeInputFieldComponent,
  LocaleCodeInputFieldComponent,
  LowerBoundInputFieldComponent,
  MaxLengthInputFieldComponent,
  MaxValueInputFieldComponent,
  MinLengthInputFieldComponent,
  MinValueInputFieldComponent,
  RegularExpressionValueInputFieldComponent,
  ScaleInputFieldComponent,
  UpperBoundInputFieldComponent,
} from '../fields';

@Component({
  selector: 'ame-constraint',
  templateUrl: './constraint.component.html',
  imports: [
    ElementListComponent,
    TranslocoDirective,
    ConstraintNameDropdownFieldComponent,
    BaseInputComponent,
    EncodingInputFieldComponent,
    IntegerInputFieldComponent,
    ScaleInputFieldComponent,
    LanguageCodeInputFieldComponent,
    MinLengthInputFieldComponent,
    MaxLengthInputFieldComponent,
    LocaleCodeInputFieldComponent,
    MinValueInputFieldComponent,
    MaxValueInputFieldComponent,
    UpperBoundInputFieldComponent,
    LowerBoundInputFieldComponent,
    RegularExpressionValueInputFieldComponent,
  ],
})
export class ConstraintComponent implements OnDestroy, AfterViewInit {
  readonly signalForm = input(new EditorSignalFormContext<EditorFormModel>({changedMetaModel: null}));

  private changeDetector = inject(ChangeDetectorRef);

  public metaModelDialogService = inject(EditorModelService);

  public selectedConstraint = signal<string>(undefined);
  public previousData = signal<PreviousFormDataSnapshot>({});
  public element = toSignal(this.metaModelDialogService.getMetaModelElement());

  ngAfterViewInit(): void {
    this.changeDetector.detectChanges();
  }

  ngOnDestroy() {
    this.previousData.set({});
  }

  onPreviousDataChange(previousData: PreviousFormDataSnapshot) {
    this.previousData.set(previousData);
    this.changeDetector.detectChanges();
  }

  onClassChange(constraint: string) {
    this.selectedConstraint.set(constraint);
    this.changeDetector.detectChanges();
  }
}
