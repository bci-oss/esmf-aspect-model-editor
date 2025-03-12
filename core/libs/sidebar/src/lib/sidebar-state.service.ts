/*
 * Copyright (c) 2024 Robert Bosch Manufacturing Solutions GmbH
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

import {ModelApiService} from '@ame/api';
import {LoadedFilesService} from '@ame/cache';
import {ExporterHelper} from '@ame/migrator';
import {APP_CONFIG, AppConfig, BrowserService, ElectronSignals, ElectronSignalsService, NotificationsService} from '@ame/shared';
import {Injectable, inject} from '@angular/core';
import {BehaviorSubject, Subscription, catchError, map, of, throwError} from 'rxjs';
import {environment} from '../../../../environments/environment';

class SidebarState {
  private opened$ = new BehaviorSubject(false);
  public isOpened$ = this.opened$.asObservable();

  close() {
    this.opened$.next(false);
  }

  open() {
    this.opened$.next(true);
  }

  toggle() {
    this.opened$.next(!this.opened$.value);
  }
}

class SidebarStateWithRefresh extends SidebarState {
  private refresh$ = new BehaviorSubject(null);
  public refreshSignal$ = this.refresh$.asObservable();

  refresh() {
    this.refresh$.next({});
  }
}

class Selection {
  #selection$ = new BehaviorSubject<{namespace: string; file: string}>(null);
  public selection$ = this.#selection$.asObservable();

  constructor(
    public namespace?: string,
    public file?: string,
  ) {}

  public select(namespace: string, file: string) {
    if (namespace && file) {
      this.namespace = namespace;
      this.file = file;
      this.#selection$.next({namespace, file});
    }
  }

  public reset() {
    this.namespace = null;
    this.file = null;
    this.#selection$.next(null);
  }

  public isSelected(namespace: string, file: string) {
    return this.namespace === namespace && this.file === file;
  }
}

export class FileStatus {
  public locked: boolean;
  public loaded: boolean;
  public outdated: boolean;
  public errored: boolean;
  public sammVersion: string;

  constructor(public name: string) {}
}

class NamespacesManager {
  private loadedFilesService = inject(LoadedFilesService);
  public namespaces: {[key: string]: FileStatus[]} = {};
  public hasOutdatedFiles = false;

  public get namespacesKeys(): string[] {
    return Object.keys(this.namespaces);
  }

  public get currentFile() {
    return this.loadedFilesService.currentLoadedFile;
  }

  setFile(namespace: string, file: string) {
    const fileStatus = new FileStatus(file);
    if (this.namespaces[namespace]) {
      this.namespaces[namespace].push(fileStatus);
    } else {
      this.namespaces[namespace] = [fileStatus];
    }

    return fileStatus;
  }

  getFile(namespace: string, file: string) {
    return this.namespaces[namespace]?.find(fileStatus => fileStatus.name === file);
  }

  lockFiles(files: {namespace: string; file: string}[]) {
    for (const namespace of this.namespacesKeys) {
      for (const fileStatus of this.namespaces[namespace]) {
        if (fileStatus.name !== this.currentFile.name) {
          fileStatus.locked = files.some(file => file.namespace === namespace && file.file === fileStatus.name);
        }
      }
    }
  }

  clear() {
    this.namespaces = {};
  }
}

@Injectable({providedIn: 'root'})
export class SidebarStateService {
  private electronSignalsService: ElectronSignals = inject(ElectronSignalsService);
  private config: AppConfig = inject(APP_CONFIG);
  private loadedFilesService = inject(LoadedFilesService);

  public sammElements = new SidebarState();
  public workspace = new SidebarStateWithRefresh();
  public fileElements = new SidebarState();
  public selection = new Selection();
  public namespacesState = new NamespacesManager();

  constructor(
    private modelApiService: ModelApiService,
    private notificationService: NotificationsService,
    private browserService: BrowserService,
  ) {
    this.manageSidebars();
    requestAnimationFrame(() => {
      this.getLockedFiles();
    });
  }

  public isCurrentFileLoaded(): boolean {
    return !!this.loadedFilesService.currentLoadedFile;
  }

  public isCurrentFile(namespace: string, fileName: string): boolean {
    const {namespace: currentNamespace, name} = this.loadedFilesService.currentLoadedFile;
    return currentNamespace === namespace && name === fileName;
  }

  public requestGetNamespaces() {
    return this.modelApiService.getNamespacesAppendWithFiles().pipe(
      map((namespaces: string[]) => {
        this.namespacesState.clear();
        let hasOutdatedFiles = false;
        for (const fullFile of namespaces) {
          const [namespace, version, file] = fullFile.split(':');
          const versionedNamespace = `${namespace}:${version}`;
          const fileStatus = this.namespacesState.setFile(versionedNamespace, file);
          this.setFileStatuses(fileStatus, versionedNamespace);
          hasOutdatedFiles ||= fileStatus.outdated;
        }

        this.namespacesState.hasOutdatedFiles = hasOutdatedFiles;
        this.getLockedFiles(true);
        return this.namespacesState.namespaces;
      }),
      catchError(err =>
        throwError(() =>
          this.notificationService.error({
            title: 'Could not retrieve the namespaces!',
            message: !err.status ? 'Please try to close and reopen the application.' : '',
          }),
        ),
      ),
    );
  }

  private getLockedFiles(takeOne?: boolean): Subscription {
    if (!environment.production && window.location.search.includes('?e2e=true')) {
      return of({}).subscribe();
    }

    let subscription: Subscription = new Subscription();
    if (this.browserService.isStartedAsElectronApp() || window.require) {
      subscription = this.electronSignalsService.call('lockedFiles').subscribe(files => {
        this.namespacesState.lockFiles(files);

        if (takeOne) {
          subscription.unsubscribe();
        }
      });
    }

    return subscription;
  }

  private setFileStatuses(file: FileStatus, namespace: string) {
    if (!file) {
      return;
    }

    const loadedFile = this.loadedFilesService.files[`${namespace}:${file.name}`];
    file.loaded = this.isCurrentFile(namespace, file.name);

    if (loadedFile?.rdfModel?.samm) {
      file.sammVersion = loadedFile.rdfModel?.samm.version;
      file.outdated = ExporterHelper.isVersionOutdated(loadedFile.rdfModel?.samm.version, this.config.currentSammVersion);
    }
  }

  private manageSidebars() {
    this.sammElements.isOpened$.subscribe(state => {
      if (!state) {
        return;
      }

      this.workspace.close();
      this.fileElements.close();
    });

    this.workspace.isOpened$.subscribe(state => {
      if (!state) {
        this.fileElements.close();
        return;
      }

      this.sammElements.close();
    });

    this.fileElements.isOpened$.subscribe(opened => {
      if (!opened) {
        this.selection.reset();
      }
    });

    this.selection.selection$.subscribe(selection => {
      if (selection) this.fileElements.open();
    });
  }
}
