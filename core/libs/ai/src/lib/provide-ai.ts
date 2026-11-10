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
import {DOCUMENT} from '@angular/common';
import {DestroyRef, EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer} from '@angular/core';
import {isAiPanelShortcut, isMac} from './ai-shortcut';
import {AiSetupComponent} from './containers/ai-setup/ai-setup.component';

/**
 * The assistant: Cmd/Ctrl+I opens and closes its panel when it is enabled in the settings; its setup is offered
 * to the settings.
 */
export function provideAi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {provide: AI_SETUP_COMPONENT, useValue: AiSetupComponent},
    provideAppInitializer(() => installAiShortcut()),
  ]);
}

function installAiShortcut(): void {
  const document = inject(DOCUMENT);
  const store = inject(AiStore);
  const uiShell = inject(UiShellStore);
  const mac = isMac();

  const listener = (event: KeyboardEvent) => {
    if (!store.enabled() || !isAiPanelShortcut(event, mac)) return;
    event.preventDefault();
    uiShell.toggleAiPanel();
  };
  document.addEventListener('keydown', listener);
  inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', listener));
}
