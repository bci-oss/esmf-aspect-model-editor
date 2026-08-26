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

import {TestBed} from '@angular/core/testing';
import {MockProvider} from 'ng-mocks';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorModelService} from '../editor-model.service';
import {ShapeSettingsStateService} from './shape-settings-state.service';

describe('ShapeSettingsStateService', () => {
  let service: ShapeSettingsStateService;
  let editorModelService: EditorModelService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ShapeSettingsStateService,
        MockProvider(EditorModelService, {
          updateMetaModelElement: vi.fn(),
        }),
      ],
    });

    service = TestBed.inject(ShapeSettingsStateService);
    editorModelService = TestBed.inject(EditorModelService);
  });

  it('openShapeSettings should set isShapeSettingOpened to true and emit', () => {
    let opened = false;
    service.onSettingsOpened$.subscribe(val => (opened = val));

    service.openShapeSettings();
    expect(service.isShapeSettingOpened).toBe(true);
    expect(opened).toBe(true);
  });

  it('closeShapeSettings should set isShapeSettingOpened to false, emit and clear element', () => {
    service.openShapeSettings();
    service.closeShapeSettings();

    expect(service.isShapeSettingOpened).toBe(false);
    expect(editorModelService.updateMetaModelElement).toHaveBeenCalledWith(null);
  });
});
