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

import {ClipboardService, FileSaverService} from '@ame/shared';
import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {describe, expect, it} from 'vitest';
import {aiFileStubs, aiTranslocoTesting} from './ai-testing';

describe('AI testing helpers', () => {
  it('provides the stubs of the clipboard and the file download', () => {
    const {clipboard, fileSaver, providers} = aiFileStubs();
    TestBed.configureTestingModule({providers});
    TestBed.inject(ClipboardService).copy('text');
    TestBed.inject(FileSaverService).download(new Blob(), 'file.json');
    expect(clipboard.copy).toHaveBeenCalledWith('text');
    expect(fileSaver.download).toHaveBeenCalledWith(expect.any(Blob), 'file.json');
  });

  it('shows the keys of the texts', () => {
    TestBed.configureTestingModule({imports: [aiTranslocoTesting()]});
    expect(TestBed.inject(TranslocoService).translate('ai.panel.title')).toBe('ai.panel.title');
  });
});
