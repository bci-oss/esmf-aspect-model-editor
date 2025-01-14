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
import {DefaultSingleEntity} from '../../aspect-meta-model/characteristic/default-single-entity';
import {getRdfModel} from '../../shared/rdf-model';
import {generateCharacteristic, getDataType} from '../characteristic/characteristic-instantiator';

export function createSingleEntityCharacteristic(quad: Quad): DefaultSingleEntity {
  return generateCharacteristic(quad, (baseProperties, propertyQuads) => {
    const {samm} = getRdfModel();
    return new DefaultSingleEntity({
      ...baseProperties,
      dataType: getDataType(propertyQuads.find(propertyQuad => samm.isDataTypeProperty(propertyQuad.predicate.value))),
    });
  });
}
