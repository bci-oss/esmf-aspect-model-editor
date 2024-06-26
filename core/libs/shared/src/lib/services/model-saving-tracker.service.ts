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

import {ModelService, RdfService} from '@ame/rdf/services';
import {MxGraphService} from '@ame/mx-graph';
import {inject, Injectable} from '@angular/core';
import {map, take} from 'rxjs';

@Injectable({providedIn: 'root'})
export class ModelSavingTrackerService {
  private modelService = inject(ModelService);
  private rdfService = inject(RdfService);
  private mxGraphService = inject(MxGraphService);
  private savedModel: string;
  private firstLoad: boolean;

  private get currentModel$() {
    return this.modelService.synchronizeModelToRdf().pipe(
      take(1),
      map(() => this.rdfService.serializeModel(this.rdfService.currentRdfModel)),
    );
  }

  public get isSaved$() {
    return this.currentModel$.pipe(
      map(currentModel => (!this.firstLoad && this.savedModel === currentModel) || !this.mxGraphService.getAllCells()?.length),
    );
  }

  public updateSavedModel(firstLoad = false) {
    this.currentModel$.subscribe(currentModel => {
      this.firstLoad = firstLoad;
      this.savedModel = currentModel;
    });
  }
}
