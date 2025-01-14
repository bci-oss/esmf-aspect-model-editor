/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/* eslint-disable @typescript-eslint/no-empty-interface */
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

import {use} from 'typescript-mix';
import {EntityInstanceProps} from '../shared/props';
import {ModelVisitor} from '../visitor/model-visitor';
import {Enumeration} from './characteristic/default-enumeration';
import {Entity} from './default-entity';
import {NamedElement} from './named-element';
import {Value} from './value';

export type PropertyUrn = string;

export interface EntityInstance extends NamedElement, Value {
  assertions: Map<PropertyUrn, Value>;
  type: Entity;
  getAssertions(): Map<PropertyUrn, Value>;
  getAssertion(propertyUrn: PropertyUrn): Value;
  setAssertion(propertyUrn: PropertyUrn, value: Value): void;
}

export interface DefaultEntityInstance extends EntityInstance {}
export class DefaultEntityInstance extends NamedElement implements EntityInstance {
  @use(Value) _: DefaultEntityInstance;

  className = 'DefaultEntityInstance';

  assertions: Map<PropertyUrn, Value> = new Map();
  type: Entity;
  override parents: Enumeration[] = [];

  constructor(props: EntityInstanceProps) {
    super(props);
    this.type = props.type;
    this.assertions = props.assertions || new Map();
  }

  getType(): Entity {
    return this.type as Entity;
  }

  getAssertions(): Map<PropertyUrn, Value> {
    return this.assertions;
  }

  getAssertion(propertyUrn: PropertyUrn): Value {
    return this.assertions.get(propertyUrn);
  }

  setAssertion(propertyUrn: PropertyUrn, value: Value) {
    if (!value) return;
    this.assertions.set(propertyUrn, value);
  }

  accept<T, U>(visitor: ModelVisitor<T, U>, context: U): T {
    return visitor.visitEntityInstance(this, context);
  }
}
