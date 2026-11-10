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

import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NamedElement} from '@esmf/aspect-model-loader';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiEditorActionsService} from '../ai-editor-actions.service';
import {AiFieldActionComponent} from './ai-field-action.component';

const URN = 'urn:samm:org.example:1.0.0#speed';

function namedElement(options: {anonymous?: boolean; predefined?: boolean} = {}): NamedElement {
  return {aspectModelUrn: URN, isAnonymous: () => !!options.anonymous, isPredefined: !!options.predefined} as unknown as NamedElement;
}

describe('AiFieldActionComponent', () => {
  let fixture: ComponentFixture<AiFieldActionComponent>;
  const enabled = signal(true);
  let actions: {enabled: typeof enabled; askAboutElement: ReturnType<typeof vi.fn>};

  const button = () => fixture.nativeElement.querySelector('[data-testid="ai-field-action"]') as HTMLButtonElement | null;
  const menuItem = (testId: string) => document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;

  beforeEach(() => {
    enabled.set(true);
    actions = {enabled, askAboutElement: vi.fn()};
    TestBed.configureTestingModule({
      imports: [AiFieldActionComponent, TranslocoTestingModule.forRoot({langs: {en: {}}})],
      providers: [{provide: AiEditorActionsService, useValue: actions}],
    });
    fixture = TestBed.createComponent(AiFieldActionComponent);
  });

  it('is shown for named elements while the assistant is enabled', async () => {
    fixture.componentRef.setInput('element', namedElement());
    await fixture.whenStable();
    expect(button()).not.toBeNull();

    enabled.set(false);
    await fixture.whenStable();
    expect(button()).toBeNull();
  });

  it('is hidden for anonymous, predefined and missing elements', async () => {
    for (const element of [namedElement({anonymous: true}), namedElement({predefined: true}), null]) {
      fixture.componentRef.setInput('element', element);
      await fixture.whenStable();
      expect(button()).toBeNull();
    }
  });

  it('asks to describe or translate the element', async () => {
    fixture.componentRef.setInput('element', namedElement());
    await fixture.whenStable();

    button()?.click();
    await fixture.whenStable();
    menuItem('ai-field-action-describe')?.click();
    expect(actions.askAboutElement).toHaveBeenCalledWith('describe', URN);

    fixture.componentInstance.ask('translate');
    expect(actions.askAboutElement).toHaveBeenCalledWith('translate', URN);
  });

  it('is disabled together with the field', async () => {
    fixture.componentRef.setInput('element', namedElement());
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(button()?.disabled).toBe(true);
  });
});
