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

import {BrowserService, IPC_RENDERER, LanguageTranslationService, NotificationsService, Settings} from '@ame/shared';
import {DOCUMENT} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {WorkspaceFacade} from '../../facades/workspace.facade';
import {LoadedFilesService} from '../../model-session/loaded-files.service';
import {ModelSourcesStore} from '../model-sources/model-sources.store';
import {ConfigurationService} from '../settings/configuration.service';
import {ExternalEditorService} from './external-editor.service';

describe('ExternalEditorService', () => {
  let settings$: BehaviorSubject<Partial<Settings>>;
  let workspace: {getElementLocation: ReturnType<typeof vi.fn>; getStoragePath: ReturnType<typeof vi.fn>};
  let loadedFiles: {currentLoadedFile: any; fileOfElement: ReturnType<typeof vi.fn>};
  let modelSources: {findSource: ReturnType<typeof vi.fn>};
  let ipcRenderer: {openInExternalEditor: ReturnType<typeof vi.fn>} | undefined;
  let browserService: {isStartedAsTauriApp: ReturnType<typeof vi.fn>};
  let notifications: {info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>};
  let windowOpen: ReturnType<typeof vi.fn>;

  const createService = () => {
    TestBed.configureTestingModule({
      providers: [
        {provide: ConfigurationService, useValue: {settings$, getSettings: () => settings$.value}},
        {provide: WorkspaceFacade, useValue: workspace},
        {provide: LoadedFilesService, useValue: loadedFiles},
        {provide: ModelSourcesStore, useValue: modelSources},
        {provide: IPC_RENDERER, useValue: ipcRenderer},
        {provide: BrowserService, useValue: browserService},
        {provide: NotificationsService, useValue: notifications},
        {
          provide: LanguageTranslationService,
          useValue: {translateService: {translate: (key: string, params: {editor: string}) => `${key}(${params.editor})`}},
        },
        {provide: DOCUMENT, useValue: {defaultView: {open: windowOpen}}},
      ],
    });
    return TestBed.inject(ExternalEditorService);
  };

  const workspaceFile = (sourceLocation: string | null, fromWorkspace = true) => ({
    namespace: 'org.example:1.0.0',
    name: 'Movement.ttl',
    fromWorkspace,
    rdfModel: {getSourceLocation: () => sourceLocation},
  });

  beforeEach(() => {
    settings$ = new BehaviorSubject<Partial<Settings>>({});
    workspace = {
      getElementLocation: vi.fn(() => of({path: '/Users/me/ws/org.example/1.0.0/Movement.ttl', line: 12, column: 3})),
      getStoragePath: vi.fn(() => of({path: '', storagePath: '/Users/me/ws'})),
    };
    loadedFiles = {currentLoadedFile: null, fileOfElement: vi.fn(() => null)};
    modelSources = {findSource: vi.fn(() => undefined)};
    ipcRenderer = undefined;
    browserService = {isStartedAsTauriApp: vi.fn(() => false)};
    notifications = {info: vi.fn(), error: vi.fn()};
    windowOpen = vi.fn();
  });

  describe('editor', () => {
    it('should default to VS Code', () => {
      const service = createService();
      expect(service.editor()).toBe('vscode');
      expect(service.editorName()).toBe('VS Code');
    });

    it('should follow the setting', () => {
      settings$.next({externalEditor: 'cursor'});
      const service = createService();
      expect(service.editorName()).toBe('Cursor');

      settings$.next({externalEditor: 'vscodium'});
      expect(service.editor()).toBe('vscodium');
      expect(service.editorName()).toBe('VSCodium');
    });

    it('should fall back to VS Code for unknown editors', () => {
      settings$.next({externalEditor: 'notepad' as any});
      expect(createService().editor()).toBe('vscode');
    });
  });

  describe('in the browser', () => {
    it('should open the editor URL of a file in a new browsing context', async () => {
      await createService().openFile('/Users/me/my ws/a.ttl', {line: 4, column: 2});
      expect(windowOpen).toHaveBeenCalledWith('vscode://file/Users/me/my%20ws/a.ttl:4:2', '_blank', 'noopener,noreferrer');
    });

    it('should open folders with the configured editor', async () => {
      settings$.next({externalEditor: 'vscode-insiders'});
      await createService().openFolder('C:\\ws\\org.example');
      expect(windowOpen).toHaveBeenCalledWith('vscode-insiders://file/C:/ws/org.example', '_blank', 'noopener,noreferrer');
    });

    it('should not use the IPC bridge outside of the desktop app', async () => {
      ipcRenderer = {openInExternalEditor: vi.fn()};
      await createService().openFile('/ws/a.ttl');
      expect(ipcRenderer.openInExternalEditor).not.toHaveBeenCalled();
      expect(windowOpen).toHaveBeenCalled();
    });
  });

  describe('in the desktop app', () => {
    beforeEach(() => {
      ipcRenderer = {openInExternalEditor: vi.fn(() => Promise.resolve())};
      browserService.isStartedAsTauriApp.mockReturnValue(true);
    });

    it('should ask the shell to open the file with URL, position and CLI', async () => {
      settings$.next({externalEditor: 'vscodium'});
      await createService().openFile('C:\\ws\\a.ttl', {line: 7, column: 1});

      expect(ipcRenderer.openInExternalEditor).toHaveBeenCalledWith({
        url: 'vscodium://file/C:/ws/a.ttl:7:1',
        path: 'C:\\ws\\a.ttl',
        line: 7,
        column: 1,
        cli: 'codium',
      });
      expect(windowOpen).not.toHaveBeenCalled();
    });

    it('should open folders without position', async () => {
      await createService().openFolder('\\\\server\\share\\ws');
      expect(ipcRenderer.openInExternalEditor).toHaveBeenCalledWith({
        url: 'vscode://file//server/share/ws',
        path: '\\\\server\\share\\ws',
        line: undefined,
        column: undefined,
        cli: 'code',
      });
    });

    it('should report errors of the shell', async () => {
      ipcRenderer.openInExternalEditor.mockRejectedValue('Unsupported editor URL');
      await createService().openFile('/ws/a.ttl');
      expect(notifications.error).toHaveBeenCalledWith(
        expect.objectContaining({title: 'externalEditor.errorTitle(VS Code)', message: 'Unsupported editor URL'}),
      );
    });
  });

  describe('openElement', () => {
    it('should open the declaring file at the declaration', async () => {
      await createService().openElement('urn:samm:org.example:1.0.0#Movement');

      expect(workspace.getElementLocation).toHaveBeenCalledWith('urn:samm:org.example:1.0.0#Movement', undefined);
      expect(windowOpen).toHaveBeenCalledWith(
        'vscode://file/Users/me/ws/org.example/1.0.0/Movement.ttl:12:3',
        '_blank',
        'noopener,noreferrer',
      );
    });

    it('should prefer the loaded file defining the element if several files declare it', async () => {
      loadedFiles.fileOfElement.mockReturnValue({namespace: 'org.example:1.0.0', name: 'AspectB.ttl'});
      await createService().openElement('urn:samm:org.example:1.0.0#property1');

      expect(loadedFiles.fileOfElement).toHaveBeenCalledWith('urn:samm:org.example:1.0.0#property1');
      expect(workspace.getElementLocation).toHaveBeenCalledWith('urn:samm:org.example:1.0.0#property1', 'AspectB.ttl');
    });

    it('should not prefer a loaded file of another namespace version', async () => {
      loadedFiles.fileOfElement.mockReturnValue({namespace: 'org.example:2.0.0', name: 'AspectB.ttl'});
      await createService().openElement('urn:samm:org.example:1.0.0#property1');

      expect(workspace.getElementLocation).toHaveBeenCalledWith('urn:samm:org.example:1.0.0#property1', undefined);
    });

    it('should ask to save the model first if no workspace file declares the element', async () => {
      workspace.getElementLocation.mockReturnValue(throwError(() => ({status: 404})));
      await createService().openElement('urn:samm:org.example:1.0.0#New');

      expect(notifications.info).toHaveBeenCalledWith(
        expect.objectContaining({title: 'externalEditor.notSavedTitle(VS Code)', message: 'externalEditor.notSavedMessage(VS Code)'}),
      );
      expect(windowOpen).not.toHaveBeenCalled();
    });

    it('should report other errors', async () => {
      workspace.getElementLocation.mockReturnValue(throwError(() => ({status: 500})));
      await createService().openElement('urn:samm:org.example:1.0.0#Movement');

      expect(notifications.error).toHaveBeenCalledWith(expect.objectContaining({message: 'externalEditor.errorMessage(VS Code)'}));
      expect(notifications.info).not.toHaveBeenCalled();
    });
  });

  describe('openWorkspace', () => {
    it('should open the active workspace folder', async () => {
      await createService().openWorkspace();
      expect(workspace.getStoragePath).toHaveBeenCalledWith();
      expect(windowOpen).toHaveBeenCalledWith('vscode://file/Users/me/ws', '_blank', 'noopener,noreferrer');
    });

    it('should report a failing backend', async () => {
      workspace.getStoragePath.mockReturnValue(throwError(() => new Error('timeout')));
      await createService().openWorkspace();
      expect(notifications.error).toHaveBeenCalledWith(expect.objectContaining({message: 'timeout'}));
      expect(windowOpen).not.toHaveBeenCalled();
    });
  });

  describe('openCurrentModel', () => {
    it('should open the workspace file of the current model', async () => {
      loadedFiles.currentLoadedFile = workspaceFile('file:///C:/ws/org.example/1.0.0/Movement.ttl');
      modelSources.findSource.mockReturnValue({path: 'C:\\ws'});
      workspace.getStoragePath.mockReturnValue(of({path: '', storagePath: 'C:\\ws\\org.example\\1.0.0\\Movement.ttl'}));

      await createService().openCurrentModel();

      expect(modelSources.findSource).toHaveBeenCalledWith('file:///C:/ws/org.example/1.0.0/Movement.ttl');
      expect(workspace.getStoragePath).toHaveBeenCalledWith({
        namespace: 'org.example',
        version: '1.0.0',
        fileName: 'Movement.ttl',
        workspace: 'C:\\ws',
      });
      expect(windowOpen).toHaveBeenCalledWith('vscode://file/C:/ws/org.example/1.0.0/Movement.ttl', '_blank', 'noopener,noreferrer');
    });

    it('should fall back to the source location if the storage path cannot be resolved', async () => {
      loadedFiles.currentLoadedFile = workspaceFile('file:/Users/me/ws/org.example/1.0.0/Movement.ttl');
      workspace.getStoragePath.mockReturnValue(throwError(() => ({status: 404})));

      await createService().openCurrentModel();

      expect(windowOpen).toHaveBeenCalledWith('vscode://file/Users/me/ws/org.example/1.0.0/Movement.ttl', '_blank', 'noopener,noreferrer');
    });

    it('should open a model loaded from outside the workspace at its source location', async () => {
      loadedFiles.currentLoadedFile = workspaceFile('/home/me/models/Movement.ttl', false);

      await createService().openCurrentModel();

      expect(workspace.getStoragePath).not.toHaveBeenCalled();
      expect(windowOpen).toHaveBeenCalledWith('vscode://file/home/me/models/Movement.ttl', '_blank', 'noopener,noreferrer');
    });

    it('should ask to save a new model first', async () => {
      loadedFiles.currentLoadedFile = workspaceFile(null, false);
      const service = createService();

      await service.openCurrentModel();
      loadedFiles.currentLoadedFile = workspaceFile('https://github.com/org/repo/Movement.ttl', false);
      await service.openCurrentModel();
      loadedFiles.currentLoadedFile = null;
      await service.openCurrentModel();

      expect(notifications.info).toHaveBeenCalledTimes(3);
      expect(windowOpen).not.toHaveBeenCalled();
    });
  });
});
