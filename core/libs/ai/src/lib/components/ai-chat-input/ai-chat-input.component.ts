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
import {ChangeDetectionStrategy, Component, computed, ElementRef, input, model, output, signal, viewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoDirective} from '@jsverse/transloco';
import {
  activeToken,
  aiContextIcon,
  commandSuggestions,
  contextSuggestions,
  insertSuggestion,
  mentionSuggestions,
  parseChatInput,
  ParsedChatInput,
  removeToken,
} from '../../utils';

export interface AiInputSuggestion {
  /** Inserted after `/` or `@`. */
  value: string;
  label: string;
  detail: string;
  /** `#`: the files or models added to the context instead of inserting text. */
  candidate?: AiContextCandidate;
}

/**
 * Input of the chat: Enter sends, Shift+Enter adds a line, `/` completes commands, `@` elements and `#` adds models to the context.
 * Files are attached by dropping them onto the input.
 */
@Component({
  selector: 'ame-ai-chat-input',
  templateUrl: './ai-chat-input.component.html',
  styleUrls: ['./ai-chat-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, TranslocoDirective],
})
export class AiChatInputComponent {
  readonly text = model('');
  readonly elements = input<AiModelElement[]>([]);
  readonly streaming = input(false);
  readonly disabled = input(false);
  readonly language = input('en');
  /** Models of the workspace offered for `#`. */
  readonly contextCandidates = input<AiContextCandidate[]>([]);
  /** A file is still uploaded; sending waits for it. */
  readonly uploading = input(false);

  readonly submitted = output<ParsedChatInput>();
  readonly stopRequested = output<void>();
  readonly filesAttached = output<File[]>();
  readonly contextPicked = output<AiContextCandidate>();
  /** The user started to type `#`; the candidates may be refreshed. */
  readonly contextSearchStarted = output<void>();

  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

  readonly dragOver = signal(false);

  readonly caret = signal(0);
  readonly highlighted = signal(0);
  private readonly suggestionsClosed = signal(false);

  readonly token = computed(() => activeToken(this.text(), this.caret()));
  readonly suggestions = computed<AiInputSuggestion[]>(() => {
    const token = this.token();
    if (!token || this.suggestionsClosed()) return [];
    if (token.kind === 'context') {
      return contextSuggestions(token.query, this.contextCandidates()).map(candidate => ({
        value: candidate.label,
        label: '#' + candidate.label,
        detail: candidate.detail,
        candidate,
      }));
    }
    if (token.kind === 'command') {
      return commandSuggestions(token.query, this.language()).map(({command, name}) => ({
        value: name,
        label: '/' + name,
        detail: 'ai.commands.' + command,
      }));
    }
    return mentionSuggestions(token.query, this.elements()).map(element => ({
      value: element.name,
      label: '@' + element.name,
      detail: element.type,
    }));
  });
  readonly canSend = computed(() => !this.disabled() && !this.streaming() && !this.uploading() && this.text().trim().length > 0);

  onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    const wasContext = this.token()?.kind === 'context';
    this.text.set(target.value);
    this.caret.set(target.selectionStart ?? target.value.length);
    this.highlighted.set(0);
    this.suggestionsClosed.set(false);
    if (!wasContext && this.token()?.kind === 'context') this.contextSearchStarted.emit();
  }

  onCaretMove(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.caret.set(target.selectionStart ?? target.value.length);
  }

  onKeydown(event: KeyboardEvent): void {
    const suggestions = this.suggestions();
    if (suggestions.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.highlighted.set((this.highlighted() + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        this.choose(suggestions[this.highlighted()] ?? suggestions[0]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.suggestionsClosed.set(true);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  choose(suggestion: AiInputSuggestion): void {
    const token = this.token();
    if (!token) return;
    const result = suggestion.candidate ? removeToken(this.text(), token) : insertSuggestion(this.text(), token, suggestion.value);
    if (suggestion.candidate) this.contextPicked.emit(suggestion.candidate);
    this.text.set(result.text);
    this.caret.set(result.caret);
    this.highlighted.set(0);
    const textarea = this.textarea()?.nativeElement;
    if (textarea) {
      textarea.value = result.text;
      textarea.focus();
      textarea.setSelectionRange(result.caret, result.caret);
    }
  }

  send(): void {
    if (!this.canSend()) return;
    this.submitted.emit(parseChatInput(this.text(), this.elements()));
    this.text.set('');
    this.caret.set(0);
  }

  icon(candidate: AiContextCandidate): string {
    return aiContextIcon(candidate.kind, {sourceType: candidate.sourceType});
  }

  onDragOver(event: DragEvent): void {
    if (this.disabled() || !hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    const related = event.relatedTarget as Node | null;
    if (related && (event.currentTarget as HTMLElement).contains(related)) return;
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    this.dragOver.set(false);
    if (this.disabled() || !hasFiles(event)) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) this.filesAttached.emit(files);
  }

  focus(): void {
    this.textarea()?.nativeElement.focus();
  }
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}
