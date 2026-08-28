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
import * as SidebarModule from './index';

describe('Sidebar Module Exports', () => {
  it('should export all services, helpers, and components', () => {
    expect(SidebarModule.ExporterHelper).toBeDefined();
    expect(SidebarModule.SidebarStateService).toBeDefined();
    expect(SidebarModule.FileStatus).toBeDefined();
    expect(SidebarModule.Selection).toBeDefined();
    expect(SidebarModule.NamespacesManager).toBeDefined();

    expect(SidebarModule.DraggableElementComponent).toBeDefined();
    expect(SidebarModule.SidebarSAMMElementsComponent).toBeDefined();
    expect(SidebarModule.SidebarMenuComponent).toBeDefined();
    expect(SidebarModule.SidebarComponent).toBeDefined();
    expect(SidebarModule.WorkspaceComponent).toBeDefined();
    expect(SidebarModule.WorkspaceFileListComponent).toBeDefined();
    expect(SidebarModule.WorkspaceFileElementsComponent).toBeDefined();
    expect(SidebarModule.WorkspaceEmptyComponent).toBeDefined();
    expect(SidebarModule.WorkspaceErrorComponent).toBeDefined();
    expect(SidebarModule.WorkspaceMigrateComponent).toBeDefined();
    expect(SidebarModule.MigrationDialogComponent).toBeDefined();
  });
});
