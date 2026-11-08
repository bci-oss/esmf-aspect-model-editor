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

import {LoadedFilesService, ModelService, PluginModel, RdfPort} from '@ame/domain';
import {inject, Injectable} from '@angular/core';
import {firstValueFrom} from 'rxjs';

/** Creates the read-only copy of the open Aspect Model that generator commands of plugins work on. */
@Injectable({providedIn: 'root'})
export class PluginModelSnapshotService {
  private readonly loadedFiles = inject(LoadedFilesService);
  private readonly modelService = inject(ModelService);
  private readonly rdf = inject(RdfPort);

  /** The open Aspect Model with all changes made in the editor, or `null` if no model is open. */
  async snapshot(): Promise<PluginModel | null> {
    const file = this.loadedFiles.currentLoadedFile;
    if (!file?.rdfModel) return null;

    try {
      // Applies the changes of the graph to the RDF model, like before saving.
      await firstValueFrom(this.modelService.synchronizeModelToRdf(), {defaultValue: undefined});
    } catch {
      return null;
    }

    const content = this.rdf.serializeModel(file.rdfModel);
    // The namespace of a file includes the version, e.g. `org.example:1.0.0`.
    const separator = file.namespace.lastIndexOf(':');
    if (!content || separator <= 0) return null;
    return {
      namespace: file.namespace.substring(0, separator),
      version: file.namespace.substring(separator + 1),
      fileName: file.name,
      content,
    };
  }
}
