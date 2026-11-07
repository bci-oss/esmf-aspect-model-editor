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

import {LoadedFilesService, ModelSourcesStore, RefactoringDialogPort} from '@ame/domain';
import {MaxGraphShapeSelectorService} from '@ame/graph';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {DefaultProperty, NamedElement} from '@esmf/aspect-model-loader';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ShapeSettingsStateService} from '../../editor-dialog/services/shape-settings-state.service';
import {ElementRefactoringMenuComponent} from './element-refactoring-menu.component';

const SPEED = 'urn:samm:org.example:1.0.0#speed';

describe('ElementRefactoringMenuComponent', () => {
  let fixture: ComponentFixture<ElementRefactoringMenuComponent>;
  let component: ElementRefactoringMenuComponent;
  let refactoringDialog: {open: ReturnType<typeof vi.fn>; showUsages: ReturnType<typeof vi.fn>};
  let loadedFiles: {currentLoadedFile: unknown; isElementExtern: ReturnType<typeof vi.fn>};
  let readOnlyLocation: boolean;
  let shapeSettingsState: {closeShapeSettings: ReturnType<typeof vi.fn>; setSelectedShapeForUpdate: ReturnType<typeof vi.fn>};

  const property = new DefaultProperty({aspectModelUrn: SPEED, name: 'speed', metaModelVersion: '2.2.0'});

  const create = (element: NamedElement | null = property) => {
    TestBed.configureTestingModule({
      imports: [
        ElementRefactoringMenuComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        provideZonelessChangeDetection(),
        {provide: RefactoringDialogPort, useValue: refactoringDialog},
        {provide: LoadedFilesService, useValue: loadedFiles},
        {provide: ModelSourcesStore, useValue: {isReadOnlyLocation: () => readOnlyLocation}},
        {provide: ShapeSettingsStateService, useValue: shapeSettingsState},
        {provide: MaxGraphShapeSelectorService, useValue: {selectedCells: signal([])}},
      ],
    });
    fixture = TestBed.createComponent(ElementRefactoringMenuComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('element', element);
    fixture.detectChanges();
  };

  beforeEach(() => {
    refactoringDialog = {open: vi.fn(() => of(null)), showUsages: vi.fn()};
    loadedFiles = {
      currentLoadedFile: {fromWorkspace: true, rdfModel: {getSourceLocation: () => '/workspace/org.example/1.0.0/Movement.ttl'}},
      isElementExtern: vi.fn(() => false),
    };
    readOnlyLocation = false;
    shapeSettingsState = {closeShapeSettings: vi.fn(), setSelectedShapeForUpdate: vi.fn()};
  });

  it('renames an element of the current workspace model after closing the editor', () => {
    create();

    component.refactor('RENAME_ELEMENT');

    expect(shapeSettingsState.closeShapeSettings).toHaveBeenCalled();
    expect(refactoringDialog.open).toHaveBeenCalledWith({type: 'RENAME_ELEMENT', urn: SPEED});
  });

  it.each([
    ['external elements', 'external', () => loadedFiles.isElementExtern.mockReturnValue(true)],
    [
      'models not stored in a workspace',
      'notSaved',
      () => (loadedFiles.currentLoadedFile = {fromWorkspace: false, rdfModel: {getSourceLocation: () => ''}}),
    ],
    ['read-only sources', 'readOnly', () => (readOnlyLocation = true)],
  ])('does not refactor %s and tells why', (_case, blocker, arrange) => {
    arrange();
    create();

    component.refactor('MOVE_ELEMENT');

    expect(component.canRefactor()).toBe(false);
    expect(component.refactoringBlocker()).toBe(blocker);
    expect(refactoringDialog.open).not.toHaveBeenCalled();
  });

  it('can refactor once a new model has been saved to a workspace', () => {
    const file = {fromWorkspace: false, rdfModel: {getSourceLocation: () => '/workspace/org.example/1.0.0/Movement.ttl'}};
    loadedFiles.currentLoadedFile = file;
    create();
    expect(component.canRefactor()).toBe(false);

    // Saving marks the loaded file instead of replacing it
    file.fromWorkspace = true;

    expect(component.canRefactor()).toBe(true);
    expect(component.refactoringBlocker()).toBeNull();
  });

  it('shows the usages also of elements that cannot be refactored', () => {
    loadedFiles.isElementExtern.mockReturnValue(true);
    create();

    component.showUsages();

    expect(refactoringDialog.showUsages).toHaveBeenCalledWith(SPEED);
  });

  it('is disabled without an element', () => {
    create(null);

    expect(component.urn()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="element-refactoring-menu"]').disabled).toBe(true);
  });
});
