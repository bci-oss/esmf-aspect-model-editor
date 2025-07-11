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
import {Aspect, CacheStrategy, DefaultAspect, NamedElement, RdfModel} from '@esmf/aspect-model-loader';
import {environment} from '../../../../environments/environment';

export interface LoadedFilePayload {
  rdfModel: RdfModel;
  sharedRdfModel?: RdfModel;
  cachedFile: CacheStrategy;
  aspect: Aspect;
  absoluteName: string;
  rendered?: boolean;
  fromWorkspace?: boolean;
}

export interface UpdateFilePayload {
  aspect?: DefaultAspect;
  name?: string;
  namespace?: string;
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
    return (this._namespace || this.aspect?.namespace || this.rdfModel.getPrefixes()['']).replace('#', '').replace('urn:samm:', '') || '';
  }

  set namespace(value) {
    this._namespace = value;
  }

  set name(value: string) {
    this._name = value;
  }

  get name(): string {
    return this._name || (this.aspect ? this.nameBasedOnAspect : 'shared-file.ttl');
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

  resetOriginalUrn() {
    this.originalNamespace = this.namespace;
    this.originalName = this.name;
  }

  setExistsInWorkspace() {
    this.fromWorkspace = true;
  }

  getAnyAspectModelUrn(): string {
    return this.rdfModel.store.getSubjects(null, null, null)[0].value;
  }
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

  get externalFiles(): NamespaceFile[] {
    return this.filesAsList.filter(file => !file.rendered);
  }

  constructor() {
    if (!environment.production) {
      window['angular.LoadedFilesService'] = this;
    }
  }

  isElementInCurrentFile(element: NamedElement): boolean {
    if (!element) return false;
    if (!this.currentLoadedFile) return false;
    if (element.name.includes('[') && element.name.includes(']')) return true;
    if (!this.currentLoadedFile.cachedFile) return false;

    return Boolean(this.currentLoadedFile.cachedFile.get(element.aspectModelUrn));
  }

  isElementExtern(element: NamedElement): boolean {
    return !this.isElementInCurrentFile(element) && !element.isPredefined;
  }

  addFile(fileInfo: LoadedFilePayload): NamespaceFile {
    const newFile = new NamespaceFile(fileInfo.rdfModel, fileInfo.cachedFile, fileInfo.aspect);
    if (fileInfo.absoluteName) {
      const [namespace, version, name] = fileInfo.absoluteName.split(':');
      if (namespace && version) newFile.namespace = `${namespace}:${version}`;
      if (name) newFile.name = name;
    }

    newFile.rendered = Boolean(fileInfo.rendered);
    newFile.originalName = newFile.name;
    newFile.originalNamespace = newFile.namespace;
    newFile.sharedRdfModel = fileInfo.sharedRdfModel;
    if (this.files[newFile.absoluteName] && this.files[newFile.absoluteName].fromWorkspace) {
      this.files[newFile.absoluteName + '_workspace_duplicate'] = this.files[newFile.absoluteName];
    }
    this.files[newFile.absoluteName] = newFile;
    return newFile;
  }

  updateFileNaming(file: NamespaceFile, {aspect, name, namespace}: UpdateFilePayload) {
    const oldAbsoluteName = file.absoluteName;
    if (name) file.name = name;
    if (namespace) file.namespace = namespace;
    if (aspect) file.aspect = aspect;
    this.updateAbsoluteName(oldAbsoluteName, file.absoluteName);
  }

  removeFile(absoluteName: string) {
    if (this.files[absoluteName]) {
      delete this.files[absoluteName];
    }
  }

  updateAbsoluteName(oldAbsoluteName: string, newAbsoluteName: string, rewriteOriginal = false) {
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
    file.name = name;
    file.namespace = `${namespace}:${version}`;

    if (rewriteOriginal) {
      file.originalName = name;
      file.originalNamespace = `${namespace}:${version}`;
    }
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

  getFileFromElement(element: NamedElement): string {
    for (const file of Object.values(this.files)) {
      if (file.rdfModel.store?.getQuads(element.aspectModelUrn, null, null, null)?.length) {
        return file.name;
      }
    }

    return null;
  }

  findElementOnExtReferences<T extends NamedElement>(aspectModelUrn: string): T {
    for (const file of this.filesAsList) {
      if (this.currentLoadedFile.absoluteName === file.absoluteName) continue;
      const element = file.cachedFile?.get<T>(aspectModelUrn);
      if (element) return element;
    }

    return null;
  }

  removeAll() {
    for (const file in this.files) {
      delete this.files[file];
    }

    this.files = {};
  }
}
