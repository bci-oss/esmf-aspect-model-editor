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
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiConsentComponent} from './ai-consent.component';

describe('AiConsentComponent', () => {
  let fixture: ComponentFixture<AiConsentComponent>;

  const button = (id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiConsentComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiConsentComponent);
    fixture.componentRef.setInput('providerLabel', 'OpenAI');
    fixture.detectChanges();
  });

  it('shows the consent dialog', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="ai-consent"]').getAttribute('role')).toBe('dialog');
    expect(fixture.nativeElement.textContent).toContain('ai.consent.text');
  });

  it('emits the choice of the user', () => {
    const accepted = vi.fn();
    const declined = vi.fn();
    const useLocal = vi.fn();
    fixture.componentInstance.accepted.subscribe(accepted);
    fixture.componentInstance.declined.subscribe(declined);
    fixture.componentInstance.useLocal.subscribe(useLocal);

    button('ai-consent-accept').click();
    button('ai-consent-decline').click();
    button('ai-consent-local').click();

    expect(accepted).toHaveBeenCalledTimes(1);
    expect(declined).toHaveBeenCalledTimes(1);
    expect(useLocal).toHaveBeenCalledTimes(1);
  });
});
