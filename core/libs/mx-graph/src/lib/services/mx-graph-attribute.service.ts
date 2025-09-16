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
import {Graph} from '@maxgraph/core';
import {environment} from 'environments/environment';

@Injectable({providedIn: 'root'})
export class MxGraphAttributeService {
  private _inCollapsedMode = false;
  private _graphTest;

  constructor() {
    if (!environment.production) {
      window['angular.mxGraphAttributeService'] = this;
    }
  }

  public get inCollapsedMode(): boolean {
    return this._inCollapsedMode;
  }

  public set inCollapsedMode(inCollapsedMode: boolean) {
    this._inCollapsedMode = inCollapsedMode;
  }

  public get graphTest(): Graph {
    return this._graphTest;
  }

  // eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
  public set graphTest(value: Graph) {
    this._graphTest = value;
  }
}
