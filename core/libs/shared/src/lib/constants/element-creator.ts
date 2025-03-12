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
  DefaultConstraint,
  DefaultEntity,
  DefaultEvent,
  DefaultOperation,
  DefaultProperty,
  DefaultTrait,
  DefaultUnit,
  NamedElement,
} from '@esmf/aspect-model-loader';
import {config} from '../config';

export function createEmptyElement(elementClass: {new (...x: any[]): NamedElement}, isAbstract = false): NamedElement {
  let element: NamedElement;
  switch (true) {
    case elementClass === DefaultAspect:
      element = new DefaultAspect({name: 'Aspect', metaModelVersion: config.currentSammVersion, aspectModelUrn: ''});
      break;
    case elementClass === DefaultProperty:
      element = new DefaultProperty({
        name: isAbstract ? 'abstractProperty' : 'property',
        metaModelVersion: '',
        aspectModelUrn: '',
        isAbstract,
      });
      break;
    case elementClass === DefaultCharacteristic:
      element = new DefaultCharacteristic({name: 'characteristic', metaModelVersion: config.currentSammVersion, aspectModelUrn: ''});
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
      element = new DefaultConstraint({name: 'constraint', metaModelVersion: config.currentSammVersion, aspectModelUrn: ''});
      break;
    case elementClass === DefaultTrait:
      element = new DefaultTrait({name: 'trait', metaModelVersion: config.currentSammVersion, aspectModelUrn: ''});
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
