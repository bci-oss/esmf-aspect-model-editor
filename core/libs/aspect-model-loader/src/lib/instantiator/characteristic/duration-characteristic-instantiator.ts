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
import {DefaultDuration} from '../../aspect-meta-model/characteristic/default-duration';
import {getRdfModel} from '../../shared/rdf-model';
import {generateCharacteristic, getDataType} from '../characteristic/characteristic-instantiator';
import {createUnit} from '../predefined-unit-instantiator';

export function createDurationCharacteristic(quad: Quad): DefaultDuration {
  return generateCharacteristic(quad, (baseProperties, propertyQuads) => {
    const {samm, sammC} = getRdfModel();
    const characteristic = new DefaultDuration({...baseProperties});

    for (const propertyQuad of propertyQuads) {
      if (sammC.isUnitProperty(propertyQuad.predicate.value)) {
        characteristic.unit = createUnit(quad.object.value);
        if (characteristic.unit) {
          characteristic.unit.addParent(characteristic);
        }
      } else if (samm.isDataTypeProperty(propertyQuad.predicate.value)) {
        characteristic.dataType = getDataType(propertyQuad);
      }
    }
    return characteristic;
  });
}
