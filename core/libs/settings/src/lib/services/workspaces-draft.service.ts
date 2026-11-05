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
import {computed, inject, Injectable, Injector, signal} from '@angular/core';
import {concat, defer, EMPTY, last, Observable} from 'rxjs';

/**
 * Pending workspace changes of one settings dialog. Nothing reaches the backend until {@link apply} runs (Apply/OK);
 * closing the dialog with Cancel simply drops this instance. Provided by the settings dialog.
 */
@Injectable()
export class WorkspacesDraftService {
  private readonly injector = inject(Injector);

  readonly added = signal<readonly string[]>([]);
  readonly removed = signal<ReadonlySet<string>>(new Set());
  readonly hasChanges = computed(() => this.added().length > 0 || this.removed().size > 0);

  /** Queues a folder; re-adding a workspace marked for removal just keeps it. Returns false for duplicates. */
  add(path: string, existingPaths: readonly string[]): boolean {
    const key = normalize(path);
    const removedMatch = [...this.removed()].find(removed => normalize(removed) === key);
    if (removedMatch) {
      this.undoRemove(removedMatch);
      return true;
    }
    if ([...existingPaths, ...this.added()].some(existing => normalize(existing) === key)) return false;
    this.added.update(paths => [...paths, path]);
    return true;
  }

  remove(path: string): void {
    if (this.added().includes(path)) {
      this.added.update(paths => paths.filter(added => added !== path));
      return;
    }
    this.removed.update(paths => new Set(paths).add(path));
  }

  undoRemove(path: string): void {
    this.removed.update(paths => {
      const next = new Set(paths);
      next.delete(path);
      return next;
    });
  }

  isRemoved(path: string): boolean {
    return this.removed().has(path);
  }

  discard(): void {
    this.added.set([]);
    this.removed.set(new Set());
  }

  /** Runs the queued changes one after another and clears the draft; completes without emitting if nothing changed. */
  apply(): Observable<unknown> {
    if (!this.hasChanges()) return EMPTY;
    const store = this.injector.get(ModelSourcesStore);
    const requests = [
      ...[...this.removed()].map(path => defer(() => store.removeWorkspace(path))),
      ...this.added().map(path => defer(() => store.addWorkspace(path))),
    ];
    this.discard();
    return concat(...requests).pipe(last());
  }
}

function normalize(path: string): string {
  return path.trim().replace(/[\\/]+$/, '');
}
