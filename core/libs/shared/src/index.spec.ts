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
import * as sharedExports from './index';

describe('Shared Library Exports', () => {
  it('should export components, services, models, constants, enums, pipes, and providers', () => {
    expect(sharedExports.AlertComponent).toBeDefined();
    expect(sharedExports.BarItemComponent).toBeDefined();
    expect(sharedExports.ElementIconComponent).toBeDefined();
    expect(sharedExports.LoadingScreenComponent).toBeDefined();
    expect(sharedExports.AlertService).toBeDefined();
    expect(sharedExports.BindingsService).toBeDefined();
    expect(sharedExports.BrowserService).toBeDefined();
    expect(sharedExports.DataTypeService).toBeDefined();
    expect(sharedExports.ElectronSignalsService).toBeDefined();
    expect(sharedExports.ElectronTunnelService).toBeDefined();
    expect(sharedExports.LoadingScreenService).toBeDefined();
    expect(sharedExports.ModelSavingTrackerService).toBeDefined();
    expect(sharedExports.NotificationsService).toBeDefined();
    expect(sharedExports.SearchService).toBeDefined();
    expect(sharedExports.TitleService).toBeDefined();
    expect(sharedExports.CounterPipe).toBeDefined();
    expect(sharedExports.HttpErrorInterceptor).toBeDefined();
    expect(sharedExports.HttpHeaderBuilder).toBeDefined();
    expect(sharedExports.IPC_RENDERER).toBeDefined();
    expect(sharedExports.APP_CONFIG).toBeDefined();
    expect(sharedExports.config).toBeDefined();
    expect(sharedExports.GeneralConfig).toBeDefined();
    expect(sharedExports.sammElements).toBeDefined();
    expect(sharedExports.ELECTRON_EVENTS).toBeDefined();
    expect(sharedExports.AssetsPath).toBeDefined();
    expect(sharedExports.NotificationType).toBeDefined();
    expect(sharedExports.Elements).toBeDefined();
    expect(sharedExports.cellRelations).toBeDefined();
    expect(sharedExports.basicShapeGeometry).toBeDefined();
    expect(sharedExports.simpleDataTypes).toBeDefined();
    expect(sharedExports.isDataTypeLangString).toBeDefined();
    expect(sharedExports.ElementCreatorService).toBeDefined();
  });
});
