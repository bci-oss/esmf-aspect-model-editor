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
import {computed, inject, Injectable, signal} from '@angular/core';
import {catchError, finalize, forkJoin, map, Observable, of, switchMap, tap} from 'rxjs';
import {GithubSourceConfig, GithubSourceStatus, isInSource, ModelSource, normalizeSourcePath, WorkspaceConfig} from '../../model-api';
import {ModelSourcesPort} from '../../ports/model-sources.port';
import {WorkspaceNamespacesService} from '../workspace/workspace-namespaces.service';
import {WorkspaceStore} from '../workspace/workspace.store';

/** State of the local workspaces and the read-only GitHub sources. */
@Injectable({providedIn: 'root'})
export class ModelSourcesStore {
  private readonly api = inject(ModelSourcesPort, {optional: true});
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly workspaceNamespaces = inject(WorkspaceNamespacesService);
  private readonly tauriSignals = inject(TauriSignalsService, {optional: true});

  readonly config = signal<WorkspaceConfig | null>(null);
  readonly sources = signal<ModelSource[]>([]);
  readonly githubStatuses = signal<GithubSourceStatus[]>([]);
  readonly loaded = signal(false);
  /** Ids of the GitHub sources currently checked or synchronized. */
  readonly busyIds = signal<ReadonlySet<string>>(new Set());

  readonly workspaces = computed(() => this.sources().filter(source => source.type === 'workspace'));
  readonly hasMultipleWorkspaces = computed(() => this.workspaces().length > 1);
  readonly defaultWorkspace = computed(
    () => this.workspaces().find(workspace => workspace.defaultWorkspace)?.path ?? this.workspaces()[0]?.path ?? null,
  );
  private readonly lastTargetWorkspace = signal<string | null>(readLastTargetWorkspace());
  /** Preselection for new models: the workspace chosen last if it still exists, otherwise the default workspace. */
  readonly preferredWorkspace = computed(() => {
    const last = this.lastTargetWorkspace();
    return this.workspaces().some(workspace => workspace.path === last) ? last : this.defaultWorkspace();
  });
  readonly updatesAvailable = computed(() =>
    this.githubStatuses().filter(status => status.source.enabled !== false && status.updateAvailable),
  );

  /** Loads the configuration, the sources and the GitHub statuses. */
  refresh(): Observable<ModelSource[]> {
    if (!this.api) return of([]);
    return forkJoin({
      config: this.api.getConfig(),
      sources: this.api.getSources(),
      statuses: this.api.getGithubStatuses(),
    }).pipe(
      tap(({config, sources, statuses}) => {
        this.config.set(config);
        this.sources.set(sources);
        this.githubStatuses.set(statuses);
        this.loaded.set(true);
      }),
      map(({sources}) => sources),
    );
  }

  /** The sources, loaded on first use. Fails silently with an empty list, e.g. with an older backend. */
  ensureLoaded(): Observable<ModelSource[]> {
    return this.loaded() ? of(this.sources()) : this.refresh().pipe(catchError(() => of([] as ModelSource[])));
  }

  /** The source containing the file (path or `file:` URI); the most specific one if sources are nested. */
  findSource(pathOrUri: string | null | undefined): ModelSource | undefined {
    if (!pathOrUri) return undefined;
    return this.sources()
      .filter(source => isInSource(source, pathOrUri))
      .sort((a, b) => normalizeSourcePath(b.path).length - normalizeSourcePath(a.path).length)[0];
  }

  isReadOnlyLocation(pathOrUri: string | null | undefined): boolean {
    return !!this.findSource(pathOrUri)?.readOnly;
  }

  githubStatus(id: string): GithubSourceStatus | undefined {
    return this.githubStatuses().find(status => status.source.id === id);
  }

  isBusy(id: string): boolean {
    return this.busyIds().has(id);
  }

  /** Remembers the workspace chosen for a new model as preselection for the next one. */
  rememberTargetWorkspace(path: string): void {
    this.lastTargetWorkspace.set(path);
    if (typeof localStorage !== 'undefined') localStorage.setItem(LAST_TARGET_WORKSPACE_KEY, path);
  }

  addWorkspace(path: string): Observable<WorkspaceConfig> {
    return this.changeSources(this.requireApi().addWorkspace(path));
  }

  removeWorkspace(path: string): Observable<WorkspaceConfig> {
    return this.changeSources(this.requireApi().removeWorkspace(path));
  }

  addGithubSource(source: GithubSourceConfig): Observable<GithubSourceStatus> {
    return this.changeSources(this.requireApi().addGithubSource(source));
  }

  updateGithubSource(id: string, source: GithubSourceConfig): Observable<GithubSourceStatus> {
    return this.changeSources(this.requireApi().updateGithubSource(id, source));
  }

  removeGithubSource(id: string): Observable<GithubSourceStatus[]> {
    return this.changeSources(this.requireApi().removeGithubSource(id));
  }

  /** Checks a GitHub source for a newer commit; errors end up in `lastError` of the status. */
  check(source: GithubSourceConfig): Observable<GithubSourceStatus> {
    return this.runBusy(source, this.requireApi().checkGithubSource(source)).pipe(tap(status => this.upsertStatus(status)));
  }

  /** Checks all enabled GitHub sources. Emits the statuses with an available update. */
  checkAll(): Observable<GithubSourceStatus[]> {
    const sources = (this.config()?.githubSources ?? []).filter(source => source.enabled !== false && source.id);
    if (!sources.length) return of([]);
    return forkJoin(sources.map(source => this.check(source).pipe(catchError(() => of(null))))).pipe(
      map(statuses => statuses.filter((status): status is GithubSourceStatus => !!status?.updateAvailable)),
    );
  }

  /** Replaces the local copy with the latest commit and reloads the workspace. */
  sync(source: GithubSourceConfig): Observable<GithubSourceStatus> {
    return this.runBusy(source, this.requireApi().syncGithubSource(source)).pipe(
      tap(status => this.upsertStatus(status)),
      switchMap(status => this.refresh().pipe(map(() => status))),
      tap(() => this.reloadWorkspace()),
    );
  }

  private changeSources<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      switchMap(result => this.refresh().pipe(map(() => result))),
      tap(() => this.reloadWorkspace()),
    );
  }

  /** The model list changes with the sources; files of removed sources must disappear. */
  private reloadWorkspace(): void {
    this.workspaceNamespaces.clear();
    this.workspaceStore.triggerRefresh();
    this.tauriSignals?.call('requestRefreshWorkspaces');
  }

  private runBusy<T>(source: GithubSourceConfig, request: Observable<T>): Observable<T> {
    const id = source.id ?? '';
    this.busyIds.update(ids => new Set(ids).add(id));
    return request.pipe(
      finalize(() =>
        this.busyIds.update(ids => {
          const next = new Set(ids);
          next.delete(id);
          return next;
        }),
      ),
    );
  }

  private upsertStatus(status: GithubSourceStatus): void {
    this.githubStatuses.update(statuses => {
      const index = statuses.findIndex(existing => existing.source.id === status.source.id);
      return index === -1 ? [...statuses, status] : statuses.map((existing, i) => (i === index ? status : existing));
    });
  }

  private requireApi(): ModelSourcesPort {
    if (!this.api) throw new Error('No ModelSourcesPort provided');
    return this.api;
  }
}

const LAST_TARGET_WORKSPACE_KEY = 'ame.lastTargetWorkspace';

function readLastTargetWorkspace(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_TARGET_WORKSPACE_KEY) : null;
}
