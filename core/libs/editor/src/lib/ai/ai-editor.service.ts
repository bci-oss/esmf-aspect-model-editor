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

import {
  AiChatContext,
  AiEditorPort,
  AiModelElement,
  AiOpenModel,
  AiValidationError,
  LoadedFilesService,
  ModelService,
  ModelSourcesStore,
  ModelValidationStore,
  NamespaceFile,
  RdfPort,
} from '@ame/domain';
import {MaxGraphHelper, MaxGraphShapeSelectorService} from '@ame/graph';
import {LanguageTranslationService, NotificationsService} from '@ame/shared';
import {computed, inject, Injectable, Injector} from '@angular/core';
import {Router} from '@angular/router';
import {NamedElement} from '@esmf/aspect-model-loader';
import {catchError, map, Observable, of, switchMap, take, tap} from 'rxjs';
import {FileHandlingService} from '../editor-toolbar/services/file-handling.service';
import {ModelHistoryService} from '../history/model-history.service';
import {ModelSavingTrackerService} from '../model-saving-tracker.service';
import {ElementRefactoringService} from '../refactoring/element-refactoring.service';
import {TabStateService} from '../tabs/tab-state.service';

/** `urn:samm:org.example:1.0.0#Movement` → namespace `org.example`, version `1.0.0`. */
const SAMM_URN = /^urn:samm:([^:#]+):([^:#]+)#/;

/**
 * What the AI assistant reads from and does in the editor. It must not depend on the AiStore (which uses this port);
 * the actions of the editor that ask the assistant live in the AiEditorActionsService.
 */
@Injectable({providedIn: 'root'})
export class AiEditorService extends AiEditorPort {
  private readonly injector = inject(Injector);
  private readonly loadedFiles = inject(LoadedFilesService);
  private readonly modelService = inject(ModelService);
  private readonly rdfService = inject(RdfPort);
  private readonly modelSources = inject(ModelSourcesStore);
  private readonly validationStore = inject(ModelValidationStore);
  private readonly shapeSelector = inject(MaxGraphShapeSelectorService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationsService);
  private readonly translate = inject(LanguageTranslationService);

  // Lazy: these services pull in large parts of the editor, which are not needed until the assistant acts.
  private get modelHistory(): ModelHistoryService {
    return this.injector.get(ModelHistoryService);
  }

  private get fileHandling(): FileHandlingService {
    return this.injector.get(FileHandlingService);
  }

  private get refactoring(): ElementRefactoringService {
    return this.injector.get(ElementRefactoringService);
  }

  private get tabState(): TabStateService {
    return this.injector.get(TabStateService);
  }

  private get savingTracker(): ModelSavingTrackerService {
    return this.injector.get(ModelSavingTrackerService);
  }

  readonly openModel = computed<AiOpenModel | null>(() => {
    const file = this.loadedFiles.currentLoadedFileSignal();
    if (!file?.rdfModel) return null;
    const urn = modelUrnOf(file);
    return {label: file.name, ...(urn ? {urn} : {}), readOnly: this.isReadOnly(file)};
  });

  readonly selectedElementUrn = computed<string | null>(() => {
    const cells = this.shapeSelector.selectedCells();
    if (cells.length !== 1) return null;
    const element = MaxGraphHelper.getModelElement(cells[0]);
    return element && !element.isAnonymous?.() ? element.aspectModelUrn : null;
  });

  currentContext(): Observable<AiChatContext> {
    const file = this.loadedFiles.currentLoadedFile;
    if (!file?.rdfModel) return of({});

    // the RDF store only contains the changes of the graph after a synchronization
    return this.modelService.synchronizeModelToRdf().pipe(
      take(1),
      map(() => this.rdfService.serializeModel(file.rdfModel)),
      catchError(() => of(undefined)),
      map(modelTurtle => this.contextOf(file, modelTurtle)),
    );
  }

  modelElements(): AiModelElement[] {
    const file = this.loadedFiles.currentLoadedFile;
    if (!file?.cachedFile) return [];
    return file.cachedFile
      .filter<NamedElement>((element: NamedElement) => !!element?.aspectModelUrn && !element.isAnonymous?.() && !element.isPredefined)
      .filter(element => this.loadedFiles.isElementInCurrentFile(element))
      .map(element => ({urn: element.aspectModelUrn, name: element.name, type: typeOf(element)}))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  applyModelChange(turtle: string): Observable<boolean> {
    const file = this.loadedFiles.currentLoadedFile;
    if (!file?.rdfModel || this.isReadOnly(file)) return of(false);

    return this.modelHistory.replaceModel(turtle).pipe(
      tap(applied => {
        if (applied) this.markTabChanged();
      }),
      catchError(error => {
        console.error(error);
        this.notifications.error({title: this.translation('ai.proposal.applyFailed', 'The change could not be applied.')});
        return of(false);
      }),
    );
  }

  openNewModel(turtle: string): Observable<boolean> {
    // the open model stays in its tab
    this.tabState.saveActiveTabSnapshot();
    return this.fileHandling.loadModel(turtle).pipe(
      take(1),
      switchMap(() => this.fileHandling.saveAspectModelToWorkspace()),
      map(rdfModel => !!rdfModel),
      catchError(error => {
        console.error(error);
        return of(false);
      }),
    );
  }

  renameElement(urn: string, newName: string): void {
    const element = this.loadedFiles.currentLoadedFile?.cachedFile?.get<NamedElement>(urn);
    if (element) this.refactoring.refactor('RENAME_ELEMENT', element, newName);
  }

  navigateToElement(urn: string): void {
    // the editor canvas selects the element in the graph or reveals it in the text view
    this.router.navigate([], {queryParams: {urn}, queryParamsHandling: 'merge'});
  }

  private contextOf(file: NamespaceFile, modelTurtle: string | undefined): AiChatContext {
    const urn = modelUrnOf(file);
    const [, namespace, version] = (urn ?? file.getAnyAspectModelUrn()).match(SAMM_URN) ?? [];
    const workspaceId = this.modelSources.findSource(file.rdfModel.getSourceLocation())?.id;
    const validationErrors = this.validationErrors();
    const selectedElementUrn = this.selectedElementUrn();

    return {
      ...(modelTurtle ? {modelTurtle} : {}),
      ...(urn ? {modelUrn: urn} : {}),
      ...(namespace ? {namespace} : {}),
      ...(version ? {version} : {}),
      fileName: file.name,
      ...(workspaceId ? {workspaceId} : {}),
      readOnly: this.isReadOnly(file),
      ...(selectedElementUrn ? {selectedElementUrn} : {}),
      ...(validationErrors.length ? {validationErrors} : {}),
    };
  }

  private validationErrors(): AiValidationError[] {
    return (this.validationStore.violations() ?? []).map(({message, focusNode, errorCode}) => ({
      message,
      ...(focusNode ? {focusNode} : {}),
      ...(errorCode ? {errorCode} : {}),
    }));
  }

  private isReadOnly(file: NamespaceFile): boolean {
    return this.modelSources.isReadOnlyLocation(file.rdfModel?.getSourceLocation());
  }

  private markTabChanged(): void {
    this.savingTracker.isSaved$.pipe(take(1)).subscribe(isSaved => {
      const activeTabId = this.tabState.activeTabId();
      if (activeTabId) this.tabState.setTabDirty(activeTabId, !isSaved);
    });
  }

  private translation(key: string, fallback: string): string {
    const text = this.translate.translateService?.translate(key);
    return text && text !== key ? text : fallback;
  }
}

function modelUrnOf(file: NamespaceFile): string | undefined {
  return file.aspect?.aspectModelUrn || undefined;
}

/** `DefaultProperty` → `Property`. */
function typeOf(element: NamedElement): string {
  return (element.className ?? '').replace(/^Default/, '') || 'Element';
}
