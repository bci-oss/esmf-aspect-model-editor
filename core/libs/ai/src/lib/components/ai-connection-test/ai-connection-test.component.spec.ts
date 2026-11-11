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
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {aiTranslocoTesting} from '../../testing/ai-testing';
import {AiConnectionTestComponent} from './ai-connection-test.component';

describe('AiConnectionTestComponent', () => {
  let fixture: ComponentFixture<AiConnectionTestComponent>;

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const set = (name: string, value: unknown) => {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiConnectionTestComponent, aiTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AiConnectionTestComponent);
    fixture.detectChanges();
  });

  it('requests the test, not while testing', () => {
    const test = vi.fn();
    fixture.componentInstance.testRequested.subscribe(test);
    query('ai-test-connection').click();
    expect(test).toHaveBeenCalled();
    set('testing', true);
    expect(query<HTMLButtonElement>('ai-test-connection').disabled).toBe(true);
  });

  it('shows a failed test with its detail', () => {
    set('result', {ok: false, code: 'invalid_key', message: '401'});
    expect(query('ai-test-error').textContent).toContain('ai.errors.invalid_key');
    expect(query('ai-test-error').textContent).toContain('401');

    set('result', {ok: false});
    expect(query('ai-test-error').textContent).toContain('ai.errors.provider_error');
  });

  it('shows a successful test and finishes', () => {
    const finished = vi.fn();
    fixture.componentInstance.finished.subscribe(finished);
    expect(query('ai-setup-done')).toBeNull();
    set('result', {ok: true});
    set('finishable', true);
    expect(query('ai-test-ok')).not.toBeNull();
    query('ai-setup-done').click();
    expect(finished).toHaveBeenCalled();
  });
});
