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

import {LoadedFilesService, ModelApiPort, NamespaceFile} from '@ame/domain';
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
import {GenerateJavaComponent, JAVA_PACKAGE_PATTERN} from './generate-java.component';

const fileSaver = {download: vi.fn()};

describe('GenerateJavaComponent', () => {
  let component: GenerateJavaComponent;
  let fixture: ComponentFixture<GenerateJavaComponent>;
  let dialogRef: {close: ReturnType<typeof vi.fn>};
  let modelApi: ModelApiPort;
  let notifications: NotificationsService;

  const aspect = new DefaultAspect({
    aspectModelUrn: 'urn:samm:org.example-company:1.0.0#Movement',
    name: 'Movement',
    metaModelVersion: '2.2.0',
  });
  const rdfModel = new RdfModel(new Store(), '2.2.0', 'urn:samm:org.example-company:1.0.0#');
  const archive = new Blob(['zip'], {type: 'application/zip'});

  beforeEach(async () => {
    dialogRef = {close: vi.fn()};
    vi.spyOn(rdfModel, 'getSourceLocation').mockReturnValue('workspace/org.example-company/1.0.0/Movement.ttl');

    await TestBed.configureTestingModule({
      imports: [
        GenerateJavaComponent,
        BrowserAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        {provide: FileSaverService, useValue: fileSaver},
        {provide: MatDialogRef, useValue: dialogRef},
        MockProvider(ModelApiPort, {generateJavaClasses: vi.fn(() => of(archive))}),
        MockProvider(EditorService, {getSerializedModel: vi.fn(() => 'turtle model')}),
        MockProvider(LoadedFilesService, {currentLoadedFile: new NamespaceFile(rdfModel, new ModelElementCache(), aspect)}),
        MockProvider(NotificationsService, {error: vi.fn()}),
        MockProvider(LanguageTranslationService, {translateService: {translate: (key: string) => key} as any}),
      ],
    }).compileComponents();

    modelApi = TestBed.inject(ModelApiPort);
    notifications = TestBed.inject(NotificationsService);
    fixture = TestBed.createComponent(GenerateJavaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fileSaver.download.mockClear());

  it('should propose the namespace as package and generate POJOs with Jackson annotations by default', () => {
    expect(component.defaultPackageName).toBe('org.example_company');
    expect(component.javaModel()).toEqual({packageName: '', staticMetaModel: false, jacksonAnnotations: true});
    expect(component.javaForm().invalid()).toBe(false);
  });

  it('should download the classes as ZIP named after the Aspect and close', () => {
    component.javaModel.set({packageName: ' com.example ', staticMetaModel: true, jacksonAnnotations: false});

    component.downloadJavaClasses();

    expect(modelApi.generateJavaClasses).toHaveBeenCalledWith(
      'turtle model',
      {packageName: 'com.example', staticMetaModel: true, jacksonAnnotations: false},
      'workspace/org.example-company/1.0.0/Movement.ttl',
    );
    expect(fileSaver.download).toHaveBeenCalledWith(archive, 'Movement-java.zip');
    expect(dialogRef.close).toHaveBeenCalled();
    expect(component.isGenerating()).toBe(false);
  });

  it('should reject package names that are no Java identifiers', () => {
    component.javaModel.update(model => ({...model, packageName: 'com.1example'}));

    expect(component.javaForm().invalid()).toBe(true);
  });

  it.each(['', 'com', 'com.example.movement', 'org._internal$'])('should accept the package name "%s"', name => {
    expect(JAVA_PACKAGE_PATTERN.test(name)).toBe(true);
  });

  it.each(['com.', '.com', 'com..example', 'com-example', '1com'])('should reject the package name "%s"', name => {
    expect(JAVA_PACKAGE_PATTERN.test(name)).toBe(false);
  });

  it('should keep the dialog open and report a failed generation', () => {
    vi.mocked(modelApi.generateJavaClasses).mockReturnValue(throwError(() => new Error('400')));

    component.downloadJavaClasses();

    expect(fileSaver.download).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith(expect.objectContaining({title: 'generateJavaDialog.failed'}));
    expect(component.isGenerating()).toBe(false);
  });
});
