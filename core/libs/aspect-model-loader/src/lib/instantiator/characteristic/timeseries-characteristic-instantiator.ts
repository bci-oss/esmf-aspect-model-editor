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
import {Characteristic, DefaultTimeSeries} from '../../aspect-meta-model';
import {getRdfModel} from '../../shared/rdf-model';
import {generateCharacteristic, getDataType} from './characteristic-instantiator';

export function createTimeSeriesCharacteristic(quad: Quad, characteristicCreator: (quad: Quad) => Characteristic): DefaultTimeSeries {
  return generateCharacteristic(quad, (baseProperties, propertyQuads) => {
    const {samm, sammC} = getRdfModel();
    const characteristic = new DefaultTimeSeries({...baseProperties});

    for (const propertyQuad of propertyQuads) {
      if (samm.isDataTypeProperty(propertyQuad.predicate.value)) {
        characteristic.dataType = getDataType(propertyQuad);
      } else if (sammC.isAllowDuplicatesProperty(propertyQuad.predicate.value)) {
        characteristic.allowDuplicates = Boolean(propertyQuad.object.value);
      } else if (sammC.isOrderedProperty(propertyQuad.predicate.value)) {
        characteristic.ordered = Boolean(propertyQuad.object.value);
      } else if (sammC.isElementCharacteristicProperty(propertyQuad.predicate.value)) {
        characteristic.elementCharacteristic = characteristicCreator(propertyQuad);
      }
    }
    return characteristic;
  });
}
