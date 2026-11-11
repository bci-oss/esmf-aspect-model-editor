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
import {beforeEach, describe, expect, it} from 'vitest';
import {aiFileStubs, aiTranslocoTesting} from '../../testing/ai-testing';
import {AiPayloadViewComponent} from './ai-payload-view.component';

describe('AiPayloadViewComponent', () => {
  let fixture: ComponentFixture<AiPayloadViewComponent>;
  const {clipboard, fileSaver, providers} = aiFileStubs();

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  beforeEach(async () => {
    clipboard.copy.mockClear();
    fileSaver.download.mockClear();
    await TestBed.configureTestingModule({
      imports: [AiPayloadViewComponent, aiTranslocoTesting()],
      providers,
    }).compileComponents();
    fixture = TestBed.createComponent(AiPayloadViewComponent);
    fixture.componentRef.setInput('fileBaseName', 'Movement');
    fixture.componentRef.setInput('variants', [
      {name: 'minimal', json: '{"speed":1}'},
      {name: 'full set', json: 'not json'},
    ]);
    fixture.detectChanges();
  });

  it('shows the first variant formatted', () => {
    expect(fixture.nativeElement.querySelectorAll('[data-testid="ai-payload-variant"]').length).toBe(2);
    expect(query('ai-payload-json').textContent).toBe('{\n  "speed": 1\n}');
  });

  it('switches the variant and keeps invalid JSON as it is', () => {
    (fixture.nativeElement.querySelectorAll('[data-testid="ai-payload-variant"]')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(query('ai-payload-json').textContent).toBe('not json');
  });

  it('copies and saves the selected variant', () => {
    query('ai-payload-copy').click();
    expect(clipboard.copy).toHaveBeenCalledWith('{\n  "speed": 1\n}');

    (fixture.nativeElement.querySelectorAll('[data-testid="ai-payload-variant"]')[1] as HTMLButtonElement).click();
    query('ai-payload-save').click();
    const [blob, name] = fileSaver.download.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe('Movement-full-set.json');
  });

  it('hides the tabs for a single variant', () => {
    fixture.componentRef.setInput('variants', [{name: 'only', json: '{}'}]);
    fixture.detectChanges();
    expect(query('ai-payload-variant')).toBeNull();
  });
});
