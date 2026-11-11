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

import {computed, inject, Injectable, signal} from '@angular/core';
import {catchError, finalize, map, Observable, of} from 'rxjs';
import {
  AI_ATTACHMENT_EXTENSIONS,
  AI_ATTACHMENT_MAX_SIZE,
  AiChatContext,
  AiContextModel,
  AiError,
  AiMessageContextRef,
  AiValidationError,
  asAiError,
  fileExtension,
} from '../../model-api';
import {AiEditorPort, AiModelElement} from '../../ports/ai-editor.port';
import {AiPort} from '../../ports/ai.port';
import {ModelApiPort} from '../../ports/model-api.port';
import {AiContextCandidate, AiContextCandidateGroup, aiContextCandidates, AiSourceType, sameContextModel} from './ai-context-candidates';
import {AiErrorStore} from './ai-error.store';
import {AiAskRequest, AiContextItem, AiSendRequest} from './ai.models';
import {aiElementName, newAiId} from './ai.utils';

/**
 * What the next message is about: the open model, the selected element, and the elements, errors, files and models the
 * user added as chips.
 */
@Injectable({providedIn: 'root'})
export class AiContextStore {
  private readonly api = inject(AiPort, {optional: true});
  private readonly editor = inject(AiEditorPort, {optional: true});
  private readonly modelApi = inject(ModelApiPort, {optional: true});
  private readonly errors = inject(AiErrorStore);

  private readonly itemsState = signal<AiContextItem[]>([]);
  private readonly includeModelState = signal(true);
  /** The selected element is not part of the context; reset when another element is selected. */
  private readonly excludedSelection = signal<string | null>(null);
  private readonly candidatesState = signal<AiContextCandidateGroup[]>([]);
  private readonly candidatesLoadingState = signal(false);

  readonly items = this.itemsState.asReadonly();
  readonly includeModel = this.includeModelState.asReadonly();
  /** The models of the workspace and the GitHub sources that can be added to the context. */
  readonly candidates = this.candidatesState.asReadonly();
  readonly candidatesLoading = this.candidatesLoadingState.asReadonly();

  readonly openModel = computed(() => this.editor?.openModel() ?? null);
  readonly selectedElementUrn = computed(() => {
    const urn = this.editor?.selectedElementUrn() ?? null;
    return urn && urn !== this.excludedSelection() ? urn : null;
  });
  /** A file of the context is still uploaded; nothing can be sent meanwhile. */
  readonly uploading = computed(() => this.items().some(item => item.uploading));

  addElement(urn: string): void {
    if (this.items().some(item => item.urn === urn && item.kind === 'element')) return;
    this.itemsState.update(items => [...items, elementItem(urn)]);
  }

  addError(error: AiValidationError): void {
    this.itemsState.update(items => [...items, errorItem(error)]);
  }

  removeItem(id: string): void {
    const attachment = this.items().find(item => item.id === id)?.attachment;
    this.itemsState.update(items => items.filter(item => item.id !== id));
    if (attachment) this.deleteAttachment(attachment.id);
  }

  /**
   * Uploads the files as context of the next messages; each is shown as chip while it is uploaded.
   * Files that are too large or of an unsupported type are refused without uploading them.
   */
  attachFiles(files: File[]): void {
    if (!this.api) return;
    for (const file of files) {
      const refused = refuseFile(file);
      if (refused) {
        this.errors.report(refused);
        continue;
      }
      const id = newAiId();
      this.itemsState.update(items => [...items, {id, kind: 'file', label: file.name, uploading: true}]);
      this.api.uploadAttachment(file).subscribe({
        next: attachment => {
          if (!this.items().some(item => item.id === id)) {
            // removed while it was uploaded
            this.deleteAttachment(attachment.id);
            return;
          }
          this.itemsState.update(items =>
            items.map(item => (item.id === id ? {id, kind: 'file', label: attachment.name || file.name, attachment} : item)),
          );
        },
        error: error => {
          this.itemsState.update(items => items.filter(item => item.id !== id));
          this.errors.report(asAiError(error));
        },
      });
    }
  }

  /** Adds a model file or a namespace folder (also a whole source for stored conversations) to the context; the same models are added only once. */
  addModel(model: AiContextModel, label: string, options: {detail?: string; sourceType?: AiSourceType} = {}): void {
    if (!model.sourcePath && !model.namespace) return;
    if (this.items().some(item => sameContextModel(item.contextModel, model))) return;
    const kind: AiContextItem['kind'] = model.fileName ? 'model' : model.namespace ? 'namespace' : 'source';
    this.itemsState.update(items => [
      ...items,
      {
        id: newAiId(),
        kind,
        label,
        contextModel: model,
        ...(options.detail ? {detail: options.detail} : {}),
        ...(options.sourceType ? {sourceType: options.sourceType} : {}),
      },
    ]);
  }

  addCandidate(candidate: AiContextCandidate): void {
    this.addModel(candidate.contextModel, candidate.label, {detail: candidate.detail, sourceType: candidate.sourceType});
  }

  /** Loads the models of the workspace and the GitHub sources offered as context. */
  loadCandidates(): void {
    if (!this.modelApi || this.candidatesLoading()) return;
    this.candidatesLoadingState.set(true);
    this.modelApi
      .loadNamespacesStructure()
      .pipe(finalize(() => this.candidatesLoadingState.set(false)))
      .subscribe({
        next: structure => this.candidatesState.set(aiContextCandidates(structure)),
        error: () => this.candidatesState.set([]),
      });
  }

  setIncludeModel(include: boolean): void {
    this.includeModelState.set(include);
  }

  excludeSelection(): void {
    this.excludedSelection.set(this.editor?.selectedElementUrn() ?? null);
  }

  /** Replaces the elements and errors of the context by those of an editor action; files and models are kept. */
  replaceEditorItems(request: AiAskRequest): void {
    this.itemsState.update(items => [
      ...items.filter(item => item.kind !== 'element' && item.kind !== 'error'),
      ...(request.elementUrns ?? []).map(urn => elementItem(urn)),
      ...(request.validationErrors ?? []).map(error => errorItem(error)),
    ]);
  }

  /** The context sent with a message, in the given target languages. */
  build(request: AiSendRequest, languages: string[]): Observable<AiChatContext> {
    const base$ = this.editor && this.includeModel() ? this.editor.currentContext().pipe(catchError(() => of<AiChatContext>({}))) : of({});
    return base$.pipe(
      map(base => {
        const items = this.items();
        const mentioned = [
          ...new Set([
            ...items.filter(item => item.kind === 'element' && item.urn).map(item => item.urn),
            ...(request.mentionedElementUrns ?? []),
          ]),
        ];
        const errors = items.filter(item => item.kind === 'error' && item.error).map(item => item.error);
        const selected = this.selectedElementUrn();
        const context: AiChatContext = {...base, languages};
        if (!this.includeModel()) delete context.modelTurtle;
        if (selected) context.selectedElementUrn = selected;
        else delete context.selectedElementUrn;
        if (mentioned.length) context.mentionedElementUrns = mentioned;
        if (errors.length) context.validationErrors = errors;
        const attachmentIds = items.filter(item => item.kind === 'file' && item.attachment).map(item => item.attachment.id);
        if (attachmentIds.length) context.attachmentIds = attachmentIds;
        const contextModels = items.filter(item => item.contextModel).map(item => item.contextModel);
        if (contextModels.length) context.contextModels = contextModels;
        return context;
      }),
    );
  }

  /** The files and models of the context as shown in the sent message. */
  refs(): AiMessageContextRef[] {
    return this.items()
      .filter(item => (item.kind === 'file' && item.attachment) || item.contextModel)
      .map(item => ({kind: item.kind as AiMessageContextRef['kind'], label: item.label}));
  }

  /** The elements of the open model, e.g. for mentions with `@`. */
  modelElements(): AiModelElement[] {
    return this.editor?.modelElements() ?? [];
  }

  navigateToElement(urn: string): void {
    this.editor?.navigateToElement(urn);
  }

  private deleteAttachment(id: string): void {
    this.api?.deleteAttachment(id).subscribe({error: () => undefined});
  }
}

function elementItem(urn: string): AiContextItem {
  return {id: newAiId(), kind: 'element', label: aiElementName(urn), urn};
}

function errorItem(error: AiValidationError): AiContextItem {
  return {id: newAiId(), kind: 'error', label: error.message, urn: error.focusNode, error};
}

function refuseFile(file: File): AiError | null {
  if (!AI_ATTACHMENT_EXTENSIONS.includes(fileExtension(file.name))) {
    return {code: 'attachment_unsupported', message: `The file type of ${file.name} is not supported.`};
  }
  if (file.size > AI_ATTACHMENT_MAX_SIZE) {
    return {code: 'attachment_too_large', message: `${file.name} is larger than 20 MB.`};
  }
  return null;
}
