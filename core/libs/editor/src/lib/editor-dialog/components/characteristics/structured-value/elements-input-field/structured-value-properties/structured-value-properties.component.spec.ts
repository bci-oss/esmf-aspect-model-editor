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
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultAspect, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorDialogValidators} from '../../../../../validators';
import {StructuredValuePropertiesComponent} from './structured-value-properties.component';

describe('StructuredValuePropertiesComponent', () => {
  let component: StructuredValuePropertiesComponent;
  let fixture: ComponentFixture<StructuredValuePropertiesComponent>;

  const dummyAspect = new DefaultAspect({
    aspectModelUrn: 'urn:test:1.0.0#Aspect',
    name: 'Aspect',
    metaModelVersion: '2.0.0',
  });

  const dialogRefMock = {
    close: vi.fn(),
  };

  const dialogData = {
    groups: [
      {
        start: 0,
        end: 5,
        text: '([a-z]+)',
        property: 'prop1',
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StructuredValuePropertiesComponent, BrowserAnimationsModule],
      providers: [
        {provide: MAT_DIALOG_DATA, useValue: dialogData},
        {provide: MatDialogRef, useValue: dialogRefMock},
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(new RdfModel(new Store(), '2.0.0', 'urn:test:1.0.0#'), new ModelElementCache(), dummyAspect),
          isElementExtern: vi.fn(() => false),
        }),
        MockProvider(ElementCreatorService),
        EditorDialogValidators,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StructuredValuePropertiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and populate table', () => {
    expect(component).toBeTruthy();
    expect(component.dataSource.data.length).toBe(1);
  });

  it('should close modal on cancel', () => {
    component.closeModal(false);
    expect(dialogRefMock.close).toHaveBeenCalledWith(null);
  });
});
