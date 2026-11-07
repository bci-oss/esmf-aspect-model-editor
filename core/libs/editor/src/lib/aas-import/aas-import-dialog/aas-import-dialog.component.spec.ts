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

import {AasImportCandidate, ModelApiPort, ModelSource, ModelSourcesStore} from '@ame/domain';
import {HttpErrorResponse, HttpStatusCode} from '@angular/common/http';
import {computed, provideZonelessChangeDetection, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {Observable, of, Subject, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AasImportDialogComponent} from './aas-import-dialog.component';

const workspace = (name: string, defaultWorkspace = false): ModelSource => ({
  type: 'workspace',
  id: `/home/${name}`,
  name,
  path: `/home/${name}`,
  readOnly: false,
  defaultWorkspace,
});

const candidate = (fileName: string, alreadyExists = false): AasImportCandidate => ({
  urn: `urn:samm:org.example:1.0.0#${fileName.replace('.ttl', '')}`,
  namespace: 'org.example',
  version: '1.0.0',
  fileName,
  alreadyExists,
});

describe('AasImportDialogComponent', () => {
  let fixture: ComponentFixture<AasImportDialogComponent>;
  let component: AasImportDialogComponent;
  let modelApi: {
    previewAasImport: ReturnType<typeof vi.fn<(file: File, workspace?: string) => Observable<AasImportCandidate[]>>>;
    importAas: ReturnType<typeof vi.fn<(file: File, workspace?: string) => Observable<unknown>>>;
  };
  let dialogRef: {close: ReturnType<typeof vi.fn>};
  let workspaces: ModelSource[];

  const file = new File([new Uint8Array([1])], 'Shell.aasx');

  const create = async () => {
    const sources = signal(workspaces);
    TestBed.configureTestingModule({
      imports: [
        AasImportDialogComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        {provide: MAT_DIALOG_DATA, useValue: {file}},
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: ModelApiPort, useValue: modelApi},
        {
          provide: ModelSourcesStore,
          useValue: {
            workspaces: sources,
            hasMultipleWorkspaces: computed(() => sources().length > 1),
            preferredWorkspace: signal(workspaces[1]?.path ?? null),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(AasImportDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const queryAll = (testId: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`));
  const query = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const importButton = () => query('aas-import-confirm') as HTMLButtonElement;

  beforeEach(() => {
    workspaces = [workspace('models', true), workspace('team')];
    modelApi = {
      previewAasImport: vi.fn(() => of([candidate('Movement.ttl'), candidate('Vehicle.ttl')])),
      importAas: vi.fn(() => of({})),
    };
    dialogRef = {close: vi.fn()};
  });

  it('previews the models for the preferred workspace', async () => {
    await create();

    expect(modelApi.previewAasImport).toHaveBeenCalledWith(file, '/home/team');
    expect(query('aas-import-file')?.textContent).toContain('Shell.aasx');
    expect(queryAll('aas-import-candidate').map(entry => entry.textContent?.trim())).toEqual([
      expect.stringContaining('org.example:1.0.0/Movement.ttl'),
      expect.stringContaining('org.example:1.0.0/Vehicle.ttl'),
    ]);
    expect(importButton().disabled).toBe(false);
  });

  it('previews again for another workspace', async () => {
    await create();

    component.selectWorkspace('/home/models');
    await fixture.whenStable();

    expect(modelApi.previewAasImport).toHaveBeenLastCalledWith(file, '/home/models');
  });

  it('hides the workspace choice for a single workspace', async () => {
    workspaces = [workspace('models', true)];
    await create();

    expect(query('aas-import-workspace-0')).toBeNull();
    expect(modelApi.previewAasImport).toHaveBeenCalledWith(file, '/home/models');
  });

  it('blocks the import while a file exists already', async () => {
    modelApi.previewAasImport.mockReturnValue(of([candidate('Movement.ttl', true), candidate('Vehicle.ttl')]));
    await create();

    expect(query('aas-import-conflicts')).not.toBeNull();
    expect(importButton().disabled).toBe(true);
  });

  it('blocks the import without models', async () => {
    modelApi.previewAasImport.mockReturnValue(of([]));
    await create();

    expect(query('aas-import-empty')).not.toBeNull();
    expect(importButton().disabled).toBe(true);
  });

  it('shows an error if the file cannot be read', async () => {
    modelApi.previewAasImport.mockReturnValue(throwError(() => new Error('422')));
    await create();

    expect(query('aas-import-preview-error')).not.toBeNull();
    expect(importButton().disabled).toBe(true);
  });

  it('imports into the chosen workspace and closes with the result', async () => {
    await create();

    importButton().click();

    expect(modelApi.importAas).toHaveBeenCalledWith(file, '/home/team');
    expect(dialogRef.close).toHaveBeenCalledWith({workspace: '/home/team', imported: 2});
  });

  it('locks the dialog while importing', async () => {
    const pending = new Subject<unknown>();
    modelApi.importAas.mockReturnValue(pending);
    await create();

    component.import();
    fixture.detectChanges();

    expect(query('aas-import-importing')).not.toBeNull();
    expect(importButton().disabled).toBe(true);
  });

  it('reports a conflict and refreshes the preview to show the existing file', async () => {
    modelApi.importAas.mockReturnValue(throwError(() => new HttpErrorResponse({status: HttpStatusCode.Conflict})));
    await create();
    modelApi.previewAasImport.mockReturnValue(of([candidate('Movement.ttl', true)]));

    component.import();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.importError()).toBe('conflict');
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(modelApi.previewAasImport).toHaveBeenCalledTimes(2);
    expect(query('aas-import-conflicts')).not.toBeNull();
  });

  it('reports other failures without closing', async () => {
    modelApi.importAas.mockReturnValue(throwError(() => new HttpErrorResponse({status: 500})));
    await create();

    component.import();
    fixture.detectChanges();

    expect(component.importError()).toBe('failed');
    expect(query('aas-import-error')).not.toBeNull();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
