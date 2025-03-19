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

import {ElementsSet} from '../shared/elements-set';
import {PropertyProps} from '../shared/props';
import {ModelVisitor} from '../visitor/model-visitor';
import {Characteristic} from './characteristic/default-characteristic';
import {HasExtends} from './has-extends';
import {NamedElement} from './named-element';

export interface Property extends NamedElement, HasExtends<Property> {
  characteristic: Characteristic;
  exampleValue: string;
  optional: boolean;
  notInPayload: boolean;
  payloadName: string;
  isAbstract: boolean;

  getCharacteristic(): Characteristic;
  getExampleValue(): string;
  isOptional(): boolean;
  isNotInPayload(): boolean;
}

export class DefaultProperty extends NamedElement implements Property {
  override className = 'DefaultProperty';
  override get children(): ElementsSet {
    const children = new ElementsSet();
    if (this.extends_ instanceof NamedElement) {
      children.push(this.extends_);
    }

    if (this.characteristic instanceof NamedElement) {
      children.push(this.characteristic);
    }

    return children;
  }

  extends_: Property;
  characteristic: Characteristic;
  exampleValue: string;
  optional: boolean;
  notInPayload: boolean;
  payloadName: string;
  isAbstract: boolean;

  constructor(props: PropertyProps) {
    super(props);
    this.characteristic = props.characteristic || null;
    this.exampleValue = props.exampleValue || null;
    this.extends_ = props.extends_;
    this.notInPayload = Boolean(props.notInPayload);
    this.optional = Boolean(props.optional);
    this.payloadName = props.payloadName;
    this.isAbstract = Boolean(props.isAbstract);
  }

  getCharacteristic(): Characteristic {
    return this.characteristic;
  }

  getExampleValue(): string {
    return this.exampleValue;
  }

  isOptional(): boolean {
    return this.optional;
  }

  isNotInPayload(): boolean {
    return this.notInPayload;
  }

  getExtends(): Property {
    return this.extends_;
  }

  setExtends(value: Property): void {
    this.extends_ = value;
  }

  accept<T, U>(visitor: ModelVisitor<T, U>, context: U): T {
    return visitor.visitProperty(this, context);
  }
}
