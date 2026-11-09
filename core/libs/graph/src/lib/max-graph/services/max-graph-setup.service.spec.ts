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

import {ConfigurationService, ElementRefactoringGuard, ExternalEditorAction, LoadedFilesService} from '@ame/domain';
import {BindingsService, BrowserService, LanguageTranslationService} from '@ame/shared';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {DefaultProperty, NamedElement} from '@esmf/aspect-model-loader';
import {Cell, MaxPopupMenu} from '@maxgraph/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MaxGraphAttributeService} from './max-graph-attribute.service';
import {MaxGraphSetupService} from './max-graph-setup.service';
import {MaxGraphShapeSelectorService} from './max-graph-shape-selector.service';

describe('MaxGraphSetupService context menu', () => {
  const speed = new DefaultProperty({aspectModelUrn: 'urn:samm:org.example:1.0.0#speed', name: 'speed', metaModelVersion: '2.2.0'});
  const cellOf = (element: NamedElement) => ({edge: false, isEdge: () => false, getMetaModelElement: () => ({element})}) as unknown as Cell;

  let service: MaxGraphSetupService;
  let selectedCells: Cell[];
  let guard: {canShowUsages: ReturnType<typeof vi.fn>; blocker: ReturnType<typeof vi.fn>};
  let loadedFiles: {isElementExtern: ReturnType<typeof vi.fn>; isElementUnresolved: ReturnType<typeof vi.fn>};
  let bindings: {fireAction: ReturnType<typeof vi.fn>};
  let items: {label: string; element: HTMLElement; action: () => void}[];
  let menu: MaxPopupMenu;

  beforeEach(() => {
    selectedCells = [];
    guard = {canShowUsages: vi.fn(() => true), blocker: vi.fn(() => null)};
    loadedFiles = {isElementExtern: vi.fn(() => false), isElementUnresolved: vi.fn(() => false)};
    bindings = {fireAction: vi.fn()};
    items = [];
    menu = {
      addItem: vi.fn((label: string, _image: string, action: () => void) => {
        const element = document.createElement('tr');
        items.push({label, element, action});
        return element;
      }),
      addSeparator: vi.fn(),
    } as unknown as MaxPopupMenu;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: ConfigurationService, useValue: {getSettings: () => ({externalEditor: 'cursor'})}},
        {provide: BindingsService, useValue: bindings},
        {provide: BrowserService, useValue: {getAssetBasePath: () => 'assets'}},
        {provide: MaxGraphShapeSelectorService, useValue: {getSelectedCells: () => selectedCells}},
        {provide: MaxGraphAttributeService, useValue: {}},
        {
          provide: LanguageTranslationService,
          useValue: {
            language: {editorCanvas: {graphSetup: {}}},
            translateService: {translate: (key: string, params?: {editor?: string}) => (params?.editor ? `${key} ${params.editor}` : key)},
          },
        },
        {provide: LoadedFilesService, useValue: loadedFiles},
        {provide: ElementRefactoringGuard, useValue: guard},
      ],
    });
    service = TestBed.inject(MaxGraphSetupService);
  });

  const openMenu = (cell: Cell | null) => (service as any).getPopupFactoryMethod(menu, cell);
  const openInEditorItem = () => items.find(item => item.element.dataset['testid'] === 'context-menu-open-in-external-editor');

  it('offers to open a single selected element in the configured external editor', () => {
    const cell = cellOf(speed);
    selectedCells = [cell];

    openMenu(cell);

    const item = openInEditorItem();
    expect(item?.label).toBe('externalEditor.openIn Cursor');
    item?.action();
    expect(bindings.fireAction).toHaveBeenCalledWith(ExternalEditorAction.openElement);
  });

  it('does not offer it for multiple selected elements', () => {
    const cell = cellOf(speed);
    selectedCells = [cell, cellOf(speed)];

    openMenu(cell);

    expect(openInEditorItem()).toBeUndefined();
  });

  it('does not offer it for predefined elements or elements without URN', () => {
    guard.canShowUsages.mockReturnValue(false);
    const cell = cellOf(speed);
    selectedCells = [cell];

    openMenu(cell);

    expect(openInEditorItem()).toBeUndefined();
  });

  it('does not offer it for unresolved elements', () => {
    loadedFiles.isElementUnresolved.mockReturnValue(true);
    const cell = cellOf(speed);
    selectedCells = [cell];

    openMenu(cell);

    expect(openInEditorItem()).toBeUndefined();
  });

  it('does not offer it on the empty canvas', () => {
    openMenu(null);

    expect(openInEditorItem()).toBeUndefined();
  });
});
