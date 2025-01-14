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

import {Injectable} from '@angular/core';
import {Aspect, CacheStrategy, NamedElement, RdfModel} from '@esmf/aspect-model-loader';

export interface LoadedFilePayload {
  rdfModel: RdfModel;
  sharedRdfModel?: RdfModel;
  cachedFile: CacheStrategy;
  aspect: Aspect;
  absoluteName: string;
  rendered?: boolean;
  fromWorkspace?: boolean;
}

export class NamespaceFile {
  private _name: string;
  private _namespace: string;

  originalName: string;
  originalNamespace: string;
  rendered = false;
  sharedRdfModel: RdfModel;
  fromWorkspace: boolean;

  get namespace() {
    return this._namespace || this.aspect.namespace;
  }

  set namespace(value) {
    this._namespace = value;
  }

  set name(value: string) {
    this._name = value;
  }

  get name(): string {
    if (this.aspect) {
      return this.nameBasedOnAspect;
    }

    return this._name || null;
  }

  get absoluteName() {
    return this.namespace + ':' + this.name;
  }

  get originalAbsoluteName() {
    return `${this.originalNamespace}:${this.originalName}`;
  }

  get nameBasedOnAspect() {
    return this.aspect ? this.aspect.name + '.ttl' : null;
  }

  get isNamespaceChanged(): boolean {
    return this.namespace !== this.originalNamespace;
  }

  get isNameChanged(): boolean {
    return this.name !== this.originalName;
  }

  constructor(
    public rdfModel: RdfModel,
    public cachedFile: CacheStrategy,
    public aspect: Aspect,
  ) {}
}

@Injectable({providedIn: 'root'})
export class LoadedFilesService {
  public files: Record<string, NamespaceFile> = {};

  get currentLoadedFile(): NamespaceFile {
    for (const file in this.files) {
      if (this.files[file].rendered) return this.files[file];
    }

    return null;
  }

  get filesAsList(): NamespaceFile[] {
    return Object.values(this.files);
  }

  addFile(fileInfo: LoadedFilePayload): NamespaceFile {
    const newFile = new NamespaceFile(fileInfo.rdfModel, fileInfo.cachedFile, fileInfo.aspect);
    if (fileInfo.absoluteName) {
      const [namespace, version, name] = fileInfo.absoluteName.split(':');
      newFile.namespace = `${namespace}:${version}`;
      newFile.name = name;
    }

    newFile.rendered = Boolean(fileInfo.rendered);
    newFile.originalName = newFile.name;
    newFile.originalNamespace = newFile.namespace;
    newFile.sharedRdfModel = fileInfo.sharedRdfModel;
    this.files[newFile.absoluteName] = newFile;
    return newFile;
  }

  removeFile(absoluteName: string) {
    if (this.files[absoluteName]) {
      delete this.files[absoluteName];
    }
  }

  updateAbsoluteName(oldAbsoluteName: string, newAbsoluteName: string) {
    if (!this.files[oldAbsoluteName]) {
      console.error(`${oldAbsoluteName} is not in the file list`);
      return;
    }

    if (this.files[newAbsoluteName]) {
      console.error(`${newAbsoluteName} already exists in file list`);
      return;
    }

    this.files[newAbsoluteName] = this.files[oldAbsoluteName];
    delete this.files[oldAbsoluteName];

    const file = this.files[newAbsoluteName];
    const [namespace, version, name] = newAbsoluteName.split(':');
    file.originalName = name;
    file.name = name;
    file.originalNamespace = `${namespace}:${version}`;
    file.namespace = `${namespace}:${version}`;
  }

  getFile(absoluteName: string): NamespaceFile {
    return this.files[absoluteName];
  }

  getElement<T extends NamedElement>(aspectModelUrn: string): T {
    for (const file of Object.values(this.files)) {
      const element = file.cachedFile?.get<T>(aspectModelUrn);
      if (element) return element;
    }

    return null;
  }
}
