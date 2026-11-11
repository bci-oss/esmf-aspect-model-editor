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
import {beforeEach, describe, expect, it} from 'vitest';
import {aiTranslocoTesting} from '../../testing/ai-testing';
import {AiModelFieldsComponent} from './ai-model-fields.component';

describe('AiModelFieldsComponent', () => {
  let fixture: ComponentFixture<AiModelFieldsComponent>;

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const set = (name: string, value: unknown) => {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };
  const change = (id: string, value: string) => {
    const input = query<HTMLInputElement>(id);
    input.value = value;
    input.dispatchEvent(new Event('change'));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiModelFieldsComponent, NoopAnimationsModule, aiTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AiModelFieldsComponent);
    fixture.detectChanges();
  });

  it('asks for the base URL only when needed', () => {
    expect(query('ai-base-url')).toBeNull();
    set('showBaseUrl', true);
    set('baseUrl', 'http://localhost:1234/v1');
    expect(query<HTMLInputElement>('ai-base-url').value).toBe('http://localhost:1234/v1');

    const urls: (string | undefined)[] = [];
    fixture.componentInstance.baseUrlChanged.subscribe(url => urls.push(url));
    change('ai-base-url', ' http://localhost:8000/v1 ');
    change('ai-base-url', '  ');
    expect(urls).toEqual(['http://localhost:8000/v1', undefined]);
  });

  it('takes a typed model when no models are known', () => {
    const models: string[] = [];
    fixture.componentInstance.modelSelected.subscribe(model => models.push(model));
    set('model', 'm1');
    expect(query<HTMLInputElement>('ai-model-input').value).toBe('m1');
    change('ai-model-input', ' my-model ');
    expect(models).toEqual(['my-model']);
  });

  it('offers the known models', () => {
    const models: string[] = [];
    fixture.componentInstance.modelSelected.subscribe(model => models.push(model));
    set('models', [{id: 'gpt-4o', name: 'GPT-4o'}]);
    expect(query('ai-model-select')).not.toBeNull();
    expect(query('ai-model-input')).toBeNull();
    fixture.componentInstance.selectModel('gpt-4o');
    expect(models).toEqual(['gpt-4o']);
  });
});
