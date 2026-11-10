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

import {ExternalEditor} from '../../common/external-editor/external-editor';

export class ToggleSettings {
  autoValidation = false;
  validationTimer = 0;
  map = false;
  nav = false;
  notification = false;
}

/**
 * How the elements of an Aspect Model are ordered when the model is written:
 * - keepOrderAfterParent: existing elements keep their position, new elements follow the element which references them
 * - keepOrderAppend: existing elements keep their position, new elements are appended at the end
 * - formatterDefault: the order is defined by the formatter of the ESMF SDK
 */
export type ElementOrderStrategy = 'keepOrderAfterParent' | 'keepOrderAppend' | 'formatterDefault';

export const DEFAULT_ELEMENT_ORDER_STRATEGY: ElementOrderStrategy = 'formatterDefault';

/** The providers of the AI assistant, see the AI contract of the backend. */
export type AiProviderKind = 'copilot' | 'openai' | 'anthropic' | 'azure-openai' | 'ollama' | 'lmstudio' | 'openai-compatible';

/** The providers in the order they are offered; GitHub Copilot is recommended. */
export const AI_PROVIDER_KINDS: readonly AiProviderKind[] = [
  'copilot',
  'openai',
  'anthropic',
  'azure-openai',
  'ollama',
  'lmstudio',
  'openai-compatible',
];

/** Settings of the AI assistant. API keys are never part of the settings, they are kept in the keychain. */
export interface AiSettings {
  /** The assistant and all its actions are hidden when disabled (default). */
  enabled: boolean;
  provider: AiProviderKind | null;
  model?: string;
  baseUrl?: string;
  /** Azure OpenAI only. */
  apiVersion?: string;
  /** Only local models (Ollama, LM Studio, …) may be used; no model data leaves the computer. */
  onlyLocal: boolean;
  /** Target languages for descriptions and translations. */
  languages: string[];
  /** Cloud providers the user agreed to send model data to. */
  cloudConsent: AiProviderKind[];
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: null,
  onlyLocal: false,
  languages: ['en', 'de'],
  cloudConsent: [],
};

export interface Settings {
  namespace: string;
  version: string;
  showEditorMap: boolean;
  showEditorNav: boolean;
  autoSaveEnabled: boolean;
  autoValidationEnabled: boolean;
  autoFormatEnabled: boolean;
  enableHierarchicalLayout: boolean;
  darkMode?: boolean;
  validationTimerSeconds: number;
  saveTimerSeconds: number;
  showConnectionLabels: boolean;
  useSaturatedColors: boolean;
  copyrightHeader: Array<string>;
  aspectModelLanguages: Array<string>;
  toolbarVisibility: boolean;
  elementOrderStrategy?: ElementOrderStrategy;
  /** Reopen the models and windows of the last session on start (desktop app only). */
  restoreSession?: boolean;
  /** The VS Code compatible editor used by the "Open in ..." actions. */
  externalEditor?: ExternalEditor;
  /** Reload models without unsaved changes right away after their files changed outside of the editor, instead of asking. */
  reloadExternalChanges?: boolean;
  /** The AI assistant; missing means disabled. */
  ai?: AiSettings;
}
