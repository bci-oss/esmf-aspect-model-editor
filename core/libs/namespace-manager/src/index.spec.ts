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
import * as namespaceManagerExports from './index';

describe('namespace-manager library index exports', () => {
  it('should export NamespacesManagerService and SelectNamespacesComponent', () => {
    expect(namespaceManagerExports.NamespacesManagerService).toBeDefined();
    expect(namespaceManagerExports.SelectNamespacesComponent).toBeDefined();
  });
});
