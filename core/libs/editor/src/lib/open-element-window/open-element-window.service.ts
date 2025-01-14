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

import {Injectable} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {NamedElement} from '@esmf/aspect-model-loader';
import {OpenElementWindowComponent} from './open-element-window.component';

@Injectable({providedIn: 'root'})
export class OpenReferencedElementService {
  constructor(private matDialog: MatDialog) {}

  openReferencedElement(element: NamedElement) {
    if (!element) {
      // error notification
      return;
    }

    this.matDialog.open(OpenElementWindowComponent, {data: {file: element.fileName, urn: element.aspectModelUrn}});
  }
}
