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
import {AiPanelHeaderComponent} from './ai-panel-header.component';

describe('AiPanelHeaderComponent', () => {
  let fixture: ComponentFixture<AiPanelHeaderComponent>;
  let component: AiPanelHeaderComponent;

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const menuItems = (): HTMLButtonElement[] => Array.from(document.querySelectorAll('.mat-mdc-menu-panel button'));
  const set = (name: string, value: unknown) => {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiPanelHeaderComponent, NoopAnimationsModule, aiTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AiPanelHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the title of the conversation or of the panel', () => {
    expect(fixture.nativeElement.textContent).toContain('ai.panel.title');
    set('title', 'Units');
    expect(fixture.nativeElement.textContent).toContain('Units');
  });

  it('emits the header actions', () => {
    const toggled = vi.fn();
    const created = vi.fn();
    const closed = vi.fn();
    component.conversationsToggled.subscribe(toggled);
    component.conversationCreated.subscribe(created);
    component.closeRequested.subscribe(closed);
    set('conversationsOpen', true);

    expect(query('ai-conversations-toggle').getAttribute('aria-expanded')).toBe('true');
    query('ai-conversations-toggle').click();
    query('ai-new-conversation').click();
    query('ai-close').click();
    expect(toggled).toHaveBeenCalled();
    expect(created).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
  });

  it('offers the models and the setup of the provider', () => {
    expect(query('ai-provider-menu')).toBeNull();
    const opened = vi.fn();
    const setup = vi.fn();
    const models: string[] = [];
    component.providerMenuOpened.subscribe(opened);
    component.setupRequested.subscribe(setup);
    component.modelSelected.subscribe(model => models.push(model));
    set('providerLabel', 'OpenAI');
    set('model', 'gpt-4o');
    set('models', [
      {id: 'gpt-4o', name: 'GPT-4o'},
      {id: 'o1', name: ''},
    ]);
    expect(query('ai-provider-menu').textContent).toContain('OpenAI');
    expect(query('ai-provider-menu').textContent).toContain('gpt-4o');

    query('ai-provider-menu').click();
    fixture.detectChanges();
    expect(opened).toHaveBeenCalled();
    const items = menuItems();
    expect(items.map(item => item.textContent?.trim())).toEqual([
      'radio_button_checkedGPT-4o',
      'radio_button_uncheckedo1',
      'tuneai.panel.changeProvider',
    ]);
    items[1].click();
    expect(models).toEqual(['o1']);

    query('ai-provider-menu').click();
    fixture.detectChanges();
    (document.querySelector('[data-testid="ai-open-setup"]') as HTMLElement).click();
    expect(setup).toHaveBeenCalled();
  });
});
