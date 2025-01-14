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
import {CachedFile, LoadedFilesService, NamespacesCacheService} from '@ame/cache';
import {LoadedAspectModel} from '@ame/meta-model';
import {APP_CONFIG, AppConfig, NotificationsService, SaveValidateErrorsCodes} from '@ame/shared';
import {Injectable, inject} from '@angular/core';
import {Aspect, NamedElement, RdfModel, Samm} from '@esmf/aspect-model-loader';
import {environment} from 'environments/environment';
import {Observable, Observer, Subject, of, throwError} from 'rxjs';
import {first, switchMap, tap} from 'rxjs/operators';
import {RdfService} from './rdf.service';

@Injectable({
  providedIn: 'root',
})
export class ModelService {
  private aspect: Aspect;
  private visitorAnnouncerSubject$ = new Subject<{observer: Observer<void>}>();

  get visitorAnnouncer$() {
    return this.visitorAnnouncerSubject$.asObservable();
  }

  get currentCachedFile(): CachedFile {
    return this.namespaceCacheService.currentCachedFile;
  }

  get loadedAspect(): Aspect {
    return this.aspect;
  }

  get currentRdfModel() {
    return this.loadedFilesService?.currentLoadedFile?.rdfModel;
  }

  private config: AppConfig = inject(APP_CONFIG);

  constructor(
    private rdfService: RdfService,
    private namespaceCacheService: NamespacesCacheService,
    private modelApiService: ModelApiService,
    private notificationsService: NotificationsService,
    private loadedFilesService: LoadedFilesService,
  ) {
    if (!environment.production) {
      window['angular.modelService'] = this;
    }
  }

  removeAspect() {
    this.aspect = null;
    this.loadedFilesService.currentLoadedFile.aspect = null;
  }

  addAspect(aspect: Aspect) {
    this.aspect = aspect;
  }

  getLoadedAspectModel(): LoadedAspectModel {
    return {
      rdfModel: this.currentRdfModel,
      aspect: this.aspect,
    };
  }

  getSammVersion(aspectModel: string) {
    const partialSammUri = `<${Samm.BASE_URI}meta-model:`;
    const startVersionIndex = aspectModel.indexOf(partialSammUri);
    const endVersionIndex = aspectModel.indexOf('#', startVersionIndex);
    return aspectModel.slice(startVersionIndex + partialSammUri.length, endVersionIndex);
  }

  loadRdfModel(loadedRdfModel: RdfModel, rdfAspectModel: string, namespaceFileName: string): Observable<Aspect> {
    if (this.currentCachedFile) {
      this.currentCachedFile.reset();
    }

    const sammVersion: string = loadedRdfModel.samm.version;

    try {
      if (sammVersion > this.config.currentSammVersion) {
        return throwError(
          () => `The provided Aspect Model is using SAMM version ${sammVersion} which is too high.
            The Aspect Model Editor is currently based on SAMM ${this.config.currentSammVersion}.`,
        );
      }

      const rdfModel$ =
        sammVersion < this.config.currentSammVersion ? this.migrateAspectModel(sammVersion, rdfAspectModel) : of(loadedRdfModel);

      // return rdfModel$.pipe(
      //   first(),
      //   tap(rdfModel => (this.rdfService.currentRdfModel = rdfModel)),
      //   tap(() => this.setCurrentCacheFile(namespaceFileName)),
      //   map(() => this.instantiateFile(namespaceFileName)),
      //   tap(() => this.processAnonymousElements()),
      //   map(aspect => (this.aspect = aspect)),
      //   catchError(error =>
      //     throwError(() => {
      //       // TODO add the real problem maybe ...
      //       console.groupCollapsed('model.service -> loadRDFmodel', error);
      //       console.groupEnd();
      //       this.logService.logError(`Error while loading the model. ${JSON.stringify(error.message)}.`);
      //       return error.message;
      //     }),
      //   ),
      // );
    } catch (error: any) {
      console.groupCollapsed('model.service -> loadRDFmodel', error);
      console.groupEnd();

      return throwError(() => error.message);
    }
  }

  migrateAspectModel(oldSammVersion: string, rdfAspectModel: string): Observable<string> {
    this.notificationsService.info({
      title: `Migrating from SAMM version ${oldSammVersion} to SAMM version ${this.config.currentSammVersion}`,
      timeout: 5000,
    });

    return this.modelApiService.migrateAspectModel(rdfAspectModel).pipe(
      first(),
      tap(() =>
        this.notificationsService.info({
          title: `Successfully migrated from SAMM Version ${oldSammVersion} to SAMM version ${this.config.currentSammVersion} SAMM version`,
          timeout: 5000,
        }),
      ),
    );
  }

  // private setCurrentCacheFile(namespaceFileName: string) {
  //   let fileName: string;
  //   if (namespaceFileName) {
  //     [, , fileName] = namespaceFileName.split(':');
  //   }

  //   this.namespaceCacheService.currentCachedFile = new CachedFile(fileName, this.rdfModel.getAspectModelUrn());
  // }

  // private instantiateFile(namespaceFileName: string) {
  //   const [, , fileName] = namespaceFileName.split(':');
  //   try {
  //     return this.instantiatorService.instantiateFile(this.rdfModel, this.currentCachedFile, fileName).aspect;
  //   } catch (error) {
  //     console.groupCollapsed('model.service -> loadRDFmodel', error);
  //     console.groupEnd();
  //     throw new Error('Instantiator cannot load model!');
  //   }
  // }

  saveModel() {
    const synchronizedModel = this.synchronizeModelToRdf();
    return (synchronizedModel || throwError(() => ({type: SaveValidateErrorsCodes.desynchronized}))).pipe(
      switchMap(() => this.rdfService.saveModel(this.currentRdfModel)),
    );
  }

  finishStoreUpdate(observer: Observer<void>) {
    observer.next();
    observer.complete();
  }

  synchronizeModelToRdf() {
    if (!this.currentRdfModel) {
      return throwError(() => ({type: SaveValidateErrorsCodes.emptyModel}));
    }

    return new Observable((observer: Observer<void>) => {
      this.visitorAnnouncerSubject$.next({observer});
    });
  }

  // private processAnonymousElements() {
  //   this.currentCachedFile.getAnonymousElements().forEach((modelElementNamePair: {element: NamedNode; name: string}) => {
  //     this.currentCachedFile.removeElement(modelElementNamePair.element.aspectModelUrn);
  //     if (modelElementNamePair.name) {
  //       modelElementNamePair.element.name = modelElementNamePair.name; // assign initial name
  //       if (this.isElementNameUnique(modelElementNamePair.element)) {
  //         // if unique, resolve the instance
  //         this.currentCachedFile.resolveElement(modelElementNamePair.element);
  //       } else {
  //         // else resolve the naming
  //         setUniqueElementName(modelElementNamePair.element, this.rdfModel, this.namespaceCacheService, modelElementNamePair.name);
  //         this.currentCachedFile.resolveElement(modelElementNamePair.element);
  //         this.notificationsService.info({
  //           title: 'Renamed anonymous element',
  //           message: `The anonymous element ${modelElementNamePair.name} was renamed to ${modelElementNamePair.element.name}`,
  //           link: `editor/select/${modelElementNamePair.element.aspectModelUrn}`,
  //           timeout: 2000,
  //         });
  //       }
  //     } else {
  //       setUniqueElementName(modelElementNamePair.element, this.rdfModel, this.namespaceCacheService);
  //       this.currentCachedFile.resolveElement(modelElementNamePair.element);
  //       this.notificationsService.info({
  //         title: 'Renamed anonymous element',
  //         message: `The anonymous element was named to ${modelElementNamePair.element.name}`,
  //         link: `editor/select/${modelElementNamePair.element.aspectModelUrn}`,
  //         timeout: 2000,
  //       });
  //     }
  //   });
  //   this.currentCachedFile.clearAnonymousElements();
  // }

  private isElementNameUnique(modelElement: NamedElement): boolean {
    modelElement.metaModelVersion = this.currentRdfModel.samm.version;
    return !this.currentCachedFile.getElement<NamedElement>(`${this.currentRdfModel.getAspectModelUrn()}${modelElement.name}`);
  }
}
