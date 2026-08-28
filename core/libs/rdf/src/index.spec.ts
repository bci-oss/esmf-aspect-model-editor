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
import * as rdfExports from './index';

describe('rdf library index exports', () => {
  it('should export services and utilities', () => {
    expect(rdfExports.ModelService).toBeDefined();
    expect(rdfExports.RdfSerializerService).toBeDefined();
    expect(rdfExports.RdfService).toBeDefined();
    expect(rdfExports.RdfModelUtil).toBeDefined();
    expect(rdfExports.getSammNamespaces).toBeDefined();
  });
});
