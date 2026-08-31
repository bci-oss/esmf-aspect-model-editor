/*
 * Copyright (c) 2026 Robert Bosch Manufacturing Solutions GmbH
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

import {LanguageTranslationService} from '@ame/translation';
import {TestBed} from '@angular/core/testing';
import {RdfModel, Samm} from '@esmf/aspect-model-loader';
import {DataFactory, Store} from 'n3';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {RdfSerializerService} from './rdf-serializer.service';

describe('RdfSerializerService', () => {
  let service: RdfSerializerService;
  let translationService: {
    translateService: {
      getActiveLang: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    translationService = {
      translateService: {
        getActiveLang: vi.fn(() => 'en'),
      },
    };

    TestBed.configureTestingModule({
      providers: [RdfSerializerService, {provide: LanguageTranslationService, useValue: translationService}],
    });

    service = TestBed.inject(RdfSerializerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return empty string when rdfModel is null or store is missing', () => {
    expect(service.serializeModel(null as unknown as RdfModel)).toBe('');
    expect(service.serializeModel({} as unknown as RdfModel)).toBe('');
  });

  it('should serialize basic rdf model with prefixes', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', null);

    const result = service.serializeModel(rdfModel);
    expect(typeof result).toBe('string');
  });

  it('should handle XSD URI prefix replacements', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', null);

    store.addQuad(
      DataFactory.quad(
        DataFactory.namedNode('urn:samm:org.eclipse.esmf:test:1.0.0#TestProperty'),
        DataFactory.namedNode('urn:samm:org.eclipse.esmf.samm:meta-model:2.2.0#dataType'),
        DataFactory.namedNode(`${Samm.XSD_URI}#string`),
      ),
    );

    const serialized = service.serializeModel(rdfModel);
    expect(serialized).toContain('xsd:string');
  });

  it('should handle langString example value quads with active language', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', null);

    translationService.translateService.getActiveLang.mockReturnValue('de');

    store.addQuad(
      DataFactory.quad(
        DataFactory.namedNode('urn:samm:org.eclipse.esmf:test:1.0.0#TestProperty'),
        rdfModel.samm.ExampleValueProperty(),
        DataFactory.literal('Beispiel', DataFactory.namedNode(`${Samm.RDF_URI}#langString`)),
      ),
    );

    const serialized = service.serializeModel(rdfModel);
    expect(serialized).toContain('"Beispiel"@de');
  });

  it('should handle samm namespace replacements to alias', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', null);

    store.addQuad(
      DataFactory.quad(
        DataFactory.namedNode('urn:samm:org.eclipse.esmf:test:1.0.0#TestAspect'),
        rdfModel.samm.RdfType(),
        rdfModel.samm.Aspect(),
      ),
    );

    const serialized = service.serializeModel(rdfModel);
    expect(serialized).toContain('samm:Aspect');
  });

  it('should handle rdf:nil quads and serialize empty list', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', null);

    store.addQuad(
      DataFactory.quad(
        DataFactory.namedNode('urn:samm:org.eclipse.esmf:test:1.0.0#TestOperation'),
        rdfModel.samm.InputProperty(),
        rdfModel.samm.RdfNil(),
      ),
    );

    const serialized = service.serializeModel(rdfModel);
    expect(serialized).toContain('()');
  });

  it('should handle blank node subjects with resolveBlankNodes', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', null);

    const blankSubject = DataFactory.blankNode('b0');
    store.addQuad(
      DataFactory.quad(
        blankSubject,
        DataFactory.namedNode('urn:samm:org.eclipse.esmf.samm:meta-model:2.2.0#name'),
        DataFactory.literal('testItem'),
      ),
    );

    const serialized = service.serializeModel(rdfModel);
    expect(typeof serialized).toBe('string');
  });

  it('should only include used prefixes in the serialized output', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', 'urn:samm:org.eclipse.esmf:test:1.0.0');

    store.addQuad(
      DataFactory.quad(
        DataFactory.namedNode('urn:samm:org.eclipse.esmf:test:1.0.0#TestProperty'),
        rdfModel.samm.RdfType(),
        rdfModel.samm.Property(),
      ),
    );

    const serialized = service.serializeModel(rdfModel);
    expect(serialized).toContain('@prefix samm:');
    expect(serialized).toContain('@prefix :');
    // xsd, rdf, rdfs and unit are not used in this store, so they should not appear in prefix header
    expect(serialized).not.toContain('@prefix xsd:');
    expect(serialized).not.toContain('@prefix rdf:');
    expect(serialized).not.toContain('@prefix rdfs:');
    expect(serialized).not.toContain('@prefix unit:');
  });

  it('should include rdf prefix when an explicit rdf term is used', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', 'urn:samm:org.eclipse.esmf:test:1.0.0');

    store.addQuad(
      DataFactory.quad(
        DataFactory.namedNode('urn:samm:org.eclipse.esmf:test:1.0.0#TestProperty'),
        DataFactory.namedNode('urn:samm:org.eclipse.esmf.samm:meta-model:2.2.0#dataType'),
        DataFactory.namedNode(`${Samm.RDF_URI}#langString`),
      ),
    );

    const serialized = service.serializeModel(rdfModel);
    expect(serialized).toContain('@prefix rdf:');
  });

  it('should not include rdf prefix for language-tagged literals or empty lists', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', 'urn:samm:org.eclipse.esmf:test:1.0.0');

    store.addQuad(
      DataFactory.quad(
        DataFactory.namedNode('urn:samm:org.eclipse.esmf:test:1.0.0#TestProperty'),
        DataFactory.namedNode('urn:samm:org.eclipse.esmf.samm:meta-model:2.2.0#description'),
        DataFactory.literal('Description in English', 'en'),
      ),
    );
    store.addQuad(
      DataFactory.quad(
        DataFactory.namedNode('urn:samm:org.eclipse.esmf:test:1.0.0#TestOperation'),
        rdfModel.samm.InputProperty(),
        rdfModel.samm.RdfNil(),
      ),
    );

    const serialized = service.serializeModel(rdfModel);
    expect(serialized).toContain('"Description in English"@en');
    expect(serialized).not.toContain('@prefix rdf:');
  });

  it('should include rdfs prefix when an rdfs term is used', () => {
    const store = new Store();
    const rdfModel = new RdfModel(store, '2.2.0', 'urn:samm:org.eclipse.esmf:test:1.0.0');

    store.addQuad(
      DataFactory.quad(
        DataFactory.namedNode('urn:samm:org.eclipse.esmf:test:1.0.0#TestProperty'),
        DataFactory.namedNode(`${Samm.RDFS_URI}#seeAlso`),
        DataFactory.namedNode('http://example.com/ref'),
      ),
    );

    const serialized = service.serializeModel(rdfModel);
    expect(serialized).toContain('@prefix rdfs:');
  });
});
