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

import {Marked, Tokens} from 'marked';

/** Links to elements are rendered as `href="#urn:samm:..."`; the panel navigates to the element on click. */
export const URN_LINK_PREFIX = '#';
export const URN_LINK_CLASS = 'ai-urn-link';

const URN = /^urn:samm:[^\s#]+#[^\s]+$/;
const SAFE_LINK = /^(https?:|mailto:)/i;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function isElementUrn(text: string): boolean {
  return URN.test(text.trim());
}

const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // the answers are untrusted; HTML is shown as text
    html({text}: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(text);
    },
    codespan({text}: Tokens.Codespan): string {
      const code = text.trim();
      if (isElementUrn(code)) {
        return `<code><a class="${URN_LINK_CLASS}" href="${URN_LINK_PREFIX}${escapeHtml(code)}">${escapeHtml(code)}</a></code>`;
      }
      return `<code>${escapeHtml(text)}</code>`;
    },
    link(this: {parser: {parseInline(tokens: Tokens.Generic[]): string}}, {href, tokens}: Tokens.Link): string {
      const label = this.parser.parseInline(tokens);
      if (!SAFE_LINK.test(href)) return label;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
    image({text}: Tokens.Image): string {
      return escapeHtml(text);
    },
  },
});

/** Renders the Markdown of an answer to HTML; it still has to be sanitized when it is shown. */
export function renderMarkdown(text: string): string {
  return markdown.parse(text ?? '', {async: false}) as string;
}

/** The element URN of a link rendered by {@link renderMarkdown}, or null for other links. */
export function urnOfLink(target: EventTarget | null): string | null {
  const element = target instanceof Element ? target.closest(`a.${URN_LINK_CLASS}`) : null;
  const href = element?.getAttribute('href') ?? '';
  return href.startsWith(URN_LINK_PREFIX) && isElementUrn(href.slice(1)) ? href.slice(1) : null;
}
