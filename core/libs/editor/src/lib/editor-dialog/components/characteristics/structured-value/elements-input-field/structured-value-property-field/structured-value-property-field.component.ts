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
import {ElementCreatorService} from '@ame/shared';
import {AsyncPipe} from '@angular/common';
import {Component, inject, input, OnInit, signal} from '@angular/core';
import {toObservable} from '@angular/core/rxjs-interop';
import {disabled, FieldTree, form, FormField, required, validate} from '@angular/forms/signals';
import {MatAutocomplete, MatAutocompleteTrigger, MatOptgroup, MatOption} from '@angular/material/autocomplete';
import {MatIconButton} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatError, MatInput, MatLabel} from '@angular/material/input';
import {DefaultCharacteristic, DefaultProperty, RdfModel} from '@esmf/aspect-model-loader';
import {debounceTime, map, Observable} from 'rxjs';

@Component({
  selector: 'ame-structured-value-property-field',
  templateUrl: './structured-value-property-field.component.html',
  styleUrls: ['./structured-value-property-field.component.scss'],
  imports: [
    MatFormFieldModule,
    MatLabel,
    MatAutocompleteTrigger,
    FormField,
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
  public readonly field = input.required<FieldTree<DefaultProperty | null>>();

  private elementCreator = inject(ElementCreatorService);
  public loadedFiles = inject(LoadedFilesService);

  public locked = signal(false);
  public displayModel = signal('');
  public filteredProperties$: Observable<any> = toObservable(this.displayModel).pipe(
    debounceTime(250),
    map(value => CacheUtils.getCachedElements(this.currentCacheFile, DefaultProperty).filter(property => property.name.includes(value))),
  );
  public displayForm = form(this.displayModel, path => {
    required(path);
    validate(path, ({value}) =>
      !value() || this.isLowerCase(value())
        ? null
        : {kind: 'namingLowerCase', message: 'Property names must start with a lowercase letter'},
    );
    disabled(path, {when: () => this.locked()});
  });

  get currentCacheFile() {
    return this.loadedFiles.currentLoadedFile.cachedFile;
  }

  get currentRdfModel(): RdfModel {
    return this.loadedFiles.currentLoadedFile.rdfModel;
  }

  ngOnInit() {
    const defaultProperty = this.defaultProperty();
    this.displayModel.set(defaultProperty?.name || '');
    this.locked.set(
      defaultProperty instanceof DefaultProperty && (!!defaultProperty.aspectModelUrn || this.loadedFiles.isElementExtern(defaultProperty)),
    );
  }

  unlock() {
    this.locked.set(false);
    this.displayModel.set('');
    this.field()().value.set(null);
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
    this.field()().value.set(newProperty);
    this.locked.set(true);
  }

  onSelectionChange(property: DefaultProperty) {
    this.field()().value.set(property);
    this.displayModel.set(property.name);
    this.locked.set(true);
  }
}
