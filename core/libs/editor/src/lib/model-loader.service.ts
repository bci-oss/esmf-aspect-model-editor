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
import {InstantiatorService} from '@ame/instantiator';
import {RdfModelUtil} from '@ame/rdf/utils';
import {BrowserService, ElectronSignalsService, ModelSavingTrackerService, NotificationsService} from '@ame/shared';
import {Injectable, inject} from '@angular/core';
import {ModelElementCache, NamedElement, RdfModel, loadAspectModel} from '@esmf/aspect-model-loader';
import {RdfLoader} from 'libs/aspect-model-loader/src/lib/shared/rdf-loader';
import {NamedNode} from 'n3';
import {Observable, catchError, forkJoin, map, of, switchMap, tap, throwError} from 'rxjs';
import {ModelRendererService} from './model-renderer.service';
import {LoadModelPayload} from './models/load-model-payload.interface';
import {LoadingCodeErrors} from './models/loading-errors';

@Injectable({providedIn: 'root'})
export class ModelLoaderService {
  private loadedFilesService = inject(LoadedFilesService);
  private modelApiService = inject(ModelApiService);
  private notificationsService = inject(NotificationsService);
  private instantiatorService = inject(InstantiatorService);
  private modelRenderer = inject(ModelRendererService);
  private modelSavingTracker = inject(ModelSavingTrackerService);
  private browserService = inject(BrowserService);
  private electronSignalsService = inject(ElectronSignalsService);

  /**
   * Loads a model with it's dependencies and renders it
   */
  renderModel(payload: LoadModelPayload) {
    this.loadedFilesService.removeAll();

    return this.loadSingleModel(payload, true).pipe(
      switchMap(() => this.modelRenderer.renderModel(payload.editElementUrn)),
      tap(() => {
        this.modelSavingTracker.updateSavedModel();
        if (this.browserService.isStartedAsElectronApp() || window.require) {
          const currentFile = this.loadedFilesService.currentLoadedFile;
          this.electronSignalsService.call('updateWindowInfo', {
            namespace: currentFile.namespace,
            fromWorkspace: payload.fromWorkspace,
            file: currentFile.name,
          });
        }
        if (!payload.isDefault) {
          this.notificationsService.info({title: 'Aspect Model loaded', timeout: 3000});
        }
      }),
    );
  }

  /**
   * Loads a model into memory along with it's dependencies and instantiate it but without render
   * @param rdfContent
   * @param absoluteFileName
   */
  loadSingleModel(payload: LoadModelPayload, render = false) {
    return (
      // getting dependencies from the current file and filter data from server
      this.getNamespaceDependencies(payload.rdfAspectModel).pipe(
        // loading in sequence all RdfModels for the current file and dependencies
        switchMap(files => this.loadRdfModelFromFiles(files, payload)),

        // loading the model with all namespace dependencies
        switchMap(({files, rdfModels}) =>
          loadAspectModel({
            filesContent: [payload.rdfAspectModel, ...Object.values(files)],
            // aspectModelUrn: undefined, // @TODO search it in store
          }).pipe(
            // using switchMap to force an this functionality to run before any tap after this
            switchMap(loadedFile => {
              // registering all loaded files
              const currentFile = this.registerFiles(rdfModels, loadedFile, payload, render);
              // loading all isolated elements
              this.instantiatorService.instantiateRemainingElements(loadedFile.rdfModel, loadedFile.cachedElements);
              // filtering and registering the elements by their location in files
              this.moveElementsToTheirCacheFile(rdfModels, loadedFile, payload.namespaceFileName);

              return of(
                render
                  ? this.loadedFilesService.currentLoadedFile
                  : this.loadedFilesService.getFile(currentFile?.absoluteName || payload.namespaceFileName),
              );
            }),
            catchError(error => {
              console.error(error);
              return throwError(() => ({code: LoadingCodeErrors.LOADING_ASPECT_MODEL, error}));
            }),
          ),
        ),
      )
    );
  }

  parseRdfModel(models: string[]) {
    return new RdfLoader()
      .loadModel(models)
      .pipe(catchError(error => throwError(() => ({code: LoadingCodeErrors.PARSING_RDF_MODEL, error}))));
  }

  createRdfModelFromContent(rdfContent: string, absoluteFileName: string): Observable<NamespaceFile> {
    return this.parseRdfModel([rdfContent]).pipe(
      map(rdfModel => this.registerPartialFile(rdfModel, absoluteFileName)),
      catchError(error => throwError(() => ({code: LoadingCodeErrors.LOADING_SINGLE_FILE, error}))),
    );
  }

  /**
   * Loads all the models from workspace and returns a list of RdfModels.
   * By default the functions looks if the model is already loaded and will not load it again.
   *
   * WARNING: using this function it's time and resources consuming. For more than 100 files in workspace
   * it can make the app go into resource allocation problem
   *
   * @param force Default value is false. Set it to true if the reload of file is necessary
   */
  loadWorkspaceModels(force = false): Observable<NamespaceFile[]> {
    return this.modelApiService.getAllNamespacesFilesContent().pipe(
      switchMap(files =>
        forkJoin(
          files.map(file => {
            const loadedFile = this.loadedFilesService.getFile(file.fileName);
            return !force && loadedFile
              ? of(loadedFile)
              : this.loadSingleModel({rdfAspectModel: file.aspectMetaModel, namespaceFileName: file.fileName, fromWorkspace: true});
          }),
        ),
      ),
    );
  }

  getRdfModelsFromWorkspace() {
    return this.modelApiService.getAllNamespacesFilesContent().pipe(
      switchMap(files =>
        forkJoin<[string, RdfModel][]>(
          files.map(file => this.parseRdfModel([file.aspectMetaModel]).pipe(map(rdfModel => [file.fileName, rdfModel]))),
        ),
      ),
      map(result =>
        result.reduce<Record<string, RdfModel>>((acc, [name, rdfModel]) => {
          acc[name] = rdfModel;
          return acc;
        }, {}),
      ),
    );
  }

  /**
   *
   * @param rdf
   * @param namespaces
   * @returns
   */
  private getNamespaceDependencies(
    rdf: string,
    namespaces: Record<string, string> = {},
    workspaceStructure: Record<string, string[]> = null,
  ) {
    return (workspaceStructure ? of(workspaceStructure) : this.modelApiService.getNamespacesStructure()).pipe(
      switchMap(wStructure =>
        this.parseRdfModel([rdf]).pipe(
          switchMap(rdfModel => {
            const dependencies = RdfModelUtil.resolveExternalNamespaces(rdfModel).map(external => external.replace(/urn:samm:|#/gi, ''));
            let dependenciesRequests = {};
            for (const dependency of dependencies) {
              const files = (wStructure?.[dependency] || []).reduce((acc, file) => {
                acc[`${dependency}:${file}`] = this.modelApiService.getAspectMetaModel(`${dependency}:${file}`);
                return acc;
              }, {});
              dependenciesRequests = {...dependenciesRequests, ...files};
            }

            return dependencies.length ? forkJoin(dependenciesRequests) : of({});
          }),
          switchMap((dependencies: Record<string, string>) => {
            const entries = Object.entries(dependencies);
            if (entries.length === 0) return of({});

            entries.forEach(([key, value]) => (namespaces[key] = value));
            const furtherDependencies = entries.reduce((acc, [key, value]) => {
              acc[key] = this.getNamespaceDependencies(value, namespaces, wStructure);
              return acc;
            }, {});
            return forkJoin(furtherDependencies);
          }),
          map(() => namespaces),
        ),
      ),
    );
  }

  private loadRdfModelsInSequence(
    files: [fileName: string, fileContent: string][],
    result: Record<string, RdfModel> = {},
    index = 0,
  ): Observable<Record<string, RdfModel>> {
    const [fileName, fileContent] = files[index];
    return this.parseRdfModel([fileContent]).pipe(
      switchMap(rdfModel =>
        (++index < files.length ? this.loadRdfModelsInSequence(files, result, index) : of(null)).pipe(
          map(() => {
            result[fileName] = rdfModel;
            return result;
          }),
        ),
      ),
      catchError(error => throwError(() => ({code: LoadingCodeErrors.SEQUENCE_LOADING, error}))),
    );
  }

  /**
   * Loads the rdf models of the current model and its dependencies
   */
  private loadRdfModelFromFiles(files: Record<string, string>, payload: LoadModelPayload) {
    return this.loadRdfModelsInSequence([[payload.namespaceFileName || 'current', payload.rdfAspectModel], ...Object.entries(files)]).pipe(
      map(rdfModels => ({rdfModels, files})),
    );
  }

  private registerPartialFile(rdfModel: RdfModel, absoluteFileName: string, fromWorkspace = false) {
    return this.loadedFilesService.addFile({
      rdfModel,
      sharedRdfModel: null,
      cachedFile: null,
      aspect: null,
      absoluteName: absoluteFileName || '',
      rendered: false,
      fromWorkspace,
    });
  }

  private registerFiles(rdfModels: Record<string, RdfModel>, loadedFile: any, payload: LoadModelPayload, render = false) {
    let currentNamespaceFile: NamespaceFile;

    for (const [key, rdfModel] of Object.entries(rdfModels)) {
      const isCurrentFile = key === 'current' || key === payload.namespaceFileName;

      console.log(render, isCurrentFile, key, payload.namespaceFileName);

      if (render && isCurrentFile) {
        const currentFile = this.loadedFilesService.currentLoadedFile;
        currentFile && (currentFile.rendered = false);
      }

      const file = this.loadedFilesService.addFile({
        rdfModel,
        sharedRdfModel: isCurrentFile ? loadedFile.rdfModel : null,
        cachedFile: isCurrentFile ? loadedFile.cachedElements : new ModelElementCache(),
        aspect: isCurrentFile ? loadedFile.aspect : null,
        absoluteName: isCurrentFile ? payload.namespaceFileName || '' : key,
        rendered: isCurrentFile && render,
        fromWorkspace: payload.fromWorkspace,
      });

      if (isCurrentFile) currentNamespaceFile = file;
    }

    return currentNamespaceFile;
  }

  private moveElementsToTheirCacheFile(rdfModels: Record<string, RdfModel>, loadedFile: any, currentLoadingFile: string) {
    const rdfModelsEntries = Object.entries(rdfModels).filter(([key]) => key !== 'current' && key !== currentLoadingFile);
    for (const urn of loadedFile.cachedElements.getKeys()) {
      const namedNode = new NamedNode(urn);
      const [key, rdfModel] = rdfModelsEntries.find(([, rdfModel]) => rdfModel.store.countQuads(namedNode, null, null, null) > 0) || [];
      if (key && key !== 'current' && key !== currentLoadingFile && rdfModel) {
        const fileCache = this.loadedFilesService.files[key].cachedFile;
        fileCache.resolveInstance<NamedElement>(loadedFile.cachedElements.get(urn));
        loadedFile.cachedElements.removeElement(urn);
      }
    }
  }
}
