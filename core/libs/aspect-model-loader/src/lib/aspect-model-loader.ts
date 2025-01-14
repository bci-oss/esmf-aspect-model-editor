/*
 * Copyright (c) 2023 Robert Bosch Manufacturing Solutions GmbH
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

import {Store} from 'n3';
import {finalize, map, Observable, Subject} from 'rxjs';
import {Aspect} from './aspect-meta-model';
import {BaseModelLoader} from './base-model-loader';
import {createAspect} from './instantiator/aspect-instantiator';
import {destroyElementCache, getElementsCache} from './shared/model-element-cache.service';
import {RdfLoader} from './shared/rdf-loader';
import {destroyRdfModel, destroyStore, getRdfModel, getStore, RdfModel, useStore} from './shared/rdf-model';
import {RdfModelUtil} from './shared/rdf-model-util';

export class AspectModelLoader extends BaseModelLoader {
  constructor() {
    super();
  }
  /**
   * Load and instantiate an Aspect Model based on an RDF/Turtle. Related imports are not resolved.
   *
   * @param rdfContent RDF/Turtle representation to load
   */
  public loadSelfContainedModel(rdfContent: string): Observable<Aspect> {
    return this.load('', rdfContent);
  }

  /**
   * Load and instantiate an Aspect Model based on an RDF/Turtle
   *
   * @param modelAspectUrn URN of the Aspect Model to load and instantiate
   *
   * @param rdfContent List of all RDF/Turtle representation to load, including
   *                   all referenced models imports. The default SAMM related imports
   *                   e.g. with prefixes "samm", "samm-c", "samm-e", "unit" and "xsd"
   *                   are already provided. No needs to provided that(content) is not
   *                   required.
   *
   * @return Observable<Aspect> Aspect including all information from the given RDF
   */
  public load(modelAspectUrn: string, ...rdfContent: string[]): Observable<Aspect> {
    const subject = new Subject<Aspect>();
    new RdfLoader().loadModel(rdfContent).subscribe({
      next: (rdfModel: RdfModel) => {
        try {
          RdfModelUtil.throwErrorIfUnsupportedVersion(rdfModel);
          subject.next(Object.freeze(createAspect(modelAspectUrn)));
        } catch (error: any) {
          subject.error(error);
        } finally {
          subject.complete();
        }
      },
      error: error => {
        subject.error(error);
      },
    });

    return subject;
  }
}

export function loadAspectModel(model: {filesContent: string[]; aspectModelUrn?: string; store?: Store}) {
  const aspectModelLoader = new AspectModelLoader();

  if (model.store) {
    useStore(model.store);
  }

  return aspectModelLoader.load(model.aspectModelUrn || '', ...model.filesContent).pipe(
    map(aspect => ({
      aspect,
      rdfModel: getRdfModel(),
      store: getStore(),
      cachedElements: getElementsCache(),
    })),
    finalize(() => {
      destroyElementCache();
      destroyRdfModel({keepStore: true});
      destroyStore();
    }),
  );
}
