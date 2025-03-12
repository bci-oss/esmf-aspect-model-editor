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
import {NamespaceFile} from '@ame/cache';
import {ConfigurationService, Settings} from '@ame/settings-dialog';
import {APP_CONFIG, AppConfig, BrowserService, FileContentModel, SaveValidateErrorsCodes} from '@ame/shared';
import {LanguageTranslationService} from '@ame/translation';
import {Inject, Injectable} from '@angular/core';
import {RdfModel, Samm} from '@esmf/aspect-model-loader';
import {environment} from 'environments/environment';
import {Parser, Store} from 'n3';
import {Observable, Subject, map, of, switchMap, throwError} from 'rxjs';
import {RdfSerializerService} from './rdf-serializer.service';

@Injectable({
  providedIn: 'root',
})
export class RdfService {
  private _rdfSerializer: RdfSerializerService;
  private _settings: Settings;

  public externalRdfModels: Array<RdfModel> = [];

  constructor(
    private modelApiService: ModelApiService,
    private configurationService: ConfigurationService,
    private translation: LanguageTranslationService,
    private browserService: BrowserService,
    @Inject(APP_CONFIG) public config: AppConfig,
  ) {
    if (!environment.production) {
      window['angular.rdfService'] = this;
    }

    this._rdfSerializer = new RdfSerializerService(this.translation);
    this._settings = this.configurationService.getSettings();
  }

  serializeModel(rdfModel: RdfModel): string {
    return this._rdfSerializer.serializeModel(rdfModel);
  }

  saveModel(rdfModel: RdfModel): Observable<RdfModel> {
    const rdfContent = this.serializeModel(rdfModel);

    if (!rdfContent) {
      console.info('Model is empty. Skipping saving.');
      return this.handleError(SaveValidateErrorsCodes.emptyModel);
    }

    return this.modelApiService.formatModel(rdfContent).pipe(
      switchMap(content => {
        if (!content) {
          return this.handleError(SaveValidateErrorsCodes.emptyModel);
        }

        return this.modelApiService.saveModel(content, '@TODO check this');
      }),
      switchMap(() => this.loadExternalReferenceModelIntoStore(new FileContentModel('@TODO check this', rdfContent))),
    );
  }

  private handleError(errorCode: SaveValidateErrorsCodes): Observable<never> {
    return throwError(() => ({type: errorCode}));
  }

  // loadModel(rdf: string, namespaceFileName?: string): Observable<RdfModel> {
  //   const rdfModel = new RdfModel(true);
  //   const parser = new Parser();
  //   const store: Store = new Store();
  //   const subject = new Subject<RdfModel>();

  //   this._settings.copyrightHeader = RdfModelUtil.extractCommentsFromRdfContent(rdf);

  //   parser.parse(rdf, (error, quad, prefixes) => {
  //     if (quad) {
  //       store.addQuad(quad);
  //     } else if (prefixes) {
  //       if (this.haveIncorrectCorrectPrefixes(prefixes)) {
  //         const incorrectPrefixes = `Incorrect prefixes, please check SAMM specification: https://eclipse-esmf.github.io/samm-specification/${this.config.currentSammVersion}/namespaces.html`;
  //         this.logService.logInfo(incorrectPrefixes);
  //         subject.error(incorrectPrefixes);
  //         subject.complete();
  //       }
  //       this.currentRdfModel = rdfModel.initRdfModel(store, prefixes);

  //       this.currentRdfModel.absoluteAspectModelFileName =
  //         namespaceFileName ||
  //         this.currentRdfModel.absoluteAspectModelFileName ||
  //         `${this.currentRdfModel.getAspectModelUrn().replace('#', ':')}NewModel.ttl`;

  //       this.currentRdfModel.loadedFromWorkspace = !!namespaceFileName;

  //       subject.next(this.currentRdfModel);
  //       subject.complete();
  //     }

  //     if (error) {
  //       this.logService.logInfo(`Error when parsing RDF ${error}`);
  //       subject.error(error);
  //       subject.complete();
  //     }
  //   });

  //   return subject;
  // }

  private haveIncorrectCorrectPrefixes(prefixes: any): boolean {
    return Object.keys(prefixes)
      .filter((prefix: any) => !['rdf', 'rdfs', 'samm', 'samm-u', 'samm-c', 'samm-e', 'unit', 'xsd'].includes(prefix))
      .some(key => !Samm.isSammPrefix(prefixes[key]));
  }
  // @TODO check the bellow functionality
  loadExternalReferenceModelIntoStore(fileContent: FileContentModel): Observable<RdfModel> {
    const store: Store = new Store();
    const rdfModel = new RdfModel(store);
    const parser = new Parser();
    const subject = new Subject<RdfModel>();

    parser.parse(fileContent.aspectMetaModel, (error, quad, prefixes) => {
      if (quad) {
        store.addQuad(quad);
      } else if (prefixes) {
        // rdfModel.isExternalRef = true;
        // rdfModel.absoluteAspectModelFileName = this.parseFileName(fileContent.fileName, rdfModel.getAspectModelUrn());
        this.externalRdfModels.push(rdfModel);
        subject.next(rdfModel);
        subject.complete();
      }

      if (error) {
        console.info(`Error when parsing RDF ${error}`);
        // const externalRdfModel = rdfModel.initRdfModel(store, {});
        // externalRdfModel.isExternalRef = true;
        // externalRdfModel.absoluteAspectModelFileName = this.parseFileName(fileContent.fileName, externalRdfModel.getAspectModelUrn());
        // externalRdfModel.hasErrors = true;
        // this.externalRdfModels.push(externalRdfModel);
        subject.next(rdfModel);
        subject.complete();
      }
    });

    return subject;
  }

  parseFileName(fileName: string, urn: string): string {
    if (this.browserService.isStartedAsElectronApp() && window.require) {
      const path = window.require('path');
      fileName = fileName.includes(path.sep) ? `${urn.replace('#', ':')}${path.basename(fileName)}` : fileName;
    }

    return fileName.charAt(0) === '/' ? fileName.substring(1) : fileName;
  }

  // parseModels(fileContentModels: FileContentModel[]): Observable<RdfModel[]> {
  //   return forkJoin(fileContentModels.map(fileContent => this.parseModel(fileContent)));
  // }

  // parseModel(fileContent: FileContentModel): Observable<RdfModel> {
  //   const rdfModel = new RdfModel();
  //   const parser = new Parser();
  //   const store: Store = new Store();
  //   const subject = new Subject<RdfModel>();

  //   parser.parse(fileContent.aspectMetaModel, (error, quad, prefixes) => {
  //     let parsedRdfModel: RdfModel;

  //     if (quad) {
  //       store.addQuad(quad);
  //     } else if (prefixes) {
  //       parsedRdfModel = rdfModel.initRdfModel(store, prefixes);
  //     }

  //     if (error) {
  //       parsedRdfModel = rdfModel.initRdfModel(store, {});
  //       parsedRdfModel.hasErrors = true;
  //       this.logService.logInfo(`Error when parsing RDF ${error}`);
  //     }

  //     if (prefixes || error) {
  //       parsedRdfModel.absoluteAspectModelFileName = fileContent.fileName;
  //       subject.next(parsedRdfModel);
  //       subject.complete();
  //     }
  //   });

  //   return subject.asObservable();
  // }

  isSameModelContent(absoluteFileName: string, fileContent: string, fileToCompare: NamespaceFile): Observable<boolean> {
    if (fileToCompare.absoluteName !== absoluteFileName) return of(false);

    const serializedModel: string = this.serializeModel(fileToCompare.rdfModel);
    return this.modelApiService.formatModel(serializedModel).pipe(map(formattedModel => formattedModel === fileContent));
  }
}
