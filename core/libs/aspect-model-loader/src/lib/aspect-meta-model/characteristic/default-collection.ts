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

import {CollectionProps} from '../../shared/props';
import {NamedElement} from '../named-element';
import {Characteristic, DefaultCharacteristic} from './default-characteristic';

export enum CollectionType {
  COLLECTION,
  SET,
  SORTEDSET,
  LIST,
}

export interface Collection extends Characteristic {
  allowDuplicates: boolean;
  ordered: boolean;
  elementCharacteristic?: Characteristic;
}

export class DefaultCollection extends DefaultCharacteristic implements Collection {
  override className = 'DefaultCollection';
  allowDuplicates: boolean;
  ordered: boolean;
  elementCharacteristic?: Characteristic;

  override get children(): NamedElement[] {
    const children = [];
    if (this.elementCharacteristic) {
      children.push(this.elementCharacteristic);
    }
    return [...super.children, ...children];
  }

  constructor(props: CollectionProps) {
    super(props);
    this.allowDuplicates = Boolean(props.allowDuplicates);
    this.ordered = Boolean(props.ordered);
    this.elementCharacteristic = props.elementCharacteristic;
  }

  isAllowedDuplicates(): boolean {
    return this.allowDuplicates;
  }

  isOrdered(): boolean {
    return this.ordered;
  }

  getElementCharacteristic(): Characteristic {
    return this.elementCharacteristic;
  }

  getCollectionType(): CollectionType {
    return CollectionType.COLLECTION;
  }
}
