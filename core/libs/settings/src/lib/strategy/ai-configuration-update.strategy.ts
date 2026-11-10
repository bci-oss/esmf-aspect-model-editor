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

import {DEFAULT_AI_SETTINGS} from '@ame/shared';
import {Injectable} from '@angular/core';
import {Settings, SettingsFormData} from '../model';
import {SettingsUpdateStrategy} from './settings-update.strategy';

/** Splits `en, de` into language tags; falls back to the default languages when empty. */
export function parseAiLanguages(text: string): string[] {
  const languages = [
    ...new Set(
      (text ?? '')
        .split(/[\s,;]+/)
        .map(language => language.trim())
        .filter(Boolean),
    ),
  ];
  return languages.length ? languages : [...DEFAULT_AI_SETTINGS.languages];
}

@Injectable({providedIn: 'root'})
export class AiConfigurationUpdateStrategy implements SettingsUpdateStrategy {
  updateSettings(model: SettingsFormData, settings: Settings): void {
    const ai = model?.aiConfiguration;
    if (!ai) return;

    // the connection (provider, model, base URL), the consent and the provider specific values are kept
    settings.ai = {
      ...DEFAULT_AI_SETTINGS,
      ...(settings.ai ?? {}),
      enabled: ai.enabled,
      onlyLocal: ai.onlyLocal,
      languages: parseAiLanguages(ai.languages),
    };
  }
}
