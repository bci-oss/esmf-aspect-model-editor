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

import {AiProviderChoice} from '@ame/domain';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {aiTranslocoTesting} from '../../testing/ai-testing';
import {AiProviderPickerComponent} from './ai-provider-picker.component';

const CHOICES: AiProviderChoice[] = [
  {kind: 'copilot', recommended: true, local: false, available: true},
  {kind: 'ollama', recommended: false, local: true, available: true},
];

describe('AiProviderPickerComponent', () => {
  let fixture: ComponentFixture<AiProviderPickerComponent>;

  const query = (id: string): HTMLElement => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiProviderPickerComponent, aiTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AiProviderPickerComponent);
    fixture.componentRef.setInput('choices', CHOICES);
    fixture.componentRef.setInput('selected', 'ollama');
    fixture.detectChanges();
  });

  it('shows the providers as radio cards with their tags', () => {
    expect(fixture.nativeElement.querySelectorAll('[role="radio"]').length).toBe(2);
    expect(query('ai-provider-copilot').textContent).toContain('ai.setup.recommended');
    expect(query('ai-provider-ollama').textContent).toContain('ai.setup.local');
    expect(query('ai-provider-ollama').getAttribute('aria-checked')).toBe('true');
    expect(query('ai-provider-copilot').getAttribute('aria-checked')).toBe('false');
    expect(query('ai-provider-description-copilot')).toBeNull();
  });

  it('describes the providers when detailed', () => {
    fixture.componentRef.setInput('detailed', true);
    fixture.detectChanges();
    expect(query('ai-provider-description-copilot').textContent).toContain('ai.setup.providerHints.copilot');
  });

  it('emits the chosen provider', () => {
    const chosen: string[] = [];
    fixture.componentInstance.providerSelected.subscribe(kind => chosen.push(kind));
    query('ai-provider-copilot').click();
    expect(chosen).toEqual(['copilot']);
  });

  it('offers found local servers', () => {
    expect(query('ai-local-servers')).toBeNull();
    const server = {kind: 'ollama' as const, baseUrl: 'http://localhost:11434', models: ['llama3', 'qwen']};
    fixture.componentRef.setInput('localServers', [server]);
    fixture.detectChanges();
    expect(query('ai-local-server').textContent).toContain('(2)');

    let used: unknown;
    fixture.componentInstance.localServerSelected.subscribe(value => (used = value));
    query('ai-local-server').click();
    expect(used).toBe(server);
  });
});
