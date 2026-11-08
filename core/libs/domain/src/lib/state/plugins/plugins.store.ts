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

import {BackendStatusService} from '@ame/shared';
import {computed, inject, Injectable, linkedSignal, Signal, signal} from '@angular/core';
import {rxResource, toObservable} from '@angular/core/rxjs-interop';
import {defer, filter, first, from, map, Observable, switchMap, tap} from 'rxjs';
import {PluginsOverview, PluginStatus} from '../../model-api';
import {PluginsPort} from '../../ports/plugins.port';

/** State of the installed plugins. */
@Injectable({providedIn: 'root'})
export class PluginsStore {
  private readonly api = inject(PluginsPort, {optional: true});
  private readonly backendStatus = inject(BackendStatusService);
  private readonly backendStatus$ = toObservable(this.backendStatus.status);

  /** Set once the plugins are needed; from then on they are loaded with every start of the backend. */
  private readonly requested = signal(false);
  /** Revision of the last start of the backend; plugins are started with the backend. */
  private readonly readyRevision = computed(() => {
    const status = this.backendStatus.status();
    return status.state === 'ready' ? status.revision : undefined;
  });
  private readonly overviewResource = rxResource({
    params: () => (this.requested() ? this.readyRevision() : undefined),
    stream: () => this.requireApi().getOverview(),
  });

  /** The last loaded plugins; kept while the backend restarts or the plugins cannot be loaded. */
  readonly overview: Signal<PluginsOverview | null> = linkedSignal<PluginsOverview | undefined, PluginsOverview | null>({
    source: () => (this.overviewResource.hasValue() ? this.overviewResource.value() : undefined),
    computation: (overview, previous) => overview ?? previous?.value ?? null,
  });
  readonly loaded = computed(() => this.overview() !== null);
  /** Why the plugins could not be loaded, e.g. because the backend does not support plugins. */
  readonly loadError = computed(() => this.overviewResource.error() ?? null);
  /** Ids of the plugins currently changed. */
  readonly busyIds = signal<ReadonlySet<string>>(new Set());
  readonly installing = signal(false);

  readonly plugins = computed(() => this.overview()?.plugins ?? []);
  readonly restartRequired = computed(() => !!this.overview()?.restartRequired);
  readonly canRestartBackend = this.backendStatus.canRestart;
  readonly restarting = this.backendStatus.restarting;

  /** Loads the plugins, and from then on again with every start of the backend. */
  load(): void {
    if (this.requested()) this.overviewResource.reload();
    else this.requested.set(true);
  }

  refresh(): Observable<PluginsOverview> {
    return this.requireApi()
      .getOverview()
      .pipe(tap(overview => this.setOverview(overview)));
  }

  plugin(id: string): PluginStatus | undefined {
    return this.plugins().find(plugin => plugin.id === id);
  }

  isBusy(id: string): boolean {
    return this.busyIds().has(id);
  }

  install(file: File): Observable<PluginStatus> {
    return defer(() => {
      this.installing.set(true);
      return this.requireApi().install(file);
    }).pipe(
      switchMap(status => this.refreshThen(status)),
      tap({finalize: () => this.installing.set(false)}),
    );
  }

  uninstall(id: string): Observable<PluginsOverview> {
    return this.runBusy(id, () => this.requireApi().uninstall(id)).pipe(tap(overview => this.setOverview(overview)));
  }

  setEnabled(id: string, enabled: boolean): Observable<PluginStatus> {
    return this.runBusy(id, () => this.requireApi().setEnabled(id, enabled)).pipe(switchMap(status => this.refreshThen(status)));
  }

  /**
   * Restarts the backend so that installed, updated, enabled and disabled plugins take effect, and reloads the plugins
   * once the backend is ready again. Fails if the backend cannot be restarted or does not start.
   */
  restartBackend(): Observable<PluginsOverview> {
    return from(this.backendStatus.restart()).pipe(
      switchMap(() => this.backendStatus$),
      filter(status => status.state !== 'starting'),
      first(),
      switchMap(status => {
        if (status.state === 'failed') throw new Error(status.message || 'The backend could not be started.');
        return this.refresh();
      }),
    );
  }

  /** Reloads the plugins and then emits the given result. */
  private refreshThen<T>(result: T): Observable<T> {
    return this.refresh().pipe(map(() => result));
  }

  private setOverview(overview: PluginsOverview): void {
    this.overviewResource.set(overview);
  }

  private runBusy<T>(id: string, request: () => Observable<T>): Observable<T> {
    return defer(() => {
      this.busyIds.update(ids => new Set(ids).add(id));
      return request();
    }).pipe(
      tap({
        finalize: () =>
          this.busyIds.update(ids => {
            const next = new Set(ids);
            next.delete(id);
            return next;
          }),
      }),
    );
  }

  private requireApi(): PluginsPort {
    if (!this.api) throw new Error('No PluginsPort provided');
    return this.api;
  }
}
