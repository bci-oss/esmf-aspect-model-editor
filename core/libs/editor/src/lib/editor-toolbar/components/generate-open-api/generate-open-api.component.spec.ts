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

import {ModelApiService} from '@ame/api';
import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {NotificationsService} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MatDialogRef} from '@angular/material/dialog';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultAspect, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorDialogValidators} from '../../../editor-dialog';
import {EditorService} from '../../../editor.service';
import {GenerateOpenApiComponent} from './generate-open-api.component';

describe('GenerateOpenApiComponent', () => {
  let component: GenerateOpenApiComponent;
  let fixture: ComponentFixture<GenerateOpenApiComponent>;
  let dialogRef: MatDialogRef<GenerateOpenApiComponent>;
  let editorService: EditorService;

  const aspect = new DefaultAspect({
    aspectModelUrn: 'urn:test:1.0.0#Aspect',
    name: 'Aspect',
    metaModelVersion: '2.0.0',
  });

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MatDialogRef<GenerateOpenApiComponent>;

    await TestBed.configureTestingModule({
      imports: [
        GenerateOpenApiComponent,
        BrowserAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        {provide: MatDialogRef, useValue: dialogRef},
        MockProvider(SammLanguageSettingsService, {
          getSammLanguageCodes: vi.fn(() => ['en']),
        }),
        MockProvider(EditorService, {
          generateOpenApiSpec: vi.fn(() => of('openapi: 3.0.0')),
        }),
        MockProvider(NotificationsService),
        MockProvider(EditorDialogValidators),
        MockProvider(ModelApiService),
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(new RdfModel(new Store(), '2.0.0', 'urn:test:1.0.0#'), new ModelElementCache(), aspect),
        }),
      ],
    }).compileComponents();

    editorService = TestBed.inject(EditorService);
    fixture = TestBed.createComponent(GenerateOpenApiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize form', () => {
    expect(component).toBeTruthy();
    expect(component.form).toBeDefined();
    expect(component.form.get('baseUrl').value).toBe('https://example.com');
  });

  it('generateOpenApiSpec should call editorService.generateOpenApiSpec and close dialog', () => {
    component.generateOpenApiSpec();

    expect(editorService.generateOpenApiSpec).toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
