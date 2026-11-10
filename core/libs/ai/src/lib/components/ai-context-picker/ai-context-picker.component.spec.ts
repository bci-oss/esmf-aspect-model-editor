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

import {AiContextCandidateGroup} from '@ame/domain';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiContextPickerComponent} from './ai-context-picker.component';

describe('AiContextPickerComponent', () => {
  let fixture: ComponentFixture<AiContextPickerComponent>;

  const ws = {sourceType: 'workspace', readOnly: false} as const;
  const groups: AiContextCandidateGroup[] = [
    {
      label: 'ws',
      path: '/ws',
      ...ws,
      sourceCandidate: {kind: 'source', label: 'ws', name: 'ws', depth: 0, detail: '/ws', contextModel: {sourcePath: '/ws'}, ...ws},
      candidates: [
        {
          kind: 'namespace',
          label: 'org.example',
          name: 'org.example',
          depth: 0,
          detail: 'ws',
          contextModel: {sourcePath: '/ws', namespace: 'org.example'},
          ...ws,
        },
        {
          kind: 'namespace',
          label: 'org.example:1.0.0',
          name: '1.0.0',
          depth: 1,
          detail: 'org.example',
          contextModel: {sourcePath: '/ws', namespace: 'org.example', version: '1.0.0'},
          ...ws,
        },
        {
          kind: 'model',
          label: 'Movement.ttl',
          name: 'Movement.ttl',
          depth: 2,
          detail: 'org.example:1.0.0',
          contextModel: {sourcePath: '/ws', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl'},
          ...ws,
        },
      ],
    },
    {
      label: 'eclipse/models@main',
      path: '/gh',
      sourceType: 'github',
      readOnly: true,
      candidates: [
        {
          kind: 'model',
          label: 'Shared.ttl',
          name: 'Shared.ttl',
          depth: 2,
          detail: 'org.shared:1.0.0',
          contextModel: {sourcePath: '/gh', namespace: 'org.shared', version: '1.0.0', fileName: 'Shared.ttl'},
          sourceType: 'github',
          readOnly: true,
        },
      ],
    },
  ];

  const query = <T extends HTMLElement>(id: string): T => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const rows = (): HTMLButtonElement[] => Array.from(fixture.nativeElement.querySelectorAll('[data-testid="ai-context-candidate"]'));

  function search(value: string): void {
    const input = query<HTMLInputElement>('ai-context-picker-search');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AiContextPickerComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiContextPickerComponent);
    fixture.componentRef.setInput('groups', groups);
    fixture.detectChanges();
  });

  it('lists the candidates as indented folder tree grouped by source with a lock for read-only sources', () => {
    expect(query('ai-context-picker')).not.toBeNull();
    expect(rows().map(row => row.dataset['kind'])).toEqual(['namespace', 'namespace', 'model', 'model']);
    expect(rows().map(row => row.dataset['depth'])).toEqual(['0', '1', '2', '2']);
    expect(rows().map(row => row.querySelector<HTMLElement>('.ai-picker__indent')?.style.width)).toEqual(['0px', '16px', '32px', '32px']);
    expect(rows().map(row => row.querySelector('.ai-picker__label')?.textContent?.trim())).toEqual([
      'org.example',
      '1.0.0',
      'Movement.ttl',
      'Shared.ttl',
    ]);
    expect(rows().map(row => row.querySelector('.ai-picker__icon')?.textContent?.trim())).toEqual([
      'folder',
      'folder_open',
      'description',
      'description',
    ]);
    expect(fixture.nativeElement.textContent).toContain('eclipse/models@main');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="ai-context-picker-lock"]')).toHaveLength(1);
  });

  it('filters by label and detail', () => {
    search('shared');
    expect(rows().map(row => row.textContent)).toEqual([expect.stringContaining('Shared.ttl')]);
    search('movement');
    expect(rows().map(row => row.dataset['depth'])).toEqual(['0', '1', '2']);
    search('nothing');
    expect(rows()).toHaveLength(0);
    expect(query('ai-context-picker-empty').textContent).toContain('ai.context.picker.noMatch');
  });

  it('emits the clicked candidate', () => {
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);
    rows()[1].click();
    expect(picked).toHaveBeenCalledWith(groups[0].candidates[1]);
  });

  it('adds a whole source with its header and shows a plain header without a path', () => {
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);
    const sources: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="ai-context-source"]'));
    expect(sources).toHaveLength(1);
    expect(sources[0].textContent).toContain('ws');
    expect(sources[0].querySelector('.ai-picker__add')).not.toBeNull();
    sources[0].click();
    expect(picked).toHaveBeenCalledWith(groups[0].sourceCandidate);
    expect(fixture.nativeElement.querySelectorAll('div.ai-picker__group-header')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('div.ai-picker__group-header').textContent).toContain('eclipse/models@main');
  });

  it('keeps a whole source when its name matches the search', () => {
    search('eclipse/models');
    expect(rows().map(row => row.textContent)).toEqual([expect.stringContaining('Shared.ttl')]);
    search('ws');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="ai-context-source"]')).toHaveLength(1);
  });

  it('closes with the close button and Escape', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    query('ai-context-picker-close').click();
    query('ai-context-picker').dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('shows the loading state and the empty state', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(rows()).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('mat-progress-spinner')).not.toBeNull();

    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('groups', []);
    fixture.detectChanges();
    expect(query('ai-context-picker-empty').textContent).toContain('ai.context.picker.empty');
  });
});
