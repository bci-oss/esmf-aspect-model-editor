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

import {ModelSourcesStore} from '@ame/domain';
import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {describe, expect, it, vi} from 'vitest';
import {WorkspacesDraftService} from './workspaces-draft.service';

describe('WorkspacesDraftService', () => {
  function setup() {
    const calls: string[] = [];
    const store = {
      addWorkspace: vi.fn((path: string) => of(calls.push(`add ${path}`))),
      removeWorkspace: vi.fn((path: string) => of(calls.push(`remove ${path}`))),
    };
    TestBed.configureTestingModule({providers: [WorkspacesDraftService, {provide: ModelSourcesStore, useValue: store}]});
    return {draft: TestBed.inject(WorkspacesDraftService), store, calls};
  }

  it('queues changes without calling the backend', () => {
    const {draft, store} = setup();

    expect(draft.add('/a', ['/models'])).toBe(true);
    draft.remove('/old');

    expect(draft.added()).toEqual(['/a']);
    expect(draft.isRemoved('/old')).toBe(true);
    expect(draft.hasChanges()).toBe(true);
    expect(store.addWorkspace).not.toHaveBeenCalled();
    expect(store.removeWorkspace).not.toHaveBeenCalled();
  });

  it('rejects folders that are already workspaces or queued', () => {
    const {draft} = setup();

    expect(draft.add('/models/', ['/models'])).toBe(false);
    expect(draft.add('/a', [])).toBe(true);
    expect(draft.add('/a', [])).toBe(false);
    expect(draft.added()).toEqual(['/a']);
  });

  it('keeps a workspace marked for removal when it is added again', () => {
    const {draft} = setup();
    draft.remove('/old');

    expect(draft.add('/old', ['/old'])).toBe(true);
    expect(draft.hasChanges()).toBe(false);
  });

  it('drops a queued folder instead of removing it', () => {
    const {draft} = setup();
    draft.add('/a', []);

    draft.remove('/a');

    expect(draft.hasChanges()).toBe(false);
  });

  it('applies removals before additions and clears the draft', () => {
    const {draft, calls} = setup();
    draft.add('/a', []);
    draft.remove('/old');
    const complete = vi.fn();

    draft.apply().subscribe({complete});

    expect(calls).toEqual(['remove /old', 'add /a']);
    expect(complete).toHaveBeenCalled();
    expect(draft.hasChanges()).toBe(false);
  });

  it('stops at the first failing change and reports the error', () => {
    const {draft, store} = setup();
    store.removeWorkspace.mockReturnValue(throwError(() => new Error('boom')));
    draft.add('/a', []);
    draft.remove('/old');
    const error = vi.fn();

    draft.apply().subscribe({error});

    expect(error).toHaveBeenCalled();
    expect(store.addWorkspace).not.toHaveBeenCalled();
  });

  it('completes without requests when nothing changed', () => {
    const {draft, store} = setup();
    const complete = vi.fn();

    draft.apply().subscribe({complete});

    expect(complete).toHaveBeenCalled();
    expect(store.addWorkspace).not.toHaveBeenCalled();
  });
});
