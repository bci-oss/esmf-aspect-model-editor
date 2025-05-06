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
import {APP_CONFIG, AppConfig, NotificationsService, SaveValidateErrorsCodes} from '@ame/shared';
import {Injectable, inject} from '@angular/core';
import {Aspect, Samm} from '@esmf/aspect-model-loader';
import {environment} from 'environments/environment';
import {Observable, Observer, Subject, throwError} from 'rxjs';
import {RdfService} from './rdf.service';

@Injectable({
  providedIn: 'root',
})
export class ModelService {
  private visitorAnnouncerSubject$ = new Subject<{observer: Observer<void>}>();

  get visitorAnnouncer$() {
    return this.visitorAnnouncerSubject$.asObservable();
  }

  private config: AppConfig = inject(APP_CONFIG);

  constructor(
    private rdfService: RdfService,
    private modelApiService: ModelApiService,
    private notificationsService: NotificationsService,
    private loadedFilesService: LoadedFilesService,
  ) {
    if (!environment.production) {
      window['angular.modelService'] = this;
    }
  }

  removeAspect() {
    this.loadedFilesService.currentLoadedFile.aspect = null;
  }

  addAspect(aspect: Aspect) {
    this.loadedFilesService.currentLoadedFile.aspect = aspect;
  }

  getSammVersion(aspectModel: string) {
    const partialSammUri = `<${Samm.BASE_URI}meta-model:`;
    const startVersionIndex = aspectModel.indexOf(partialSammUri);
    const endVersionIndex = aspectModel.indexOf('#', startVersionIndex);
    return aspectModel.slice(startVersionIndex + partialSammUri.length, endVersionIndex);
  }

  finishStoreUpdate(observer: Observer<void>) {
    observer.next();
    observer.complete();
  }

  synchronizeModelToRdf() {
    if (!this.loadedFilesService?.currentLoadedFile?.rdfModel) {
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

  // private isElementNameUnique(modelElement: NamedElement): boolean {
  //   modelElement.metaModelVersion = this.currentRdfModel.samm.version;
  //   return null; // !this.currentCachedFile.getElement<NamedElement>(`${this.currentRdfModel.getAspectModelUrn()}${modelElement.name}`);
  // }
}
