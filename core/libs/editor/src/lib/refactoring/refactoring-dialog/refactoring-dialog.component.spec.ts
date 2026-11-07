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

import {
  ModelSourcesStore,
  RefactoringHistoryEntry,
  RefactoringPreview,
  RefactoringProgress,
  RefactoringRequest,
  RefactoringStore,
} from '@ame/domain';
import {HttpErrorResponse} from '@angular/common/http';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorTab} from '../../tabs/tab.model';
import {RefactoringTabSyncService} from '../refactoring-tab-sync.service';
import {RefactoringDialogComponent} from './refactoring-dialog.component';

const SPEED = 'urn:samm:org.example:1.0.0#speed';
const changedFile = (fileName: string) => ({namespace: 'org.example', version: '1.0.0', fileName, path: fileName, readOnly: false});
const preview = (overrides: Partial<RefactoringPreview> = {}): RefactoringPreview => ({
  description: 'Rename speed',
  report: '',
  created: [],
  modified: [changedFile('Movement.ttl')],
  removed: [],
  blocked: [],
  applicable: true,
  ...overrides,
});
const entry: RefactoringHistoryEntry = {id: '1', description: 'Rename speed', timestamp: 1, created: [], modified: [], removed: []};

describe('RefactoringDialogComponent', () => {
  let fixture: ComponentFixture<RefactoringDialogComponent>;
  let component: RefactoringDialogComponent;
  let store: {
    busy: ReturnType<typeof signal<boolean>>;
    progress: ReturnType<typeof signal<RefactoringProgress | null>>;
    preview: ReturnType<typeof vi.fn>;
    apply: ReturnType<typeof vi.fn>;
  };
  let dialogRef: {close: ReturnType<typeof vi.fn>};
  let unsavedTabs: EditorTab[];
  let unsavedTabsAmong: ReturnType<typeof vi.fn>;

  const create = (request: RefactoringRequest, pendingSaveTabId?: string) => {
    TestBed.configureTestingModule({
      imports: [
        RefactoringDialogComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        {provide: MAT_DIALOG_DATA, useValue: {request, pendingSaveTabId}},
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: RefactoringStore, useValue: store},
        {provide: RefactoringTabSyncService, useValue: {unsavedTabsAmong}},
        {provide: ModelSourcesStore, useValue: {hasMultipleWorkspaces: signal(false), workspaces: signal([])}},
      ],
    });
    fixture = TestBed.createComponent(RefactoringDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const setModel = (changes: Partial<ReturnType<RefactoringDialogComponent['model']>>) => {
    component.model.update(model => ({...model, ...changes}));
    fixture.detectChanges();
  };

  const query = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  beforeEach(() => {
    store = {busy: signal(false), progress: signal(null), preview: vi.fn(() => of(preview())), apply: vi.fn(() => of(entry))};
    dialogRef = {close: vi.fn()};
    unsavedTabs = [];
    unsavedTabsAmong = vi.fn(() => unsavedTabs);
  });

  describe('renaming an element', () => {
    beforeEach(() => create({type: 'RENAME_ELEMENT', urn: SPEED}));

    it('starts with the current name, which is invalid until changed', () => {
      expect(component.model().newName).toBe('speed');
      expect(
        component.refactoringForm
          .newName()
          .errors()
          .map(error => error.kind),
      ).toEqual(['unchanged']);
    });

    it('keeps the casing of the first letter', () => {
      setModel({newName: 'Velocity'});
      expect(
        component.refactoringForm
          .newName()
          .errors()
          .map(error => error.kind),
      ).toEqual(['casing']);

      setModel({newName: 'velocity'});
      expect(component.refactoringForm().valid()).toBe(true);
    });

    it('applies only the previewed input', () => {
      setModel({newName: 'velocity'});
      component.runPreview();
      fixture.detectChanges();

      expect(store.preview).toHaveBeenCalledWith({type: 'RENAME_ELEMENT', urn: SPEED, newName: 'velocity'});
      expect(query('refactoring-preview-modified')?.textContent).toContain('org.example:1.0.0/Movement.ttl');
      expect(component.canApply()).toBe(true);

      setModel({newName: 'velocityKmh'});
      expect(component.preview()).toBeNull();
      expect(component.canApply()).toBe(false);
    });

    it('closes with the applied refactoring', () => {
      setModel({newName: 'velocity'});
      component.runPreview();
      component.apply();

      expect(store.apply).toHaveBeenCalledWith({type: 'RENAME_ELEMENT', urn: SPEED, newName: 'velocity'});
      expect(dialogRef.close).toHaveBeenCalledWith({request: {type: 'RENAME_ELEMENT', urn: SPEED, newName: 'velocity'}, entry});
    });

    it('cannot be applied while affected files have unsaved changes', () => {
      unsavedTabs = [{id: 'org.example:1.0.0:Movement.ttl', namespace: 'org.example:1.0.0', file: 'Movement.ttl', isDirty: true}];
      setModel({newName: 'velocity'});
      component.runPreview();
      fixture.detectChanges();

      expect(component.canApply()).toBe(false);
      expect(query('refactoring-unsaved')).not.toBeNull();
    });

    it('cannot be applied if read-only files are affected', () => {
      store.preview.mockReturnValue(of(preview({blocked: [changedFile('Remote.ttl')], applicable: false})));
      setModel({newName: 'velocity'});
      component.runPreview();
      fixture.detectChanges();

      expect(component.canApply()).toBe(false);
      expect(query('refactoring-blocked')).not.toBeNull();
    });

    it('shows conflicts reported by the backend', () => {
      store.preview.mockReturnValue(throwError(() => new HttpErrorResponse({status: 409, error: {error: {message: 'Name taken'}}})));
      setModel({newName: 'velocity'});
      component.runPreview();
      fixture.detectChanges();

      expect(component.error()).toEqual({key: 'error.conflict', message: 'Name taken'});
      expect(query('refactoring-error')?.textContent).toContain('Name taken');
    });

    it('shows an indeterminate progress until the backend reports one', () => {
      store.busy.set(true);
      fixture.detectChanges();
      expect(query('refactoring-busy')).toBeTruthy();
      expect(query('refactoring-progress')).toBeNull();

      store.progress.set({running: true, phase: 'PLANNING', step: 2, steps: 3, files: 1200});
      fixture.detectChanges();
      expect(query('refactoring-busy')).toBeNull();
      expect(component.progressPercent()).toBeCloseTo(66.67, 1);
      expect(query('refactoring-progress-step')?.textContent).toContain('progress.step');
      expect(query('refactoring-progress-phase')?.textContent).toContain('progress.PLANNING');
    });

    it('is not closed while a refactoring runs', () => {
      store.busy.set(true);
      component.requestClose();
      expect(dialogRef.close).not.toHaveBeenCalled();

      store.busy.set(false);
      component.requestClose();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });
  });

  it('moves an element into a file of another namespace', () => {
    create({type: 'MOVE_ELEMENT', urn: SPEED});
    setModel({targetFileName: 'Shared', targetNamespace: 'org.shared'});
    component.runPreview();

    expect(store.preview).toHaveBeenCalledWith({
      type: 'MOVE_ELEMENT',
      urn: SPEED,
      targetFileName: 'Shared.ttl',
      targetNamespace: 'org.shared',
      targetVersion: '1.0.0',
    });
  });

  it('renames a file with its extension', () => {
    create({type: 'RENAME_FILE', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl'});
    expect(component.model().newName).toBe('Movement');
    expect(component.refactoringForm().valid()).toBe(false);

    setModel({newName: 'Motion'});
    component.runPreview();

    expect(store.preview).toHaveBeenCalledWith(expect.objectContaining({type: 'RENAME_FILE', newName: 'Motion.ttl'}));
  });

  it('requires a different namespace version when renaming a namespace', () => {
    create({type: 'RENAME_NAMESPACE', namespace: 'org.example', version: '1.0.0'});
    expect(component.refactoringForm().valid()).toBe(false);

    setModel({targetVersion: '1.0'});
    expect(
      component.refactoringForm
        .targetVersion()
        .errors()
        .map(error => error.kind),
    ).toEqual(['pattern']);

    setModel({targetVersion: '2.0.0'});
    expect(component.refactoringForm().valid()).toBe(true);
  });

  it('creates a new version with the selected increase', () => {
    create({type: 'NEW_VERSION', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl'});
    (query('refactoring-increase-MAJOR')?.querySelector('input') as HTMLInputElement).click();
    fixture.detectChanges();
    component.runPreview();

    expect(store.preview).toHaveBeenCalledWith(expect.objectContaining({type: 'NEW_VERSION', fileName: 'Movement.ttl', increase: 'MAJOR'}));
  });

  it('starts renaming an element with a proposed name', () => {
    create({type: 'RENAME_ELEMENT', urn: SPEED, newName: 'velocity'});

    expect(component.model().newName).toBe('velocity');
    expect(component.refactoringForm().valid()).toBe(true);
  });

  describe('moving a file', () => {
    const request: RefactoringRequest = {
      type: 'MOVE_FILE',
      namespace: 'org.example',
      version: '1.0.0',
      fileName: 'Movement.ttl',
      targetNamespace: 'com.example',
      targetVersion: '2.0.0',
    };

    it('previews the complete request right away', () => {
      create(request, 'org.example:1.0.0:Movement.ttl');

      expect(store.preview).toHaveBeenCalledWith(request);
      expect(component.canApply()).toBe(true);
    });

    it('ignores the unsaved changes of the tab saved afterwards', () => {
      create(request, 'org.example:1.0.0:Movement.ttl');
      const keep = unsavedTabsAmong.mock.calls[0][1];

      expect(keep({id: 'org.example:1.0.0:Movement.ttl'})).toBe(true);
      expect(keep({id: 'org.example:1.0.0:Other.ttl'})).toBe(false);
    });

    it('applies the request unchanged', () => {
      create(request);
      component.apply();

      expect(store.apply).toHaveBeenCalledWith(request);
    });
  });
});
