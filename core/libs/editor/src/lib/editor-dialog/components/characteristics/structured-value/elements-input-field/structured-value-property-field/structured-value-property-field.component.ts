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

import {NamespacesCacheService} from '@ame/cache';
import {EditorDialogValidators} from '@ame/editor';
import {RdfService} from '@ame/rdf/services';
import {Component, Input, OnInit, inject} from '@angular/core';
import {FormControl, Validators} from '@angular/forms';
import {DefaultProperty} from '@esmf/aspect-model-loader';
import {Observable, debounceTime, map, startWith} from 'rxjs';

@Component({
  selector: 'ame-structured-value-property-field',
  templateUrl: './structured-value-property-field.component.html',
  styleUrls: ['./structured-value-property-field.component.scss'],
})
export class StructuredValuePropertyFieldComponent implements OnInit {
  @Input() public property: DefaultProperty = null;
  @Input() public fieldControl: FormControl;

  public filteredProperties$: Observable<any>;
  public control: FormControl;

  private namespaceCacheService = inject(NamespacesCacheService);
  get currentCacheFile() {
    return this.namespaceCacheService.currentCachedFile;
  }

  constructor(private rdfService: RdfService) {}

  ngOnInit() {
    this.control = new FormControl(
      {
        value: this.property?.name || '',
        disabled: !!this.property?.name || this.property?.isExternalReference(),
      },
      [Validators.required, EditorDialogValidators.namingLowerCase],
    );
    this.filteredProperties$ = this.control.valueChanges.pipe(
      startWith([]),
      debounceTime(250),
      map(value => this.currentCacheFile.getCachedProperties().filter(property => property.name.includes(value))),
    );
  }

  unlock() {
    this.control.enable();
    this.control.patchValue('');
    this.fieldControl.setValue('');
    this.property = null;
  }

  isLowerCase(value: string) {
    return /[a-z]/.test(value?.[0] || '');
  }

  createNewProperty(name: string) {
    const namespace = this.rdfService.currentRdfModel.getAspectModelUrn();
    const version = this.rdfService.currentRdfModel.getMetaModelVersion();
    const newProperty = new DefaultProperty({metaModelVersion: version, aspectModelUrn: namespace + name, name});
    this.fieldControl.setValue(newProperty);
    this.control.disable();
  }

  onSelectionChange(property: DefaultProperty) {
    this.fieldControl.setValue(property);
    this.control.disable();
  }
}
