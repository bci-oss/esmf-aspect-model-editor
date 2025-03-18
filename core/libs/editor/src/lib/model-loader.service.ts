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
import {BrowserService, ElectronSignalsService, FileContentModel, ModelSavingTrackerService, NotificationsService} from '@ame/shared';
import {SidebarStateService} from '@ame/sidebar';
import {Injectable, inject} from '@angular/core';
import {ModelElementCache, NamedElement, RdfModel, destroyRdfModel, destroyStore, loadAspectModel} from '@esmf/aspect-model-loader';
import {RdfLoader} from 'libs/aspect-model-loader/src/lib/shared/rdf-loader';
import {NamedNode} from 'n3';
import {Observable, catchError, forkJoin, map, of, switchMap, tap, throwError} from 'rxjs';
import {ModelRendererService} from './model-renderer.service';
import {LoadModelPayload} from './models/load-model-payload.interface';
import {LoadingCodeErrors} from './models/loading-errors';

@Injectable({providedIn: 'root'})
export class ModelLoaderService {
  private loadedFilesService = inject(LoadedFilesService);
  private sidebarService = inject(SidebarStateService);
  private modelApiService = inject(ModelApiService);
  private notificationsService = inject(NotificationsService);
  private instantiatorService = inject(InstantiatorService);
  private modelRenderer = inject(ModelRendererService);
  private modelSavingTracker = inject(ModelSavingTrackerService);
  private browserService = inject(BrowserService);
  private electronSignalsService = inject(ElectronSignalsService);

  createRdfModelFromContent(rdfContent: string, absoluteFileName: string): Observable<NamespaceFile> {
    return this.parseRdfModel([rdfContent]).pipe(
      map(rdfModel => this.registerPartialFile(rdfModel, absoluteFileName)),
      catchError(error => throwError(() => ({code: LoadingCodeErrors.LOADING_SINGLE_FILE, error}))),
    );
  }

  /**
   * Loads a model into memory along with it's dependencies and instantiate it but without render
   * @param rdfContent
   * @param absoluteFileName
   */
  loadSingleModel(payload: LoadModelPayload) {
    const preloadedFile = this.loadedFilesService.getFile(payload.namespaceFileName);
    if (preloadedFile) {
      return of(preloadedFile);
    }

    return (
      this.modelApiService
        // getting all files from server
        .getAllNamespacesFilesContent()
        .pipe(
          // getting dependencies from the current file and filter data from server
          switchMap(allNamespaces => this.getNamespacesDependencies(payload.rdfAspectModel, allNamespaces)),

          // loading in sequence all RdfModels for the current file and dependencies
          switchMap(files => this.loadRdfModelFromFiles(files, payload.rdfAspectModel)),

          // loading the model with all namespace dependencies
          switchMap(({files, rdfModels}) =>
            loadAspectModel({
              filesContent: [payload.rdfAspectModel, ...Object.values(files)],
              // aspectModelUrn: undefined, // @TODO search it in store
            }).pipe(
              // using switchMap to force an this functionality to run before any tap after this
              switchMap(loadedFile => {
                // registering all loaded files
                this.registerFiles(rdfModels, loadedFile, payload);
                // loading all isolated elements
                this.instantiatorService.instantiateRemainingElements(loadedFile.rdfModel, loadedFile.cachedElements);
                // filtering and registering the elements by their location in files
                this.moveElementsToTheirCacheFile(rdfModels, loadedFile);

                return of(this.loadedFilesService.currentLoadedFile);
              }),
              catchError(error => throwError(() => ({code: LoadingCodeErrors.LOADING_ASPECT_MODEL, error}))),
            ),
          ),
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
        )
    );
  }

  parseRdfModel(rdfModels: string[]) {
    return new RdfLoader().loadModel(rdfModels).pipe(
      tap(() => {
        destroyRdfModel({keepStore: true});
        destroyStore();
      }),
      catchError(error => throwError(() => ({code: LoadingCodeErrors.PARSING_RDF_MODEL, error}))),
    );
  }

  private getNamespacesDependencies(rdf: string, allNamespaces: FileContentModel[], previousNamespaces: Record<string, string> = {}) {
    return this.parseRdfModel([rdf]).pipe(
      map(rdfModel => RdfModelUtil.resolveExternalNamespaces(rdfModel).map(external => external.replace(/urn:samm:|#/gi, ''))),
      map(externalNamespaces => allNamespaces.filter(n => externalNamespaces.some(en => n.fileName.startsWith(en)))),
      switchMap(filteredNamespaces => {
        const obs = {};
        for (const namespace of filteredNamespaces) {
          previousNamespaces[namespace.fileName] = namespace.aspectMetaModel;
          obs[namespace.fileName] = this.getNamespacesDependencies(namespace.aspectMetaModel, allNamespaces, previousNamespaces);
        }

        return filteredNamespaces.length ? forkJoin(obs) : of({});
      }),
      map(() => previousNamespaces),
      catchError(error => throwError(() => ({code: LoadingCodeErrors.NAMESPACE_DEPENDENCIES, error}))),
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
  private loadRdfModelFromFiles(files: Record<string, string>, currentFileContent: string) {
    return this.loadRdfModelsInSequence([['current', currentFileContent], ...Object.entries(files)]).pipe(
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

  private registerFiles(rdfModels: Record<string, RdfModel>, loadedFile: any, payload: LoadModelPayload) {
    for (const [key, rdfModel] of Object.entries(rdfModels)) {
      const isCurrentFile = key === 'current';

      if (isCurrentFile) {
        const currentFile = this.loadedFilesService.currentLoadedFile;
        currentFile && (currentFile.rendered = false);
      }

      this.loadedFilesService.addFile({
        rdfModel,
        sharedRdfModel: isCurrentFile ? loadedFile.rdfModel : null,
        cachedFile: isCurrentFile ? loadedFile.cachedElements : new ModelElementCache(),
        aspect: isCurrentFile ? loadedFile.aspect : null,
        absoluteName: isCurrentFile ? payload.namespaceFileName || '' : key,
        rendered: isCurrentFile,
        fromWorkspace: payload.fromWorkspace,
      });
    }
  }

  private moveElementsToTheirCacheFile(rdfModels: Record<string, RdfModel>, loadedFile: any) {
    const rdfModelsEntries = Object.entries(rdfModels).filter(([key]) => key !== 'current');
    for (const urn of loadedFile.cachedElements.getKeys()) {
      const namedNode = new NamedNode(urn);
      const [key, rdfModel] = rdfModelsEntries.find(([, rdfModel]) => rdfModel.store.countQuads(namedNode, null, null, null) > 0) || [];
      if (key && key !== 'current' && rdfModel) {
        const fileCache = this.loadedFilesService.files[key].cachedFile;
        fileCache.resolveInstance<NamedElement>(loadedFile.cachedElements.get(urn));
        loadedFile.cachedElements.removeElement(urn);
      }
    }
  }
}
