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
import {EnumerationProps} from '../../shared/props';
import {DefaultEntityInstance, EntityInstance} from '../default-entity-instance';
import {NamedElement} from '../named-element';
import {Value} from '../value';
import {Characteristic, DefaultCharacteristic} from './default-characteristic';

export interface Enumeration extends Characteristic {
  values: Value[];
}

export class DefaultEnumeration extends DefaultCharacteristic implements Enumeration {
  override className = 'DefaultEnumeration';
  values: Value[];

  override get children(): NamedElement[] {
    const elementValues = this.values.filter(v => v instanceof DefaultEntityInstance);
    return [...super.children, ...elementValues];
  }

  constructor(props: EnumerationProps) {
    super(props);
    this.values = props.values || [];
  }

  getValues(): Value[] {
    return this.values;
  }

  getValue(valueOrUrn: string): Value | EntityInstance {
    return this.values.find(v => {
      if (v instanceof DefaultEntityInstance && v.aspectModelUrn === valueOrUrn) {
        return true;
      }

      return v.value === valueOrUrn;
    });
  }
}
