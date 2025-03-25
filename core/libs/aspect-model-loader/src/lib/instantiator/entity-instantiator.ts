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

import {NamedNode, Quad} from 'n3';
import {Property} from '../aspect-meta-model';
import {ComplexType} from '../aspect-meta-model/complex-type';
import {DefaultEntity} from '../aspect-meta-model/default-entity';
import {BaseInitProps} from '../shared/base-init-props';
import {getBaseProperties} from './meta-model-element-instantiator';
import {getProperties} from './property-instantiator';

export function createEntity(initProps: BaseInitProps) {
  return (quads: Quad[], isAbstract = false, extending?: ComplexType) => {
    if (!quads?.length) return null;

    const {samm, store} = initProps.rdfModel;
    const elementsCache = initProps.cache;

    const subject = quads?.[0].subject as NamedNode;
    const cachedEntity = elementsCache.get<DefaultEntity>(subject.value);
    if (cachedEntity) {
      if (extending && !cachedEntity.extendingElements.find(el => el.aspectModelUrn === extending.aspectModelUrn)) {
        cachedEntity.extendingElements.push(extending);
      }
      return cachedEntity;
    }

    const baseProperties = getBaseProperties(subject);
    const properties: Property[] = [];

    const entity = new DefaultEntity({
      ...baseProperties,
      properties,
      isAbstract,
    });

    for (const quad of quads) {
      if (samm.isPropertiesProperty(quad.predicate.value)) {
        properties.push(...getProperties(quad.subject as NamedNode));
        continue;
      }

      if (samm.isExtends(quad.predicate.value)) {
        const extendsEntityQuads = store.getQuads(quad.object, null, null, null);
        if (extendsEntityQuads && extendsEntityQuads.length > 0) {
          entity.extends_ = createEntity(initProps)(
            extendsEntityQuads,
            extendsEntityQuads.some(q => samm.isAbstractEntity(q.object.value)),
            entity,
          );
        }
      }
    }

    properties.forEach(property => property.addParent(entity));

    return elementsCache.resolveInstance(entity);
  };
}
