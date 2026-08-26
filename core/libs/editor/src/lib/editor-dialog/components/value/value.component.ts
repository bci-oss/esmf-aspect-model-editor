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

import {Component, inject, input} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {FormGroup} from '@angular/forms';
import {DefaultValue} from '@esmf/aspect-model-loader';
import {TranslocoDirective} from '@jsverse/transloco';
import {EditorModelService} from '../../editor-model.service';
import {ElementListComponent} from '../element-list';
import {BaseInputComponent, ValueInputFieldComponent} from '../fields';
import {ModelElementEditorComponent} from '../model-element-editor-component';

@Component({
  selector: 'ame-value',
  templateUrl: './value.component.html',
  imports: [BaseInputComponent, ElementListComponent, TranslocoDirective, ValueInputFieldComponent],
})
export class ValueComponent extends ModelElementEditorComponent<DefaultValue> {
  readonly parentForm = input<FormGroup>();
  public metaModelDialogService = inject(EditorModelService);
  public element = toSignal(this.metaModelDialogService.getMetaModelElement());
}
