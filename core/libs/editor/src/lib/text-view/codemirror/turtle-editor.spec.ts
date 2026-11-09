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

import {EditorView} from '@codemirror/view';
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {createTurtleEditor, TurtleEditor} from './turtle-editor';

const PREFIXES = '@prefix samm: <urn:samm:org.eclipse.esmf.samm:meta-model:2.3.0#> .\n@prefix : <urn:samm:org.example:1.0.0#> .\n';
const CONTENT = `${PREFIXES}:Movement a samm:Aspect ;\n   samm:properties ( :speed ) .\n:speed a samm:Property .`;

describe('createTurtleEditor', () => {
  let parent: HTMLElement;
  let editor: TurtleEditor;
  let onElementActivate: ReturnType<typeof vi.fn<(offset: number) => void>>;

  beforeAll(() => {
    // jsdom has no layout for ranges; CodeMirror measures text in animation frames.
    Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  });

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    onElementActivate = vi.fn<(offset: number) => void>();
    editor = createTurtleEditor(parent, CONTENT, {onElementActivate});
  });

  afterEach(() => {
    editor.destroy();
    parent.remove();
    vi.restoreAllMocks();
  });

  const content = () => parent.querySelector('.cm-content') as HTMLElement;
  const mouseDown = (init: MouseEventInit) => {
    const event = new MouseEvent('mousedown', {bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5, ...init});
    content().dispatchEvent(event);
    return event;
  };

  it('reports the cursor offset', () => {
    expect(editor.cursorOffset()).toBe(0);
    editor.goToLine(5);
    expect(editor.cursorOffset()).toBe(CONTENT.indexOf(':speed a'));
  });

  it.each([{ctrlKey: true}, {metaKey: true}])('activates the element clicked with %o', modifier => {
    vi.spyOn(EditorView.prototype, 'posAtCoords').mockReturnValue(28);

    const event = mouseDown(modifier);

    expect(onElementActivate).toHaveBeenCalledWith(28);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores plain clicks, other buttons and clicks outside the text', () => {
    const posAtCoords = vi.spyOn(EditorView.prototype, 'posAtCoords').mockReturnValue(28);
    mouseDown({});
    mouseDown({ctrlKey: true, button: 2});
    posAtCoords.mockReturnValue(null);
    mouseDown({ctrlKey: true});

    expect(onElementActivate).not.toHaveBeenCalled();
  });

  describe('links', () => {
    const links = () => [...parent.querySelectorAll('.cm-ame-element-link')].map(link => link.textContent);
    const mouseMove = (init: MouseEventInit) => content().dispatchEvent(new MouseEvent('mousemove', {bubbles: true, ...init}));

    it('shows the element under the mouse as link while Ctrl or Cmd is held', () => {
      vi.spyOn(EditorView.prototype, 'posAtCoords').mockReturnValue(CONTENT.indexOf(':Movement') + 2);

      mouseMove({});
      expect(links()).toEqual([]);

      mouseMove({ctrlKey: true});
      expect(links()).toEqual([':Movement']);

      window.dispatchEvent(new KeyboardEvent('keyup', {key: 'Control'}));
      expect(links()).toEqual([]);

      window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Meta', metaKey: true}));
      expect(links()).toEqual([':Movement']);
    });

    it('hides the link when the mouse leaves, the window loses the focus or no element is under the mouse', () => {
      const posAtCoords = vi.spyOn(EditorView.prototype, 'posAtCoords').mockReturnValue(CONTENT.indexOf(':speed )') + 1);
      mouseMove({ctrlKey: true});
      expect(links()).toEqual([':speed']);

      content().dispatchEvent(new MouseEvent('mouseleave'));
      expect(links()).toEqual([]);

      mouseMove({ctrlKey: true});
      window.dispatchEvent(new Event('blur'));
      expect(links()).toEqual([]);

      posAtCoords.mockReturnValue(CONTENT.indexOf('samm:Aspect') + 2);
      mouseMove({ctrlKey: true});
      expect(links()).toEqual([]);
    });

    it('stops listening to the keys when destroyed', () => {
      const removeEventListener = vi.spyOn(window, 'removeEventListener');
      editor.destroy();
      expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
    });
  });

  describe('gutter icons', () => {
    const icons = () =>
      [...parent.querySelectorAll<HTMLElement>('[data-testid="text-view-open-element"]')].filter(icon => icon.isConnected);
    const iconLine = (icon: HTMLElement) => icon.closest('.cm-gutterElement') as HTMLElement;

    beforeEach(() => {
      editor.destroy();
      editor = createTurtleEditor(parent, CONTENT, {onElementActivate, activateTitle: 'Open in VS Code'});
    });

    it('shows an icon with tooltip next to each element definition', () => {
      // The spacer measuring the gutter width is hidden
      const visible = icons().filter(icon => iconLine(icon).style.visibility !== 'hidden');
      expect(visible).toHaveLength(2);
      expect(visible.every(icon => icon.title === 'Open in VS Code')).toBe(true);
    });

    it('activates the element defined on the line of the clicked icon', () => {
      const definition = CONTENT.indexOf(':speed a');
      // Without layout the gutter cannot map the click height to its line
      vi.spyOn(EditorView.prototype, 'lineBlockAtHeight').mockImplementation(function (this: EditorView) {
        return this.lineBlockAt(definition);
      });
      const visible = icons().filter(icon => iconLine(icon).style.visibility !== 'hidden');
      visible[1].dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, button: 0}));

      expect(onElementActivate).toHaveBeenCalledWith(definition);
    });

    it('ignores clicks on lines without definition', () => {
      vi.spyOn(EditorView.prototype, 'lineBlockAtHeight').mockImplementation(function (this: EditorView) {
        return this.lineBlockAt(0);
      });
      const gutter = parent.querySelector('.cm-ame-activate-gutter') as HTMLElement;
      gutter.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, button: 0}));

      expect(onElementActivate).not.toHaveBeenCalled();
    });

    it('updates the icons when the content changes', () => {
      editor.setContent(`${PREFIXES}:Movement a samm:Aspect .`);
      expect(icons().filter(icon => iconLine(icon).style.visibility !== 'hidden')).toHaveLength(1);
    });
  });

  it('adds neither links nor icons without activation', () => {
    editor.destroy();
    editor = createTurtleEditor(parent, CONTENT);
    expect(parent.querySelector('.cm-ame-activate-gutter')).toBeNull();
  });
});
