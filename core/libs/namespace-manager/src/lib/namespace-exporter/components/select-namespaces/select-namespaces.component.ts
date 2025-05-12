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

import {ModelCheckerService} from '@ame/editor';
import {APP_CONFIG, AppConfig} from '@ame/shared';
import {LanguageTranslateModule} from '@ame/translation';
import {KeyValuePipe} from '@angular/common';
import {Component, Inject, OnInit} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxChange, MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialogModule} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Router} from '@angular/router';
import {NamespacesManagerService} from '../../../shared';

interface NamespacesDependencies {
  [namespace: string]: {
    disabled: boolean;
    hasUnknownSAMM: boolean;
    dependencies: string[];
    files: string[];
    checked: boolean;
  };
}

@Component({
  standalone: true,
  templateUrl: './select-namespaces.component.html',
  styleUrls: ['select-namespaces.component.scss'],
  imports: [
    MatDialogModule,
    LanguageTranslateModule,
    MatCheckboxModule,
    KeyValuePipe,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinner,
  ],
})
export class SelectNamespacesComponent implements OnInit {
  selectedNamespaces: string[] = [];
  namespacesDependencies: NamespacesDependencies = {};
  extracting = false;

  private visitedNamespaces: string[] = [];

  constructor(
    private namespacesManager: NamespacesManagerService,
    private router: Router,
    private modelChecker: ModelCheckerService,
    @Inject(APP_CONFIG) public config: AppConfig,
  ) {}

  ngOnInit(): void {
    this.extracting = true;
    this.modelChecker.detectWorkspaceErrors().subscribe(analysis => {
      for (const [absoluteName, status] of Object.entries(analysis)) {
        const [namespace, version] = absoluteName.split(':');
        const namespaceDependency = this.namespacesDependencies[`${namespace}:${version}`];
        if (namespaceDependency) {
          namespaceDependency.dependencies = Array.from(new Set([...namespaceDependency.dependencies, ...status.dependencies]));
          namespaceDependency.files.push(status.name);
          namespaceDependency.hasUnknownSAMM ||= status.unknownSammVersion;
        } else {
          this.namespacesDependencies[`${namespace}:${version}`] = {
            dependencies: [...status.dependencies],
            files: [],
            checked: false,
            disabled: false,
            hasUnknownSAMM: status.unknownSammVersion,
          };
        }
      }
      this.extracting = false;
    });
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

  private selectDependencies(namespace: string, checked: boolean, level = 0): void {
    const nDependency = this.namespacesDependencies[namespace];
    if (!nDependency) return;

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
