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
import {aiContextIcon} from './context-icon';

describe('aiContextIcon', () => {
  it('chooses the icon by kind', () => {
    expect(aiContextIcon('file')).toBe('attach_file');
    expect(aiContextIcon('file', {fileKind: 'pdf'})).toBe('picture_as_pdf');
    expect(aiContextIcon('file', {fileName: 'Spec.PDF'})).toBe('picture_as_pdf');
    expect(aiContextIcon('model')).toBe('description');
    expect(aiContextIcon('namespace')).toBe('folder');
    expect(aiContextIcon('source')).toBe('inventory_2');
    expect(aiContextIcon('source', {sourceType: 'github'})).toBe('cloud');
    expect(aiContextIcon('error')).toBe('error_outline');
    expect(aiContextIcon('element')).toBe('category');
  });
});
