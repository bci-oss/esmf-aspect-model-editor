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

import {RdfNodeService} from '@ame/aspect-exporter';
import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {MxGraphService} from '@ame/mx-graph';
import {TestBed} from '@angular/core/testing';
import {DefaultValue, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {describe, expect, it} from '@jest/globals';
import {MockProvider, MockProviders} from 'ng-mocks';
import {RdfListService} from '../../rdf-list';
import {ValueVisitor} from './value-visitor';

jest.mock('@ame/editor', () => ({
  ModelElementEditorComponent: class {},
}));

jest.mock('@esmf/aspect-model-loader', () => {
  class NamedElement {}
  return {
    DefaultValue: class DefaultValue extends NamedElement {
      constructor(data: any) {
        super();
        Object.assign(this, data);
      }
    },
  };
});
describe('Value Visitor', () => {
  let service: ValueVisitor;

  const rdfModel: RdfModel = {
    // store: new Store(),
    // samm: new Samm(''),
    // sammC: {ConstraintProperty: () => 'constraintProperty'} as any,
    hasDependency: jest.fn(() => false),
    addPrefix: jest.fn(() => {}),
  } as any;
  const value = new DefaultValue({
    metaModelVersion: '1',
    aspectModelUrn: 'samm#value1',
    name: 'value1',
    value: 'value_test',
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ValueVisitor,
        MockProviders(MxGraphService),
        MockProvider(MxGraphService),
        MockProvider(RdfListService, {
          push: jest.fn(),
          createEmpty: jest.fn(),
        }),
        MockProvider(RdfNodeService, {
          update: jest.fn(),
        }),
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(rdfModel, new ModelElementCache(), null),
          externalFiles: [],
        }),
      ],
    });

    service = TestBed.inject(ValueVisitor);
  });

  it('should update store with default value', () => {
    service.visit(value);

    expect(value.aspectModelUrn).toBe('samm#value1');
    expect(service.rdfNodeService.update).toHaveBeenCalledWith(value, {
      preferredName: [],
      description: [],
      see: [],
    });
  });
});
