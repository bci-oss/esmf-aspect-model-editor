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

import {ModelApiService, WorkspaceStructure} from '@ame/api';
import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {InstantiatorService} from '@ame/instantiator';
import {ExporterHelper} from '@ame/migrator';
import {RdfModelUtil} from '@ame/rdf/utils';
import {ConfigurationService} from '@ame/settings-dialog';
import {BrowserService, ElectronSignalsService, ModelSavingTrackerService, NotificationsService, TitleService, config} from '@ame/shared';
import {Injectable, inject} from '@angular/core';
import {DefaultAspect, ModelElementCache, NamedElement, RdfModel, loadAspectModel} from '@esmf/aspect-model-loader';
import {RdfLoader} from 'libs/aspect-model-loader/src/lib/shared/rdf-loader';
import {NamedNode} from 'n3';
import {Observable, catchError, first, forkJoin, map, of, switchMap, tap, throwError} from 'rxjs';
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
  private configurationService = inject(ConfigurationService);
  private titleService = inject(TitleService);

  private get settings() {
    return this.configurationService.getSettings();
  }

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
          this.titleService.updateTitle(this.loadedFilesService.currentLoadedFile?.absoluteName);
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
    this.settings.copyrightHeader = RdfModelUtil.extractCommentsFromRdfContent(payload.rdfAspectModel);
    const currentFileKey = payload.namespaceFileName || 'current';

    const migrate$ = this.parseRdfModel([payload.rdfAspectModel]).pipe(
      switchMap((rdfModel: RdfModel) =>
        ExporterHelper.isVersionOutdated(rdfModel.samm.version, config.currentSammVersion)
          ? this.migrateAspectModel(rdfModel.samm.version, payload.rdfAspectModel)
          : of(payload.rdfAspectModel),
      ),
    );

    return (render ? migrate$ : of(payload.rdfAspectModel)).pipe(
      // getting dependencies from the current file and filter data from server
      switchMap((model: string) => {
        payload.rdfAspectModel = model;
        return this.getNamespaceDependencies(payload.rdfAspectModel, {}, null, payload.namespaceFileName);
      }),
      // loading in sequence all RdfModels for the current file and dependencies
      switchMap(files => this.loadRdfModelFromFiles(files, payload)),
      map(({files, rdfModels}) => ({files, rdfModels: this.filterDependencies(files, rdfModels, currentFileKey)})),
      // loading the model with all namespace dependencies
      switchMap(({files, rdfModels}) =>
        loadAspectModel({
          filesContent: [payload.rdfAspectModel, ...Object.values(files)],
          aspectModelUrn: this.getAspectUrn(rdfModels[currentFileKey]),
        }).pipe(
          // using switchMap to force an this functionality to run before any tap after this
          switchMap(loadedFile => {
            loadedFile.rdfModel = rdfModels[currentFileKey];
            // registering all loaded files
            const currentFile = this.registerFiles(rdfModels, loadedFile, payload, render);
            // loading all isolated elements
            this.instantiatorService.instantiateRemainingElements(rdfModels[currentFileKey], loadedFile.cachedElements);
            // filtering and registering the elements by their location in files
            this.moveElementsToTheirCacheFile(rdfModels, loadedFile, payload);

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

  private filterDependencies(files: Record<string, string>, rdfModels: Record<string, RdfModel>, currentFile: string) {
    const current = rdfModels[currentFile];
    if (!current) return rdfModels;

    const aspect = this.getAspectUrn(current);

    const objects = current.store.getObjects(null, null, null);
    const toRemove = [];
    for (const key in rdfModels) {
      if (key === currentFile) continue;
      const foundAspect = Boolean(aspect && rdfModels[key].store.getQuads(new NamedNode(aspect), null, null, null).length);

      if (foundAspect) {
        this.notificationsService.error({title: 'Same aspect found in workspace file ' + key});
        throw new Error('Same aspect found in workspace file ' + key);
      }

      const isDependency = objects.some(object => rdfModels[key].store.getQuads(object, null, null, null).length);

      if (!isDependency) {
        toRemove.push(key);
      }
    }

    for (const file of toRemove) {
      delete rdfModels[file];
      delete files[file];
    }

    return rdfModels;
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
    workspaceStructure: WorkspaceStructure = null,
    currentFile: string,
  ) {
    return (workspaceStructure ? of(workspaceStructure) : this.modelApiService.getNamespacesStructure()).pipe(
      switchMap(wStructure =>
        this.parseRdfModel([rdf]).pipe(
          switchMap(rdfModel => {
            const mainNamespace = rdfModel.getPrefixes()['']?.replace('urn:samm:', '')?.replace('#', '');
            const excludeSelf = Object.keys(namespaces).some(namespace => namespace.startsWith(mainNamespace));
            const dependencies = RdfModelUtil.resolveExternalNamespaces(rdfModel, excludeSelf).map(external =>
              external.replace(/urn:samm:|#/gi, ''),
            );
            let dependenciesRequests = {};
            for (const dependency of dependencies) {
              const [namespace] = dependency.split(':');
              const files = (wStructure[namespace] || []).reduce((acc, file) => {
                for (const model of file.models) {
                  const dependencyFile = `${dependency}:${model.model}`;
                  if (dependencyFile === currentFile) continue;
                  acc[`${dependency}:${model.model}`] = this.modelApiService.getAspectMetaModel(model.aspectModelUrn);
                }
                return acc;
              }, {});
              dependenciesRequests = {...dependenciesRequests, ...files};
            }

            return Object.keys(dependenciesRequests).length ? forkJoin(dependenciesRequests) : of({});
          }),
          switchMap((dependencies: Record<string, string>) => {
            const entries = Object.entries(dependencies);
            if (entries.length === 0) return of({});

            entries.forEach(([key, value]) => (namespaces[key] = value));
            const furtherDependencies = entries.reduce((acc, [key, value]) => {
              acc[key] = this.getNamespaceDependencies(value, namespaces, wStructure, currentFile);
              return acc;
            }, {});
            return forkJoin(furtherDependencies);
          }),
          map(() => namespaces),
        ),
      ),
    );
  }

  private getAspectUrn(rdfModel: RdfModel): string | undefined {
    if (!rdfModel) return undefined;
    return rdfModel.store.getSubjects(rdfModel.samm.RdfType(), rdfModel.samm.Aspect(), null)?.[0]?.value;
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

  private moveElementsToTheirCacheFile(rdfModels: Record<string, RdfModel>, loadedFile: any, payload: LoadModelPayload) {
    const rdfModelsEntries = Object.entries(rdfModels).filter(([key]) => key !== 'current' && key !== payload.namespaceFileName);
    const elementsInWorkspace = [];
    for (const urn of loadedFile.cachedElements.getKeys()) {
      const namedNode = new NamedNode(urn);
      const [key, rdfModel] = rdfModelsEntries.find(([, rdfModel]) => rdfModel.store.countQuads(namedNode, null, null, null) > 0) || [];

      if (key && key !== 'current' && key !== payload.namespaceFileName && rdfModel) {
        elementsInWorkspace.push({file: key, element: urn});
        const element: NamedElement = loadedFile.cachedElements.get(urn);
        if (element instanceof DefaultAspect) {
          this.notificationsService.warning({title: `Aspect "${urn}" found in workspace`});
          continue;
        }

        const fileCache = this.loadedFilesService.files[key].cachedFile;
        fileCache.resolveInstance<NamedElement>(element);
        loadedFile.cachedElements.removeElement(urn);
      }
    }

    if (elementsInWorkspace.length) {
      const message = elementsInWorkspace.reduce((acc, el) => {
        acc += `${el.element} in file: ${el.file}. \n`;
        return acc;
      }, 'Elements found in workspace: \n');

      this.notificationsService.warning({title: 'Elements found in workspace. Using them instead.', message});
    }
  }

  private migrateAspectModel(oldSammVersion: string, rdfAspectModel: string): Observable<string> {
    this.notificationsService.info({
      title: `Migrating from SAMM version ${oldSammVersion} to SAMM version ${config.currentSammVersion}`,
      timeout: 5000,
    });

    return this.modelApiService.migrateAspectModel(rdfAspectModel).pipe(
      first(),
      tap(() =>
        this.notificationsService.info({
          title: `Successfully migrated from SAMM Version ${oldSammVersion} to SAMM version ${config.currentSammVersion} SAMM version`,
          timeout: 5000,
        }),
      ),
    );
  }
}
