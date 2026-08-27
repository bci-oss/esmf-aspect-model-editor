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
import {FILTER_ATTRIBUTES, FiltersService} from '@ame/loader-filters';
import {MaxGraphAttributeService, MaxGraphService, MaxGraphShapeOverlayService, MaxGraphShapeSelectorService} from '@ame/max-graph';
import {ElementModelService} from '@ame/meta-model';
import {ModelService, RdfService} from '@ame/rdf/services';
import {ConfigurationService, SammLanguageSettingsService} from '@ame/settings-dialog';
import {AlertService, ElementCreatorService, LoadingScreenService, NotificationsService, TitleService} from '@ame/shared';
import {LanguageTranslationService} from '@ame/translation';
import {TestBed} from '@angular/core/testing';
import {DefaultAspect, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConfirmDialogService} from './confirm-dialog/confirm-dialog.service';
import {ShapeSettingsStateService} from './editor-dialog';
import {EditorService} from './editor.service';
import {ModelSaverService} from './model-saver.service';

describe('EditorService', () => {
  let service: EditorService;
  let modelApiService: ModelApiService;
  let rdfService: RdfService;

  const aspect = new DefaultAspect({
    aspectModelUrn: 'urn:test:1.0.0#Aspect',
    name: 'Aspect',
    metaModelVersion: '2.0.0',
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EditorService,
        MockProvider(FiltersService),
        {provide: FILTER_ATTRIBUTES, useValue: {isFiltering: false, changeState: vi.fn()}},
        MockProvider(ConfigurationService, {
          getSettings: vi.fn(
            () =>
              ({
                autoValidationEnabled: false,
                validationTimerSeconds: 60,
              }) as any,
          ),
        }),
        MockProvider(ModelSaverService, {
          enableAutoSave: vi.fn(),
        }),
        MockProvider(MaxGraphService, {
          initGraph: vi.fn(),
          resetValidationErrorOnAllShapes: vi.fn(),
        }),
        MockProvider(MaxGraphShapeOverlayService),
        MockProvider(MaxGraphShapeSelectorService, {
          getSelectedCells: vi.fn(() => []),
        }),
        MockProvider(MaxGraphAttributeService, {
          graph: {
            getContainer: vi.fn(() => document.createElement('div')),
            addListener: vi.fn(),
            getDataModel: vi.fn(() => ({addListener: vi.fn()})),
            view: {setTranslate: vi.fn()},
            zoomIn: vi.fn(),
            zoomOut: vi.fn(),
          } as any,
        }),
        MockProvider(NotificationsService),
        MockProvider(ModelApiService, {
          generateJsonSample: vi.fn(() => of('{}')),
          generateJsonSchema: vi.fn(() => of('{}')),
          generateOpenApiSpec: vi.fn(() => of('')),
          generateAsyncApiSpec: vi.fn(() => of('')),
          validate: vi.fn(() => of([])),
        }),
        MockProvider(ModelService, {
          synchronizeModelToRdf: vi.fn(() => of(undefined)),
        }),
        MockProvider(AlertService),
        MockProvider(RdfService, {
          serializeModel: vi.fn(() => 'turtle content'),
        }),
        MockProvider(SammLanguageSettingsService),
        MockProvider(ConfirmDialogService),
        MockProvider(ElementModelService),
        MockProvider(TitleService),
        MockProvider(ShapeSettingsStateService),
        MockProvider(LoadingScreenService, {
          open: vi.fn(() => ({afterOpened: () => of(null)}) as any),
          close: vi.fn(),
        }),
        MockProvider(LanguageTranslationService, {
          language: {
            loadingScreenDialog: {
              zoomInProgress: 'Zoom In',
              zoomInWait: 'Wait',
              zoomOutProgress: 'Zoom Out',
              fittingProgress: 'Fit',
              fittingWait: 'Wait',
              fitToViewProgress: 'Actual',
              folding: 'Fold',
              expanding: 'Expand',
              actionWait: 'Wait',
              formatting: 'Format',
              waitFormat: 'Wait',
            },
            notificationService: {},
          } as any,
        }),
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(new RdfModel(new Store(), '2.0.0', 'urn:test:1.0.0#'), new ModelElementCache(), aspect),
        }),
        MockProvider(ElementCreatorService),
      ],
    });

    service = TestBed.inject(EditorService);
    modelApiService = TestBed.inject(ModelApiService);
    rdfService = TestBed.inject(RdfService);
  });

  it('generateJsonSample should serialize model and call api', async () => {
    const rdfModel = new RdfModel(new Store());
    await new Promise(resolve => service.generateJsonSample(rdfModel).subscribe(resolve));

    expect(rdfService.serializeModel).toHaveBeenCalledWith(rdfModel);
    expect(modelApiService.generateJsonSample).toHaveBeenCalled();
  });

  it('validate should synchronize and call validate on api', async () => {
    await new Promise(resolve => service.validate().subscribe(resolve));

    expect(modelApiService.validate).toHaveBeenCalled();
  });
});
