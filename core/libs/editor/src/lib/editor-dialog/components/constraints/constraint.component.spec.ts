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
import {ModelService, RdfService} from '@ame/rdf/services';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {NotificationsService, SearchService} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormGroup, ReactiveFormsModule} from '@angular/forms';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultAspect, DefaultConstraint, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorModelService} from '../../editor-model.service';
import {EditorDialogValidators} from '../../validators';
import {ConstraintComponent} from './constraint.component';

describe('ConstraintComponent', () => {
  let component: ConstraintComponent;
  let fixture: ComponentFixture<ConstraintComponent>;

  const dummyAspect = new DefaultAspect({
    aspectModelUrn: 'urn:test:1.0.0#Aspect',
    name: 'Aspect',
    metaModelVersion: '2.0.0',
  });

  const constraint = new DefaultConstraint({
    aspectModelUrn: 'urn:test:1.0.0#TestConstraint',
    name: 'TestConstraint',
    metaModelVersion: '2.0.0',
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ConstraintComponent,
        ReactiveFormsModule,
        BrowserAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        MockProvider(EditorModelService, {
          getMetaModelElement: vi.fn(() => of(constraint)),
          isReadOnly: vi.fn(() => false),
        }),
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(new RdfModel(new Store(), '2.0.0', 'urn:test:1.0.0#'), new ModelElementCache(), dummyAspect),
          isElementExtern: vi.fn(() => false),
        }),
        MockProvider(SammLanguageSettingsService, {
          getSammLanguageCodes: vi.fn(() => ['en', 'de']),
        }),
        EditorDialogValidators,
        MockProvider(MaxGraphService),
        MockProvider(NotificationsService),
        MockProvider(RdfService),
        MockProvider(ModelService),
        MockProvider(SearchService),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConstraintComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('parentForm', new FormGroup({}));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should handle class change', () => {
    component.selectedConstraint.set('EncodingConstraint');
    expect(component.selectedConstraint()).toBe('EncodingConstraint');
  });

  it('should handle previous data change', () => {
    component.onPreviousDataChange({name: 'Updated'});
    expect(component.previousData()).toEqual({name: 'Updated'});
  });
});
