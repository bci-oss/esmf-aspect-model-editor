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

import {ModelApiService} from '@ame/api';
import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {ModelLoaderService} from '@ame/editor';
import {MaxGraphService} from '@ame/max-graph';
import {ElementIconComponent, ElementType, sammElements} from '@ame/shared';
import {Component, DestroyRef, effect, inject, signal} from '@angular/core';
import {MatMiniFabButton} from '@angular/material/button';
import {MatCheckbox} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInput} from '@angular/material/input';
import {MatMenu, MatMenuTrigger} from '@angular/material/menu';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltip} from '@angular/material/tooltip';
import {NamedElement} from '@esmf/aspect-model-loader';
import {TranslocoDirective} from '@jsverse/transloco';
import {first, switchMap} from 'rxjs';
import {DraggableElementComponent} from '../../draggable-element/draggable-element.component';
import {SidebarStateService} from '../../sidebar-state.service';

@Component({
  selector: 'ame-workspace-file-elements',
  templateUrl: './workspace-file-elements.component.html',
  styleUrls: ['./workspace-file-elements.component.scss'],
  imports: [
    MatMiniFabButton,
    MatMenuTrigger,
    MatInput,
    DraggableElementComponent,
    ElementIconComponent,
    MatCheckbox,
    MatMenu,
    MatTooltip,
    MatIconModule,
    MatFormFieldModule,
    TranslocoDirective,
    MatProgressSpinnerModule,
  ],
})
export class WorkspaceFileElementsComponent {
  private maxgraphService = inject(MaxGraphService);
  private modelApiService = inject(ModelApiService);
  private modelLoaderService = inject(ModelLoaderService);
  private loadedFilesService = inject(LoadedFilesService);
  private destroyRef = inject(DestroyRef);

  public sidebarService = inject(SidebarStateService);

  public readonly elements = signal<Record<string, any>>({});
  public readonly searched = signal<Record<string, any[]>>({});
  public readonly loadingElements = signal(false);

  public elementsOrder: ElementType[] = [
    'property',
    'abstract-property',
    'characteristic',
    'entity',
    'abstract-entity',
    'unit',
    'constraint',
    'trait',
    'operation',
    'event',
    'value',
  ];

  private searchThrottle: NodeJS.Timeout | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.searchThrottle) {
        clearTimeout(this.searchThrottle);
      }
    });

    effect(() => {
      const selection = this.sidebarService.selection.selection();
      if (selection) {
        const newElements: Record<string, any> = {};
        const newSearched: Record<string, any[]> = {};

        for (const element of this.elementsOrder) {
          newElements[element] = {
            ...sammElements[element],
            elements: [],
            hidden: true,
            displayed: true,
          };
          newSearched[element] = newElements[element].elements;
        }

        this.elements.set(newElements);
        this.searched.set(newSearched);

        const namespaceFile = this.loadedFilesService.getFile(`${selection.namespace}:${selection.file}`);

        if (namespaceFile?.cachedFile.getAllElements().length) {
          this.updateElements(this.loadedFilesService.getFile(`${selection.namespace}:${selection.file}`));
        } else {
          this.requestFile(`${selection.namespace}:${selection.file}`, selection.aspectModelUrn);
        }
      }
    });
  }

  public elementImported(element: NamedElement): boolean {
    if (element?.aspectModelUrn) {
      return !!this.maxgraphService.resolveCellByModelElement(element);
    }
    return false;
  }

  public toggleFilter(event: MouseEvent, key: string) {
    event.stopPropagation();
    const currentElements = this.elements();
    if (currentElements[key]) {
      this.elements.set({
        ...currentElements,
        [key]: {
          ...currentElements[key],
          displayed: !currentElements[key].displayed,
        },
      });
    }
  }

  public search(event: KeyboardEvent) {
    const target = event.target as HTMLInputElement;
    if (this.searchThrottle) {
      clearTimeout(this.searchThrottle);
    }

    this.searchThrottle = setTimeout(() => {
      const searchString = target.value.toLowerCase();
      const currentElements = this.elements();
      const newSearched: Record<string, any[]> = {};

      for (const key in currentElements) {
        newSearched[key] = searchString
          ? currentElements[key].elements.filter((element: NamedElement) => {
              // @TODO Search for the language the application is set on
              return (
                element.name?.toLowerCase().includes(searchString) || element.getDescription?.('en')?.toLowerCase()?.includes(searchString)
              );
            })
          : currentElements[key].elements;
      }

      this.searched.set(newSearched);
    }, 100);
  }

  private updateElements(file: NamespaceFile) {
    const cachedFile = file.cachedFile;
    const currentElements = this.elements();
    const sections = Object.values(currentElements);

    for (const element of cachedFile.getAllElements()) {
      sections.find(e => element instanceof e.class && !element.isAnonymous())?.elements?.push?.(element);
    }
  }

  private requestFile(absoluteName: string, aspectModelUrn: string) {
    this.loadingElements.set(true);
    this.modelApiService
      .fetchAspectMetaModel(aspectModelUrn)
      .pipe(
        switchMap(model =>
          this.modelLoaderService.loadSingleModel({
            aspectModelUri: model.sourceLocation,
            rdfAspectModel: model.content,
            fromWorkspace: true,
            namespaceFileName: absoluteName,
            aspectModelUrn,
          }),
        ),
        first(),
      )
      .subscribe({
        next: file => {
          this.updateElements(file);
          this.loadingElements.set(false);
        },
        error: () => {
          this.loadingElements.set(false);
        },
      });
  }

  protected readonly sammElements = sammElements;
}
