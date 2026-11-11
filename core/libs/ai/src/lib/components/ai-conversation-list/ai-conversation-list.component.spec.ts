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
import {AiConversationListComponent} from './ai-conversation-list.component';

describe('AiConversationListComponent', () => {
  let fixture: ComponentFixture<AiConversationListComponent>;

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const queryAll = (id: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${id}"]`));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiConversationListComponent, aiTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AiConversationListComponent);
    fixture.componentRef.setInput('conversations', [
      {id: 'c1', title: 'Explain Movement', updatedAt: '2026-11-01T10:00:00Z'},
      {id: 'c2', title: 'Review', updatedAt: '2026-10-01T10:00:00Z'},
    ]);
    fixture.componentRef.setInput('activeId', 'c2');
    fixture.detectChanges();
  });

  it('lists the conversations and marks the active one', () => {
    const items = queryAll('ai-conversation');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Explain Movement');
    expect(items[1].classList).toContain('ai-conversations__item--active');
  });

  it('shows a hint without conversations', () => {
    fixture.componentRef.setInput('conversations', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ai.conversations.empty');
    expect(query('ai-conversation-clear')).toBeNull();
  });

  it('opens, creates and deletes conversations', () => {
    const opened = vi.fn();
    const created = vi.fn();
    const deleted = vi.fn();
    fixture.componentInstance.opened.subscribe(opened);
    fixture.componentInstance.created.subscribe(created);
    fixture.componentInstance.deleted.subscribe(deleted);

    (queryAll('ai-conversation')[0].querySelector('.ai-conversations__open') as HTMLButtonElement).click();
    query('ai-conversation-new').click();
    (queryAll('ai-conversation-delete')[1] as HTMLButtonElement).click();

    expect(opened).toHaveBeenCalledWith('c1');
    expect(created).toHaveBeenCalled();
    expect(deleted).toHaveBeenCalledWith('c2');
  });

  it('renames with Enter and cancels with Escape', () => {
    const renamed = vi.fn();
    fixture.componentInstance.renamed.subscribe(renamed);

    queryAll('ai-conversation-rename')[0].click();
    fixture.detectChanges();
    const input = query<HTMLInputElement>('ai-conversation-title-input');
    input.value = '  Speed  ';
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
    fixture.detectChanges();
    expect(renamed).toHaveBeenCalledWith({id: 'c1', title: 'Speed'});
    expect(query('ai-conversation-title-input')).toBeNull();

    queryAll('ai-conversation-rename')[0].click();
    fixture.detectChanges();
    query('ai-conversation-title-input').dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    fixture.detectChanges();
    expect(query('ai-conversation-title-input')).toBeNull();
    expect(renamed).toHaveBeenCalledTimes(1);
  });

  it('does not rename to an empty title', () => {
    const renamed = vi.fn();
    fixture.componentInstance.renamed.subscribe(renamed);
    fixture.componentInstance.renamingId.set('c1');
    fixture.componentInstance.finishRename('c1', '   ');
    expect(renamed).not.toHaveBeenCalled();
    expect(fixture.componentInstance.renamingId()).toBeNull();
  });

  it('clears all conversations after the confirmation', () => {
    const cleared = vi.fn();
    fixture.componentInstance.cleared.subscribe(cleared);

    query('ai-conversation-clear').click();
    fixture.detectChanges();
    expect(cleared).not.toHaveBeenCalled();
    query('ai-conversation-clear-confirm').click();
    fixture.detectChanges();

    expect(cleared).toHaveBeenCalled();
    expect(query('ai-conversation-clear-confirm')).toBeNull();
  });
});
