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
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {aiTranslocoTesting} from '../../testing/ai-testing';
import {AiKeyFieldComponent} from './ai-key-field.component';

describe('AiKeyFieldComponent', () => {
  let fixture: ComponentFixture<AiKeyFieldComponent>;
  let component: AiKeyFieldComponent;
  let submitted: string[];

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const set = (name: string, value: unknown) => {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };
  const type = (value: string) => {
    const input = query<HTMLInputElement>('ai-key-input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiKeyFieldComponent, NoopAnimationsModule, aiTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AiKeyFieldComponent);
    component = fixture.componentInstance;
    submitted = [];
    component.keySubmitted.subscribe(key => submitted.push(key));
    fixture.detectChanges();
  });

  it('submits the trimmed key', () => {
    expect(query<HTMLButtonElement>('ai-key-save').disabled).toBe(true);
    type(' sk-test ');
    expect(component.key()).toBe(' sk-test ');
    query('ai-key-save').click();
    expect(submitted).toEqual(['sk-test']);
  });

  it('submits with enter but not while saving or empty', () => {
    query('ai-key-input').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
    expect(submitted).toEqual([]);
    type('sk');
    set('saving', true);
    component.submit();
    expect(submitted).toEqual([]);
    set('saving', false);
    query('ai-key-input').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
    expect(submitted).toEqual(['sk']);
  });

  it('shows where the key is stored and removes it', () => {
    const deleted = vi.fn();
    component.keyDeleted.subscribe(deleted);
    set('info', {stored: true, persistent: true});
    expect(query('ai-key-stored').textContent).toContain('ai.setup.key.storedPersistent');
    expect(query('ai-key-input')).toBeNull();
    set('info', {stored: true, persistent: false});
    expect(query('ai-key-stored').textContent).toContain('ai.setup.key.storedSession');
    query('ai-key-delete').click();
    expect(deleted).toHaveBeenCalled();
  });

  it('changes a stored key until a new one is stored or the change is cancelled', () => {
    set('info', {stored: true, persistent: true});
    query('ai-key-change').click();
    fixture.detectChanges();
    expect(query('ai-key-input')).not.toBeNull();

    type('sk-new');
    query('ai-key-change-cancel').click();
    fixture.detectChanges();
    expect(component.key()).toBe('');
    expect(query('ai-key-stored')).not.toBeNull();

    query('ai-key-change').click();
    fixture.detectChanges();
    set('info', {stored: true, persistent: true});
    expect(component.changing()).toBe(false);
    expect(query('ai-key-stored')).not.toBeNull();
  });
});
