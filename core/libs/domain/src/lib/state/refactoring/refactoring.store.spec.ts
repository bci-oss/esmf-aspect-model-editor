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

import {TauriSignalsService} from '@ame/shared';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of, Subject, throwError} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {RefactoringHistoryEntry, RefactoringPreview, RefactoringProgress, RefactoringRequest} from '../../model-api';
import {RefactoringPort} from '../../ports/refactoring.port';
import {WorkspaceNamespacesService} from '../workspace/workspace-namespaces.service';
import {WorkspaceStore} from '../workspace/workspace.store';
import {REFACTORING_PROGRESS_DELAY, REFACTORING_PROGRESS_INTERVAL, RefactoringStore} from './refactoring.store';

const request: RefactoringRequest = {type: 'RENAME_ELEMENT', urn: 'urn:samm:org.example:1.0.0#speed', newName: 'velocity'};
const entry = (id: string): RefactoringHistoryEntry => ({
  id,
  description: `Refactoring ${id}`,
  timestamp: 1,
  created: [],
  modified: [],
  removed: [],
});
const preview: RefactoringPreview = {
  description: 'Rename',
  report: '',
  created: [],
  modified: [],
  removed: [],
  blocked: [],
  applicable: true,
};

const idle: RefactoringProgress = {running: false, phase: null, step: 0, steps: 0, files: 0};
const loading: RefactoringProgress = {running: true, phase: 'LOADING', step: 1, steps: 3, files: 1200};

describe('RefactoringStore', () => {
  let store: RefactoringStore;
  let api: Record<keyof RefactoringPort, ReturnType<typeof vi.fn>>;
  let tauri: {call: ReturnType<typeof vi.fn>};
  let triggerRefresh: ReturnType<typeof vi.spyOn>;
  let clearNamespaces: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    api = {
      preview: vi.fn(() => of(preview)),
      apply: vi.fn(() => of(entry('new'))),
      getProgress: vi.fn(() => of(idle)),
      getHistory: vi.fn(() => of([entry('b'), entry('a')])),
      revert: vi.fn((id: string) => of(entry(id))),
    };
    tauri = {call: vi.fn()};
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: RefactoringPort, useValue: api},
        {provide: TauriSignalsService, useValue: tauri},
      ],
    });
    store = TestBed.inject(RefactoringStore);
    triggerRefresh = vi.spyOn(TestBed.inject(WorkspaceStore), 'triggerRefresh');
    clearNamespaces = vi.spyOn(TestBed.inject(WorkspaceNamespacesService), 'clear');
  });

  it('is busy while a preview runs', () => {
    const response = new Subject<RefactoringPreview>();
    api.preview.mockReturnValue(response);

    let result: RefactoringPreview | undefined;
    store.preview(request).subscribe(value => (result = value));
    expect(store.busy()).toBe(true);

    response.next(preview);
    response.complete();
    expect(result).toBe(preview);
    expect(store.busy()).toBe(false);
    expect(triggerRefresh).not.toHaveBeenCalled();
  });

  describe('progress', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is not polled for quick refactorings', () => {
      store.apply(request).subscribe();
      vi.advanceTimersByTime(REFACTORING_PROGRESS_DELAY * 2);

      expect(api.getProgress).not.toHaveBeenCalled();
      expect(store.progress()).toBeNull();
    });

    it('is polled while a long refactoring runs and reset afterwards', () => {
      const response = new Subject<RefactoringHistoryEntry>();
      api.apply.mockReturnValue(response);
      api.getProgress.mockReturnValue(of(loading));

      store.apply(request).subscribe();
      vi.advanceTimersByTime(REFACTORING_PROGRESS_DELAY);
      expect(store.progress()).toEqual(loading);

      vi.advanceTimersByTime(REFACTORING_PROGRESS_INTERVAL);
      expect(api.getProgress).toHaveBeenCalledTimes(2);

      response.next(entry('new'));
      response.complete();
      vi.advanceTimersByTime(REFACTORING_PROGRESS_INTERVAL * 2);
      expect(api.getProgress).toHaveBeenCalledTimes(2);
      expect(store.progress()).toBeNull();
    });

    it('ignores an idle backend and failed polls', () => {
      const response = new Subject<RefactoringPreview>();
      api.preview.mockReturnValue(response);
      api.getProgress.mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of(idle));

      store.preview(request).subscribe();
      vi.advanceTimersByTime(REFACTORING_PROGRESS_DELAY + REFACTORING_PROGRESS_INTERVAL);

      expect(api.getProgress).toHaveBeenCalledTimes(2);
      expect(store.progress()).toBeNull();
      expect(store.busy()).toBe(true);
      response.complete();
    });

    it('is not polled for reverts', () => {
      api.revert.mockReturnValue(new Subject());

      store.revert('b').subscribe();
      vi.advanceTimersByTime(REFACTORING_PROGRESS_DELAY * 2);

      expect(api.getProgress).not.toHaveBeenCalled();
    });
  });

  it('records an applied refactoring as latest and reloads the workspaces of all windows', () => {
    store.loadHistory().subscribe();
    store.apply(request).subscribe();

    expect(api.apply).toHaveBeenCalledWith(request);
    expect(store.history().map(item => item.id)).toEqual(['new', 'b', 'a']);
    expect(clearNamespaces).toHaveBeenCalled();
    expect(triggerRefresh).toHaveBeenCalled();
    expect(tauri.call).toHaveBeenCalledWith('requestRefreshWorkspaces');
  });

  it('removes a reverted refactoring from the history', () => {
    store.loadHistory().subscribe();
    store.revert('b', true).subscribe();

    expect(api.revert).toHaveBeenCalledWith('b', true);
    expect(store.history().map(item => item.id)).toEqual(['a']);
    expect(triggerRefresh).toHaveBeenCalled();
  });

  it('keeps history and workspaces unchanged if the revert fails', () => {
    api.revert.mockReturnValue(throwError(() => ({status: 409})));
    store.loadHistory().subscribe();

    store.revert('b').subscribe({error: () => undefined});

    expect(api.revert).toHaveBeenCalledWith('b', false);
    expect(store.history()).toHaveLength(2);
    expect(store.busy()).toBe(false);
    expect(triggerRefresh).not.toHaveBeenCalled();
  });
});
