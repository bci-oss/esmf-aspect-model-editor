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
import {Provider} from '@angular/core';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {vi} from 'vitest';

/** Transloco without translations: the components show the keys of their texts. */
export function aiTranslocoTesting() {
  return TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}});
}

/** Stubs of the clipboard and the download of files, with the providers that replace the services. */
export function aiFileStubs() {
  const clipboard = {copy: vi.fn()};
  const fileSaver = {download: vi.fn()};
  const providers: Provider[] = [
    {provide: ClipboardService, useValue: clipboard},
    {provide: FileSaverService, useValue: fileSaver},
  ];
  return {clipboard, fileSaver, providers};
}
