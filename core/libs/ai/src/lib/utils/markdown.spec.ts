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

import {describe, expect, it} from 'vitest';
import {escapeHtml, isElementUrn, renderMarkdown, urnOfLink} from './markdown';

describe('markdown', () => {
  it('renders Markdown', () => {
    const html = renderMarkdown('# Title\n\n**bold** and *it*\n\n- a\n- b');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<li>a</li>');
  });

  it('escapes raw HTML and unsafe links', () => {
    const html = renderMarkdown(
      'Text <script>alert(1)</script> <b>x</b>\n\n<div onclick="x">y</div>\n\n[l](javascript:alert(1)) ![i](http://x/y.png)',
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<div');
  });

  it('opens safe links in a new window', () => {
    expect(renderMarkdown('[docs](https://eclipse-esmf.github.io)')).toContain(
      '<a href="https://eclipse-esmf.github.io" target="_blank" rel="noopener noreferrer">docs</a>',
    );
  });

  it('links element URNs in code spans', () => {
    const html = renderMarkdown('See `urn:samm:org.example:1.0.0#speed` and `a < b`');
    expect(html).toContain('<a class="ai-urn-link" href="#urn:samm:org.example:1.0.0#speed">urn:samm:org.example:1.0.0#speed</a>');
    expect(html).toContain('<code>a &lt; b</code>');
  });

  it('finds the URN of a clicked link', () => {
    const container = document.createElement('div');
    container.innerHTML = renderMarkdown('`urn:samm:org.example:1.0.0#speed` [x](https://example.org)');
    const urnLink = container.querySelector('a.ai-urn-link');
    expect(urnOfLink(urnLink)).toBe('urn:samm:org.example:1.0.0#speed');
    expect(urnOfLink(container.querySelector('a[target]'))).toBeNull();
    expect(urnOfLink(null)).toBeNull();
  });

  it('detects URNs and escapes', () => {
    expect(isElementUrn('urn:samm:a.b:1.0.0#c')).toBe(true);
    expect(isElementUrn('urn:samm:a.b:1.0.0')).toBe(false);
    expect(escapeHtml('<"&\'>')).toBe('&lt;&quot;&amp;&#39;&gt;');
  });
});
