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

import {RefactoringHistoryEntry, RefactoringStore} from '@ame/domain';
import {provideZonelessChangeDetection, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {Observable, of, tap, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {RefactoringRevertService} from '../refactoring-revert.service';
import {RefactoringHistoryDialogComponent} from './refactoring-history-dialog.component';

const file = (name: string) => ({
  path: `/workspace/org.example/1.0.0/${name}`,
  namespace: 'org.example',
  version: '1.0.0',
  fileName: name,
  readOnly: false,
});
const entry = (id: string, overrides: Partial<RefactoringHistoryEntry> = {}): RefactoringHistoryEntry => ({
  id,
  description: `Refactoring ${id}`,
  timestamp: 1_700_000_000_000,
  created: [],
  modified: [file('Movement.ttl'), file('Vehicle.ttl')],
  removed: [],
  request: {type: 'RENAME_ELEMENT', urn: 'urn:samm:org.example:1.0.0#speed', newName: 'velocity'},
  ...overrides,
});

describe('RefactoringHistoryDialogComponent', () => {
  let fixture: ComponentFixture<RefactoringHistoryDialogComponent>;
  let store: {
    history: ReturnType<typeof signal<RefactoringHistoryEntry[]>>;
    busy: ReturnType<typeof signal<boolean>>;
    loadHistory: ReturnType<typeof vi.fn>;
  };
  let reverter: {revert: ReturnType<typeof vi.fn>};

  const create = async (history: Observable<RefactoringHistoryEntry[]>) => {
    store.loadHistory.mockReturnValue(history.pipe(tap(entries => store.history.set(entries))));
    TestBed.configureTestingModule({
      imports: [
        RefactoringHistoryDialogComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        {provide: RefactoringStore, useValue: store},
        {provide: RefactoringRevertService, useValue: reverter},
      ],
    });
    fixture = TestBed.createComponent(RefactoringHistoryDialogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const queryAll = (testId: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`));

  beforeEach(() => {
    store = {history: signal([]), busy: signal(false), loadHistory: vi.fn()};
    reverter = {revert: vi.fn(() => of(true))};
  });

  it('loads and lists the history, the latest first as delivered by the store', async () => {
    await create(of([entry('2'), entry('1')]));

    expect(store.loadHistory).toHaveBeenCalledOnce();
    const entries = queryAll('refactoring-history-entry');
    expect(entries.map(element => element.textContent)).toEqual([
      expect.stringContaining('Refactoring 2'),
      expect.stringContaining('Refactoring 1'),
    ]);
    expect(queryAll('refactoring-history-empty')).toHaveLength(0);
  });

  it('shows an empty state without refactorings', async () => {
    await create(of([]));

    expect(queryAll('refactoring-history-empty')).toHaveLength(1);
    expect(queryAll('refactoring-history-entry')).toHaveLength(0);
  });

  it('shows an error when the history cannot be loaded', async () => {
    await create(throwError(() => new Error('offline')));

    expect(queryAll('refactoring-history-error')).toHaveLength(1);
    expect(queryAll('refactoring-history-list')).toHaveLength(0);
  });

  it('undoes an entry with the request it was applied with', async () => {
    const applied = entry('1');
    await create(of([applied]));

    queryAll('refactoring-history-undo')[0].click();

    expect(reverter.revert).toHaveBeenCalledWith(applied.request, applied);
  });

  it('undoes entries recorded without a request', async () => {
    const legacy = entry('1', {request: undefined});
    await create(of([legacy]));

    queryAll('refactoring-history-undo')[0].click();

    expect(reverter.revert).toHaveBeenCalledWith(undefined, legacy);
  });

  it('disables undo while a refactoring is running', async () => {
    await create(of([entry('1')]));
    store.busy.set(true);
    fixture.detectChanges();

    const undo = queryAll('refactoring-history-undo')[0] as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    fixture.componentInstance.revert(entry('1'));
    expect(reverter.revert).not.toHaveBeenCalled();
  });
});
