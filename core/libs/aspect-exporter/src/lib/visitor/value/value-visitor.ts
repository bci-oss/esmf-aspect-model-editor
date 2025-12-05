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

import {getDescriptionsLocales, getPreferredNamesLocales} from '@ame/utils';
import {inject, Injectable} from '@angular/core';
import {DefaultValue} from '@esmf/aspect-model-loader';
import {RdfNodeService} from '../../rdf-node';
import {BaseVisitor} from '../base-visitor';

@Injectable({providedIn: 'root'})
export class ValueVisitor extends BaseVisitor<DefaultValue> {
  public rdfNodeService = inject(RdfNodeService);

  visit(value: DefaultValue): DefaultValue {
    if (value.isPredefined) {
      return null;
    }

    this.setPrefix(value.aspectModelUrn);
    const newAspectModelUrn = `${value.aspectModelUrn.split('#')[0]}#${value.name}`;
    value.aspectModelUrn = newAspectModelUrn;
    this.updateProperties(value);

    return value;
  }

  private updateProperties(value: DefaultValue) {
    this.rdfNodeService.update(value, {
      preferredName: getPreferredNamesLocales(value)?.map(language => ({
        language,
        value: value.getPreferredName(language),
      })),
      description: getDescriptionsLocales(value)?.map(language => ({
        language,
        value: value.getDescription(language),
      })),
      see: value.getSee() || [],
      value: value.getValue(),
    });
  }
}
