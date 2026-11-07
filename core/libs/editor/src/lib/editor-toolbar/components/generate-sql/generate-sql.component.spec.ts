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

import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MatDialogRef} from '@angular/material/dialog';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {GenerateSqlComponent, SQL_DIALECTS} from './generate-sql.component';

describe('GenerateSqlComponent', () => {
  let component: GenerateSqlComponent;
  let fixture: ComponentFixture<GenerateSqlComponent>;
  let dialogRef: {close: ReturnType<typeof vi.fn>};

  beforeEach(async () => {
    dialogRef = {close: vi.fn()};

    await TestBed.configureTestingModule({
      imports: [
        GenerateSqlComponent,
        BrowserAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [{provide: MatDialogRef, useValue: dialogRef}],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateSqlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should offer the dialects of the SDK and preselect PostgreSQL', () => {
    expect(component.dialects).toEqual(SQL_DIALECTS);
    expect(component.sqlModel().dialect).toBe('POSTGRESQL');
  });

  it('should close with the chosen dialect', () => {
    component.sqlModel.set({dialect: 'DATABRICKS'});

    fixture.nativeElement.querySelector('[data-testid="generateSql"]').click();

    expect(dialogRef.close).toHaveBeenCalledWith('DATABRICKS');
  });
});
