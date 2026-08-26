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
import {TestBed} from '@angular/core/testing';
import {FormControl} from '@angular/forms';
import {DefaultEntity, DefaultProperty, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorDialogValidators} from './editor-dialog-validators';

describe('EditorDialogValidators', () => {
  let validators: EditorDialogValidators;
  let modelApiService: ModelApiService;
  let loadedFilesService: LoadedFilesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EditorDialogValidators,
        MockProvider(ModelApiService, {
          checkElementExists: vi.fn(() => of(false)),
        }),
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(new RdfModel(new Store(), '2.0.0', 'urn:test:1.0.0#'), new ModelElementCache(), null),
        }),
      ],
    });

    validators = TestBed.inject(EditorDialogValidators);
    modelApiService = TestBed.inject(ModelApiService);
    loadedFilesService = TestBed.inject(LoadedFilesService);
  });

  describe('Static validators', () => {
    it('namingLowerCase should validate camelCase / lowercase naming', () => {
      expect(EditorDialogValidators.namingLowerCase(new FormControl(''))).toBeNull();
      expect(EditorDialogValidators.namingLowerCase(new FormControl('camelCase'))).toBeNull();
      expect(EditorDialogValidators.namingLowerCase(new FormControl('prop1'))).toBeNull();
      expect(EditorDialogValidators.namingLowerCase(new FormControl('PascalCase'))).toEqual({namingLowerCase: true});
      expect(EditorDialogValidators.namingLowerCase(new FormControl('1invalid'))).toEqual({namingLowerCase: true});
    });

    it('namingUpperCase should validate PascalCase naming', () => {
      expect(EditorDialogValidators.namingUpperCase(new FormControl(''))).toBeNull();
      expect(EditorDialogValidators.namingUpperCase(new FormControl('PascalCase'))).toBeNull();
      expect(EditorDialogValidators.namingUpperCase(new FormControl('Entity1'))).toBeNull();
      expect(EditorDialogValidators.namingUpperCase(new FormControl('camelCase'))).toEqual({namingUpperCase: true});
      expect(EditorDialogValidators.namingUpperCase(new FormControl('1Invalid'))).toEqual({namingUpperCase: true});
    });

    it('noWhiteSpace should reject whitespace', () => {
      expect(EditorDialogValidators.noWhiteSpace(new FormControl(''))).toBeNull();
      expect(EditorDialogValidators.noWhiteSpace(new FormControl('noSpace'))).toBeNull();
      expect(EditorDialogValidators.noWhiteSpace(new FormControl('has space'))).toEqual({whitespace: true});
    });

    it('requiredObject should check for empty value', () => {
      expect(EditorDialogValidators.requiredObject(new FormControl(null))).toEqual({required: true});
      expect(EditorDialogValidators.requiredObject(new FormControl('something'))).toBeNull();
    });

    it('regexValidator should validate regex syntax', () => {
      expect(EditorDialogValidators.regexValidator(new FormControl(''))).toBeNull();
      expect(EditorDialogValidators.regexValidator(new FormControl('^[a-z]+$'))).toBeNull();
      expect(EditorDialogValidators.regexValidator(new FormControl('[invalid('))).toBeDefined();
    });

    it('baseUrl should validate URL format', () => {
      expect(EditorDialogValidators.baseUrl(new FormControl('https://example.com'))).toBeNull();
      expect(EditorDialogValidators.baseUrl(new FormControl('http://example.com:8080'))).toBeNull();
      expect(EditorDialogValidators.baseUrl(new FormControl('not-a-url'))).toEqual({invalidUrl: true});
    });

    it('disabled validator should check control status', async () => {
      const enabledControl = new FormControl('test');
      const disabledControl = new FormControl({value: 'test', disabled: true});

      const enabledResult = await new Promise(resolve => EditorDialogValidators.disabled(enabledControl).subscribe(resolve));
      const disabledResult = await new Promise(resolve => EditorDialogValidators.disabled(disabledControl).subscribe(resolve));

      expect(enabledResult).toEqual({disabled: true});
      expect(disabledResult).toBeNull();
    });

    it('seeURI should validate comma separated URLs and URNs', () => {
      expect(EditorDialogValidators.seeURI(new FormControl(''))).toBeNull();
      expect(EditorDialogValidators.seeURI(new FormControl('https://example.com/spec, urn:samm:com.example:1.0.0#Test'))).toBeNull();
      expect(EditorDialogValidators.seeURI(new FormControl('invalid-uri-here'))).toEqual({
        uri: {invalidUris: ['invalid-uri-here'], elementsCount: 1},
      });
    });
  });

  describe('Instance validators', () => {
    it('duplicateName should return null if value is empty or same as current element', async () => {
      const element = new DefaultProperty({aspectModelUrn: 'urn:test:1.0.0#myProp', name: 'myProp', metaModelVersion: '2.0.0'});
      const validator = validators.duplicateName(element);

      const emptyResult = await new Promise(resolve => (validator(new FormControl('')) as any).subscribe(resolve));
      const sameNameResult = await new Promise(resolve => (validator(new FormControl('myProp')) as any).subscribe(resolve));

      expect(emptyResult).toBeNull();
      expect(sameNameResult).toBeNull();
    });

    it('duplicateName should return error when element exists in workspace', async () => {
      const element = new DefaultProperty({aspectModelUrn: 'urn:test:1.0.0#myProp', name: 'myProp', metaModelVersion: '2.0.0'});
      vi.spyOn(modelApiService, 'checkElementExists').mockReturnValue(of(true));

      const validator = validators.duplicateName(element);
      const result = await new Promise(resolve => (validator(new FormControl('otherProp')) as any).subscribe(resolve));

      expect(result).toEqual({checkShapeNameExtRef: true, foundModel: true});
    });

    it('duplicateName should check cache when not in workspace', async () => {
      const element = new DefaultProperty({aspectModelUrn: 'urn:test:1.0.0#myProp', name: 'myProp', metaModelVersion: '2.0.0'});
      const cached = new DefaultProperty({aspectModelUrn: 'urn:test:1.0.0#cachedProp', name: 'cachedProp', metaModelVersion: '2.0.0'});
      loadedFilesService.currentLoadedFile.cachedFile.resolveInstance(cached);

      vi.spyOn(modelApiService, 'checkElementExists').mockReturnValue(of(false));

      const validator = validators.duplicateName(element);
      const result = await new Promise(resolve => (validator(new FormControl('cachedProp')) as any).subscribe(resolve));

      expect(result).toEqual({checkShapeName: true, foundModel: cached});
    });

    it('duplicateNameWithDifferentType should allow duplicate name if of the specified modelType', async () => {
      const element = new DefaultProperty({aspectModelUrn: 'urn:test:1.0.0#myEntity', name: 'myEntity', metaModelVersion: '2.0.0'});
      const entity = new DefaultEntity({aspectModelUrn: 'urn:test:1.0.0#myEntity', name: 'myEntity', metaModelVersion: '2.0.0'});
      loadedFilesService.currentLoadedFile.cachedFile.resolveInstance(entity);

      vi.spyOn(modelApiService, 'checkElementExists').mockReturnValue(of(false));

      const validator = validators.duplicateNameWithDifferentType(element, DefaultEntity);
      const result = await new Promise(resolve => (validator(new FormControl('myEntity')) as any).subscribe(resolve));

      expect(result).toBeNull();
    });
  });
});
