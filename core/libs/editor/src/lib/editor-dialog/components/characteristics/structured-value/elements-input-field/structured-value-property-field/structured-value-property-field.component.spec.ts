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

import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {ElementCreatorService} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultAspect, DefaultProperty, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorDialogValidators} from '../../../../../validators';
import {StructuredValuePropertyFieldComponent} from './structured-value-property-field.component';

describe('StructuredValuePropertyFieldComponent', () => {
  let component: StructuredValuePropertyFieldComponent;
  let fixture: ComponentFixture<StructuredValuePropertyFieldComponent>;

  const dummyAspect = new DefaultAspect({
    aspectModelUrn: 'urn:test:1.0.0#Aspect',
    name: 'Aspect',
    metaModelVersion: '2.0.0',
  });

  const defaultProp = new DefaultProperty({
    aspectModelUrn: 'urn:test:1.0.0#testProp',
    name: 'testProp',
    metaModelVersion: '2.0.0',
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StructuredValuePropertyFieldComponent, ReactiveFormsModule, BrowserAnimationsModule],
      providers: [
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(new RdfModel(new Store(), '2.0.0', 'urn:test:1.0.0#'), new ModelElementCache(), dummyAspect),
          isElementExtern: vi.fn(() => false),
        }),
        MockProvider(ElementCreatorService),
        EditorDialogValidators,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StructuredValuePropertyFieldComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('defaultProperty', defaultProp);
    fixture.componentRef.setInput('fieldControl', new FormControl());
    fixture.detectChanges();
  });

  it('should create and initialize control', () => {
    expect(component).toBeTruthy();
    expect(component.control).toBeDefined();
    expect(component.control.value).toBe('testProp');
  });

  it('should unlock control', () => {
    component.unlock();
    expect(component.control.enabled).toBe(true);
    expect(component.control.value).toBe('');
  });
});
