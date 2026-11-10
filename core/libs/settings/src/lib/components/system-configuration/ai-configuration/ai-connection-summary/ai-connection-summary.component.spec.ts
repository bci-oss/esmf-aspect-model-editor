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
import {AiConnectionSummaryComponent} from './ai-connection-summary.component';

describe('AiConnectionSummaryComponent', () => {
  let fixture: ComponentFixture<AiConnectionSummaryComponent>;
  const text = (testId: string): string | undefined =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim().replace(/\s+/g, ' ');

  const render = (inputs: Partial<Record<'provider' | 'model' | 'state' | 'keyState' | 'copilotLogin', unknown>>) => {
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiConnectionSummaryComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiConnectionSummaryComponent);
    fixture.detectChanges();
  });

  it('says that no provider is chosen yet', () => {
    expect(text('aiConnectionProvider')).toBe('settingsDialog.ai.status.none');
    expect(text('aiConnectionModel')).toBeUndefined();
    expect(fixture.nativeElement.querySelector('.ai-connection-summary--none')).not.toBeNull();
  });

  it('shows the provider, the state, the model and the stored key', () => {
    render({provider: 'openai', model: 'gpt-x', state: 'ready', keyState: 'persistent'});

    expect(text('aiConnectionProvider')).toBe('ai.providers.openai · settingsDialog.ai.status.ready');
    expect(text('aiConnectionModel')).toBe('settingsDialog.ai.status.model');
    expect(text('aiConnectionKey')).toBe('ai.setup.key.storedPersistent');
    expect(text('aiConnectionAccount')).toBeUndefined();
    expect(fixture.nativeElement.querySelector('.ai-connection-summary--ready')).not.toBeNull();
  });

  it('names the default model and a missing or session key', () => {
    render({provider: 'anthropic', state: 'incomplete', keyState: 'missing'});
    expect(text('aiConnectionModel')).toBe('settingsDialog.ai.status.defaultModel');
    expect(text('aiConnectionKey')).toBe('settingsDialog.ai.status.keyMissing');

    render({keyState: 'session'});
    expect(text('aiConnectionKey')).toBe('ai.setup.key.storedSession');

    render({keyState: 'notNeeded'});
    expect(text('aiConnectionKey')).toBeUndefined();
  });

  it('shows the GitHub account for Copilot', () => {
    render({provider: 'copilot', state: 'ready'});
    expect(text('aiConnectionAccount')).toBe('settingsDialog.ai.status.copilotSignedOut');

    render({copilotLogin: 'octocat'});
    expect(text('aiConnectionAccount')).toBe('ai.setup.copilot.signedIn');
  });
});
