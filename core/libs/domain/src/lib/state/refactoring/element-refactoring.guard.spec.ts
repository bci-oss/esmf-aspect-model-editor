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

import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {DefaultProperty, NamedElement} from '@esmf/aspect-model-loader';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {LoadedFilesService} from '../../model-session/loaded-files.service';
import {ModelSourcesStore} from '../model-sources/model-sources.store';
import {ElementRefactoringGuard} from './element-refactoring.guard';

const property = (overrides: Partial<NamedElement> = {}): NamedElement =>
  Object.assign(
    new DefaultProperty({aspectModelUrn: 'urn:samm:org.example:1.0.0#speed', name: 'speed', metaModelVersion: '2.2.0'}),
    overrides,
  );

describe('ElementRefactoringGuard', () => {
  let guard: ElementRefactoringGuard;
  let loadedFiles: {currentLoadedFile: unknown; isElementExtern: ReturnType<typeof vi.fn>};
  let readOnlyLocation: boolean;

  beforeEach(() => {
    loadedFiles = {
      currentLoadedFile: {fromWorkspace: true, rdfModel: {getSourceLocation: () => '/workspace/org.example/1.0.0/Movement.ttl'}},
      isElementExtern: vi.fn(() => false),
    };
    readOnlyLocation = false;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: LoadedFilesService, useValue: loadedFiles},
        {provide: ModelSourcesStore, useValue: {isReadOnlyLocation: () => readOnlyLocation}},
      ],
    });
    guard = TestBed.inject(ElementRefactoringGuard);
  });

  it('allows named elements of a workspace model', () => {
    expect(guard.blocker(property())).toBeNull();
    expect(guard.canRefactor(property())).toBe(true);
    expect(guard.canShowUsages(property())).toBe(true);
  });

  it.each([
    ['elements of the SAMM meta model', 'predefined', () => property({isPredefined: true})],
    ['anonymous elements', 'notSaved', () => Object.assign(property(), {isAnonymous: () => true})],
    ['missing elements', 'notSaved', () => null],
    [
      'models not stored in a workspace',
      'notSaved',
      () => {
        loadedFiles.currentLoadedFile = {fromWorkspace: false, rdfModel: {getSourceLocation: () => ''}};
        return property();
      },
    ],
    [
      'read-only sources',
      'readOnly',
      () => {
        readOnlyLocation = true;
        return property();
      },
    ],
    [
      'elements of other files',
      'external',
      () => {
        loadedFiles.isElementExtern.mockReturnValue(true);
        return property();
      },
    ],
  ])('blocks %s', (_case, blocker, arrange) => {
    const element = arrange();

    expect(guard.blocker(element)).toBe(blocker);
    expect(guard.canRefactor(element)).toBe(false);
  });

  it('shows the usages of elements of other files, but not of the SAMM meta model', () => {
    loadedFiles.isElementExtern.mockReturnValue(true);

    expect(guard.canShowUsages(property())).toBe(true);
    expect(guard.canShowUsages(property({isPredefined: true}))).toBe(false);
    expect(guard.urnOf(Object.assign(property(), {isAnonymous: () => true}))).toBeNull();
  });
});
