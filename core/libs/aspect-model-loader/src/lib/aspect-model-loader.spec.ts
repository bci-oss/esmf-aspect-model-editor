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

import {firstValueFrom} from 'rxjs';
import {describe, expect, it} from 'vitest';
import {AspectModelLoader, loadAspectModel} from './aspect-model-loader';

const sampleAspectTtl = `
@prefix samm: <urn:samm:org.eclipse.esmf.samm:meta-model:2.0.0#> .
@prefix samm-c: <urn:samm:org.eclipse.esmf.samm:characteristic:2.0.0#> .
@prefix samm-e: <urn:samm:org.eclipse.esmf.samm:entity:2.0.0#> .
@prefix unit: <urn:samm:org.eclipse.esmf.samm:unit:2.0.0#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix : <urn:samm:org.eclipse.esmf.samm:test:1.0.0#> .

:TestAspect a samm:Aspect ;
   samm:preferredName "Test Aspect"@en ;
   samm:description "Test Aspect Description"@en ;
   samm:properties ( :testProperty ) ;
   samm:operations () ;
   samm:events () .

:testProperty a samm:Property ;
   samm:preferredName "Test Property"@en ;
   samm:characteristic :TestCharacteristic .

:TestCharacteristic a samm-c:Quantifiable ;
   samm:dataType xsd:string .
`;

describe('AspectModelLoader', () => {
  it('should load self contained aspect model from TTL string', async () => {
    const loader = new AspectModelLoader();
    const result = await firstValueFrom(loader.loadSelfContainedModel(sampleAspectTtl));

    expect(result).toBeDefined();
    expect(result.aspect).toBeDefined();
    expect(result.aspect.name).toBe('TestAspect');
    expect(result.aspect.aspectModelUrn).toBe('urn:samm:org.eclipse.esmf.samm:test:1.0.0#TestAspect');
    expect(result.aspect.getPreferredName('en')).toBe('Test Aspect');
    expect(result.aspect.getDescription('en')).toBe('Test Aspect Description');
    expect(result.aspect.properties.length).toBe(1);
    expect(result.aspect.properties[0].name).toBe('testProperty');
  });

  it('should load model using loadAspectModel helper function', async () => {
    const result = await firstValueFrom(
      loadAspectModel({
        filesContent: [sampleAspectTtl],
        aspectModelUrn: 'urn:samm:org.eclipse.esmf.samm:test:1.0.0#TestAspect',
      }),
    );

    expect(result.aspect).toBeDefined();
    expect(result.aspect.name).toBe('TestAspect');
    expect(result.rdfModel).toBeDefined();
    expect(result.store).toBeDefined();
    expect(result.cachedElements).toBeDefined();
    expect(result.cachedElements.get('urn:samm:org.eclipse.esmf.samm:test:1.0.0#TestAspect')).toBe(result.aspect);
  });
});
