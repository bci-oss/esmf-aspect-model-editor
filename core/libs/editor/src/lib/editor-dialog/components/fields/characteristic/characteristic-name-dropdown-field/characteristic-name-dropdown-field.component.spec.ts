/*
 * Copyright (c) 2026 Robert Bosch Manufacturing Solutions GmbH
 * SPDX-License-Identifier: MPL-2.0
 */

import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {CharacteristicClassType} from '@ame/editor';
import {ModelElementNamingService} from '@ame/meta-model';
import {ModelService} from '@ame/rdf/services';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {ElementCreatorService} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultCharacteristic, DefaultMeasurement, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorModelService} from '../../../../editor-model.service';
import {EditorSignalFormContext} from '../../../../forms/editor-signal-form-context';
import {CharacteristicNameDropdownFieldComponent} from './characteristic-name-dropdown-field.component';

describe('CharacteristicNameDropdownFieldComponent', () => {
  let component: CharacteristicNameDropdownFieldComponent;
  let fixture: ComponentFixture<CharacteristicNameDropdownFieldComponent>;
  let signalForm: EditorSignalFormContext;
  let editorModelService: EditorModelService;
  const characteristic = new DefaultCharacteristic({
    aspectModelUrn: 'urn:test:1.0.0#Characteristic',
    name: 'Characteristic',
    metaModelVersion: '2.0.0',
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CharacteristicNameDropdownFieldComponent, BrowserAnimationsModule],
      providers: [
        MockProvider(EditorModelService, {
          getMetaModelElement: vi.fn(() => of(characteristic)),
          updateMetaModelElement: vi.fn(),
          originalMetaModel: characteristic,
        }),
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(new RdfModel(new Store(), '2.0.0', 'urn:test:1.0.0#'), new ModelElementCache(), null),
        }),
        MockProvider(ModelElementNamingService),
        MockProvider(ModelService),
        MockProvider(SammLanguageSettingsService, {getSammLanguageCodes: vi.fn(() => [])}),
        MockProvider(ElementCreatorService),
      ],
    });
    signalForm = TestBed.runInInjectionContext(() => EditorSignalFormContext.create());
    editorModelService = TestBed.inject(EditorModelService);
    fixture = TestBed.createComponent(CharacteristicNameDropdownFieldComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('signalForm', signalForm);
  });

  it('should initialize class and predefined-instance groups', () => {
    fixture.detectChanges();

    expect(component.listCharacteristicGroup().get('Classes')).toContain(CharacteristicClassType.Measurement);
    expect(component.listCharacteristicGroup().get('Instances')).toContain('Boolean');
    expect(component.listCharacteristics.size).toBeGreaterThan(20);
  });

  it('should emit the current characteristic class on initialization', () => {
    const selected = vi.fn();
    component.selectedCharacteristic.subscribe(selected);

    fixture.detectChanges();

    expect(selected).toHaveBeenCalledWith(CharacteristicClassType.Characteristic);
  });

  it('should route changed model output through Signal Forms', () => {
    fixture.detectChanges();
    const measurement = new DefaultMeasurement({
      aspectModelUrn: 'urn:test:1.0.0#Measurement',
      name: 'Measurement',
      metaModelVersion: '2.0.0',
    });
    component.metaModelElement = measurement;

    component.updateFields(measurement);

    expect(signalForm.value().changedMetaModel).toBe(measurement);
    expect(editorModelService.updateMetaModelElement).toHaveBeenCalledWith(measurement);
  });
});
