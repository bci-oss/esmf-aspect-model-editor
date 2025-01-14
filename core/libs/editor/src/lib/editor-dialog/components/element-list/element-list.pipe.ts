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
import {ElementInfo, ElementType, sammElements} from '@ame/shared';
import {Pipe, PipeTransform} from '@angular/core';
import {NamedElement} from '@esmf/aspect-model-loader';

@Pipe({
  standalone: true,
  name: 'modelElementParser',
})
export class ModelElementParserPipe implements PipeTransform {
  getElementType(element: NamedElement): [ElementType, ElementInfo[ElementType]] {
    return Object.entries(sammElements).find(([, value]) => element instanceof value.class) || (['', null] as any);
  }

  transform(element: NamedElement) {
    const [type, elementData] = this.getElementType(element);
    return {
      element,
      symbol: elementData?.symbol,
      type,
    };
  }
}
