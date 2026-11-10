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

import {ClipboardService} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiDeviceCodeComponent} from './ai-device-code.component';

describe('AiDeviceCodeComponent', () => {
  let fixture: ComponentFixture<AiDeviceCodeComponent>;
  const clipboard = {copy: vi.fn()};

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  beforeEach(async () => {
    clipboard.copy.mockClear();
    await TestBed.configureTestingModule({
      imports: [
        AiDeviceCodeComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [{provide: ClipboardService, useValue: clipboard}],
    }).compileComponents();
    fixture = TestBed.createComponent(AiDeviceCodeComponent);
    fixture.componentRef.setInput('flow', {
      flowId: 'f1',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900,
    });
    fixture.detectChanges();
  });

  it('shows the code and links to GitHub', () => {
    expect(query('ai-device-code-value').textContent).toContain('ABCD-1234');
    expect(query<HTMLAnchorElement>('ai-device-code-open').getAttribute('href')).toBe('https://github.com/login/device');
  });

  it('copies the code', () => {
    query('ai-device-code-copy').click();
    fixture.detectChanges();
    expect(clipboard.copy).toHaveBeenCalledWith('ABCD-1234');
    expect(query('ai-device-code-copy').textContent).toContain('check');
  });

  it('emits the cancellation', () => {
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    query('ai-device-code-cancel').click();
    expect(cancelled).toHaveBeenCalled();
  });
});
