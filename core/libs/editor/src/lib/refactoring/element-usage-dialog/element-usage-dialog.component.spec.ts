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

import {ElementUsageReport, ModelApiPort, ModelOpenerPort} from '@ame/domain';
import {HttpErrorResponse, HttpStatusCode} from '@angular/common/http';
import {provideZonelessChangeDetection} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ElementUsageDialogComponent} from './element-usage-dialog.component';

const SPEED = 'urn:samm:org.example:1.0.0#speed';
const usage = (name: string, overrides: Partial<ElementUsageReport['usages'][number]> = {}) => ({
  urn: `urn:samm:org.example:1.0.0#${name}`,
  namespace: 'org.example',
  version: '1.0.0',
  fileName: 'Movement.ttl',
  path: '/workspace/org.example/1.0.0/Movement.ttl',
  readOnly: false,
  external: false,
  ...overrides,
});

describe('ElementUsageDialogComponent', () => {
  let fixture: ComponentFixture<ElementUsageDialogComponent>;
  let modelApi: {getElementUsage: ReturnType<typeof vi.fn>};
  let modelOpener: {promptAndOpen: ReturnType<typeof vi.fn>};
  let dialogRef: {close: ReturnType<typeof vi.fn>};

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [
        ElementUsageDialogComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        {provide: MAT_DIALOG_DATA, useValue: {urn: SPEED}},
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: ModelApiPort, useValue: modelApi},
        {provide: ModelOpenerPort, useValue: modelOpener},
      ],
    });
    fixture = TestBed.createComponent(ElementUsageDialogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const queryAll = (testId: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`));

  beforeEach(() => {
    modelApi = {getElementUsage: vi.fn()};
    modelOpener = {promptAndOpen: vi.fn(() => of(true))};
    dialogRef = {close: vi.fn()};
  });

  it('groups the usages by file and lists other files first', async () => {
    modelApi.getElementUsage.mockReturnValue(
      of({
        urn: SPEED,
        usages: [
          usage('Movement'),
          usage('Vehicle', {fileName: 'Vehicle.ttl', external: true}),
          usage('Fleet', {fileName: 'Vehicle.ttl', external: true}),
        ],
        unreadable: [],
      }),
    );
    await create();

    expect(modelApi.getElementUsage).toHaveBeenCalledWith(SPEED);
    expect(queryAll('element-usage-group').map(group => group.querySelector('.group__file')?.textContent?.trim())).toEqual([
      'org.example:1.0.0/Vehicle.ttl',
      'org.example:1.0.0/Movement.ttl',
    ]);
    expect(queryAll('element-usage-entry').map(entry => entry.textContent?.trim())).toEqual([
      expect.stringContaining('Fleet'),
      expect.stringContaining('Vehicle'),
      expect.stringContaining('Movement'),
    ]);
    expect(fixture.componentInstance.fileCount()).toBe(2);
  });

  it('filters the usages by element name and file', async () => {
    modelApi.getElementUsage.mockReturnValue(
      of({urn: SPEED, usages: [usage('Movement'), usage('Vehicle', {fileName: 'Vehicle.ttl', external: true})], unreadable: []}),
    );
    await create();

    fixture.componentInstance.filter.set('vehicle.ttl');
    fixture.detectChanges();
    expect(queryAll('element-usage-entry').map(entry => entry.textContent?.trim())).toEqual([expect.stringContaining('Vehicle')]);

    fixture.componentInstance.filter.set('unknown');
    fixture.detectChanges();
    expect(queryAll('element-usage-entry')).toHaveLength(0);
    expect(queryAll('element-usage-no-match')).toHaveLength(1);
  });

  it('opens the model of a usage with the referring element', async () => {
    modelApi.getElementUsage.mockReturnValue(of({urn: SPEED, usages: [usage('Movement')], unreadable: []}));
    await create();

    queryAll('element-usage-entry')[0].click();

    expect(dialogRef.close).toHaveBeenCalled();
    expect(modelOpener.promptAndOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        file: 'Movement.ttl',
        namespace: 'org.example:1.0.0',
        editElementUrn: 'urn:samm:org.example:1.0.0#Movement',
      }),
    );
  });

  it('does not open read-only usages', async () => {
    modelApi.getElementUsage.mockReturnValue(of({urn: SPEED, usages: [usage('Remote', {readOnly: true})], unreadable: []}));
    await create();

    fixture.componentInstance.open(usage('Remote', {readOnly: true}));

    expect(modelOpener.promptAndOpen).not.toHaveBeenCalled();
  });

  it('warns about files that could not be checked', async () => {
    modelApi.getElementUsage.mockReturnValue(
      of({
        urn: SPEED,
        usages: [],
        unreadable: [{namespace: 'org.example', version: '1.0.0', fileName: 'Broken.ttl', message: 'Syntax error'}],
      }),
    );
    await create();

    expect(queryAll('element-usage-empty')).toHaveLength(1);
    expect(queryAll('element-usage-unreadable')[0].textContent).toContain('org.example:1.0.0/Broken.ttl');
  });

  it('shows an error if the usages cannot be loaded', async () => {
    modelApi.getElementUsage.mockReturnValue(throwError(() => new Error('offline')));
    await create();

    expect(queryAll('element-usage-error')).toHaveLength(1);
    expect(queryAll('element-usage-not-saved')).toHaveLength(0);
  });

  it('explains that unsaved elements have no usages yet', async () => {
    modelApi.getElementUsage.mockReturnValue(throwError(() => new HttpErrorResponse({status: HttpStatusCode.NotFound})));
    await create();

    expect(queryAll('element-usage-not-saved')).toHaveLength(1);
    expect(queryAll('element-usage-error')).toHaveLength(0);
  });
});
