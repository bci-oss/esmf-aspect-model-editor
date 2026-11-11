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
  ConfigurationService,
  getNamespaceModels,
  LoadedFilesService,
  ModelApiPort,
  ModelDocumentService,
  ModelSaverPort,
  ModelService,
  ModelSourcesStore,
  NamespaceFile,
  RdfPort,
  WorkspaceStore,
} from '@ame/domain';
import {LanguageTranslationService, NotificationsService, SaveValidateErrorsCodes, unresolvedElementsOf} from '@ame/shared';
import {DestroyRef, inject, Injectable} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatDialog} from '@angular/material/dialog';
import {RdfModel} from '@esmf/aspect-model-loader';
import {catchError, defer, delayWhen, first, map, Observable, of, retry, Subscription, switchMap, tap, throwError, timer} from 'rxjs';
import {ModelSavingTrackerService} from './model-saving-tracker.service';
import {TargetWorkspaceDialogComponent, TargetWorkspaceDialogData} from './target-workspace-dialog/target-workspace-dialog.component';

import {TabStateService} from './tabs/tab-state.service';

const SAVE_CANCELLED = 'saveCancelled';

@Injectable({providedIn: 'root'})
export class ModelSaverService implements ModelSaverPort {
  private destroyRef = inject(DestroyRef);
  private modelApiService = inject(ModelApiPort);
  private rdfSerializer = inject(RdfPort);
  private loadedFiles = inject(LoadedFilesService);
  private modelService = inject(ModelService);
  private modelSavingTracker = inject(ModelSavingTrackerService);
  private notificationsService = inject(NotificationsService);
  private workspaceStore = inject(WorkspaceStore);
  private translate = inject(LanguageTranslationService);
  private configurationService = inject(ConfigurationService);
  private modelDocumentService = inject(ModelDocumentService);
  private modelSources = inject(ModelSourcesStore);
  private matDialog = inject(MatDialog);

  private readonly tabStateService = inject(TabStateService);

  private saveModelSubscription$: Subscription;

  private get settings() {
    return this.configurationService.getSettings();
  }

  private get currentFile(): NamespaceFile | undefined {
    return this.loadedFiles.currentLoadedFile;
  }

  saveModel(rdfModel?: RdfModel) {
    if (!rdfModel && this.isCurrentModelReadOnly()) {
      const source = this.modelSources.findSource(this.currentFile?.rdfModel?.getSourceLocation());
      this.notificationsService.error({
        title: this.translate.language.notificationService.aspectSavedError,
        message: this.translate.translateService.translate('modelSources.readOnlySave', {source: source?.name ?? ''}),
      });
      return of(null);
    }

    const synchronizedModel = this.modelService.synchronizeModelToRdf();
    return (synchronizedModel || throwError(() => ({type: SaveValidateErrorsCodes.desynchronized}))).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(() => this.writeModelToWorkspace(rdfModel)),
      tap(() => {
        this.modelSavingTracker.updateSavedModel();
        this.tabStateService.setTabDirty(this.tabStateService.activeTabId(), false);
        this.notificationsService.info({title: this.translate.language.notificationService.aspectSavedSuccess});
        console.info('Aspect model was saved to the local folder');
        this.workspaceStore.triggerRefresh();
      }),
      catchError(error => {
        if (error?.type === SAVE_CANCELLED) {
          console.info('Saving was cancelled by the user');
          return of(null);
        }
        console.error('Error on saving aspect model', error);
        const unresolvedElements = unresolvedElementsOf(error);
        this.notificationsService.error(
          unresolvedElements.length
            ? {
                title: this.translate.translateService.translate('notificationService.unresolvedReferencesTitle'),
                message: this.translate.translateService.translate('notificationService.unresolvedReferencesSaveMessage', {
                  elements: unresolvedElements.join(', '),
                }),
              }
            : {
                title: this.translate.language.notificationService.aspectSavedError,
                message: error?.error?.message,
              },
        );
        return of(null);
      }),
    );
  }

  /** Saves the model after the configured delay, but only if it changed since it was loaded or saved the last time. */
  autoSaveModel(): Observable<RdfModel> {
    return of({}).pipe(
      takeUntilDestroyed(this.destroyRef),
      delayWhen(() => timer(this.settings.saveTimerSeconds * 1000)),
      switchMap(() => (this.canAutoSave() ? this.modelSavingTracker.isSaved$.pipe(first()) : of(true))),
      switchMap(saved => (saved ? of(null) : this.saveModel().pipe(takeUntilDestroyed(this.destroyRef), first()))),
      tap(() => {
        this.enableAutoSave();
      }),
      retry({
        delay: () => timer(this.settings.saveTimerSeconds * 1000),
      }),
    );
  }

  enableAutoSave(): void {
    if (this.settings.autoSaveEnabled) {
      this.startSaveModel();
    } else {
      this.stopSaveModel();
    }
  }

  private startSaveModel(): void {
    this.stopSaveModel();
    this.saveModelSubscription$ = this.autoSaveModel().subscribe();
  }

  private stopSaveModel() {
    if (this.saveModelSubscription$) {
      this.saveModelSubscription$.unsubscribe();
    }
  }

  /** Files of GitHub sources are read-only. */
  isCurrentModelReadOnly(): boolean {
    return this.modelSources.isReadOnlyLocation(this.currentFile?.rdfModel?.getSourceLocation());
  }

  /**
   * Autosave neither touches empty or read-only files nor stores a new model before the user chose its workspace;
   * the first save of a new model is always explicit.
   */
  private canAutoSave(): boolean {
    if (!this.currentFile?.cachedFile?.getKeys().length || this.currentFile.name?.includes('empty.ttl')) return false;
    if (this.isCurrentModelReadOnly()) return false;
    return !(this.isNewModel() && this.modelSources.hasMultipleWorkspaces());
  }

  private isNewModel(): boolean {
    return !!this.currentFile && !this.currentFile.fromWorkspace;
  }

  /**
   * The workspace to save the model to. A model that already exists stays in its workspace (also when renamed);
   * for a new model the user chooses the workspace if there are several. `undefined` lets the backend decide.
   */
  private resolveTargetWorkspace(currentModel: RdfModel | undefined, isCurrentFile: boolean): Observable<string | undefined> {
    return defer(() => {
      const existing = this.modelSources.findSource(currentModel?.getSourceLocation());
      if (existing?.type === 'workspace') return of(existing.path);
      if (!isCurrentFile || !this.isNewModel() || !this.modelSources.hasMultipleWorkspaces()) return of(undefined);

      const data: TargetWorkspaceDialogData = {
        workspaces: this.modelSources.workspaces(),
        selected: this.modelSources.preferredWorkspace(),
        fileName: this.currentFile?.name ?? '',
      };
      return this.matDialog
        .open<TargetWorkspaceDialogComponent, TargetWorkspaceDialogData, string>(TargetWorkspaceDialogComponent, {data, width: '560px'})
        .afterClosed()
        .pipe(
          tap(target => target && this.modelSources.rememberTargetWorkspace(target)),
          switchMap(target => (target ? of(target) : throwError(() => ({type: SAVE_CANCELLED})))),
        );
    });
  }

  private writeModelToWorkspace(rdfModel?: RdfModel): Observable<RdfModel> {
    const currentModel = rdfModel || this.currentFile?.rdfModel;
    const rdfContent = this.rdfSerializer.serializeModel(currentModel);

    if (!rdfContent || !/\S/.test(rdfContent.replace(/@prefix[^\n]*\n/g, ''))) {
      console.info('Model is empty. Skipping saving.');
      return throwError(() => ({
        error: {
          message: this.translate.language.notificationService.aspectSavedEmptyModel,
        },
      }));
    }

    let targetWorkspace: string | undefined;
    return this.modelSources.ensureLoaded().pipe(
      switchMap(() => this.resolveTargetWorkspace(currentModel, !rdfModel)),
      tap(target => (targetWorkspace = target)),
      switchMap(() => this.modelApiService.fetchFormatedAspectModel(rdfContent, currentModel?.getSourceLocation())),
      takeUntilDestroyed(this.destroyRef),
      switchMap(content => {
        if (!content) {
          return throwError(() => ({
            error: {
              message: this.translate.language.notificationService.aspectSavedEmptyModel,
            },
          }));
        }

        const contentWithCopyright = this.modelDocumentService.toDocument(content, currentModel);

        const originalAspectModelUrn = this.currentFile?.originalAspectModelUrn;
        const newAspectModelUrn = this.currentFile?.getAnyAspectModelUrn();

        const saveModel = () =>
          this.modelApiService.saveAspectModel(
            contentWithCopyright,
            newAspectModelUrn,
            this.currentFile?.absoluteName || '',
            targetWorkspace,
          );
        if (this.currentFile) {
          this.currentFile.originalAspectModelUrn = newAspectModelUrn;
        }

        if (this.currentFile?.isNameChanged || this.currentFile?.isNamespaceChanged) {
          const model = this.currentFile?.originalNamespace.split(':');
          const [namespaceName, namespaceVersion] = model && model.length === 2 ? model : ['', ''];
          const originalName = this.currentFile?.originalName;

          return this.modelApiService.loadNamespacesStructure().pipe(
            map(structure => getNamespaceModels(structure, namespaceName, namespaceVersion).some(m => m.name === originalName)),
            map(exists => (exists ? this.modelApiService.deleteAspectModel(originalAspectModelUrn) : of(null))),
            switchMap(() => saveModel()),
          );
        }

        return saveModel();
      }),
      map(() => this.currentFile?.rdfModel),
    );
  }
}
