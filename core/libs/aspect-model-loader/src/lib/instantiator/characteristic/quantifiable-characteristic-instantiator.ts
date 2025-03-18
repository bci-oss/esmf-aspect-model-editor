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
import {DefaultQuantifiable} from '../../aspect-meta-model/characteristic/default-quantifiable';
import {getRdfModel} from '../../shared/rdf-model';
import {generateCharacteristic, getDataType} from '../characteristic/characteristic-instantiator';
import {createUnit} from '../predefined-unit-instantiator';

export function createQuantifiableCharacteristic(quad: Quad): DefaultQuantifiable {
  return generateCharacteristic(quad, (baseProperties, propertyQuads) => {
    const {samm, sammC} = getRdfModel();
    const characteristic = new DefaultQuantifiable({
      ...baseProperties,
      dataType: getDataType(propertyQuads.find(propertyQuad => samm.isDataTypeProperty(propertyQuad.predicate.value))),
    });

    for (const propertyQuad of propertyQuads) {
      if (sammC.isUnitProperty(propertyQuad.predicate.value)) {
        characteristic.unit = createUnit(propertyQuad.object.value);
        characteristic.unit && characteristic.unit.addParent(characteristic);
      }
    }
    return characteristic;
  });
}
