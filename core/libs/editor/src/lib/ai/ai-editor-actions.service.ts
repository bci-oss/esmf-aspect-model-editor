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

import {AiCommand, AiEditorAction, AiEditorPort, aiElementName, AiStore, AiValidationError, UiShellStore} from '@ame/domain';
import {BindingsService, LanguageTranslationService} from '@ame/shared';
import {inject, Injectable} from '@angular/core';

/** Commands about a single element, offered in the element editor and the graph context menu. */
export type AiElementCommand = Extract<AiCommand, 'describe' | 'translate' | 'explain'>;

/**
 * The actions of the editor that ask the AI assistant, e.g. the ✨ buttons of the element editor, the graph context menu,
 * "explain and fix" of a validation error and the AI menu of the toolbar. Every action opens the panel.
 */
@Injectable({providedIn: 'root'})
export class AiEditorActionsService {
  private readonly aiStore = inject(AiStore);
  private readonly aiEditor = inject(AiEditorPort, {optional: true});
  private readonly uiShell = inject(UiShellStore);
  private readonly bindings = inject(BindingsService);
  private readonly translate = inject(LanguageTranslationService);

  readonly enabled = this.aiStore.enabled;
  readonly panelOpen = this.uiShell.aiPanelOpen;

  registerContextMenuActions(): void {
    this.bindings.registerAction(AiEditorAction.describe, () => this.askAboutSelection('describe'));
    this.bindings.registerAction(AiEditorAction.translate, () => this.askAboutSelection('translate'));
    this.bindings.registerAction(AiEditorAction.explain, () => this.askAboutSelection('explain'));
  }

  /** Asks about one element, e.g. to add its description or to translate it. */
  askAboutElement(command: AiElementCommand, urn: string): void {
    if (!this.enabled() || !urn) return;
    const message = this.translation(`ai.actions.${command}.message`, {name: aiElementName(urn)});
    this.aiStore.ask({message, command, elementUrns: [urn]});
  }

  /** Explains a validation error and proposes a fix. */
  fix(error: AiValidationError): void {
    if (!this.enabled() || !error?.message) return;
    const message = this.translation('ai.actions.fix.message', {error: error.message});
    this.aiStore.ask({message, command: 'fix', validationErrors: [error]});
  }

  review(): void {
    this.askAboutModel('review');
  }

  examples(): void {
    this.askAboutModel('examples');
  }

  explainModel(): void {
    this.askAboutModel('explain');
  }

  /** Opens the panel with the generate command in the input; the user describes the model. */
  newModel(): void {
    if (!this.enabled()) return;
    this.aiStore.prepare({command: 'generate', message: this.translation('ai.actions.newModel.message')});
  }

  togglePanel(): void {
    if (this.enabled()) this.uiShell.toggleAiPanel();
  }

  private askAboutSelection(command: AiElementCommand): void {
    const urn = this.aiEditor?.selectedElementUrn();
    if (urn) this.askAboutElement(command, urn);
  }

  private askAboutModel(command: Extract<AiCommand, 'review' | 'examples' | 'explain'>): void {
    if (!this.enabled()) return;
    const key = command === 'explain' ? 'ai.starters.explain.message' : `ai.actions.${command}.message`;
    this.aiStore.ask({message: this.translation(key), command});
  }

  private translation(key: string, params?: Record<string, string>): string {
    return this.translate.translateService.translate(key, params);
  }
}
