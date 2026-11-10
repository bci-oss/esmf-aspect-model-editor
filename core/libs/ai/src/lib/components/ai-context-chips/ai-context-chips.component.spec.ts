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

import {AiContextItem} from '@ame/domain';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiContextChipsComponent} from './ai-context-chips.component';

describe('AiContextChipsComponent', () => {
  let fixture: ComponentFixture<AiContextChipsComponent>;

  const query = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const removeOf = (id: string) => query(id)?.querySelector('.ai-chip__remove') as HTMLButtonElement;

  const items: AiContextItem[] = [
    {id: '1', kind: 'element', label: 'speed', urn: 'urn:samm:org.example:1.0.0#speed'},
    {id: '2', kind: 'error', label: 'Missing unit', error: {message: 'Missing unit'}},
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiContextChipsComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiContextChipsComponent);
  });

  it('shows nothing without a model and items', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.ai-chip').length).toBe(0);
  });

  it('shows the model, the selection and the items', () => {
    fixture.componentRef.setInput('openModel', {label: 'Movement.ttl', readOnly: true});
    fixture.componentRef.setInput('selectedElement', 'speed');
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    expect(query('ai-chip-model')?.textContent).toContain('Movement.ttl');
    expect(query('ai-chip-model')?.textContent).toContain('lock');
    expect(query('ai-chip-selection')?.textContent).toContain('speed');
    const chips = fixture.nativeElement.querySelectorAll('[data-testid="ai-chip-item"]');
    expect(chips.length).toBe(2);
    expect(chips[1].classList).toContain('ai-chip--error');
  });

  it('emits when the user removes or adds context', () => {
    const includeModel = vi.fn();
    const selectionExcluded = vi.fn();
    const itemRemoved = vi.fn();
    fixture.componentInstance.includeModelChange.subscribe(includeModel);
    fixture.componentInstance.selectionExcluded.subscribe(selectionExcluded);
    fixture.componentInstance.itemRemoved.subscribe(itemRemoved);
    fixture.componentRef.setInput('openModel', {label: 'Movement.ttl', readOnly: false});
    fixture.componentRef.setInput('selectedElement', 'speed');
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    removeOf('ai-chip-model').click();
    removeOf('ai-chip-selection').click();
    (fixture.nativeElement.querySelectorAll('[data-testid="ai-chip-item"] .ai-chip__remove')[1] as HTMLButtonElement).click();

    expect(includeModel).toHaveBeenCalledWith(false);
    expect(selectionExcluded).toHaveBeenCalled();
    expect(itemRemoved).toHaveBeenCalledWith('2');

    fixture.componentRef.setInput('includeModel', false);
    fixture.detectChanges();
    expect(query('ai-chip-model')).toBeNull();
    (query('ai-chip-model-add') as HTMLButtonElement).click();
    expect(includeModel).toHaveBeenLastCalledWith(true);
  });

  describe('files and models', () => {
    const context: AiContextItem[] = [
      {id: 'f1', kind: 'file', label: 'spec.pdf', uploading: true},
      {
        id: 'f2',
        kind: 'file',
        label: 'manual.pdf',
        attachment: {id: 'a2', name: 'manual.pdf', kind: 'pdf', size: 100, characters: 1200, pages: 3, truncated: true},
      },
      {
        id: 'f3',
        kind: 'file',
        label: 'notes.txt',
        attachment: {id: 'a3', name: 'notes.txt', kind: 'text', size: 10, characters: 10, truncated: false},
      },
      {id: 'm1', kind: 'model', label: 'Movement.ttl', detail: 'org.example:1.0.0', contextModel: {sourcePath: '/ws'}},
      {id: 'n1', kind: 'namespace', label: 'org.example:1.0.0', detail: 'ws', contextModel: {sourcePath: '/ws'}},
      {id: 's1', kind: 'source', label: 'models', sourceType: 'github', contextModel: {sourcePath: '/gh'}},
      {id: 's2', kind: 'source', label: 'ws', sourceType: 'workspace', contextModel: {sourcePath: '/ws'}},
    ];

    const chips = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('[data-testid="ai-chip-item"]'));

    beforeEach(() => {
      fixture.componentRef.setInput('items', context);
      fixture.detectChanges();
    });

    it('renders every kind with its icon', () => {
      expect(chips().map(chip => chip.dataset['kind'])).toEqual(['file', 'file', 'file', 'model', 'namespace', 'source', 'source']);
      const icons = chips().map(chip => chip.querySelector('.ai-chip__icon')?.textContent?.trim() ?? null);
      expect(icons).toEqual([null, 'picture_as_pdf', 'attach_file', 'description', 'folder', 'cloud', 'inventory_2']);
    });

    it('shows a spinner while a file is uploaded and a warning for truncated files', () => {
      expect(chips()[0].querySelector('[data-testid="ai-chip-uploading"]')).not.toBeNull();
      expect(chips()[0].getAttribute('aria-busy')).toBe('true');
      expect(chips()[1].querySelector('[data-testid="ai-chip-warning"]')).not.toBeNull();
      expect(chips()[2].querySelector('[data-testid="ai-chip-warning"]')).toBeNull();
    });

    it('describes the items in the tooltip', () => {
      const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${params['count']}` : key);
      const component = fixture.componentInstance;
      expect(component.tooltip(context[0], t)).toBe('spec.pdf\nai.context.file.uploading');
      expect(component.tooltip(context[1], t)).toBe(
        'manual.pdf\nai.context.file.pages:3\nai.context.file.characters:1200\nai.context.file.truncated',
      );
      expect(
        component.tooltip(
          {
            ...context[2],
            attachment: {id: 'a3', name: 'notes.txt', kind: 'text', size: 10, characters: 10, truncated: false, warning: 'no_text'},
          },
          t,
        ),
      ).toBe('notes.txt\nai.context.file.characters:10\nai.context.file.no_text');
      expect(component.tooltip(context[3], t)).toBe('Movement.ttl\norg.example:1.0.0');
      expect(component.tooltip(items[0], t)).toBe('urn:samm:org.example:1.0.0#speed');
      expect(component.tooltip(items[1], t)).toBe('Missing unit');
    });
  });

  describe('add context', () => {
    beforeEach(() => fixture.detectChanges());

    it('comes first, in front of the chips', () => {
      fixture.componentRef.setInput('items', items);
      fixture.detectChanges();
      const chips = query('ai-context-chips') as HTMLElement;
      expect(chips.firstElementChild?.getAttribute('data-testid')).toBe('ai-attach');
      expect(query('ai-attach')?.textContent).toContain('ai.attach.button');
    });

    it('attaches files chosen in the file dialog', () => {
      const attached = vi.fn();
      fixture.componentInstance.filesAttached.subscribe(attached);
      const input = query('ai-file-input') as HTMLInputElement;
      expect(input.multiple).toBe(true);
      expect(input.accept).toContain('.pdf');
      expect(input.accept).toContain('.ttl');

      const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
      query('ai-attach')?.click();
      fixture.detectChanges();
      (document.querySelector('[data-testid="ai-attach-file"]') as HTMLElement).click();
      expect(click).toHaveBeenCalled();

      const file = new File(['text'], 'notes.txt');
      Object.defineProperty(input, 'files', {value: [file], configurable: true});
      input.dispatchEvent(new Event('change'));
      expect(attached).toHaveBeenCalledWith([file]);
      expect(input.value).toBe('');
    });

    it('asks for the picker from the menu', () => {
      const requested = vi.fn();
      fixture.componentInstance.pickerRequested.subscribe(requested);
      query('ai-attach')?.click();
      fixture.detectChanges();
      (document.querySelector('[data-testid="ai-attach-model"]') as HTMLElement).click();
      expect(requested).toHaveBeenCalled();
    });

    it('is disabled and ignores files while disabled', () => {
      const attached = vi.fn();
      fixture.componentInstance.filesAttached.subscribe(attached);
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();
      expect((query('ai-attach') as HTMLButtonElement).disabled).toBe(true);
      const input = query('ai-file-input') as HTMLInputElement;
      Object.defineProperty(input, 'files', {value: [new File(['x'], 'x.txt')], configurable: true});
      input.dispatchEvent(new Event('change'));
      expect(attached).not.toHaveBeenCalled();
    });
  });
});
