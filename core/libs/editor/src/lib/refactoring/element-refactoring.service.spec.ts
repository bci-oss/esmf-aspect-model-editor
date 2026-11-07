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

import {ElementRefactoringAction, ElementRefactoringGuard, RefactoringDialogPort} from '@ame/domain';
import {MaxGraphHelper, MaxGraphShapeSelectorService} from '@ame/graph';
import {BindingsService} from '@ame/shared';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {DefaultProperty} from '@esmf/aspect-model-loader';
import {Cell} from '@maxgraph/core';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ShapeSettingsStateService} from '../editor-dialog/services/shape-settings-state.service';
import {ElementRefactoringService} from './element-refactoring.service';

const SPEED = 'urn:samm:org.example:1.0.0#speed';

describe('ElementRefactoringService', () => {
  const speed = new DefaultProperty({aspectModelUrn: SPEED, name: 'speed', metaModelVersion: '2.2.0'});
  let service: ElementRefactoringService;
  let selectedCells: ReturnType<typeof signal<Cell[]>>;
  let guard: {
    urnOf: ReturnType<typeof vi.fn>;
    blocker: ReturnType<typeof vi.fn>;
    canRefactor: ReturnType<typeof vi.fn>;
    canShowUsages: ReturnType<typeof vi.fn>;
  };
  let refactoringDialog: {open: ReturnType<typeof vi.fn>; showUsages: ReturnType<typeof vi.fn>};
  let shapeSettingsState: {closeShapeSettings: ReturnType<typeof vi.fn>; setSelectedShapeForUpdate: ReturnType<typeof vi.fn>};
  let actions: Map<string, () => void>;

  beforeEach(() => {
    selectedCells = signal([]);
    guard = {
      urnOf: vi.fn(element => element?.aspectModelUrn ?? null),
      blocker: vi.fn(() => null),
      canRefactor: vi.fn(() => true),
      canShowUsages: vi.fn(() => true),
    };
    refactoringDialog = {open: vi.fn(() => of(null)), showUsages: vi.fn()};
    shapeSettingsState = {closeShapeSettings: vi.fn(), setSelectedShapeForUpdate: vi.fn()};
    actions = new Map();
    vi.spyOn(MaxGraphHelper, 'getModelElement').mockImplementation(cell => (cell as unknown as {element: never}).element);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: ElementRefactoringGuard, useValue: guard},
        {provide: RefactoringDialogPort, useValue: refactoringDialog},
        {provide: ShapeSettingsStateService, useValue: shapeSettingsState},
        {provide: MaxGraphShapeSelectorService, useValue: {selectedCells}},
        {provide: BindingsService, useValue: {registerAction: (name: string, callback: () => void) => actions.set(name, callback)}},
      ],
    });
    service = TestBed.inject(ElementRefactoringService);
  });

  afterEach(() => vi.restoreAllMocks());

  const select = (...elements: unknown[]) => selectedCells.set(elements.map(element => ({element}) as unknown as Cell));

  it('works on exactly one selected element', () => {
    expect(service.selectedElement()).toBeNull();

    select(speed);
    expect(service.selectedElement()).toBe(speed);

    select(speed, speed);
    expect(service.selectedElement()).toBeNull();
  });

  it('closes the element editor before the refactoring dialog opens', () => {
    service.refactor('MOVE_ELEMENT', speed);

    expect(shapeSettingsState.closeShapeSettings).toHaveBeenCalled();
    expect(shapeSettingsState.setSelectedShapeForUpdate).toHaveBeenCalledWith(null);
    expect(refactoringDialog.open).toHaveBeenCalledWith({type: 'MOVE_ELEMENT', urn: SPEED});
  });

  it('does not refactor blocked elements', () => {
    guard.canRefactor.mockReturnValue(false);

    service.refactor('RENAME_ELEMENT', speed);

    expect(shapeSettingsState.closeShapeSettings).not.toHaveBeenCalled();
    expect(refactoringDialog.open).not.toHaveBeenCalled();
  });

  it('shows usages only where they are known', () => {
    service.showUsages(speed);
    expect(refactoringDialog.showUsages).toHaveBeenCalledWith(SPEED);

    guard.canShowUsages.mockReturnValue(false);
    service.showUsages(speed);
    expect(refactoringDialog.showUsages).toHaveBeenCalledTimes(1);
  });

  it('runs the actions of the graph context menu on the selected element', () => {
    service.registerContextMenuActions();
    select(speed);

    actions.get(ElementRefactoringAction.rename)?.();
    actions.get(ElementRefactoringAction.move)?.();
    actions.get(ElementRefactoringAction.usages)?.();

    expect(refactoringDialog.open).toHaveBeenNthCalledWith(1, {type: 'RENAME_ELEMENT', urn: SPEED});
    expect(refactoringDialog.open).toHaveBeenNthCalledWith(2, {type: 'MOVE_ELEMENT', urn: SPEED});
    expect(refactoringDialog.showUsages).toHaveBeenCalledWith(SPEED);
  });
});
