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

import {LoadedFilesService} from '@ame/cache';
import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {DefaultAspect, DefaultEntity, DefaultProperty, NamedElement} from '@esmf/aspect-model-loader';
import {first} from 'rxjs/operators';
import {PropertiesModalComponent} from '..';
import {EditorModelService} from '../../../editor-model.service';

export interface UpdatedProperties {
  [key: string]: DefaultProperty;
}

@Component({
  selector: 'ame-properties-button',
  templateUrl: './properties-button.component.html',
  styleUrls: ['./properties-button.component.scss'],
})
export class PropertiesButtonComponent implements OnInit {
  @Output() overwrite = new EventEmitter();

  private propertiesClone: DefaultProperty[];

  public metaModelElement: DefaultEntity | DefaultAspect;
  public get isPredefined(): boolean {
    return this.metaModelElement?.isPredefined;
  }

  constructor(
    private matDialog: MatDialog,
    private metaModelDialogService: EditorModelService,
    private loadedFiles: LoadedFilesService,
  ) {}

  ngOnInit(): void {
    this.metaModelDialogService.getMetaModelElement().subscribe((metaModelElement: NamedElement) => {
      if (metaModelElement instanceof DefaultEntity || metaModelElement instanceof DefaultAspect) {
        this.metaModelElement = metaModelElement;
      }
    });
  }

  openPropertiesTable() {
    this.matDialog
      .open(PropertiesModalComponent, {
        data: {
          name: this.metaModelElement.name,
          properties: this.propertiesClone || this.metaModelElement.properties,
          isExternalRef: this.loadedFiles.isElementExtern(this.metaModelElement),
          metaModelElement: this.metaModelElement,
          isPredefined: this.isPredefined,
        },
        autoFocus: false,
      })
      .afterClosed()
      .pipe(first())
      .subscribe((data: UpdatedProperties) => {
        if (!data) {
          return;
        }

        // @TODO clone this property
        this.propertiesClone = []; // this.metaModelElement.properties.map(({property, keys}) => ({property, keys: {...keys}}));
        for (const property of this.propertiesClone) {
          if (!data[property.aspectModelUrn]) {
            continue;
          }
          property.notInPayload = data[property.aspectModelUrn].notInPayload;
          property.optional = data[property.aspectModelUrn].optional;
          property.payloadName = data[property.aspectModelUrn].payloadName;
        }

        this.overwrite.emit(data);
      });
  }
}
