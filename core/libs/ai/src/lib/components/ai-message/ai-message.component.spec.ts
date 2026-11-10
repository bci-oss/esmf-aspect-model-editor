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

import {AiChatMessage} from '@ame/domain';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiMessageComponent} from './ai-message.component';

describe('AiMessageComponent', () => {
  let fixture: ComponentFixture<AiMessageComponent>;

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  function show(message: Partial<AiChatMessage>): void {
    fixture.componentRef.setInput('message', {id: 'm1', role: 'assistant', content: '', proposals: [], tools: [], ...message});
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiMessageComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiMessageComponent);
  });

  it('shows the message of the user as plain text with the command', () => {
    show({role: 'user', content: '**speed**', command: 'explain'});
    const element = query('ai-message-user');
    expect(element.querySelector('.ai-message__command')?.textContent).toBe('/explain');
    expect(element.querySelector('.ai-message__text')?.textContent).toBe('**speed**');
    expect(element.querySelector('ame-ai-markdown')).toBeNull();
  });

  it('shows the files and models the user sent as context', () => {
    show({
      role: 'user',
      content: 'Check',
      context: [
        {kind: 'file', label: 'spec.pdf'},
        {kind: 'model', label: 'Movement.ttl'},
        {kind: 'source', label: 'ws'},
      ],
    });
    const items = Array.from(query('ai-message-context').querySelectorAll('li')) as HTMLElement[];
    expect(items.map(item => item.dataset['kind'])).toEqual(['file', 'model', 'source']);
    expect(items.map(item => item.querySelector('mat-icon')?.textContent)).toEqual(['picture_as_pdf', 'description', 'inventory_2']);
    expect(items[1].textContent).toContain('Movement.ttl');
  });

  it('shows no context without context', () => {
    show({role: 'user', content: 'Hello'});
    expect(query('ai-message-context')).toBeNull();
  });

  it('renders the answer as Markdown', () => {
    show({content: '**speed**'});
    expect(query('ai-message-assistant').querySelector('strong')?.textContent).toBe('speed');
    expect(query('ai-thinking')).toBeNull();
  });

  it('shows that the assistant thinks before the first text', () => {
    show({streaming: true});
    expect(query('ai-thinking').textContent).toContain('ai.message.thinking');
  });

  it('shows the running tool, otherwise the last one', () => {
    show({
      streaming: true,
      tools: [
        {callId: '1', name: 'validate', status: 'started'},
        {callId: '2', name: 'search', status: 'failed', summary: 'nothing found'},
      ],
    });
    expect(query('ai-tool').textContent).toContain('ai.tools.started');
    expect(query('ai-thinking')).toBeNull();

    show({tools: [{callId: '2', name: 'search', status: 'failed', summary: 'nothing found'}]});
    expect(query('ai-tool').classList).toContain('ai-message__tool--failed');
    expect(query('ai-tool').textContent).toContain('nothing found');
  });

  it('shows that the answer was stopped and the error with its actions', () => {
    const errorAction = vi.fn();
    fixture.componentInstance.errorAction.subscribe(errorAction);
    show({content: 'partial', stopped: true, error: {code: 'offline', message: ''}});

    expect(query('ai-stopped').textContent).toContain('ai.message.stopped');
    query('ai-error-action-retry').click();
    expect(errorAction).toHaveBeenCalledWith('retry');
    expect(fixture.nativeElement.querySelector('.ai-error__close')).toBeNull();
  });

  it('emits the element of a clicked link', () => {
    const elementSelected = vi.fn();
    fixture.componentInstance.elementSelected.subscribe(elementSelected);
    show({content: '`urn:samm:org.example:1.0.0#speed`'});
    (fixture.nativeElement.querySelector('a') as HTMLAnchorElement).click();
    expect(elementSelected).toHaveBeenCalledWith('urn:samm:org.example:1.0.0#speed');
  });
});
