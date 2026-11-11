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

import {AiChatStore, AiEditorAction, AiEditorPort, AiSetupStore, UiShellStore} from '@ame/domain';
import {BindingsService, LanguageTranslationService} from '@ame/shared';
import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiEditorActionsService} from './ai-editor-actions.service';

const URN = 'urn:samm:org.example:1.0.0#speed';

describe('AiEditorActionsService', () => {
  let service: AiEditorActionsService;
  const enabled = signal(true);
  const selectedElementUrn = signal<string | null>(null);
  let aiChat: {ask: ReturnType<typeof vi.fn>; prepare: ReturnType<typeof vi.fn>};
  let uiShell: {aiPanelOpen: ReturnType<typeof signal<boolean>>; toggleAiPanel: ReturnType<typeof vi.fn>};
  let actions: Map<string, () => void>;

  beforeEach(() => {
    enabled.set(true);
    selectedElementUrn.set(null);
    actions = new Map();
    aiChat = {ask: vi.fn(), prepare: vi.fn()};
    uiShell = {aiPanelOpen: signal(false), toggleAiPanel: vi.fn()};

    TestBed.configureTestingModule({
      providers: [
        {provide: AiChatStore, useValue: aiChat},
        {provide: AiSetupStore, useValue: {enabled}},
        {provide: AiEditorPort, useValue: {selectedElementUrn}},
        {provide: UiShellStore, useValue: uiShell},
        {provide: BindingsService, useValue: {registerAction: (name: string, action: () => void) => actions.set(name, action)}},
        {
          provide: LanguageTranslationService,
          useValue: {
            translateService: {
              translate: (key: string, params?: Record<string, string>) => (params ? `${key}:${JSON.stringify(params)}` : key),
            },
          },
        },
      ],
    });
    service = TestBed.inject(AiEditorActionsService);
  });

  it('asks about an element with its name', () => {
    service.askAboutElement('describe', URN);
    expect(aiChat.ask).toHaveBeenCalledWith({
      message: 'ai.actions.describe.message:{"name":"speed"}',
      command: 'describe',
      elementUrns: [URN],
    });
  });

  it('asks to explain and fix a validation error', () => {
    const error = {message: 'Missing characteristic', focusNode: URN};
    service.fix(error);
    expect(aiChat.ask).toHaveBeenCalledWith({
      message: 'ai.actions.fix.message:{"error":"Missing characteristic"}',
      command: 'fix',
      validationErrors: [error],
    });
  });

  it('asks about the whole model', () => {
    service.review();
    service.examples();
    service.explainModel();
    expect(aiChat.ask.mock.calls.map(([request]) => request)).toEqual([
      {message: 'ai.actions.review.message', command: 'review'},
      {message: 'ai.actions.examples.message', command: 'examples'},
      {message: 'ai.starters.explain.message', command: 'explain'},
    ]);
  });

  it('prepares the generation of a new model', () => {
    service.newModel();
    expect(aiChat.prepare).toHaveBeenCalledWith({command: 'generate', message: 'ai.actions.newModel.message'});
  });

  it('toggles the panel and exposes its state', () => {
    service.togglePanel();
    expect(uiShell.toggleAiPanel).toHaveBeenCalled();

    uiShell.aiPanelOpen.set(true);
    expect(service.panelOpen()).toBe(true);
  });

  it('registers the context menu actions for the selected element', () => {
    service.registerContextMenuActions();
    expect([...actions.keys()]).toEqual([AiEditorAction.describe, AiEditorAction.translate, AiEditorAction.explain]);

    actions.get(AiEditorAction.translate)?.();
    expect(aiChat.ask).not.toHaveBeenCalled();

    selectedElementUrn.set(URN);
    actions.get(AiEditorAction.translate)?.();
    actions.get(AiEditorAction.explain)?.();
    expect(aiChat.ask.mock.calls.map(([request]) => request.command)).toEqual(['translate', 'explain']);
  });

  it('does nothing while the assistant is disabled', () => {
    enabled.set(false);
    service.askAboutElement('describe', URN);
    service.fix({message: 'x'});
    service.review();
    service.newModel();
    service.togglePanel();
    expect(aiChat.ask).not.toHaveBeenCalled();
    expect(aiChat.prepare).not.toHaveBeenCalled();
    expect(uiShell.toggleAiPanel).not.toHaveBeenCalled();
  });

  it('ignores missing input', () => {
    service.askAboutElement('describe', '');
    service.fix({message: ''});
    expect(aiChat.ask).not.toHaveBeenCalled();
  });
});
