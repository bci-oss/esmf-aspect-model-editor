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

import {LoadedFilesService, ModelApiPort, NamespaceFile, SammLanguageSettingsService} from '@ame/domain';
import {FileSaverService, LanguageTranslationService, NotificationsService} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MatDialogRef} from '@angular/material/dialog';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultAspect, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {of, throwError} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorService} from '../../../editor.service';
import {GenerateDiagramComponent} from './generate-diagram.component';

const fileSaver = {download: vi.fn()};

describe('GenerateDiagramComponent', () => {
  let component: GenerateDiagramComponent;
  let fixture: ComponentFixture<GenerateDiagramComponent>;
  let dialogRef: {close: ReturnType<typeof vi.fn>};
  let modelApi: ModelApiPort;
  let notifications: NotificationsService;

  const aspect = new DefaultAspect({aspectModelUrn: 'urn:samm:org.example:1.0.0#Movement', name: 'Movement', metaModelVersion: '2.2.0'});
  const rdfModel = new RdfModel(new Store(), '2.2.0', 'urn:samm:org.example:1.0.0#');
  const diagram = new Blob(['<svg/>'], {type: 'image/svg+xml'});

  beforeEach(async () => {
    dialogRef = {close: vi.fn()};
    vi.spyOn(rdfModel, 'getSourceLocation').mockReturnValue('workspace/org.example/1.0.0/Movement.ttl');

    await TestBed.configureTestingModule({
      imports: [
        GenerateDiagramComponent,
        BrowserAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        {provide: FileSaverService, useValue: fileSaver},
        {provide: MatDialogRef, useValue: dialogRef},
        MockProvider(SammLanguageSettingsService, {getSammLanguageCodes: vi.fn(() => ['en', 'de'])}),
        MockProvider(ModelApiPort, {generateDiagram: vi.fn(() => of(diagram))}),
        MockProvider(EditorService, {getSerializedModel: vi.fn(() => 'turtle model')}),
        MockProvider(LoadedFilesService, {currentLoadedFile: new NamespaceFile(rdfModel, new ModelElementCache(), aspect)}),
        MockProvider(NotificationsService, {error: vi.fn()}),
        MockProvider(LanguageTranslationService, {translateService: {translate: (key: string) => key} as any}),
      ],
    }).compileComponents();

    modelApi = TestBed.inject(ModelApiPort);
    notifications = TestBed.inject(NotificationsService);
    fixture = TestBed.createComponent(GenerateDiagramComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fileSaver.download.mockClear());

  it('should preselect the first model language and SVG', () => {
    expect(component.languages().map(language => language.tag)).toEqual(['en', 'de']);
    expect(component.diagramModel()).toEqual({language: 'en', format: 'SVG'});
  });

  it('should download the diagram named after the Aspect and close', () => {
    component.downloadDiagram();

    expect(modelApi.generateDiagram).toHaveBeenCalledWith('turtle model', 'en', 'SVG', 'workspace/org.example/1.0.0/Movement.ttl');
    expect(fileSaver.download).toHaveBeenCalledWith(diagram, 'Movement.svg');
    expect(dialogRef.close).toHaveBeenCalled();
    expect(component.isGenerating()).toBe(false);
  });

  it('should use the chosen language and format', () => {
    component.diagramModel.set({language: 'de', format: 'PNG'});

    component.downloadDiagram();

    expect(modelApi.generateDiagram).toHaveBeenCalledWith('turtle model', 'de', 'PNG', expect.any(String));
    expect(fileSaver.download).toHaveBeenCalledWith(diagram, 'Movement.png');
  });

  it('should keep the dialog open and report a failed generation', () => {
    vi.mocked(modelApi.generateDiagram).mockReturnValue(throwError(() => new Error('422')));

    component.downloadDiagram();

    expect(fileSaver.download).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith(expect.objectContaining({title: 'generateDiagramDialog.failed'}));
    expect(component.isGenerating()).toBe(false);
  });
});
