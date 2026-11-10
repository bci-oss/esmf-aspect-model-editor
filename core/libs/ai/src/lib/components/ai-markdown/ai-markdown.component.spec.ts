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
import {AiMarkdownComponent} from './ai-markdown.component';

describe('AiMarkdownComponent', () => {
  let fixture: ComponentFixture<AiMarkdownComponent>;

  const content = (): HTMLElement => fixture.nativeElement.querySelector('[data-testid="ai-markdown"]');

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [AiMarkdownComponent]}).compileComponents();
    fixture = TestBed.createComponent(AiMarkdownComponent);
  });

  it('renders Markdown without raw HTML', () => {
    fixture.componentRef.setInput('text', '**bold**\n\n<img src=x onerror="alert(1)">');
    fixture.detectChanges();
    expect(content().querySelector('strong')?.textContent).toBe('bold');
    expect(content().querySelector('img')).toBeNull();
  });

  it('emits the URN of a clicked element link', () => {
    const selected = vi.fn();
    fixture.componentInstance.elementSelected.subscribe(selected);
    fixture.componentRef.setInput('text', 'See `urn:samm:org.example:1.0.0#speed`.');
    fixture.detectChanges();

    const link = content().querySelector('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    const event = new MouseEvent('click', {bubbles: true, cancelable: true});
    link.dispatchEvent(event);

    expect(selected).toHaveBeenCalledWith('urn:samm:org.example:1.0.0#speed');
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores clicks outside of element links', () => {
    const selected = vi.fn();
    fixture.componentInstance.elementSelected.subscribe(selected);
    fixture.componentRef.setInput('text', 'plain text');
    fixture.detectChanges();
    content().querySelector('p')?.click();
    expect(selected).not.toHaveBeenCalled();
  });
});
