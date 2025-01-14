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

import {Quad} from 'n3';
import {Characteristic} from '../../aspect-meta-model';
import {DefaultEither, Either} from '../../aspect-meta-model/characteristic/default-either';
import {getRdfModel} from '../../shared/rdf-model';
import {generateCharacteristic} from '../characteristic/characteristic-instantiator';

export function createEitherCharacteristic(quad: Quad, characteristicCreator: (quad: Quad) => Characteristic): Either {
  return generateCharacteristic(quad, (baseProperties, propertyQuads) => {
    const {sammC} = getRdfModel();
    const characteristic = new DefaultEither({
      ...baseProperties,
      left: null,
      right: null,
    });

    for (const propertyQuad of propertyQuads) {
      if (sammC.isEitherLeftProperty(propertyQuad.predicate.value)) {
        characteristic.left = characteristicCreator(propertyQuad);
      } else if (sammC.isEitherRightProperty(propertyQuad.predicate.value)) {
        characteristic.right = characteristicCreator(propertyQuad);
      }
    }
    return characteristic;
  });
}
