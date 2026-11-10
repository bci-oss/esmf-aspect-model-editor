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

import {LoadedFilesService, ModelService, ModelSourcesStore, ModelValidationStore, NamespaceFile, RdfPort} from '@ame/domain';
import {MaxGraphHelper, MaxGraphShapeSelectorService} from '@ame/graph';
import {LanguageTranslationService, NotificationsService} from '@ame/shared';
import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {Cell} from '@maxgraph/core';
import {firstValueFrom, NEVER, of, throwError} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FileHandlingService} from '../editor-toolbar/services/file-handling.service';
import {ModelHistoryService} from '../history/model-history.service';
import {ModelSavingTrackerService} from '../model-saving-tracker.service';
import {ElementRefactoringService} from '../refactoring/element-refactoring.service';
import {TabStateService} from '../tabs/tab-state.service';
import {AiEditorService} from './ai-editor.service';

const ASPECT_URN = 'urn:samm:org.example:1.0.0#Movement';

function element(name: string, options: {className?: string; anonymous?: boolean; predefined?: boolean} = {}) {
  return {
    name,
    aspectModelUrn: `urn:samm:org.example:1.0.0#${name}`,
    className: options.className ?? 'DefaultProperty',
    isPredefined: !!options.predefined,
    isAnonymous: () => !!options.anonymous,
  };
}

describe('AiEditorService', () => {
  let service: AiEditorService;
  let file: NamespaceFile | null;
  let elements: ReturnType<typeof element>[];
  const currentFile = signal<NamespaceFile | null>(null);
  const selectedCells = signal<Cell[]>([]);
  const violations = signal<{message: string; focusNode?: string; errorCode?: string}[]>([]);
  let loadedFiles: {
    currentLoadedFile: NamespaceFile | null;
    currentLoadedFileSignal: typeof currentFile;
    isElementInCurrentFile: ReturnType<typeof vi.fn>;
  };
  let modelSources: {findSource: ReturnType<typeof vi.fn>; isReadOnlyLocation: ReturnType<typeof vi.fn>};
  let modelService: {synchronizeModelToRdf: ReturnType<typeof vi.fn>};
  let rdfService: {serializeModel: ReturnType<typeof vi.fn>};
  let modelHistory: {replaceModel: ReturnType<typeof vi.fn>};
  let fileHandling: {loadModel: ReturnType<typeof vi.fn>; saveAspectModelToWorkspace: ReturnType<typeof vi.fn>};
  let refactoring: {refactor: ReturnType<typeof vi.fn>};
  let tabState: {
    saveActiveTabSnapshot: ReturnType<typeof vi.fn>;
    activeTabId: ReturnType<typeof vi.fn>;
    setTabDirty: ReturnType<typeof vi.fn>;
  };
  let notifications: {error: ReturnType<typeof vi.fn>};
  let router: {navigate: ReturnType<typeof vi.fn>};

  const setFile = (value: NamespaceFile | null) => {
    file = value;
    loadedFiles.currentLoadedFile = value;
    currentFile.set(value);
  };

  beforeEach(() => {
    elements = [element('speed'), element('Movement', {className: 'DefaultAspect'}), element('anon', {anonymous: true})];
    const cachedFile = {
      filter: (predicate: (value: unknown) => boolean) => elements.filter(predicate),
      get: (urn: string) => elements.find(value => value.aspectModelUrn === urn),
    };
    file = {
      name: 'Movement.ttl',
      rdfModel: {getSourceLocation: () => 'file:///workspace/org.example/1.0.0/Movement.ttl'},
      cachedFile,
      aspect: {aspectModelUrn: ASPECT_URN},
      getAnyAspectModelUrn: () => ASPECT_URN,
    } as unknown as NamespaceFile;

    loadedFiles = {currentLoadedFile: null, currentLoadedFileSignal: currentFile, isElementInCurrentFile: vi.fn(() => true)};
    modelSources = {findSource: vi.fn(() => ({id: 'workspace'})), isReadOnlyLocation: vi.fn(() => false)};
    modelService = {synchronizeModelToRdf: vi.fn(() => of(undefined))};
    rdfService = {serializeModel: vi.fn(() => '@prefix : <urn:samm:org.example:1.0.0#> .')};
    modelHistory = {replaceModel: vi.fn(() => of(true))};
    fileHandling = {loadModel: vi.fn(() => of({})), saveAspectModelToWorkspace: vi.fn(() => of({}))};
    refactoring = {refactor: vi.fn()};
    tabState = {saveActiveTabSnapshot: vi.fn(), activeTabId: vi.fn(() => 'tab-1'), setTabDirty: vi.fn()};
    notifications = {error: vi.fn()};
    router = {navigate: vi.fn()};
    selectedCells.set([]);
    violations.set([]);

    TestBed.configureTestingModule({
      providers: [
        {provide: LoadedFilesService, useValue: loadedFiles},
        {provide: ModelService, useValue: modelService},
        {provide: RdfPort, useValue: rdfService},
        {provide: ModelSourcesStore, useValue: modelSources},
        {provide: ModelValidationStore, useValue: {violations}},
        {provide: MaxGraphShapeSelectorService, useValue: {selectedCells}},
        {provide: Router, useValue: router},
        {provide: NotificationsService, useValue: notifications},
        {provide: LanguageTranslationService, useValue: {translateService: {translate: (key: string) => key}}},
        {provide: ModelHistoryService, useValue: modelHistory},
        {provide: FileHandlingService, useValue: fileHandling},
        {provide: ElementRefactoringService, useValue: refactoring},
        {provide: TabStateService, useValue: tabState},
        {provide: ModelSavingTrackerService, useValue: {isSaved$: of(false)}},
      ],
    });
    service = TestBed.inject(AiEditorService);
    setFile(file);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('open model', () => {
    it('describes the open model', () => {
      expect(service.openModel()).toEqual({label: 'Movement.ttl', urn: ASPECT_URN, readOnly: false});
    });

    it('is null without a model', () => {
      setFile(null);
      expect(service.openModel()).toBeNull();
    });

    it('marks models of read-only sources', () => {
      modelSources.isReadOnlyLocation.mockReturnValue(true);
      setFile({...file, aspect: null} as unknown as NamespaceFile);
      expect(service.openModel()).toEqual({label: 'Movement.ttl', readOnly: true});
    });
  });

  describe('selected element', () => {
    it('is the single named element selected in the graph', () => {
      const speed = element('speed');
      vi.spyOn(MaxGraphHelper, 'getModelElement').mockReturnValue(speed as never);
      selectedCells.set([{} as Cell]);
      expect(service.selectedElementUrn()).toBe(speed.aspectModelUrn);
    });

    it('is null for anonymous, missing or multiple selections', () => {
      const spy = vi.spyOn(MaxGraphHelper, 'getModelElement').mockReturnValue(element('anon', {anonymous: true}) as never);
      selectedCells.set([{} as Cell]);
      expect(service.selectedElementUrn()).toBeNull();

      spy.mockReturnValue(null as never);
      selectedCells.set([{} as Cell]);
      expect(service.selectedElementUrn()).toBeNull();

      selectedCells.set([{} as Cell, {} as Cell]);
      expect(service.selectedElementUrn()).toBeNull();
    });
  });

  describe('context', () => {
    it('sends the current (unsaved) model with its coordinates and the validation errors', async () => {
      violations.set([{message: 'Missing characteristic', focusNode: `${ASPECT_URN}x`, errorCode: 'ERR'}, {message: 'Other'}]);
      const context = await firstValueFrom(service.currentContext());

      expect(modelService.synchronizeModelToRdf).toHaveBeenCalled();
      expect(context).toEqual({
        modelTurtle: '@prefix : <urn:samm:org.example:1.0.0#> .',
        modelUrn: ASPECT_URN,
        namespace: 'org.example',
        version: '1.0.0',
        fileName: 'Movement.ttl',
        workspaceId: 'workspace',
        readOnly: false,
        validationErrors: [{message: 'Missing characteristic', focusNode: `${ASPECT_URN}x`, errorCode: 'ERR'}, {message: 'Other'}],
      });
    });

    it('contains the selected element and skips a model which cannot be serialized', async () => {
      vi.spyOn(MaxGraphHelper, 'getModelElement').mockReturnValue(element('speed') as never);
      selectedCells.set([{} as Cell]);
      rdfService.serializeModel.mockImplementation(() => {
        throw new Error('broken');
      });
      modelSources.findSource.mockReturnValue(undefined);

      const context = await firstValueFrom(service.currentContext());
      expect(context.modelTurtle).toBeUndefined();
      expect(context.workspaceId).toBeUndefined();
      expect(context.selectedElementUrn).toBe('urn:samm:org.example:1.0.0#speed');
    });

    it('is empty without a model', async () => {
      setFile(null);
      expect(await firstValueFrom(service.currentContext())).toEqual({});
    });
  });

  it('lists the named elements of the current file sorted by name', () => {
    elements.push(element('external'), element('Boolean', {className: 'DefaultCharacteristic', predefined: true}));
    loadedFiles.isElementInCurrentFile.mockImplementation((value: {name: string}) => value.name !== 'external');

    expect(service.modelElements()).toEqual([
      {urn: ASPECT_URN, name: 'Movement', type: 'Aspect'},
      {urn: 'urn:samm:org.example:1.0.0#speed', name: 'speed', type: 'Property'},
    ]);
    setFile(null);
    expect(service.modelElements()).toEqual([]);
  });

  describe('apply model change', () => {
    it('replaces the model through the history and marks the tab as changed', async () => {
      expect(await firstValueFrom(service.applyModelChange('turtle'))).toBe(true);
      expect(modelHistory.replaceModel).toHaveBeenCalledWith('turtle');
      expect(tabState.setTabDirty).toHaveBeenCalledWith('tab-1', true);
    });

    it('does not change read-only models', async () => {
      modelSources.isReadOnlyLocation.mockReturnValue(true);
      expect(await firstValueFrom(service.applyModelChange('turtle'))).toBe(false);
      expect(modelHistory.replaceModel).not.toHaveBeenCalled();
    });

    it('reports a failed change', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      modelHistory.replaceModel.mockReturnValue(throwError(() => new Error('invalid')));
      expect(await firstValueFrom(service.applyModelChange('turtle'))).toBe(false);
      expect(notifications.error).toHaveBeenCalledWith({title: 'The change could not be applied.'});
      expect(tabState.setTabDirty).not.toHaveBeenCalled();
    });
  });

  describe('new model', () => {
    it('opens the model and saves it to the workspace', async () => {
      fileHandling.loadModel.mockReturnValue(of({}, {}));
      expect(await firstValueFrom(service.openNewModel('turtle'))).toBe(true);
      expect(tabState.saveActiveTabSnapshot).toHaveBeenCalled();
      expect(fileHandling.loadModel).toHaveBeenCalledWith('turtle');
      expect(fileHandling.saveAspectModelToWorkspace).toHaveBeenCalledTimes(1);
    });

    it('emits false when the save is cancelled or fails', async () => {
      fileHandling.saveAspectModelToWorkspace.mockReturnValue(of(null));
      expect(await firstValueFrom(service.openNewModel('turtle'))).toBe(false);

      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      fileHandling.loadModel.mockReturnValue(throwError(() => new Error('invalid')));
      expect(await firstValueFrom(service.openNewModel('turtle'))).toBe(false);
    });

    it('waits for the model to be loaded', () => {
      fileHandling.loadModel.mockReturnValue(NEVER);
      service.openNewModel('turtle').subscribe();
      expect(fileHandling.saveAspectModelToWorkspace).not.toHaveBeenCalled();
    });
  });

  it('renames an element with the refactoring', () => {
    service.renameElement('urn:samm:org.example:1.0.0#speed', 'velocity');
    expect(refactoring.refactor).toHaveBeenCalledWith('RENAME_ELEMENT', elements[0], 'velocity');

    service.renameElement('urn:samm:org.example:1.0.0#unknown', 'x');
    expect(refactoring.refactor).toHaveBeenCalledTimes(1);
  });

  it('navigates to an element through the urn query parameter', () => {
    service.navigateToElement(ASPECT_URN);
    expect(router.navigate).toHaveBeenCalledWith([], {queryParams: {urn: ASPECT_URN}, queryParamsHandling: 'merge'});
  });
});
