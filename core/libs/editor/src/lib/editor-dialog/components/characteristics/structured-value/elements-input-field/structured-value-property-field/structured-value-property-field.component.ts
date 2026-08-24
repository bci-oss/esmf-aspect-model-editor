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

import {CacheUtils, LoadedFilesService} from '@ame/cache';
import {EditorDialogValidators} from '@ame/editor';
import {ElementCreatorService} from '@ame/shared';
import {AsyncPipe} from '@angular/common';
import {Component, inject, input, OnInit} from '@angular/core';
import {FormControl, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatAutocomplete, MatAutocompleteTrigger, MatOptgroup, MatOption} from '@angular/material/autocomplete';
import {MatIconButton} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatError, MatInput, MatLabel} from '@angular/material/input';
import {DefaultCharacteristic, DefaultProperty, RdfModel} from '@esmf/aspect-model-loader';
import {debounceTime, map, Observable, startWith} from 'rxjs';

@Component({
  selector: 'ame-structured-value-property-field',
  templateUrl: './structured-value-property-field.component.html',
  styleUrls: ['./structured-value-property-field.component.scss'],
  imports: [
    MatFormFieldModule,
    MatLabel,
    MatAutocompleteTrigger,
    ReactiveFormsModule,
    MatInput,
    MatIconButton,
    MatIconModule,
    MatAutocomplete,
    AsyncPipe,
    MatOptgroup,
    MatOption,
    MatError,
  ],
})
export class StructuredValuePropertyFieldComponent implements OnInit {
  public defaultProperty = input<DefaultProperty>(null);
  public readonly fieldControl = input<FormControl>();

  private elementCreator = inject(ElementCreatorService);
  public loadedFiles = inject(LoadedFilesService);

  public filteredProperties$: Observable<any>;
  public control: FormControl;

  get currentCacheFile() {
    return this.loadedFiles.currentLoadedFile.cachedFile;
  }

  get currentRdfModel(): RdfModel {
    return this.loadedFiles.currentLoadedFile.rdfModel;
  }

  ngOnInit() {
    const defaultProperty = this.defaultProperty();
    this.control = new FormControl(
      {
        value: this.defaultProperty()?.name || '',
        disabled:
          defaultProperty instanceof DefaultProperty &&
          (!!defaultProperty?.aspectModelUrn || this.loadedFiles.isElementExtern(defaultProperty)),
      },
      [Validators.required, EditorDialogValidators.namingLowerCase],
    );
    this.filteredProperties$ = this.control.valueChanges.pipe(
      startWith([]),
      debounceTime(250),
      map(value => CacheUtils.getCachedElements(this.currentCacheFile, DefaultProperty).filter(property => property.name.includes(value))),
    );
  }

  unlock() {
    this.control.enable();
    this.control.patchValue('');
    this.fieldControl().setValue('');
  }

  isLowerCase(value: string) {
    return /[a-z]/.test(value?.[0] || '');
  }

  createNewProperty(name: string) {
    const namespace = `urn:samm:${this.loadedFiles.currentLoadedFile.namespace}#`;
    const version = this.currentRdfModel.getMetaModelVersion();
    const characteristic = this.elementCreator.createEmptyElement(DefaultCharacteristic, {
      resolveNaming: true,
      cached: false,
      aspectModelUrn: `${namespace}Characteristic${name}`,
    });

    const newProperty = new DefaultProperty({
      metaModelVersion: version,
      aspectModelUrn: namespace + name,
      name,
      characteristic,
    });
    this.fieldControl().setValue(newProperty);
    this.control.disable();
  }

  onSelectionChange(property: DefaultProperty) {
    this.fieldControl().setValue(property);
    this.control.disable();
  }
}
