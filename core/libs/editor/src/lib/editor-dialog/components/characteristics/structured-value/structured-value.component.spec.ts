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
import {MaxGraphService} from '@ame/max-graph';
import {RdfService} from '@ame/rdf/services';
import {NotificationsService, SearchService} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormGroup, ReactiveFormsModule} from '@angular/forms';
import {MatDialog} from '@angular/material/dialog';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultAspect, DefaultStructuredValue, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorModelService} from '../../../editor-model.service';
import {EditorDialogValidators} from '../../../validators';
import {PredefinedRulesService} from './predefined-rules.service';
import {StructuredValueComponent} from './structured-value.component';

describe('StructuredValueComponent', () => {
  let component: StructuredValueComponent;
  let fixture: ComponentFixture<StructuredValueComponent>;

  const dummyAspect = new DefaultAspect({
    aspectModelUrn: 'urn:test:1.0.0#Aspect',
    name: 'Aspect',
    metaModelVersion: '2.0.0',
  });

  const structuredValue = new DefaultStructuredValue({
    aspectModelUrn: 'urn:test:1.0.0#TestStructuredValue',
    name: 'TestStructuredValue',
    metaModelVersion: '2.0.0',
    deconstructionRule: '(.*)',
    elements: ['([a-z]+)'],
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        StructuredValueComponent,
        ReactiveFormsModule,
        BrowserAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        MockProvider(EditorModelService, {
          getMetaModelElement: vi.fn(() => of(structuredValue)),
          isReadOnly: vi.fn(() => false),
        }),
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(new RdfModel(new Store(), '2.0.0', 'urn:test:1.0.0#'), new ModelElementCache(), dummyAspect),
          isElementExtern: vi.fn(() => false),
        }),
        PredefinedRulesService,
        EditorDialogValidators,
        MockProvider(MatDialog),
        MockProvider(MaxGraphService),
        MockProvider(NotificationsService),
        MockProvider(RdfService),
        MockProvider(SearchService),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StructuredValueComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('parentForm', new FormGroup({}));
    fixture.detectChanges();
  });

  it('should create and initialize form with rules', () => {
    expect(component).toBeTruthy();
    expect(component.selectedRule()).toBeDefined();
    expect(component.predefinedRules().length).toBeGreaterThan(0);
  });
});
