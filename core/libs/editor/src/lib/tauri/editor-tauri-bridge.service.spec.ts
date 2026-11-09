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

import {ExternalEditorService, FiltersService, LoadedFilesService, NamespacesTransferPort} from '@ame/domain';
import {MaxGraphService, ShapeConnectorService} from '@ame/graph';
import {IPC_RENDERER, LanguageTranslationService, TAURI_EVENTS} from '@ame/shared';
import {WritableSignal, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {MatDialog} from '@angular/material/dialog';
import {BehaviorSubject, of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AasImportService} from '../aas-import/aas-import.service';
import {ShapeSettingsService} from '../editor-dialog/services/shape-settings.service';
import {FileHandlingService} from '../editor-toolbar/services/file-handling.service';
import {GenerateHandlingService} from '../editor-toolbar/services/generate-handling.service';
import {EditorService} from '../editor.service';
import {ModelSavingTrackerService} from '../model-saving-tracker.service';
import {SaveModelDialogService} from '../save-model-dialog/save-model-dialog.service';
import {EditorTauriBridge} from './editor-tauri-bridge.service';

function createIpcMock() {
  const handlers = new Map<string, (...args: any[]) => void>();
  return {
    handlers,
    send: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => handlers.set(event, handler)),
  };
}

describe('EditorTauriBridge', () => {
  let ipcMock: ReturnType<typeof createIpcMock>;
  let editorService: any;
  let fileHandlingService: any;
  let shapeSettingsService: any;
  let generateHandlingService: any;
  let aasImportService: any;
  let externalEditor: {editorName: WritableSignal<string>; openCurrentModel: any; openWorkspace: any};
  let translation: any;

  beforeEach(() => {
    ipcMock = createIpcMock();
    editorService = {zoomIn: vi.fn(), zoomOut: vi.fn(), fit: vi.fn(), actualSize: vi.fn(), formatModel: vi.fn()};
    fileHandlingService = {loadEmptyModel: vi.fn(() => of(true)), onValidateFile: vi.fn(), onCopyToClipboard: vi.fn()};
    generateHandlingService = {
      onGenerateDocumentation: vi.fn(),
      onGenerateDiagram: vi.fn(),
      onGenerateSql: vi.fn(),
      onGenerateJsonLd: vi.fn(),
      onGenerateParquetPayload: vi.fn(),
      onGenerateJavaClasses: vi.fn(),
    };
    aasImportService = {onImportAas: vi.fn()};
    externalEditor = {editorName: signal('Cursor'), openCurrentModel: vi.fn(), openWorkspace: vi.fn()};
    translation = {menu: {file: {openInExternalEditor: 'Open in {{editor}}'}}};
    shapeSettingsService = {
      selectedCells$: new BehaviorSubject([]),
      hasSelection$: new BehaviorSubject(false),
      hasCellsSubject$: new BehaviorSubject(false),
      editModel: vi.fn(),
      editSelectedCell: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        {provide: IPC_RENDERER, useValue: ipcMock},
        {provide: EditorService, useValue: editorService},
        {provide: FileHandlingService, useValue: fileHandlingService},
        {provide: ShapeSettingsService, useValue: shapeSettingsService},
        {provide: GenerateHandlingService, useValue: generateHandlingService},
        {provide: AasImportService, useValue: aasImportService},
        {provide: SaveModelDialogService, useValue: {openDialog: vi.fn(() => of(true))}},
        {provide: ModelSavingTrackerService, useValue: {isSaved$: of(true)}},
        {provide: LoadedFilesService, useValue: {currentLoadedFile: {cachedFile: {get: vi.fn()}}}},
        {provide: MaxGraphService, useValue: {navigateToCellByUrn: vi.fn()}},
        {provide: ShapeConnectorService, useValue: {connectSelectedElements: vi.fn()}},
        {provide: NamespacesTransferPort, useValue: {onImportNamespaces: vi.fn(), onExportNamespaces: vi.fn()}},
        {provide: FiltersService, useValue: {renderByFilter: vi.fn()}},
        {provide: MatDialog, useValue: {open: vi.fn()}},
        {provide: ExternalEditorService, useValue: externalEditor},
        {
          provide: LanguageTranslationService,
          useValue: {language: translation, translateService: {getActiveLang: () => 'en'}, getTranslation: vi.fn(() => of({}))},
        },
      ],
    });

    TestBed.inject(EditorTauriBridge).register();
  });

  it('delegates menu signals to editor services', () => {
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.ZOOM_IN)!();
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.FORMAT_MODEL)!();
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.VALIDATE_MODEL)!();
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.OPEN_SELECTED_ELEMENT)!();

    expect(editorService.zoomIn).toHaveBeenCalled();
    expect(editorService.formatModel).toHaveBeenCalled();
    expect(fileHandlingService.onValidateFile).toHaveBeenCalled();
    expect(shapeSettingsService.editSelectedCell).toHaveBeenCalled();
  });

  it('delegates the SDK generator menu signals to the generate handling', () => {
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.GENERATE_DIAGRAM)?.();
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.GENERATE_SQL)?.();
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.GENERATE_JSON_LD)?.();
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.GENERATE_PARQUET_PAYLOAD)?.();
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.GENERATE_JAVA_CLASSES)?.();

    expect(generateHandlingService.onGenerateDiagram).toHaveBeenCalled();
    expect(generateHandlingService.onGenerateSql).toHaveBeenCalled();
    expect(generateHandlingService.onGenerateJsonLd).toHaveBeenCalled();
    expect(generateHandlingService.onGenerateParquetPayload).toHaveBeenCalled();
    expect(generateHandlingService.onGenerateJavaClasses).toHaveBeenCalled();
  });

  it('imports the Asset Administration Shell chosen in the native file dialog', () => {
    const fileInfo = {path: '/tmp/Shell.aasx', name: 'Shell.aasx', content: new Uint8Array([1, 2])};

    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.IMPORT_AAS)?.(fileInfo);

    expect(aasImportService.onImportAas).toHaveBeenCalledWith(fileInfo);
  });

  it('enables the generator menu items only while the editor shows a model', () => {
    shapeSettingsService.hasCellsSubject$.next(true);

    expect(ipcMock.send).toHaveBeenCalledWith(
      TAURI_EVENTS.SIGNAL.UPDATE_MENU_ITEM,
      expect.objectContaining({
        ids: expect.arrayContaining([
          'GENERATE_DIAGRAM',
          'GENERATE_SQL',
          'GENERATE_JSON_LD',
          'GENERATE_PARQUET_PAYLOAD',
          'GENERATE_JAVA_CLASSES',
        ]),
      }),
    );
  });

  it('loads an empty model on NEW_EMPTY_MODEL when current model is saved', () => {
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.NEW_EMPTY_MODEL)!();
    expect(fileHandlingService.loadEmptyModel).toHaveBeenCalled();
  });

  it('closes the window on IS_FILE_SAVED when model is saved', () => {
    ipcMock.handlers.get(TAURI_EVENTS.REQUEST.IS_FILE_SAVED)!('win-1');
    expect(ipcMock.send).toHaveBeenCalledWith(TAURI_EVENTS.REQUEST.CLOSE_WINDOW, 'win-1');
  });

  it('updates menu items when cell selection changes', () => {
    shapeSettingsService.selectedCells$.next([{}]);
    expect(ipcMock.send).toHaveBeenCalledWith(
      TAURI_EVENTS.SIGNAL.UPDATE_MENU_ITEM,
      expect.objectContaining({ids: ['OPEN_SELECTED_ELEMENT', 'CONNECT_ELEMENTS']}),
    );
  });

  it('opens the current model and the workspace in the external editor', () => {
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.OPEN_IN_EXTERNAL_EDITOR)!();
    ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.OPEN_WORKSPACE_IN_EXTERNAL_EDITOR)!();

    expect(externalEditor.openCurrentModel).toHaveBeenCalledOnce();
    expect(externalEditor.openWorkspace).toHaveBeenCalledOnce();
  });

  it('enables "Open in external editor" with a model and labels it with the configured editor', () => {
    shapeSettingsService.hasCellsSubject$.next(true);

    expect(ipcMock.send).toHaveBeenCalledWith(
      TAURI_EVENTS.SIGNAL.UPDATE_MENU_ITEM,
      expect.objectContaining({
        ids: expect.arrayContaining(['OPEN_IN_EXTERNAL_EDITOR']),
        payload: {enabled: true, translation: {menu: {file: {openInExternalEditor: 'Open in Cursor'}}}},
      }),
    );
    expect(translation.menu.file.openInExternalEditor).toBe('Open in {{editor}}');
  });

  it('enables the remove menu item when only a connection is selected', () => {
    shapeSettingsService.hasSelection$.next(true);
    expect(ipcMock.send).toHaveBeenCalledWith(
      TAURI_EVENTS.SIGNAL.UPDATE_MENU_ITEM,
      expect.objectContaining({ids: ['REMOVE_SELECTED_ELEMENT'], payload: expect.objectContaining({enabled: true})}),
    );
  });
  describe('zoom in with the "+" key', () => {
    const pressPlus = (init: KeyboardEventInit = {ctrlKey: true}) => {
      const event = new KeyboardEvent('keydown', {key: '+', cancelable: true, ...init});
      document.dispatchEvent(event);
      return event;
    };

    beforeEach(() => vi.useFakeTimers({toFake: ['Date']}));
    afterEach(() => vi.useRealTimers());

    it('zooms in on Ctrl + "+" when a model is shown and prevents the browser zoom', () => {
      shapeSettingsService.hasCellsSubject$.next(true);

      const event = pressPlus();

      expect(editorService.zoomIn).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('does nothing without a model, like the disabled menu item', () => {
      const event = pressPlus();

      expect(editorService.zoomIn).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it.each([
      ['without modifier', {}],
      ['with Alt (AltGr on Windows)', {ctrlKey: true, altKey: true}],
      ['with the other platform modifier', {metaKey: true}],
    ])('ignores "+" %s', (_label, init) => {
      shapeSettingsService.hasCellsSubject$.next(true);

      pressPlus(init);

      expect(editorService.zoomIn).not.toHaveBeenCalled();
    });

    it('ignores other keys', () => {
      shapeSettingsService.hasCellsSubject$.next(true);

      document.dispatchEvent(new KeyboardEvent('keydown', {key: '=', ctrlKey: true}));

      expect(editorService.zoomIn).not.toHaveBeenCalled();
    });

    it('zooms only once when the menu accelerator and the key handler react to the same key press', () => {
      shapeSettingsService.hasCellsSubject$.next(true);

      pressPlus();
      ipcMock.handlers.get(TAURI_EVENTS.SIGNAL.ZOOM_IN)!();

      expect(editorService.zoomIn).toHaveBeenCalledTimes(1);
    });

    it('zooms again on the next key press', () => {
      shapeSettingsService.hasCellsSubject$.next(true);

      pressPlus();
      vi.setSystemTime(Date.now() + 300);
      pressPlus();

      expect(editorService.zoomIn).toHaveBeenCalledTimes(2);
    });
  });
});
