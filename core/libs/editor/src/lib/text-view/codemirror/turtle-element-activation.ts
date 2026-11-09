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

// Everything that depends on CodeMirror lives here so it can be loaded lazily when the text view is opened.

import {Extension, RangeSet, StateEffect, StateField} from '@codemirror/state';
import {Decoration, DecorationSet, EditorView, gutter, GutterMarker, ViewPlugin} from '@codemirror/view';
import {elementDefinitionOffsets, elementRangeAt, TextRange} from './turtle-text.utils';

const isActivationModifier = (event: MouseEvent | KeyboardEvent) => event.ctrlKey || event.metaKey;

/** Opens elements on Ctrl/Cmd + click and via an icon in the gutter next to each element definition. */
export function elementActivation(activate: (offset: number) => void, title: string): Extension {
  return [
    elementLinks,
    definitionGutter(activate, title),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (event.button !== 0 || !isActivationModifier(event)) {
          return false;
        }
        const offset = view.posAtCoords({x: event.clientX, y: event.clientY});
        if (offset === null) {
          return false;
        }
        event.preventDefault();
        activate(offset);
        return true;
      },
    }),
  ];
}

const setLink = StateEffect.define<TextRange | null>();

const linkMark = Decoration.mark({class: 'cm-ame-element-link'});

/** The element shown as a link, i.e. the one under the mouse while the activation modifier is held. */
const linkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(links, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setLink)) {
        return effect.value ? Decoration.set(linkMark.range(effect.value.from, effect.value.to)) : Decoration.none;
      }
    }
    return transaction.docChanged ? Decoration.none : links;
  },
  provide: field => EditorView.decorations.from(field),
});

/** Tracks the mouse and the modifier keys, which are also pressed while the editor is not focused. */
const elementLinks = [
  linkField,
  ViewPlugin.fromClass(
    class {
      private mouse: {x: number; y: number} | null = null;
      private readonly onKey = (event: KeyboardEvent) => this.show(isActivationModifier(event));
      private readonly onBlur = () => this.show(false);

      constructor(private readonly view: EditorView) {
        const window = view.dom.ownerDocument.defaultView;
        window?.addEventListener('keydown', this.onKey);
        window?.addEventListener('keyup', this.onKey);
        window?.addEventListener('blur', this.onBlur);
      }

      mouseMoved(event: MouseEvent): void {
        this.mouse = {x: event.clientX, y: event.clientY};
        this.show(isActivationModifier(event));
      }

      mouseLeft(): void {
        this.mouse = null;
        this.show(false);
      }

      private show(modifierHeld: boolean): void {
        const offset = modifierHeld && this.mouse ? this.view.posAtCoords(this.mouse) : null;
        const range = offset === null ? null : elementRangeAt(this.view.state.doc.toString(), offset);
        const current = this.view.state.field(linkField).iter();
        const unchanged = range ? current.value !== null && current.from === range.from && current.to === range.to : current.value === null;
        if (!unchanged) {
          this.view.dispatch({effects: setLink.of(range)});
        }
      }

      destroy(): void {
        const window = this.view.dom.ownerDocument.defaultView;
        window?.removeEventListener('keydown', this.onKey);
        window?.removeEventListener('keyup', this.onKey);
        window?.removeEventListener('blur', this.onBlur);
      }
    },
    {
      eventHandlers: {
        mousemove(event) {
          this.mouseMoved(event);
        },
        mouseleave() {
          this.mouseLeft();
        },
      },
    },
  ),
];

class ActivateMarker extends GutterMarker {
  constructor(private readonly title: string) {
    super();
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof ActivateMarker && other.title === this.title;
  }

  override toDOM(): Node {
    const icon = document.createElement('span');
    icon.className = 'cm-ame-activate-icon';
    icon.textContent = 'open_in_new';
    icon.title = this.title;
    icon.setAttribute('data-testid', 'text-view-open-element');
    return icon;
  }
}

/** An icon next to each element definition, opening the element. */
function definitionGutter(activate: (offset: number) => void, title: string): Extension {
  const marker = new ActivateMarker(title);
  const markers = StateField.define<RangeSet<GutterMarker>>({
    create: state => definitionMarkers(state.doc.toString(), marker),
    update: (value, transaction) => (transaction.docChanged ? definitionMarkers(transaction.state.doc.toString(), marker) : value),
  });

  return [
    markers,
    gutter({
      class: 'cm-ame-activate-gutter',
      markers: view => view.state.field(markers),
      initialSpacer: () => marker,
      domEventHandlers: {
        mousedown(view, line, event) {
          let defined = false;
          view.state.field(markers).between(line.from, line.from, () => {
            defined = true;
          });
          if (!defined || (event as MouseEvent).button !== 0) {
            return false;
          }
          event.preventDefault();
          activate(line.from);
          return true;
        },
      },
    }),
  ];
}

function definitionMarkers(text: string, marker: GutterMarker): RangeSet<GutterMarker> {
  return RangeSet.of(elementDefinitionOffsets(text).map(offset => marker.range(offset)));
}
