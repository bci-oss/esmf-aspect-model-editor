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

import {LoadedFilesService} from '@ame/cache';
import {ConfirmDialogEnum, ConfirmDialogService, ShapeSettingsService} from '@ame/editor';
import {MaxGraphHelper, MaxGraphService} from '@ame/max-graph';
import {ElectronSignalsService, SearchService} from '@ame/shared';
import {LanguageTranslationService} from '@ame/translation';
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {FormsModule} from '@angular/forms';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultAspect, DefaultProperty} from '@esmf/aspect-model-loader';
import {TranslocoService} from '@jsverse/transloco';
import {MockProvider} from 'ng-mocks';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SearchesStateService} from '../../search-state.service';
import {ElementsSearchComponent} from './elements-search.component';

describe('ElementsSearchComponent', () => {
  let component: ElementsSearchComponent;
  let fixture: ComponentFixture<ElementsSearchComponent>;
  let maxGraphService: MaxGraphService;
  let searchesStateService: SearchesStateService;
  let confirmDialogService: ConfirmDialogService;
  let searchService: SearchService;
  let loadedFiles: LoadedFilesService;
  let electronSignalsService: ElectronSignalsService;
  let shapeSettingsService: ShapeSettingsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ElementsSearchComponent,
        FormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatAutocompleteModule,
        MatIconModule,
        BrowserAnimationsModule,
      ],
      providers: [
        MockProvider(LoadedFilesService, {
          isElementExtern: vi.fn(() => false),
          getFileFromElement: vi.fn(() => 'TestFile.ttl'),
        }),
        MockProvider(MaxGraphService, {
          getAllCells: vi.fn(() => []),
          navigateToCellByUrn: vi.fn(),
        }),
        MockProvider(ShapeSettingsService, {
          editModel: vi.fn(),
        }),
        MockProvider(SearchesStateService, {
          elementsSearch: {close: vi.fn()} as any,
          filesSearch: {close: vi.fn()} as any,
        }),
        MockProvider(ConfirmDialogService, {
          open: vi.fn(() => of(ConfirmDialogEnum.ok)),
        }),
        MockProvider(SearchService, {
          search: vi.fn(() => []),
        }),
        MockProvider(LanguageTranslationService, {
          translateService: {
            translate: vi.fn((key: string) => key),
          } as any,
          language: {
            confirmDialog: {
              newWindowElement: {
                title: 'Title',
                phrase1: 'Phrase',
                cancelButton: 'Cancel',
                okButton: 'OK',
              },
            },
          } as any,
        }),
        MockProvider(ElectronSignalsService, {
          call: vi.fn(),
        }),
        MockProvider(TranslocoService, {
          langChanges$: new BehaviorSubject('en'),
          events$: new Subject(),
          translate: vi.fn((key: string) => key),
          selectTranslate: vi.fn(() => of('')),
          _loadDependencies: vi.fn(() => of(undefined)),
          config: {reRenderOnLangChange: false} as any,
        } as Partial<TranslocoService>),
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementsSearchComponent);
    component = fixture.componentInstance;
    maxGraphService = TestBed.inject(MaxGraphService);
    searchesStateService = TestBed.inject(SearchesStateService);
    confirmDialogService = TestBed.inject(ConfirmDialogService);
    searchService = TestBed.inject(SearchService);
    loadedFiles = TestBed.inject(LoadedFilesService);
    electronSignalsService = TestBed.inject(ElectronSignalsService);
    shapeSettingsService = TestBed.inject(ShapeSettingsService);
    fixture.detectChanges();
  });

  it('should create component', () => {
    expect(component).toBeTruthy();
  });

  it('should transform elements and provide symbols', () => {
    const aspect = new DefaultAspect();
    aspect.name = 'TestAspect';
    aspect.aspectModelUrn = 'urn:samm:org.eclipse.examples:1.0.0#TestAspect';

    const property = new DefaultProperty();
    property.name = 'testProp';
    property.aspectModelUrn = 'urn:samm:org.eclipse.examples:1.0.0#testProp';

    component.elements.set([aspect, property]);

    const transformed = component.transformedElements();
    expect(transformed.length).toBe(2);
    expect(transformed[0].element).toBe(aspect);
    expect(transformed[0].type).toBe('aspect');
    expect(transformed[1].element).toBe(property);
    expect(transformed[1].type).toBe('property');
  });

  it('should filter elements when search query changes', fakeAsync(() => {
    const mockCell = {} as any;
    const aspect = new DefaultAspect();
    vi.spyOn(MaxGraphHelper, 'getModelElement').mockReturnValue(aspect);
    vi.spyOn(searchService, 'search').mockReturnValue([mockCell]);

    component.searchQuery.set('Test');
    tick(200);

    expect(searchService.search).toHaveBeenCalled();
    expect(component.elements()).toEqual([aspect]);
  }));

  it('should navigate to local element and edit model', () => {
    const aspect = new DefaultAspect();
    aspect.name = 'TestAspect';
    aspect.aspectModelUrn = 'urn:samm:org.eclipse.examples:1.0.0#TestAspect';
    vi.spyOn(loadedFiles, 'isElementExtern').mockReturnValue(false);

    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      cb();
      return 0;
    });

    component.openElement(aspect);

    expect(shapeSettingsService.editModel).toHaveBeenCalledWith(aspect);
    expect(maxGraphService.navigateToCellByUrn).toHaveBeenCalledWith(aspect.aspectModelUrn);
    expect(searchesStateService.elementsSearch.close).toHaveBeenCalled();
    expect(component.searchQuery()).toBe('');

    vi.unstubAllGlobals();
  });

  it('should open confirmation dialog and open window for external element', () => {
    const aspect = new DefaultAspect();
    aspect.name = 'ExternalAspect';
    aspect.aspectModelUrn = 'urn:samm:org.eclipse.examples:1.0.0#ExternalAspect';
    aspect.isPredefined = false;

    vi.spyOn(loadedFiles, 'isElementExtern').mockReturnValue(true);
    vi.spyOn(confirmDialogService, 'open').mockReturnValue(of(ConfirmDialogEnum.ok));

    component.openElement(aspect);

    expect(confirmDialogService.open).toHaveBeenCalled();
    expect(electronSignalsService.call).toHaveBeenCalledWith('openWindow', {
      file: 'TestFile.ttl',
      namespace: 'org.eclipse.examples:1.0.0',
      editElement: aspect.aspectModelUrn,
      fromWorkspace: true,
      aspectModelUrn: aspect.aspectModelUrn,
    });
    expect(searchesStateService.elementsSearch.close).toHaveBeenCalled();
  });

  it('should not open window if user cancels confirm dialog for external element', () => {
    const aspect = new DefaultAspect();
    aspect.name = 'ExternalAspect';
    aspect.aspectModelUrn = 'urn:samm:org.eclipse.examples:1.0.0#ExternalAspect';
    aspect.isPredefined = false;

    vi.spyOn(loadedFiles, 'isElementExtern').mockReturnValue(true);
    vi.spyOn(confirmDialogService, 'open').mockReturnValue(of(ConfirmDialogEnum.cancel));

    component.openElement(aspect);

    expect(confirmDialogService.open).toHaveBeenCalled();
    expect(electronSignalsService.call).not.toHaveBeenCalled();
  });
});
