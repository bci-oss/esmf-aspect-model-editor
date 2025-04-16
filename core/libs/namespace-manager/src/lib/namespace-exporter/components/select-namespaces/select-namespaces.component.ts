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

import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {ModelLoaderService} from '@ame/editor';
import {RdfModelUtil} from '@ame/rdf/utils';
import {APP_CONFIG, AppConfig} from '@ame/shared';
import {LanguageTranslateModule} from '@ame/translation';
import {KeyValuePipe} from '@angular/common';
import {Component, Inject, OnInit} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxChange, MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialogModule} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Router} from '@angular/router';
import {Prefixes} from 'n3';
import {first} from 'rxjs';
import {tap} from 'rxjs/operators';
import {NamespacesManagerService} from '../../../shared';

const nonDependentNamespaces = (sammVersion: string) => [
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'http://www.w3.org/2000/01/rdf-schema#',
  `urn:samm:org.eclipse.esmf.samm:meta-model:${sammVersion}#`,
  `urn:samm:org.eclipse.esmf.samm:characteristic:${sammVersion}#`,
  `urn:samm:org.eclipse.esmf.samm:entity:${sammVersion}#`,
  `urn:samm:org.eclipse.esmf.samm:unit:${sammVersion}#`,
  'http://www.w3.org/2001/XMLSchema#',
];

interface NamespacesDependencies {
  [namespace: string]: {
    disabled: boolean;
    dependencies: string[];
    files: string[];
    checked: boolean;
  };
}

@Component({
  standalone: true,
  templateUrl: './select-namespaces.component.html',
  styleUrls: ['select-namespaces.component.scss'],
  imports: [MatDialogModule, LanguageTranslateModule, MatCheckboxModule, KeyValuePipe, MatIconModule, MatButtonModule, MatTooltipModule],
})
export class SelectNamespacesComponent implements OnInit {
  selectedNamespaces: string[] = [];
  namespacesDependencies: NamespacesDependencies = {};

  private visitedNamespaces: string[] = [];

  constructor(
    private namespacesManager: NamespacesManagerService,
    private router: Router,
    private loadedFilesService: LoadedFilesService,
    private modelLoader: ModelLoaderService,
    @Inject(APP_CONFIG) public config: AppConfig,
  ) {}

  ngOnInit(): void {
    this.modelLoader
      .loadWorkspaceModels()
      .pipe(
        first(),
        tap(files => (this.namespacesDependencies = this.getNamespacesDependencies(files))),
      )
      .subscribe();
  }

  toggleNamespace(event: MatCheckboxChange, namespace: string): void {
    this.selectDependencies(namespace, event.checked);
    this.visitedNamespaces = [];
  }

  validate(): void {
    const namespaces = Array.from(new Set(this.selectedNamespaces));
    const validatePayload = namespaces.map(namespace => ({
      namespace,
      files: this.namespacesDependencies[namespace].files,
    }));
    this.namespacesManager.validateExport(validatePayload).subscribe();
    this.router.navigate([{outlets: {'export-namespaces': 'validate'}}]);
  }

  private getNamespacesDependencies(models: NamespaceFile[]): NamespacesDependencies {
    return models.reduce((acc, file) => {
      const versionedNamespace = RdfModelUtil.getNamespaceFromRdf(file.absoluteName);
      const fileName = RdfModelUtil.getFileNameFromRdf(file.absoluteName);

      let nDependency = acc[versionedNamespace];
      if (!nDependency) {
        acc[versionedNamespace] = {
          disabled: false,
          checked: false,
          dependencies: [],
          files: [],
        };
        nDependency = acc[versionedNamespace];
      }

      nDependency.dependencies = Array.from(
        new Set([...nDependency.dependencies, ...this.getDependentNamespaces(file.rdfModel.getPrefixes())]),
      );
      nDependency.files = Array.from(new Set([...nDependency.files, fileName]));
      return acc;
    }, {});
  }

  private getDependentNamespaces(prefixes: Prefixes<string>): string[] {
    return Object.entries(prefixes).reduce((acc, [key, value]) => {
      if (!nonDependentNamespaces(this.config.currentSammVersion).includes(value) && key !== '') {
        acc.push(value.replace('urn:samm:', '').replace('#', ''));
      }

      return acc;
    }, []);
  }

  private selectDependencies(namespace: string, checked: boolean, level = 0): void {
    const nDependency = this.namespacesDependencies[namespace];
    nDependency.checked = checked;
    nDependency.disabled = level > 0 && checked;
    this.selectedNamespaces = checked ? [...this.selectedNamespaces, namespace] : this.selectedNamespaces.filter(n => n !== namespace);
    this.visitedNamespaces.push(namespace);

    for (const dependency of this.namespacesDependencies[namespace].dependencies) {
      if (this.visitedNamespaces.includes(dependency)) {
        continue;
      }
      this.selectDependencies(dependency, checked, ++level);
    }
  }
}
