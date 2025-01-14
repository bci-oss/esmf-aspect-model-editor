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
import {AfterViewInit, Component, Inject, OnInit, ViewChild} from '@angular/core';
import {FormBuilder, FormControl, FormGroup} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {MatPaginator} from '@angular/material/paginator';
import {MatTableDataSource} from '@angular/material/table';
import {DefaultEntity, DefaultEntityInstance, DefaultProperty, NamedElement} from '@esmf/aspect-model-loader';

export interface PropertiesDialogData {
  name: string;
  metaModelElement?: NamedElement;
  properties: DefaultProperty[];
  isExternalRef: boolean;
  isPredefined?: boolean;
}

export interface PropertyStatus {
  property: DefaultProperty;
  inherited?: boolean;
  disabled?: boolean;
}

@Component({
  templateUrl: './properties-modal.component.html',
  styleUrls: ['./properties-modal.component.scss'],
})
export class PropertiesModalComponent implements OnInit, AfterViewInit {
  public form: FormGroup;
  public keys: string[] = [];

  public headers = [];
  public standardHeaders = ['name', 'optional', 'payloadName'];
  public enumerationEntityHeaders = ['name', 'optional', 'notInPayload', 'payloadName'];
  public dataSource: MatTableDataSource<PropertyStatus>;

  @ViewChild(MatPaginator) paginator: MatPaginator;

  public get extendedProperties(): DefaultProperty[] {
    return (this.data.metaModelElement as DefaultEntity)?.extends_.properties || [];
  }

  constructor(
    private formBuilder: FormBuilder,
    private dialogRef: MatDialogRef<PropertiesModalComponent>,
    private cacheService: NamespacesCacheService,
    @Inject(MAT_DIALOG_DATA) public data: PropertiesDialogData,
  ) {}

  ngOnInit() {
    const extendedProperties: PropertyStatus[] = ((this.data.metaModelElement as DefaultEntity)?.properties || [])
      .filter(
        property => !(property instanceof DefaultProperty && property.isAbstract && this.data.metaModelElement instanceof DefaultEntity),
      )
      .map(property => ({
        property,
        inherited: true,
      }));

    const allProperties: PropertyStatus[] = [
      ...extendedProperties,
      ...this.data.properties.map(property => ({
        property,
        disabled: !!(property instanceof DefaultProperty && property.extends_),
      })),
    ];

    this.dataSource = new MatTableDataSource(allProperties);

    const group = allProperties.reduce((acc, status) => {
      this.keys.push(status.property.aspectModelUrn);
      acc[status.property.aspectModelUrn] = this.formBuilder.group({
        name: this.formBuilder.control({
          value: status.property.name,
          disabled: status.inherited || status.disabled,
        }),
        optional: this.formBuilder.control({
          value: status.property.optional || false,
          disabled: status.inherited || status.disabled,
        }),
        notInPayload: this.formBuilder.control({
          value: status.property.notInPayload || false,
          disabled: status.inherited || status.disabled,
        }),
        payloadName: this.formBuilder.control({
          value: status.property.payloadName || '',
          disabled: status.inherited || status.disabled,
        }),
      });
      return acc;
    }, {});

    this.form = this.formBuilder.group(group);
    if (this.data.isExternalRef || this.data.isPredefined) {
      this.form.disable();
    }

    this.headers = this.standardHeaders;
    if (this.data.metaModelElement instanceof DefaultEntity) {
      const entityValues = this.cacheService.currentCachedFile.getCachedEntityValues();
      entityValues.forEach((entityValue: DefaultEntityInstance) => {
        if (entityValue.type.aspectModelUrn === this.data.metaModelElement.aspectModelUrn) {
          this.headers = this.enumerationEntityHeaders;
        }
      });
    }
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  getControl(path: string | string[]): FormControl {
    return this.form.get(path) as FormControl;
  }

  closeModal() {
    this.dialogRef.close();
  }

  saveChanges() {
    this.dialogRef.close(this.form.value);
  }
}
