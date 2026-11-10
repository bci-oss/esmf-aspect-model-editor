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
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it} from 'vitest';
import {AiStarter, AiWelcomeComponent} from './ai-welcome.component';

describe('AiWelcomeComponent', () => {
  let fixture: ComponentFixture<AiWelcomeComponent>;

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiWelcomeComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiWelcomeComponent);
    fixture.detectChanges();
  });

  it('offers only generating without an open model', () => {
    expect(query<HTMLButtonElement>('ai-starter-explain').disabled).toBe(true);
    expect(query<HTMLButtonElement>('ai-starter-generate').disabled).toBe(false);
    fixture.componentRef.setInput('modelOpen', true);
    fixture.detectChanges();
    expect(query<HTMLButtonElement>('ai-starter-explain').disabled).toBe(false);
  });

  it('emits the chosen starter', () => {
    const started: AiStarter[] = [];
    fixture.componentInstance.started.subscribe(starter => started.push(starter));
    query('ai-starter-generate').click();
    expect(started.map(starter => starter.command)).toEqual(['generate']);
  });
});
