/*
 * Copyright (c) 2023 Robert Bosch Manufacturing Solutions GmbH
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

import {ModelVisitor} from '../visitor/model-visitor';
import {NamedElement} from './named-element';

export class HasExtends<T extends NamedElement> extends NamedElement {
  extends_: T;

  getExtends(): T {
    return this.extends_;
  }

  setExtends(value: T) {
    this.extends_ = value;
  }

  override accept<T, U>(visitor: ModelVisitor<T, U>, context: U): T {
    throw new Error('Method not implemented.');
  }
}
