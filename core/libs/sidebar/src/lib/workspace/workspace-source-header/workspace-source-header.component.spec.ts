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

import {ModelSource} from '@ame/domain';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {WorkspaceSourceHeaderComponent} from './workspace-source-header.component';

describe('WorkspaceSourceHeaderComponent', () => {
  const github: ModelSource = {type: 'github', id: 'gh', name: 'GitHub', path: '/cache/gh', readOnly: true, defaultWorkspace: false};
  const workspace: ModelSource = {type: 'workspace', id: 'ws', name: 'Home', path: '/home/ws', readOnly: false, defaultWorkspace: true};

  let fixture: ComponentFixture<WorkspaceSourceHeaderComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        WorkspaceSourceHeaderComponent,
        TranslocoTestingModule.forRoot({
          langs: {en: {modelSources: {sidebar: {readOnlyBadge: 'read-only'}}, externalEditor: {openSourceIn: 'Open in {{editor}}'}}},
          translocoConfig: {availableLangs: ['en'], defaultLang: 'en'},
        }),
      ],
    });
    fixture = TestBed.createComponent(WorkspaceSourceHeaderComponent);
    fixture.componentRef.setInput('editorName', 'Cursor');
    element = fixture.nativeElement;
  });

  function render(inputs: {source?: ModelSource; readOnly?: boolean; collapsed?: boolean}): void {
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
  }

  const header = () => element.querySelector<HTMLButtonElement>('button.source');
  const openButton = () => element.querySelector<HTMLButtonElement>('[data-testid="workspace-source-open-in-editor"]');

  it('shows the source with its type icon and a read-only badge', () => {
    render({source: github, readOnly: true});

    expect(element.querySelector('[data-testid="workspace-source-github"]')).toBe(header());
    expect(header()?.textContent).toContain('cloud');
    expect(header()?.textContent).toContain('GitHub');
    expect(element.querySelector('[data-testid="workspace-source-read-only"]')?.textContent).toBe('read-only');
  });

  it('marks the default workspace and hides the badge of writable sources', () => {
    render({source: workspace});

    expect(header()?.textContent).toContain('home');
    expect(element.querySelector('[data-testid="workspace-source-read-only"]')).toBeNull();
  });

  it('falls back to an unknown source', () => {
    render({});

    expect(element.querySelector('[data-testid="workspace-source-unknown"]')).toBeTruthy();
    expect(header()?.textContent).toContain('–');
    expect(openButton()).toBeNull();
  });

  it('reflects the collapsed state and emits toggleCollapsed on click', () => {
    const toggle = vi.fn();
    fixture.componentInstance.toggleCollapsed.subscribe(toggle);
    render({source: workspace, collapsed: true});

    expect(header()?.getAttribute('aria-expanded')).toBe('false');
    expect(header()?.textContent).toContain('chevron_right');
    header()?.click();
    expect(toggle).toHaveBeenCalledTimes(1);

    render({collapsed: false});
    expect(header()?.getAttribute('aria-expanded')).toBe('true');
    expect(header()?.textContent).toContain('expand_more');
  });

  it('emits the source to open its folder in the external editor', () => {
    const openInEditor = vi.fn();
    fixture.componentInstance.openInEditor.subscribe(openInEditor);
    render({source: workspace});

    expect(openButton()?.getAttribute('aria-label')).toBe('Open in Cursor');
    openButton()?.click();
    expect(openInEditor).toHaveBeenCalledWith(workspace);
  });

  it('offers no folder to open for sources without a path', () => {
    render({source: {...workspace, path: ''}});

    expect(openButton()).toBeNull();
  });
});
