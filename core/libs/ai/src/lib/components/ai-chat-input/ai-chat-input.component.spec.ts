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

import {AiContextCandidate, AiModelElement} from '@ame/domain';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiChatInputComponent} from './ai-chat-input.component';

describe('AiChatInputComponent', () => {
  let fixture: ComponentFixture<AiChatInputComponent>;

  const elements: AiModelElement[] = [
    {urn: 'urn:samm:org.example:1.0.0#speed', name: 'speed', type: 'Property'},
    {urn: 'urn:samm:org.example:1.0.0#Movement', name: 'Movement', type: 'Aspect'},
  ];

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const textarea = () => query<HTMLTextAreaElement>('ai-input');

  function type(value: string): void {
    textarea().value = value;
    textarea().setSelectionRange(value.length, value.length);
    textarea().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {key, cancelable: true, ...init});
    textarea().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiChatInputComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiChatInputComponent);
    fixture.componentRef.setInput('elements', elements);
    fixture.detectChanges();
  });

  it('sends with Enter and clears the input', () => {
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    expect(query<HTMLButtonElement>('ai-send').disabled).toBe(true);

    type('What is @speed now');
    expect(query<HTMLButtonElement>('ai-send').disabled).toBe(false);
    const event = press('Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(submitted).toHaveBeenCalledWith({message: 'What is @speed now', mentionedElementUrns: ['urn:samm:org.example:1.0.0#speed']});
    expect(fixture.componentInstance.text()).toBe('');
  });

  it('adds a line with Shift+Enter', () => {
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    type('first line');
    expect(press('Enter', {shiftKey: true}).defaultPrevented).toBe(false);
    expect(submitted).not.toHaveBeenCalled();
  });

  it('sends the command with the send button', () => {
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.text.set('/explain speed');
    fixture.detectChanges();
    query('ai-send').click();
    expect(submitted).toHaveBeenCalledWith({command: 'explain', message: 'speed', mentionedElementUrns: []});
  });

  it('suggests commands and chooses one with the keyboard', () => {
    type('/e');
    const suggestions = query('ai-input-suggestions');
    expect(suggestions).not.toBeNull();
    expect(suggestions.textContent).toContain('/explain');
    expect(suggestions.textContent).toContain('ai.commands.explain');

    press('ArrowDown');
    expect(fixture.componentInstance.highlighted()).toBe(1);
    press('Enter');

    expect(fixture.componentInstance.text()).toBe('/generate ');
    expect(query('ai-input-suggestions')).toBeNull();
  });

  it('suggests elements after @ and closes the suggestions with Escape', () => {
    type('about @mo');
    expect(query('ai-input-suggestions').textContent).toContain('@Movement');
    press('Escape');
    expect(query('ai-input-suggestions')).toBeNull();
  });

  it('shows the stop button while streaming', () => {
    const stopRequested = vi.fn();
    fixture.componentInstance.stopRequested.subscribe(stopRequested);
    fixture.componentRef.setInput('streaming', true);
    fixture.detectChanges();

    expect(query('ai-send')).toBeNull();
    query('ai-stop').click();
    expect(stopRequested).toHaveBeenCalled();
  });

  it('does not send when disabled', () => {
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.text.set('hello');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    expect(textarea().disabled).toBe(true);
    fixture.componentInstance.send();
    expect(submitted).not.toHaveBeenCalled();
  });

  describe('context', () => {
    const candidates: AiContextCandidate[] = [
      {
        kind: 'model',
        label: 'Movement.ttl',
        name: 'Movement.ttl',
        depth: 2,
        detail: 'org.example:1.0.0',
        contextModel: {sourcePath: '/ws', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl'},
        sourceType: 'workspace',
        readOnly: false,
      },
      {
        kind: 'namespace',
        label: 'org.shared',
        name: 'org.shared',
        depth: 0,
        detail: 'models@main',
        contextModel: {sourcePath: '/cache/gh', namespace: 'org.shared'},
        sourceType: 'github',
        readOnly: true,
      },
    ];

    function dragEvent(type: string, files: File[]): Event {
      const event = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(event, 'dataTransfer', {value: {types: ['Files'], files, dropEffect: 'none'}});
      return event;
    }

    beforeEach(() => {
      fixture.componentRef.setInput('contextCandidates', candidates);
      fixture.detectChanges();
    });

    it('suggests models after # and adds the chosen one to the context instead of inserting text', () => {
      const started = vi.fn();
      const picked = vi.fn();
      fixture.componentInstance.contextSearchStarted.subscribe(started);
      fixture.componentInstance.contextPicked.subscribe(picked);

      type('compare #mov');
      expect(started).toHaveBeenCalledTimes(1);
      expect(query('ai-input-suggestions').textContent).toContain('#Movement.ttl');
      expect(query('ai-input-suggestions').textContent).toContain('description');
      type('compare #mo');
      expect(started).toHaveBeenCalledTimes(1);

      press('Enter');
      expect(picked).toHaveBeenCalledWith(candidates[0]);
      expect(fixture.componentInstance.text()).toBe('compare ');
      expect(query('ai-input-suggestions')).toBeNull();
    });

    it('offers namespace folders after #', () => {
      type('#org.sh');
      expect(query('ai-input-suggestions').textContent).toContain('#org.shared');
      expect(query('ai-input-suggestions').textContent).toContain('folder');
    });

    it('attaches dropped files', () => {
      const attached = vi.fn();
      fixture.componentInstance.filesAttached.subscribe(attached);
      const file = new File(['%PDF'], 'spec.pdf');
      const area = query('ai-input-area');

      const over = dragEvent('dragover', [file]);
      area.dispatchEvent(over);
      fixture.detectChanges();
      expect(over.defaultPrevented).toBe(true);
      expect(area.classList).toContain('ai-input--drag-over');

      const drop = dragEvent('drop', [file]);
      area.dispatchEvent(drop);
      fixture.detectChanges();
      expect(drop.defaultPrevented).toBe(true);
      expect(attached).toHaveBeenCalledWith([file]);
      expect(area.classList).not.toContain('ai-input--drag-over');
    });

    it('ignores drops while disabled', () => {
      const attached = vi.fn();
      fixture.componentInstance.filesAttached.subscribe(attached);
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();
      query('ai-input-area').dispatchEvent(dragEvent('drop', [new File(['x'], 'a.txt')]));
      expect(attached).not.toHaveBeenCalled();
    });

    it('does not send while a file is uploaded', () => {
      fixture.componentInstance.text.set('hello');
      fixture.componentRef.setInput('uploading', true);
      fixture.detectChanges();
      expect(query<HTMLButtonElement>('ai-send').disabled).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('ai.attach.uploading');
    });
  });
});
