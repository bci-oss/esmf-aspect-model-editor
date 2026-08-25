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

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {MaxGraphService} from '@ame/max-graph';
import {RdfService} from '@ame/rdf/services';
import {NotificationsService, SearchService} from '@ame/shared';
import {provideHttpClient, withXhr} from '@angular/common/http';
import {provideHttpClientTesting} from '@angular/common/http/testing';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormGroup, ReactiveFormsModule} from '@angular/forms';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultEntity, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {TranslocoService} from '@jsverse/transloco';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {EditorModelService} from '../../../../editor-model.service';
import {EntityExtendsFieldComponent} from './extends-field.component';

vi.mock('@ame/editor', () => ({
  ModelElementEditorComponent: class {},
}));

describe('EntityExtendsFieldComponent', () => {
  let component: EntityExtendsFieldComponent;
  let fixture: ComponentFixture<EntityExtendsFieldComponent>;
  let editorModelService: EditorModelService;

  const rdfModel = new RdfModel(new Store());

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MatFormFieldModule, MatAutocompleteModule, ReactiveFormsModule, MatInputModule, BrowserAnimationsModule],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        MockProvider(TranslocoService, {
          langChanges$: new BehaviorSubject('en'),
          events$: new Subject(),
          translate: vi.fn(() => ''),
          selectTranslate: vi.fn(() => of('')),
          _loadDependencies: vi.fn(() => of(undefined)),
          config: {reRenderOnLangChange: false} as any,
        } as Partial<TranslocoService>),
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(rdfModel, new ModelElementCache(), null),
        }),
        MockProvider(NotificationsService),
        MockProvider(EditorModelService),
        MockProvider(RdfService),
        MockProvider(SearchService),
        MockProvider(MaxGraphService),
      ],
    });

    editorModelService = TestBed.inject(EditorModelService);
    editorModelService.getMetaModelElement = vi.fn(() => of(new DefaultEntity({metaModelVersion: '', aspectModelUrn: '', name: ''})));

    fixture = TestBed.createComponent(EntityExtendsFieldComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('parentForm', new FormGroup({}));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
