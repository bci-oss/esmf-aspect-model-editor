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

import {ExternalEditorService} from '@ame/domain';
import {ExternalEditor} from '@ame/shared';
import {signal, WritableSignal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {WorkspaceErrorComponent} from './workspace-error.component';

describe('WorkspaceErrorComponent', () => {
  let component: WorkspaceErrorComponent;
  let fixture: ComponentFixture<WorkspaceErrorComponent>;
  let externalEditor: {editor: WritableSignal<ExternalEditor>; openFile: ReturnType<typeof vi.fn>};

  beforeEach(() => {
    externalEditor = {editor: signal<ExternalEditor>('vscode'), openFile: vi.fn()};
    TestBed.configureTestingModule({
      imports: [
        WorkspaceErrorComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              sidebar: {
                workspaceError: {
                  title: 'Workspace validation error!',
                  description:
                    'During loading the models from the workspace, the following validation error(s) occured. The affected ttl files need to be removed or fixed outside the editor to display and use the workspace.',
                },
              },
            },
          },
          translocoConfig: {availableLangs: ['en'], defaultLang: 'en'},
        }),
      ],
      providers: [{provide: ExternalEditorService, useValue: externalEditor}],
    });

    fixture = TestBed.createComponent(WorkspaceErrorComponent);
    component = fixture.componentInstance;
  });

  function renderFileLink(file: string): HTMLAnchorElement {
    fixture.componentRef.setInput('error', {code: 400, message: `File: ${file} • Error: Something broke`, path: file});
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('a.file-link') as HTMLAnchorElement;
  }

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render error details when error input is provided', () => {
    fixture.componentRef.setInput('error', {
      code: 400,
      message: 'Invalid syntax in model file',
      path: '/workspace/models/Invalid.ttl',
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Workspace validation error!');
    expect(compiled.textContent).toContain('Invalid syntax in model file');
  });

  it('should open the file of a file link in the external editor', () => {
    const link = renderFileLink('/workspace/models/Invalid.ttl');

    link.click();

    expect(externalEditor.openFile).toHaveBeenCalledWith('/workspace/models/Invalid.ttl');
  });

  it('should link file URIs to the configured external editor', () => {
    externalEditor.editor.set('cursor');

    const link = renderFileLink('file:///C:/my%20models/Invalid.ttl');

    expect(link.textContent).toBe('file:///C:/my%20models/Invalid.ttl');
    expect(link.getAttribute('href')).toBe('cursor://file/C:/my%20models/Invalid.ttl');
    link.click();
    expect(externalEditor.openFile).toHaveBeenCalledWith('C:/my models/Invalid.ttl');
  });

  it('should link Unix paths given as file URIs', () => {
    const link = renderFileLink('file:/Users/me/models/Invalid.ttl');

    expect(link.getAttribute('href')).toBe('vscode://file/Users/me/models/Invalid.ttl');
  });
});
