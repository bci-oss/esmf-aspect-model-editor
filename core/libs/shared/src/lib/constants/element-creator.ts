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

import {
  DefaultAspect,
  DefaultCharacteristic,
  DefaultCode,
  DefaultCollection,
  DefaultConstraint,
  DefaultDuration,
  DefaultEither,
  DefaultEntity,
  DefaultEnumeration,
  DefaultEvent,
  DefaultList,
  DefaultMeasurement,
  DefaultOperation,
  DefaultProperty,
  DefaultQuantifiable,
  DefaultSet,
  DefaultSingleEntity,
  DefaultSortedSet,
  DefaultState,
  DefaultStructuredValue,
  DefaultTimeSeries,
  DefaultTrait,
  DefaultUnit,
  NamedElement,
} from '@esmf/aspect-model-loader';
import {config} from '../config';

const characteristics: {new (...x: any[]): NamedElement}[] = [
  DefaultCharacteristic,
  DefaultCode,
  DefaultCollection,
  DefaultDuration,
  DefaultEither,
  DefaultEnumeration,
  DefaultList,
  DefaultMeasurement,
  DefaultQuantifiable,
  DefaultSet,
  DefaultSortedSet,
  DefaultSingleEntity,
  DefaultState,
  DefaultStructuredValue,
  DefaultTimeSeries,
];

export function createEmptyElement(elementClass: {new (...x: any[]): NamedElement}, isAbstract = false): NamedElement {
  let element: NamedElement;
  switch (true) {
    case elementClass === DefaultAspect:
      element = new DefaultAspect({name: 'Aspect', metaModelVersion: config.currentSammVersion, aspectModelUrn: ''});
      break;
    case elementClass === DefaultProperty:
      element = new DefaultProperty({
        name: isAbstract ? 'abstractProperty' : 'property',
        metaModelVersion: config.currentSammVersion,
        aspectModelUrn: '',
        isAbstract,
      });
      break;
    case characteristics.includes(elementClass):
      element = new elementClass({name: 'Characteristic', metaModelVersion: config.currentSammVersion, aspectModelUrn: ''});
      break;
    case elementClass === DefaultEntity:
      element = new DefaultEntity({
        name: isAbstract ? 'AbstractEntity' : 'Entity',
        metaModelVersion: config.currentSammVersion,
        aspectModelUrn: '',
        isAbstract,
      });
      break;
    case elementClass === DefaultUnit:
      element = new DefaultUnit({name: 'unit', metaModelVersion: config.currentSammVersion, aspectModelUrn: '', quantityKinds: []});
      break;
    case elementClass === DefaultConstraint:
      element = new DefaultConstraint({name: 'Constraint', metaModelVersion: config.currentSammVersion, aspectModelUrn: ''});
      break;
    case elementClass === DefaultTrait:
      element = new DefaultTrait({name: 'Trait', metaModelVersion: config.currentSammVersion, aspectModelUrn: ''});
      break;
    case elementClass === DefaultOperation:
      element = new DefaultOperation({name: 'operation', metaModelVersion: config.currentSammVersion, aspectModelUrn: '', input: null});
      break;
    case elementClass === DefaultEvent:
      element = new DefaultEvent({name: 'event', metaModelVersion: config.currentSammVersion, aspectModelUrn: ''});
      break;
    default:
      element = null;
  }
  return element;
}
