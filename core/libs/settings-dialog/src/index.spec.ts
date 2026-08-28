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

import {describe, expect, it} from 'vitest';
import * as SettingsDialogModule from './index';

describe('SettingsDialog Module Exports', () => {
  it('should export all services, components, models, and strategies', () => {
    expect(SettingsDialogModule.ConfigurationService).toBeDefined();
    expect(SettingsDialogModule.SammLanguageSettingsService).toBeDefined();
    expect(SettingsDialogModule.SettingsFormService).toBeDefined();

    expect(SettingsDialogModule.SettingDialogComponent).toBeDefined();
    expect(SettingsDialogModule.LanguageSettingsComponent).toBeDefined();
    expect(SettingsDialogModule.NamespaceSettingsComponent).toBeDefined();
    expect(SettingsDialogModule.AutomatedWorkflowComponent).toBeDefined();
    expect(SettingsDialogModule.EditorConfigurationComponent).toBeDefined();
    expect(SettingsDialogModule.HeaderCopyrightComponent).toBeDefined();

    expect(SettingsDialogModule.AutomatedWorkflowUpdateStrategy).toBeDefined();
    expect(SettingsDialogModule.CopyrightHeaderUpdateStrategy).toBeDefined();
    expect(SettingsDialogModule.EditorConfigurationUpdateStrategy).toBeDefined();
    expect(SettingsDialogModule.LanguageConfigurationUpdateStrategy).toBeDefined();
    expect(SettingsDialogModule.NamespaceConfigurationUpdateStrategy).toBeDefined();
  });
});
