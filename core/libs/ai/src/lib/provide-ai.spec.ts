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

import {AI_SETUP_COMPONENT, AiStore, UiShellStore} from '@ame/domain';
import {ApplicationInitStatus, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {isAiPanelShortcut, isMac} from './ai-shortcut';
import {AiSetupComponent} from './containers/ai-setup/ai-setup.component';
import {provideAi} from './provide-ai';

const key = (init: Partial<KeyboardEvent>) => ({key: 'i', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...init});

describe('isAiPanelShortcut', () => {
  it('uses Cmd+I on macOS and Ctrl+I elsewhere', () => {
    expect(isAiPanelShortcut(key({metaKey: true}), true)).toBe(true);
    expect(isAiPanelShortcut(key({ctrlKey: true}), true)).toBe(false);
    expect(isAiPanelShortcut(key({ctrlKey: true, key: 'I'}), false)).toBe(true);
    expect(isAiPanelShortcut(key({metaKey: true}), false)).toBe(false);
  });

  it('ignores other keys and modifiers', () => {
    expect(isAiPanelShortcut(key({ctrlKey: true, shiftKey: true}), false)).toBe(false);
    expect(isAiPanelShortcut(key({ctrlKey: true, altKey: true}), false)).toBe(false);
    expect(isAiPanelShortcut(key({ctrlKey: true, key: 'j'}), false)).toBe(false);
  });
});

describe('provideAi', () => {
  const enabled = signal(true);
  const uiShell = {toggleAiPanel: vi.fn()};

  beforeEach(async () => {
    enabled.set(true);
    uiShell.toggleAiPanel.mockClear();
    TestBed.configureTestingModule({
      providers: [provideAi(), {provide: AiStore, useValue: {enabled}}, {provide: UiShellStore, useValue: uiShell}],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
  });

  function press(): KeyboardEvent {
    const mac = isMac();
    const event = new KeyboardEvent('keydown', {key: 'i', ctrlKey: !mac, metaKey: mac, cancelable: true});
    document.dispatchEvent(event);
    return event;
  }

  it('toggles the panel with the shortcut when the assistant is enabled', () => {
    const event = press();
    expect(uiShell.toggleAiPanel).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('offers its setup to the settings', () => {
    expect(TestBed.inject(AI_SETUP_COMPONENT)).toBe(AiSetupComponent);
  });

  it('ignores the shortcut when the assistant is disabled', () => {
    enabled.set(false);
    const event = press();
    expect(uiShell.toggleAiPanel).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
