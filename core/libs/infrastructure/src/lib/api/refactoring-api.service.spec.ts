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

import {RefactoringHistoryEntry, RefactoringPreview, RefactoringProgress, RefactoringRequest} from '@ame/domain';
import {APP_CONFIG, AppConfig, BackendStatusService} from '@ame/shared';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {RefactoringApiService} from './refactoring-api.service';

const refactoringUrl = 'http://localhost:9090/ame/api/refactoring';
const request: RefactoringRequest = {type: 'RENAME_ELEMENT', urn: 'urn:samm:org.example:1.0.0#speed', newName: 'velocity'};
const entry: RefactoringHistoryEntry = {id: 'a/1', description: 'Rename', timestamp: 1, created: [], modified: [], removed: []};

describe('RefactoringApiService', () => {
  let service: RefactoringApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {provide: APP_CONFIG, useValue: {api: {refactoring: '/ame/api/refactoring'}} as AppConfig},
        {provide: BackendStatusService, useValue: {serviceUrl: () => 'http://localhost:9090'}},
      ],
    });
    service = TestBed.inject(RefactoringApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('previews a refactoring', () => {
    const preview = {applicable: true} as RefactoringPreview;
    let result: RefactoringPreview | undefined;
    service.preview(request).subscribe(value => (result = value));

    const req = httpMock.expectOne(`${refactoringUrl}/preview`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(preview);

    expect(result).toEqual(preview);
  });

  it('applies a refactoring', () => {
    let result: RefactoringHistoryEntry | undefined;
    service.apply(request).subscribe(value => (result = value));

    const req = httpMock.expectOne(`${refactoringUrl}/apply`);
    expect(req.request.body).toEqual(request);
    req.flush(entry);

    expect(result).toEqual(entry);
  });

  it('loads the progress', () => {
    const progress: RefactoringProgress = {running: true, phase: 'WRITING', step: 3, steps: 3, files: 12};
    let result: RefactoringProgress | undefined;
    service.getProgress().subscribe(value => (result = value));

    const req = httpMock.expectOne(`${refactoringUrl}/progress`);
    expect(req.request.method).toBe('GET');
    req.flush(progress);

    expect(result).toEqual(progress);
  });

  it('loads the history', () => {
    let result: RefactoringHistoryEntry[] | undefined;
    service.getHistory().subscribe(value => (result = value));

    const req = httpMock.expectOne(`${refactoringUrl}/history`);
    expect(req.request.method).toBe('GET');
    req.flush([entry]);

    expect(result).toEqual([entry]);
  });

  it('reverts a refactoring with an encoded id and the force flag', () => {
    service.revert('a/1', true).subscribe();

    const req = httpMock.expectOne(r => r.url === `${refactoringUrl}/history/a%2F1/revert`);
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('force')).toBe('true');
    req.flush(entry);
  });
});
