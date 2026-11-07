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

import {ElementUsageReport, LoadedFilesService, ModelApiPort, NamespaceFile} from '@ame/domain';
import {MaxGraphService} from '@ame/graph';
import {SearchService} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultProperty, ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ElementRefactoringService} from '../../../../../refactoring/element-refactoring.service';
import {EditorModelService} from '../../../../editor-model.service';
import {EditorSignalFormContext} from '../../../../forms/editor-signal-form-context';
import {EditorDialogValidators} from '../../../../validators';
import {NameInputFieldComponent} from './name-input-field.component';

describe('NameInputFieldComponent', () => {
  let component: NameInputFieldComponent;
  let fixture: ComponentFixture<NameInputFieldComponent>;
  let signalForm: EditorSignalFormContext;
  let property: DefaultProperty;
  let elementRefactoring: {blocker: ReturnType<typeof vi.fn>; urnOf: ReturnType<typeof vi.fn>; refactor: ReturnType<typeof vi.fn>};
  let modelApi: {getElementUsage: ReturnType<typeof vi.fn>};

  const usageReport = (external: boolean): ElementUsageReport => ({
    urn: 'urn:test:1.0.0#testProp',
    usages: [
      {
        urn: 'urn:test:1.0.0#Aspect',
        namespace: 'test',
        version: '1.0.0',
        fileName: 'Other.ttl',
        path: 'Other.ttl',
        readOnly: false,
        external,
      },
    ],
    unreadable: [],
  });

  const query = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  const rename = async (name: string) => {
    component.field().value.set(name);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    elementRefactoring = {blocker: vi.fn(() => null), urnOf: vi.fn(() => 'urn:test:1.0.0#testProp'), refactor: vi.fn()};
    modelApi = {getElementUsage: vi.fn(() => of(usageReport(true)))};

    property = new DefaultProperty({
      aspectModelUrn: 'urn:test:1.0.0#testProp',
      name: 'testProp',
      metaModelVersion: '2.0.0',
    });

    const cachedFile = new ModelElementCache();
    const rdfModel = new RdfModel(new Store(), '2.0.0', 'urn:test:1.0.0#');

    TestBed.configureTestingModule({
      imports: [
        NameInputFieldComponent,
        BrowserAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {defaultLang: 'en', availableLangs: ['en']}}),
      ],
      providers: [
        MockProvider(EditorModelService, {
          getMetaModelElement: vi.fn(() => of(property)),
          isReadOnly: vi.fn(() => false),
        }),
        MockProvider(LoadedFilesService, {
          currentLoadedFile: new NamespaceFile(rdfModel, cachedFile, null),
          findElementOnExtReferences: vi.fn(() => null),
          isElementExtern: vi.fn(() => false),
        }),
        MockProvider(MaxGraphService, {
          getAllCells: vi.fn(() => []),
        }),
        MockProvider(SearchService),
        {provide: ElementRefactoringService, useValue: elementRefactoring},
        {provide: ModelApiPort, useValue: modelApi},
        MockProvider(EditorDialogValidators, {
          duplicateNameValue: vi.fn(value => (value === 'duplicate' ? of({checkShapeName: true}) : of(null))),
        }),
      ],
    });

    signalForm = TestBed.runInInjectionContext(() => EditorSignalFormContext.create());
    fixture = TestBed.createComponent(NameInputFieldComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('signalForm', signalForm);
    fixture.detectChanges();
  });

  it('should initialize and register name field', () => {
    expect(component).toBeTruthy();
    expect(signalForm.value().name).toBe('testProp');
    expect(component.field().valid()).toBe(true);
  });

  it('should validate lowercase naming for properties', () => {
    component.field().value.set('INVALID');
    expect(component.hasError('namingLowerCase')).toBe(true);
    expect(signalForm.valid()).toBe(false);

    component.field().value.set('validLower');
    expect(component.hasError('namingLowerCase')).toBe(false);
  });

  it('should validate required name', () => {
    component.field().value.set('');
    expect(component.hasError('required')).toBe(true);
  });

  it('should validate duplicate name asynchronously', async () => {
    component.field().value.set('duplicate');
    fixture.detectChanges();
    await fixture.whenStable();

    await vi.waitFor(() => expect(component.hasError('checkShapeName')).toBe(true));
  });

  it('should unregister name field on destroy', () => {
    fixture.destroy();
    expect(signalForm.value()).not.toHaveProperty('name');
  });

  describe('usage hint', () => {
    it('does not load the usages while the name is unchanged', () => {
      expect(modelApi.getElementUsage).not.toHaveBeenCalled();
      expect(component.usedInOtherFiles()).toBe(false);
    });

    it('warns about a rename breaking other files and offers to rename everywhere', async () => {
      await rename('speed');

      expect(modelApi.getElementUsage).toHaveBeenCalledWith('urn:test:1.0.0#testProp');
      expect(query('name-usage-hint')).not.toBeNull();

      query('name-usage-hint-rename')?.click();
      expect(elementRefactoring.refactor).toHaveBeenCalledWith('RENAME_ELEMENT', property, 'speed');
    });

    it('stays silent if only the own file uses the element', async () => {
      modelApi.getElementUsage.mockReturnValue(of(usageReport(false)));

      await rename('speed');

      expect(component.usedInOtherFiles()).toBe(false);
      expect(query('name-usage-hint')).toBeNull();
    });

    it('is hidden again when the old name is restored', async () => {
      await rename('speed');
      await rename('testProp');

      expect(query('name-usage-hint')).toBeNull();
    });

    it('is not offered for elements that cannot be refactored', async () => {
      elementRefactoring.blocker.mockReturnValue('notSaved');
      fixture = TestBed.createComponent(NameInputFieldComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput(
        'signalForm',
        TestBed.runInInjectionContext(() => EditorSignalFormContext.create()),
      );
      fixture.detectChanges();

      await rename('speed');

      expect(modelApi.getElementUsage).not.toHaveBeenCalled();
    });
  });
});
