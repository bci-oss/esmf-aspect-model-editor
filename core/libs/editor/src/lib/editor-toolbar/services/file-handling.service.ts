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
import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {
  ConfirmDialogService,
  DialogOptions,
  EditorService,
  FileTypes,
  FileUploadOptions,
  FileUploadService,
  ModelLoaderService,
  ShapeSettingsStateService,
} from '@ame/editor';
import {MigratorService} from '@ame/migrator';
import {MxGraphService} from '@ame/mx-graph';
import {ModelService, RdfService} from '@ame/rdf/services';
import {RdfModelUtil} from '@ame/rdf/utils';
import {ConfigurationService} from '@ame/settings-dialog';
import {
  ElectronSignalsService,
  GeneralConfig,
  LoadingScreenOptions,
  LoadingScreenService,
  ModelSavingTrackerService,
  NotificationsService,
  SaveValidateErrorsCodes,
} from '@ame/shared';
import {FileStatus, SidebarStateService} from '@ame/sidebar';
import {LanguageTranslationService} from '@ame/translation';
import {decodeText, readFile} from '@ame/utils';
import {Injectable, inject} from '@angular/core';
import {ModelElementCache, RdfModel} from '@esmf/aspect-model-loader';
import {saveAs} from 'file-saver';
import {BlankNode, NamedNode, Store} from 'n3';
import {Observable, forkJoin, from, of, throwError} from 'rxjs';
import {catchError, finalize, first, map, switchMap, tap} from 'rxjs/operators';
import {environment} from '../../../../../../environments/environment';
import {ConfirmDialogEnum} from '../../models/confirm-dialog.enum';

export interface FileInfo {
  content: BufferSource;
  path: string;
  name: string;
}

export interface FileInfoParsed extends Omit<FileInfo, 'content'> {
  content: string;
}

interface ModelLoaderState {
  /** Original model absolute file urn */
  originalModelName: string;
  /** New model absolute file urn */
  newModelName: string;
  /** Original file name */
  oldFileName: string;
  /** New model name got after renaming or removing the Aspect */
  newFileName: string;
  /** Boolean representing if model was loaded from workspace */
  loadedFromWorkspace: boolean;
  /** Boolean representing if the original file name was changed */
  isNameChanged: boolean;
  /** Boolean representing if name or version of the namespace was changed */
  isNamespaceChanged: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class FileHandlingService {
  private modelLoaderService = inject(ModelLoaderService);
  private loadedFilesService = inject(LoadedFilesService);

  get currentLoadedFile() {
    return this.loadedFilesService.currentLoadedFile;
  }

  constructor(
    private editorService: EditorService,
    private modelService: ModelService,
    private rdfService: RdfService,
    private modelApiService: ModelApiService,
    private confirmDialogService: ConfirmDialogService,
    private notificationsService: NotificationsService,
    private loadingScreenService: LoadingScreenService,
    private migratorService: MigratorService,
    private sidebarService: SidebarStateService,
    private translate: LanguageTranslationService,
    private electronSignalsService: ElectronSignalsService,
    private configurationService: ConfigurationService,
    private modelSaveTracker: ModelSavingTrackerService,
    private fileUploadService: FileUploadService,
    private shapeSettingsStateService: ShapeSettingsStateService,
    private mxGraphService: MxGraphService,
  ) {
    if (!environment.production) {
      window['angular.fileHandlingService'] = this;
    }
  }

  onLoadModel(fileInfo?: FileInfo) {
    this.loadModel(decodeText(fileInfo.content)).pipe(first()).subscribe();
  }

  loadModel(modelContent: string): Observable<any> {
    if (!modelContent) return of(null);

    const loadingScreenOptions: LoadingScreenOptions = {
      title: this.translate.language.NOTIFICATION_DIALOG?.LOADING,
      content: this.translate.language.NOTIFICATION_DIALOG?.CONTENT,
      hasCloseButton: true,
    };
    this.loadingScreenService.open(loadingScreenOptions);
    const migratedModel = this.migratorService.bammToSamm(modelContent);

    return this.modelApiService.validate(migratedModel).pipe(
      switchMap(validations => {
        const found = validations.find(({errorCode}) => errorCode === 'ERR_PROCESSING');
        return found ? throwError(() => found.message) : this.modelLoaderService.loadSingleModel({rdfAspectModel: migratedModel});
      }),
      catchError(error => {
        this.notificationsService.info({
          title: this.translate.language.NOTIFICATION_SERVICE.LOADING_ERROR,
          message: error.message,
          timeout: 5000,
        });
        return of(null);
      }),
      finalize(() => {
        this.modelSaveTracker.updateSavedModel(true);
        this.loadingScreenService.close();
        if (this.modelService.getLoadedAspectModel().rdfModel) {
          this.shapeSettingsStateService.closeShapeSettings();
        }
        this.sidebarService.workspace.close();
      }),
    );
  }

  loadNamespaceFile(absoluteFileName: string) {
    const subscription = this.modelApiService
      .getAspectMetaModel(absoluteFileName)
      .pipe(
        first(),
        tap(() => {
          const loadingScreenOptions: LoadingScreenOptions = {
            title: this.translate.language.NOTIFICATION_DIALOG?.LOADING,
            hasCloseButton: true,
            closeButtonAction: () => {
              subscription.unsubscribe();
            },
          };
          this.loadingScreenService.open(loadingScreenOptions);
        }),
        switchMap((rdfAspectModel: string) =>
          this.modelLoaderService.loadSingleModel({
            rdfAspectModel,
            namespaceFileName: absoluteFileName,
            fromWorkspace: true,
          }),
        ),
        first(),
        catchError(error => {
          console.groupCollapsed('sidebar.component -> loadNamespaceFile', error);
          console.groupEnd();

          this.notificationsService.error({
            title: this.translate.language.NOTIFICATION_SERVICE.LOADING_ERROR,
            message: `${error?.message || error?.error?.message || error}`,
            timeout: 5000,
          });
          return throwError(() => error);
        }),
        finalize(() => {
          this.loadingScreenService.close();
          if (this.shapeSettingsStateService.isShapeSettingOpened) {
            this.shapeSettingsStateService.closeShapeSettings();
          }
        }),
      )
      .subscribe();
  }

  createEmptyModel() {
    this.loadedFilesService.removeAll();
    const currentRdfModel = this.loadedFilesService.currentLoadedFile?.rdfModel;
    let fileStatus: FileStatus;

    if (currentRdfModel) {
      const [namespace, version, file] = this.loadedFilesService.currentLoadedFile.absoluteName;
      const namespaceVersion = `${namespace}:${version}`;
      fileStatus = this.sidebarService.namespacesState.getFile(namespaceVersion, file);

      if (fileStatus) {
        fileStatus.locked = false;
        this.electronSignalsService.call('removeLock', {namespace: namespaceVersion, file: file});
      }
    }

    // @ TODO rethink creation of empty file
    const emptyNamespace = 'urn:samm:org.eclipse.esmf:1.0.0';
    const rdfModel = new RdfModel(new Store(), GeneralConfig.sammVersion, emptyNamespace);

    this.loadedFilesService.addFile({
      rdfModel,
      cachedFile: new ModelElementCache(),
      aspect: null,
      absoluteName: 'org.eclipse.esmf:1.0.0:empty.ttl',
      rendered: true,
      fromWorkspace: false,
    });

    // const newRdfModel = new RdfModel() //.initRdfModel(new Store(), {'': emptyNamespace as any}, 'empty');
    // const oldFile = this.loadedFilesService.currentCachedFile;

    this.sidebarService.sammElements.open();

    // newRdfModel.absoluteAspectModelFileName = `${emptyNamespace}:${fileName}`;
    // this.rdfService.currentRdfModel = newRdfModel;
    // if (oldFile) {
    //   this.namespaceCacheService.removeFile(oldFile.namespace, oldFile.fileName);
    // }

    // TODO here should be the new cached file
    // this.namespaceCacheService.currentCachedFile = new CachedFile(fileName, emptyNamespace);

    if (this.mxGraphService.graph?.model) {
      this.mxGraphService.deleteAllShapes();
    }

    // this.modelService.addAspect(null);
    // this.modelSaveTracker.updateSavedModel(true);

    //   const loadExternalModels$ = this.editorService
    //     .loadExternalModels()
    //     .pipe(finalize(() => loadExternalModels$.unsubscribe()))
    //     .subscribe();
  }

  onCopyToClipboard() {
    this.copyToClipboard().pipe(first()).subscribe();
  }

  copyToClipboard(): Observable<any> {
    if (!this.modelService.currentRdfModel) {
      return throwError(() => {
        console.error('No Rdf model available. ');
        return 'No Rdf model available. ';
      });
    }

    return this.modelService.synchronizeModelToRdf().pipe(
      map(() => this.rdfService.serializeModel(this.modelService.currentRdfModel)),
      switchMap(serializedModel => this.modelApiService.formatModel(serializedModel)),
      switchMap(formattedModel => {
        const header = this.configurationService.getSettings().copyrightHeader.join('\n');
        return from(navigator.clipboard.writeText(header + '\n\n' + formattedModel));
      }),
      tap(() => {
        this.notificationsService.success({
          title: this.translate.language.SAVE_MENU.COPIED_TO_CLIPBOARD,
          message: this.translate.language.NOTIFICATION_SERVICE.COPIED_TO_CLIPBOARD_MESSAGE,
          timeout: 5000,
        });
      }),
      first(),
    );
  }

  onExportAsAspectModelFile() {
    this.exportAsAspectModelFile().pipe(first()).subscribe();
  }

  exportAsAspectModelFile(): Observable<string> {
    if (!this.modelService.getLoadedAspectModel().rdfModel) {
      return throwError(() => {
        console.error('No Rdf model available. ');
        return 'No Rdf model available. ';
      });
    }

    this.loadingScreenService.open({
      title: this.translate.language.NOTIFICATION_DIALOG?.SAVING,
      content: this.translate.language.NOTIFICATION_DIALOG?.CONTENT,
      hasCloseButton: false,
    });

    return this.modelService.synchronizeModelToRdf().pipe(
      map(() => this.loadedFilesService.currentLoadedFile.absoluteName || 'undefined.ttl'),
      switchMap(fileName => {
        const rdfModelTtl = this.rdfService.serializeModel(this.modelService.currentRdfModel);
        return this.modelApiService.formatModel(rdfModelTtl).pipe(
          tap(formattedModel => {
            const header = this.configurationService.getSettings().copyrightHeader.join('\n');
            saveAs(new Blob([header + '\n\n' + formattedModel], {type: 'text/turtle;charset=utf-8'}), fileName);
          }),
        );
      }),
      catchError(error => {
        console.error(`Error while exporting the Aspect Model. ${JSON.stringify(error)}.`);
        this.notificationsService.error({
          title: this.translate.language.NOTIFICATION_SERVICE.EXPORTING_TITLE_ERROR,
          message: `${error?.error?.message || error}`,
          timeout: 5000,
        });
        return throwError(() => error);
      }),
      finalize(() => this.loadingScreenService.close()),
    );
  }

  onSaveAspectModelToWorkspace() {
    this.saveAspectModelToWorkspace().pipe(first()).subscribe();
  }

  saveAspectModelToWorkspace(): Observable<any> {
    let modelState: ModelLoaderState;

    return this.modelService.synchronizeModelToRdf().pipe(
      switchMap(() => this.getModelLoaderState()),
      tap(state => (modelState = state)),
      switchMap(() => this.handleNamespaceChange(modelState)),
      switchMap(confirm => (confirm !== ConfirmDialogEnum.cancel ? this.editorService.saveModel() : of(null))),
      tap(rdfModel => this.handleRdfModel(rdfModel, modelState)),
      switchMap(() => this.editorService.loadExternalModels()),
      finalize(() => {
        this.modelSaveTracker.updateSavedModel();
        this.loadingScreenService.close();
      }),
    );
  }

  onAddFileToNamespace(fileInfo?: FileInfo): void {
    this.resolveModelFileContent(fileInfo)
      .pipe(
        switchMap(fileInfo => this.addFileToNamespace(fileInfo)),
        first(),
      )
      .subscribe();
  }

  resolveModelFileContent(fileInfo?: FileInfo): Observable<FileInfoParsed> {
    return fileInfo
      ? of({
          ...fileInfo,
          content: decodeText(fileInfo.content),
        })
      : this.selectFile();
  }

  addFileToNamespace(fileInfo: FileInfoParsed): Observable<any> {
    return this.addFileToWorkspace(fileInfo.path, fileInfo.content, {showNotifications: true}).pipe(
      map(() => this.electronSignalsService.call('requestRefreshWorkspaces')),
    );
  }

  selectFile(): Observable<FileInfoParsed> {
    return this.fileUploadService.selectFile([FileTypes.TTL]).pipe(
      switchMap((file: File) =>
        forkJoin({
          content: readFile(file),
          path: of(file.path),
          name: of(file.path.split('/').pop()),
        }),
      ),
    );
  }

  importFilesToWorkspace(
    files: string[],
    conflictFiles: {
      replace: string[];
      keep: string[];
    },
    showLoading = true,
  ): Observable<RdfModel[]> {
    const loadingOptions: LoadingScreenOptions = {
      title: this.translate.language.LOADING_SCREEN_DIALOG.WORKSPACE_IMPORT,
      hasCloseButton: false,
    };
    if (showLoading) this.loadingScreenService.open(loadingOptions);

    const filesReplacement = this.getFilesReplacement(files, conflictFiles);

    return this.importFiles(filesReplacement).pipe(
      tap(() => this.notificationsService.success({title: this.translate.language.NOTIFICATION_SERVICE.PACKAGE_IMPORTED_SUCCESS})),
      catchError(httpError => {
        // @TODO: Temporary check until file blockage is fixed
        !httpError.error?.error?.message?.includes('packages-to-import')
          ? this.notificationsService.error({title: this.translate.language.NOTIFICATION_SERVICE.PACKAGE_IMPORTED_ERROR})
          : this.notificationsService.success({title: this.translate.language.NOTIFICATION_SERVICE.PACKAGE_IMPORTED_SUCCESS});

        return of(null);
      }),
      finalize(() => (showLoading ? this.loadingScreenService.close() : null)),
    );
  }

  addFileToWorkspace(fileName: string, fileContent: string, uploadOptions: FileUploadOptions = {}): Observable<RdfModel> {
    const loadingOptions: LoadingScreenOptions = {
      title: this.translate.language.LOADING_SCREEN_DIALOG.WORKSPACE_IMPORT,
      hasCloseButton: false,
    };
    if (uploadOptions.showLoading) this.loadingScreenService.open(loadingOptions);

    const migratedFile = this.migratorService.bammToSamm(fileContent);
    let newModelContent: string;
    let newModelAbsoluteFileName: string;

    return this.modelApiService.formatModel(migratedFile).pipe(
      switchMap(formattedModel => {
        newModelContent = formattedModel;
        return this.modelApiService.validate(migratedFile, false);
      }),
      switchMap(validations => {
        const found = validations.find(({errorCode}) => errorCode === 'ERR_PROCESSING');
        return found ? throwError(() => found.message) : this.modelLoaderService.createRdfModelFromContent(newModelContent, fileName);
      }),
      tap(({absoluteName}) => (newModelAbsoluteFileName = absoluteName)),
      switchMap(() => this.modelApiService.saveModel(newModelContent, newModelAbsoluteFileName)),
      tap(() => {
        if (uploadOptions.showNotifications) {
          this.notificationsService.success({
            title: this.translate.language.NOTIFICATION_SERVICE.FILE_ADDED_SUCCESS_TITLE,
            message: this.translate.language.NOTIFICATION_SERVICE.FILE_ADDED_SUCCESS_MESSAGE,
          });
        }
        this.sidebarService.workspace.refresh();
      }),
      switchMap(() => this.handleFileVersionConflicts(newModelAbsoluteFileName, newModelContent)),
      catchError(error => {
        console.error(`'Error adding file to namespaces. ${JSON.stringify(error)}.`);
        if (uploadOptions.showNotifications) {
          this.notificationsService.error({
            title: this.translate.language.NOTIFICATION_SERVICE.FILE_ADDED_ERROR_TITLE,
            message: error || this.translate.language.NOTIFICATION_SERVICE.FILE_ADDED_ERROR_MESSAGE,
          });
        }
        return throwError(() => error);
      }),
      finalize(() => (uploadOptions.showLoading ? this.loadingScreenService.close() : null)),
    );
  }

  private handleFileVersionConflicts(fileName: string, fileContent: string): Observable<RdfModel> {
    const currentModel = this.currentLoadedFile;

    if (!currentModel.fromWorkspace || fileName !== this.currentLoadedFile.absoluteName) return of(this.currentLoadedFile.rdfModel);

    return this.rdfService.isSameModelContent(fileName, fileContent, currentModel).pipe(
      switchMap(isSameModelContent => (!isSameModelContent ? this.openReloadConfirmationDialog(currentModel.absoluteName) : of(false))),
      switchMap(isApprove => (isApprove ? this.modelLoaderService.createRdfModelFromContent(fileContent, fileName) : of(null))),
      map((file: NamespaceFile) => file.rdfModel),
    );
  }

  private openReloadConfirmationDialog(fileName: string): Observable<boolean> {
    return this.confirmDialogService
      .open({
        phrases: [
          `${this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.VERSION_CHANGE_NOTICE} ${fileName} ${this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.WORKSPACE_LOAD_NOTICE}`,
          this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.RELOAD_WARNING,
        ],
        title: this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.TITLE,
        closeButtonText: this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.CLOSE_BUTTON,
        okButtonText: this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.OK_BUTTON,
      })
      .pipe(map(confirm => confirm === ConfirmDialogEnum.ok));
  }

  onValidateFile() {
    const subscription$ = this.modelService
      .synchronizeModelToRdf()
      .pipe(finalize(() => subscription$.unsubscribe()))
      .subscribe((): void => {
        if (!this.loadedFilesService.currentLoadedFile.cachedFile.getKeys().length) {
          this.notificationsService.info({
            title: this.translate.language.NOTIFICATION_DIALOG?.NO_ASPECT_TITLE,
            timeout: 5000,
          });
          return;
        }
        this.validateFile().pipe(first()).subscribe();
      });
  }

  validateFile(callback?: Function) {
    const loadingScreenOptions: LoadingScreenOptions = {
      title: this.translate.language.NOTIFICATION_DIALOG?.VALIDATING,
      content: this.translate.language.NOTIFICATION_DIALOG?.CONTENT,
      hasCloseButton: true,
    };
    this.loadingScreenService.open(loadingScreenOptions);

    return this.editorService.validate().pipe(
      map(correctableErrors => {
        this.loadingScreenService.close();
        if (correctableErrors?.length === 0) {
          callback?.call(this);
        }
      }),
      catchError(error => {
        this.loadingScreenService.close();
        if (error?.type === SaveValidateErrorsCodes.validationInProgress) {
          this.notificationsService.error({title: this.translate.language.NOTIFICATION_SERVICE.VALIDATION_IN_PROGRESS});
          return of(() => 'Validation in progress');
        }
        this.notificationsService.error({
          title: this.translate.language.NOTIFICATION_SERVICE.VALIDATION_ERROR_TITLE,
          message: this.translate.language.NOTIFICATION_SERVICE.VALIDATION_ERROR_MESSAGE,
          timeout: 5000,
        });
        console.error(`Error occurred while validating the current model (${JSON.stringify(error)})`);
        return throwError(() => 'Validation completed with errors');
      }),
      finalize(() => localStorage.removeItem('validating')),
    );
  }

  private importFiles(filesReplacement: {namespace: string; files: string[]}[]): Observable<RdfModel[]> {
    return this.modelApiService.replaceFiles(filesReplacement).pipe(
      map(() => {
        const requests: Observable<RdfModel>[] = [];

        filesReplacement.forEach(entry =>
          entry.files.forEach(file => {
            const fileName = `${entry.namespace}:${file}`;
            requests.push(this.importFile(fileName));
          }),
        );

        return requests;
      }),
      switchMap(requests => forkJoin(requests)),
    );
  }

  private importFile(fileName: string): Observable<RdfModel> {
    return this.modelApiService
      .getAspectMetaModel(fileName)
      .pipe(switchMap(formattedContent => this.addFileToWorkspace(fileName, formattedContent)));
  }

  private getFilesReplacement(
    files: string[],
    {keep, replace}: {replace: string[]; keep: string[]},
  ): {namespace: string; files: string[]}[] {
    // Should "keep" files be excluded?
    return Array.from(new Set([...keep, ...replace])).map(namespace => ({
      namespace,
      files: files.filter(file => file.startsWith(namespace)).map(file => file.replace(`${namespace}:`, '')),
    }));
  }

  private getModelLoaderState(): Observable<ModelLoaderState> {
    const currentFile = this.loadedFilesService.currentLoadedFile;
    const response: ModelLoaderState = {
      originalModelName: currentFile.originalName,
      newModelName: currentFile.absoluteName,
      oldFileName: currentFile.originalName?.split(':')?.pop(),
      newFileName: currentFile.absoluteName?.split(':')?.pop(),
      loadedFromWorkspace: currentFile.fromWorkspace,
      isNameChanged: currentFile.isNameChanged,
      isNamespaceChanged: currentFile.isNamespaceChanged,
    };
    return of(response);
  }

  private handleNamespaceChange(modelState: ModelLoaderState): Observable<string> {
    if (!modelState.isNamespaceChanged) {
      return of(ConfirmDialogEnum.action);
    }

    const confirmationDialogConfig: DialogOptions = {
      phrases: [
        this.translate.translateService.instant('CONFIRM_DIALOG.NAMESPACE_CHANGE.PHRASE1', {
          originalModelName: modelState.newFileName,
        }),
        this.translate.translateService.instant('CONFIRM_DIALOG.NAMESPACE_CHANGE.PHRASE2', {
          originalModelNamespace: RdfModelUtil.getNamespaceFromRdf(modelState.originalModelName),
        }),
        this.translate.translateService.instant('CONFIRM_DIALOG.NAMESPACE_CHANGE.PHRASE3', {
          newNamespace: RdfModelUtil.getNamespaceFromRdf(modelState.newModelName),
        }),
        this.translate.language.CONFIRM_DIALOG.NAMESPACE_CHANGE.PHRASE4,
        this.translate.translateService.instant('CONFIRM_DIALOG.NAMESPACE_CHANGE.PHRASE5', {
          originalModelName: modelState.newFileName,
        }),
        this.translate.translateService.instant('CONFIRM_DIALOG.NAMESPACE_CHANGE.PHRASE6', {
          originalModelName: modelState.newFileName,
        }),
        this.translate.language.CONFIRM_DIALOG.NAMESPACE_CHANGE.PHRASE7,
      ],
      title: this.translate.language.CONFIRM_DIALOG.NAMESPACE_CHANGE.TITLE,
      okButtonText: this.translate.language.CONFIRM_DIALOG.NAMESPACE_CHANGE.OK_BUTTON,
      actionButtonText: this.translate.language.CONFIRM_DIALOG.NAMESPACE_CHANGE.ACTION_BUTTON,
      closeButtonText: this.translate.language.CONFIRM_DIALOG.NAMESPACE_CHANGE.CANCEL_BUTTON,
    };

    const loadingDialogConfig: LoadingScreenOptions = {
      hasCloseButton: true,
      title: this.translate.language.LOADING_SCREEN_DIALOG.SAVING_TO_WORKSPACE_TITLE,
      content: this.translate.language.LOADING_SCREEN_DIALOG.SAVING_TO_WORKSPACE_CONTENT,
    };

    return this.confirmDialogService.open(confirmationDialogConfig).pipe(
      tap(() => this.loadingScreenService.open(loadingDialogConfig)),
      switchMap(confirm => {
        if (confirm === ConfirmDialogEnum.ok) {
          return this.migrateAffectedModels(modelState.originalModelName, modelState.newModelName).pipe(map(() => confirm));
        }

        return of(confirm);
      }),
    );
  }

  private migrateAffectedModels(originalModelName: string, newModelName: string): Observable<RdfModel[]> {
    const originalNamespace = RdfModelUtil.getUrnFromFileName(originalModelName);
    const newNamespace = RdfModelUtil.getUrnFromFileName(newModelName);
    const affectedModels = this.updateAffectedQuads(originalModelName, originalNamespace, newNamespace);
    return this.updateAffectedModels(affectedModels, originalNamespace, newNamespace);
  }

  public updateAffectedQuads(originalModelName: string, originalNamespace: string, newNamespace: string): NamespaceFile[] {
    const subjects = this.loadedFilesService.currentLoadedFile.rdfModel.store.getSubjects(null, null, null);
    const models = Object.values(this.loadedFilesService.files).filter(model => model.absoluteName !== originalModelName);
    const affectedModels: NamespaceFile[] = [];

    subjects.forEach(subject => {
      if (subject instanceof BlankNode) return;
      if (!subject.value.startsWith(newNamespace)) return;
      const subjectName = subject.value.split('#').pop();
      const originalSubject = new NamedNode(`${originalNamespace}#${subjectName}`);

      // models.forEach(model => {
      //   const updatedPredicateQuadsCount = model.updateQuads({predicate: originalSubject}, {predicate: subject});
      //   const updatedObjectQuadsCount = model.updateQuads({object: originalSubject}, {object: subject});
      //   if (updatedPredicateQuadsCount || updatedObjectQuadsCount) affectedModels.push(model);
      // });
    });

    return affectedModels;
  }

  private updateAffectedModels(models: NamespaceFile[], originalNamespace: string, newNamespace: string): Observable<RdfModel[]> {
    // const requests = models.map(model => {
    //   const alias = model.rdfModel.getAliasByNamespace(`${originalNamespace}#`);
    //   alias
    //     ? model.rdfModel.updatePrefix(alias, originalNamespace, newNamespace)
    //     : model.rdfModel.addPrefix('ext-namespace', `${newNamespace}#`);
    //   return this.rdfService.saveModel(model);
    // });
    // TODO: redo this function
    const requests = [];
    return requests.length ? forkJoin(requests) : of([]);
  }

  private handleRdfModel(rdfModel: object | RdfModel, modelState: ModelLoaderState): void {
    if (!rdfModel) {
      return;
    }
    // TODO change functionality with the new files service
    if (rdfModel instanceof RdfModel) {
      // this.rdfService.currentRdfModel.namespaceHasChanged = false;
      // this.namespaceCacheService.currentCachedFile.fileName = rdfModel.aspectModelFileName;
    }

    if (modelState.isNameChanged) {
      this.showFileNameChangeNotification(modelState);
    }

    // this.rdfService.currentRdfModel.originalAbsoluteFileName = null;
    // this.rdfService.currentRdfModel.loadedFromWorkspace = true;

    const namespace = RdfModelUtil.getNamespaceFromRdf(modelState.newModelName);
    this.electronSignalsService.call('updateWindowInfo', {
      namespace,
      fromWorkspace: true,
      file: modelState.newFileName,
    });
  }

  private showFileNameChangeNotification(modelState: ModelLoaderState): void {
    const title = this.translate.language.NOTIFICATION_SERVICE.RENAMED_FILE_TITLE;
    const message = this.translate.translateService.instant('NOTIFICATION_SERVICE.RENAMED_FILE_MESSAGE', {
      oldFile: modelState.oldFileName,
      newFile: modelState.newFileName,
    });

    this.notificationsService.info({title, message});
  }
}
