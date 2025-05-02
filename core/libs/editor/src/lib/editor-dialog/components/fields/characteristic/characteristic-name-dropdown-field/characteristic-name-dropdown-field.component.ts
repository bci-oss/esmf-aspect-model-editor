/*
 * Copyright (c) 2024 Robert Bosch Manufacturing Solutions GmbH
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
import {CharacteristicClassType} from '@ame/editor';
import {ModelElementNamingService} from '@ame/meta-model';
import {ModelService} from '@ame/rdf/services';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {createEmptyElement} from '@ame/shared';
import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {
  Characteristic,
  DefaultCharacteristic,
  DefaultCode,
  DefaultCollection,
  DefaultDuration,
  DefaultEither,
  DefaultEnumeration,
  DefaultList,
  DefaultMeasurement,
  DefaultQuantifiable,
  DefaultSet,
  DefaultSingleEntity,
  DefaultSortedSet,
  DefaultState,
  DefaultStructuredValue,
  DefaultTimeSeries,
  NamedElement,
  Unit,
  useLoader,
} from '@esmf/aspect-model-loader';
import {DataFactory} from 'n3';
import {EditorModelService} from '../../../../editor-model.service';
import {DropdownFieldComponent} from '../../dropdown-field.component';

@Component({
  selector: 'ame-characteristic-name-dropdown-field',
  templateUrl: './characteristic-name-dropdown-field.component.html',
})
export class CharacteristicNameDropdownFieldComponent extends DropdownFieldComponent<DefaultCharacteristic> implements OnInit {
  public listCharacteristics: Map<string, Function> = new Map();
  public listCharacteristicGroup: Map<string, Array<string>> = new Map();
  public units: Array<Unit> = [];

  @Output() selectedCharacteristic = new EventEmitter<CharacteristicClassType>();

  constructor(
    public editorModelService: EditorModelService,
    public modelService: ModelService,
    public languageSettings: SammLanguageSettingsService,
    private modelElementNamingService: ModelElementNamingService,
    public loadedFilesService: LoadedFilesService,
  ) {
    super(editorModelService, modelService, languageSettings, loadedFilesService);
  }

  ngOnInit(): void {
    this.initListCharacteristics();
    this.subscription.add(
      this.getMetaModelData().subscribe(() => {
        this.selectedMetaModelElement = this.metaModelElement;
        this.setMetaModelClassName();
        this.selectedCharacteristic.emit(this.metaModelClassName as CharacteristicClassType);
      }),
    );
  }

  onCharacteristicChange(characteristic: string) {
    this.setPreviousData();

    const createInstanceFunction = this.listCharacteristics.get(characteristic);
    const newCharacteristicType = this.getMetaModelElementTypeWhenChange(createInstanceFunction);

    const oldMetaModelElement = this.metaModelElement;
    this.metaModelElement = newCharacteristicType;

    if (newCharacteristicType?.isPredefined) {
      this.metaModelElement.name = newCharacteristicType.name;
    } else {
      const oldCharacteristic = oldMetaModelElement;
      const selectedCharacteristic = this.selectedMetaModelElement;

      if (oldCharacteristic.isPredefined && !selectedCharacteristic.isPredefined) {
        this.metaModelElement.name = this.selectedMetaModelElement.name;
      } else if (oldCharacteristic.isPredefined && selectedCharacteristic.isPredefined) {
        this.metaModelElement = this.modelElementNamingService.resolveElementNaming(newCharacteristicType) as DefaultCharacteristic;
        if (this.originalCharacteristic && !this.originalCharacteristic.isPredefined) {
          this.metaModelElement.name = this.originalCharacteristic.name;
          this.metaModelElement.aspectModelUrn = this.originalCharacteristic.aspectModelUrn;
        }
      } else {
        this.metaModelElement.name = oldMetaModelElement.name;
        this.migrateCommonAttributes(oldMetaModelElement);
      }
    }
    this.addLanguageSettings(this.metaModelElement);
    this.setMetaModelElementAspectUrn(newCharacteristicType);

    this.selectedCharacteristic.emit(characteristic as CharacteristicClassType);
    this.updateFields(newCharacteristicType);
  }

  private initListCharacteristics(): void {
    if (this.listCharacteristics.size <= 0) {
      this.listCharacteristicGroup.set('Classes', this.createCharacteristicClassesList());
      this.listCharacteristicGroup.set('Instances', this.createCharacteristicInstancesList());
    }
  }

  private createCharacteristicClassesList() {
    const characteristicList = [...this.listCharacteristics.keys()];
    this.listCharacteristics.set(CharacteristicClassType.Characteristic, () => createEmptyElement(DefaultCharacteristic));
    this.listCharacteristics.set(CharacteristicClassType.Code, () => createEmptyElement(DefaultCode));
    this.listCharacteristics.set(CharacteristicClassType.Collection, () => createEmptyElement(DefaultCollection));
    this.listCharacteristics.set(CharacteristicClassType.Duration, () => createEmptyElement(DefaultDuration));
    this.listCharacteristics.set(CharacteristicClassType.Either, () => createEmptyElement(DefaultEither));
    this.listCharacteristics.set(CharacteristicClassType.Enumeration, () => createEmptyElement(DefaultEnumeration));
    this.listCharacteristics.set(CharacteristicClassType.List, () => createEmptyElement(DefaultList));
    this.listCharacteristics.set(CharacteristicClassType.Measurement, () => createEmptyElement(DefaultMeasurement));
    this.listCharacteristics.set(CharacteristicClassType.Quantifiable, () => createEmptyElement(DefaultQuantifiable));
    this.listCharacteristics.set(CharacteristicClassType.Set, () => createEmptyElement(DefaultSet));
    this.listCharacteristics.set(CharacteristicClassType.SortedSet, () => createEmptyElement(DefaultSortedSet));
    this.listCharacteristics.set(CharacteristicClassType.SingleEntity, () => createEmptyElement(DefaultSingleEntity));
    this.listCharacteristics.set(CharacteristicClassType.State, () => createEmptyElement(DefaultState));
    this.listCharacteristics.set(CharacteristicClassType.StructuredValue, () => createEmptyElement(DefaultStructuredValue));
    this.listCharacteristics.set(CharacteristicClassType.TimeSeries, () => createEmptyElement(DefaultTimeSeries));
    return [...this.listCharacteristics.keys()].filter(value => !characteristicList.includes(value));
  }

  private createCharacteristicInstancesList() {
    const instanceList = [...this.listCharacteristics.keys()];
    this.listCharacteristics.set('Boolean', () => this.createDefaultCharacteristic('Boolean'));
    this.listCharacteristics.set('Language', () => this.createDefaultCharacteristic('Language'));
    this.listCharacteristics.set('Locale', () => this.createDefaultCharacteristic('Locale'));
    this.listCharacteristics.set('MultiLanguageText', () => this.createDefaultCharacteristic('MultiLanguageText'));
    this.listCharacteristics.set('MimeType', () => this.createDefaultCharacteristic('MimeType'));
    this.listCharacteristics.set('ResourcePath', () => this.createDefaultCharacteristic('ResourcePath'));
    this.listCharacteristics.set('Text', () => this.createDefaultCharacteristic('Text'));
    this.listCharacteristics.set('Timestamp', () => this.createDefaultCharacteristic('Timestamp'));
    this.listCharacteristics.set('UnitReference', () => this.createDefaultCharacteristic('UnitReference'));
    return [...this.listCharacteristics.keys()].filter(value => !instanceList.includes(value));
  }

  private createDefaultCharacteristic(characteristicName: string): Characteristic {
    const rdfModel = this.loadedFilesService.currentLoadedFile.rdfModel;
    const cache = this.loadedFilesService.currentLoadedFile.cachedFile;
    const {createDefaultCharacteristic} = useLoader({rdfModel, cache});
    return createDefaultCharacteristic(
      DataFactory.quad(null, null, DataFactory.namedNode(`${rdfModel.sammC.getUri()}#${characteristicName}`)),
    );
  }

  private migrateCommonAttributes(oldMetaModelElement: NamedElement) {
    const modelKeys = Object.keys(this.metaModelElement);
    const skipKeys = ['aspectModelUrn', 'name', 'className'];
    const {createUnit} = useLoader({
      rdfModel: this.loadedFilesService.currentLoadedFile.rdfModel,
      cache: this.loadedFilesService.currentLoadedFile.cachedFile,
    });

    Object.keys(oldMetaModelElement).forEach(oldKey => {
      if (modelKeys.includes(oldKey) && !skipKeys.includes(oldKey)) {
        if (oldKey === 'unit' && this.metaModelElement instanceof DefaultDuration) {
          const matchedUnit = this.units.find(
            unit =>
              unit.quantityKinds &&
              unit.quantityKinds.includes('time') &&
              unit.name.toLowerCase().indexOf(oldMetaModelElement[oldKey].name.toLowerCase()) >= 0,
          );
          if (matchedUnit) {
            this.metaModelElement[oldKey] = createUnit(matchedUnit.name);
          }
        } else {
          this.metaModelElement[oldKey] = oldMetaModelElement[oldKey];
        }
      }
    });
  }

  private setMetaModelElementAspectUrn(modelElement: NamedElement) {
    const currentRdfModel = this.loadedFilesService.currentLoadedFile.rdfModel;
    const {getSupportedCharacteristicNames} = useLoader({
      rdfModel: currentRdfModel,
      cache: this.loadedFilesService.currentLoadedFile.cachedFile,
    });

    if (getSupportedCharacteristicNames()?.includes(modelElement.name)) {
      this.metaModelElement.aspectModelUrn = `${currentRdfModel.getAspectModelUrn()}${modelElement.name}`;
    }
  }

  private getMetaModelElementTypeWhenChange(createInstanceFunction: Function) {
    const modelElementType = createInstanceFunction();
    if (modelElementType.aspectModelUrn === this.selectedMetaModelElement.aspectModelUrn) {
      this.metaModelElement = this.selectedMetaModelElement;
      return;
    }
    return modelElementType;
  }
}
