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
import {
  buildExternalEditorUrl,
  DEFAULT_EXTERNAL_EDITOR,
  EXTERNAL_EDITOR_CLI,
  EXTERNAL_EDITOR_NAMES,
  EXTERNAL_EDITORS,
  fileUriToPath,
  isExternalEditor,
  parentDirectory,
  resolveExternalEditor,
  withExternalEditorMenuLabels,
} from './external-editor';

describe('external-editor', () => {
  describe('editor metadata', () => {
    it('defines display and CLI names for every editor', () => {
      expect(EXTERNAL_EDITORS).toEqual(['vscode', 'vscode-insiders', 'cursor', 'vscodium']);
      expect(DEFAULT_EXTERNAL_EDITOR).toBe('vscode');
      expect(EXTERNAL_EDITORS.map(editor => EXTERNAL_EDITOR_NAMES[editor])).toEqual(['VS Code', 'VS Code Insiders', 'Cursor', 'VSCodium']);
      expect(EXTERNAL_EDITORS.map(editor => EXTERNAL_EDITOR_CLI[editor])).toEqual(['code', 'code-insiders', 'cursor', 'codium']);
    });

    it('recognizes supported editors only', () => {
      expect(isExternalEditor('cursor')).toBe(true);
      expect(isExternalEditor('notepad')).toBe(false);
      expect(isExternalEditor(undefined)).toBe(false);
    });

    it('falls back to the default editor for unknown values', () => {
      expect(resolveExternalEditor('vscodium')).toBe('vscodium');
      expect(resolveExternalEditor('emacs')).toBe('vscode');
      expect(resolveExternalEditor(null)).toBe('vscode');
    });
  });

  describe('buildExternalEditorUrl', () => {
    describe('macOS and Linux paths', () => {
      it('builds the URL of an absolute path', () => {
        expect(buildExternalEditorUrl('vscode', '/Users/me/ws/a.ttl')).toBe('vscode://file/Users/me/ws/a.ttl');
        expect(buildExternalEditorUrl('vscode', '/home/me/ws/a.ttl')).toBe('vscode://file/home/me/ws/a.ttl');
      });

      it('percent-encodes spaces and reserved characters per segment', () => {
        expect(buildExternalEditorUrl('vscode', '/Users/a b/x.ttl')).toBe('vscode://file/Users/a%20b/x.ttl');
        expect(buildExternalEditorUrl('vscode', '/ws/#1/100%/what?.ttl')).toBe('vscode://file/ws/%231/100%25/what%3F.ttl');
      });

      it('percent-encodes unicode characters', () => {
        expect(buildExternalEditorUrl('vscode', '/home/jürgen/模型.ttl')).toBe('vscode://file/home/j%C3%BCrgen/%E6%A8%A1%E5%9E%8B.ttl');
      });

      it('drops trailing and duplicate separators of folders', () => {
        expect(buildExternalEditorUrl('vscode', '/home/me//ws/')).toBe('vscode://file/home/me/ws');
      });

      it('encodes colons of file names so that they are not mistaken for a position', () => {
        expect(buildExternalEditorUrl('vscode', '/ws/a:b.ttl', {line: 2})).toBe('vscode://file/ws/a%3Ab.ttl:2');
      });
    });

    describe('Windows paths', () => {
      it('converts drive paths with backslashes', () => {
        expect(buildExternalEditorUrl('vscode', 'C:\\ws\\a.ttl')).toBe('vscode://file/C:/ws/a.ttl');
      });

      it('converts drive paths with forward slashes, also with a leading slash', () => {
        expect(buildExternalEditorUrl('vscode', 'C:/ws/a.ttl')).toBe('vscode://file/C:/ws/a.ttl');
        expect(buildExternalEditorUrl('vscode', '/d:/ws/a.ttl')).toBe('vscode://file/d:/ws/a.ttl');
      });

      it('keeps the drive colon but encodes the remaining segments', () => {
        expect(buildExternalEditorUrl('vscode', 'C:\\Program Files\\a#b.ttl')).toBe('vscode://file/C:/Program%20Files/a%23b.ttl');
      });

      it('opens the root of a drive', () => {
        expect(buildExternalEditorUrl('vscode', 'C:\\')).toBe('vscode://file/C:');
      });

      it('converts UNC paths', () => {
        expect(buildExternalEditorUrl('vscode', '\\\\server\\share\\a.ttl')).toBe('vscode://file//server/share/a.ttl');
        expect(buildExternalEditorUrl('vscode', '//server/share/my ws')).toBe('vscode://file//server/share/my%20ws');
      });
    });

    describe('position', () => {
      it('appends line and column', () => {
        expect(buildExternalEditorUrl('vscode', '/ws/a.ttl', {line: 12, column: 3})).toBe('vscode://file/ws/a.ttl:12:3');
        expect(buildExternalEditorUrl('vscode', 'C:\\ws\\a.ttl', {line: 1, column: 1})).toBe('vscode://file/C:/ws/a.ttl:1:1');
      });

      it('appends only the line without a valid column', () => {
        expect(buildExternalEditorUrl('vscode', '/ws/a.ttl', {line: 12})).toBe('vscode://file/ws/a.ttl:12');
        expect(buildExternalEditorUrl('vscode', '/ws/a.ttl', {line: 12, column: 0})).toBe('vscode://file/ws/a.ttl:12');
      });

      it('ignores invalid lines', () => {
        expect(buildExternalEditorUrl('vscode', '/ws/a.ttl', {line: 0, column: 4})).toBe('vscode://file/ws/a.ttl');
        expect(buildExternalEditorUrl('vscode', '/ws/a.ttl', {line: -1})).toBe('vscode://file/ws/a.ttl');
        expect(buildExternalEditorUrl('vscode', '/ws/a.ttl', {line: 1.5})).toBe('vscode://file/ws/a.ttl');
        expect(buildExternalEditorUrl('vscode', '/ws/a.ttl', {line: Number.NaN})).toBe('vscode://file/ws/a.ttl');
      });
    });

    it('uses the scheme of the chosen editor', () => {
      expect(buildExternalEditorUrl('vscode-insiders', '/ws/a.ttl')).toBe('vscode-insiders://file/ws/a.ttl');
      expect(buildExternalEditorUrl('cursor', '/ws/a.ttl')).toBe('cursor://file/ws/a.ttl');
      expect(buildExternalEditorUrl('vscodium', '/ws/a.ttl')).toBe('vscodium://file/ws/a.ttl');
    });
  });

  describe('fileUriToPath', () => {
    it('converts Windows file URIs', () => {
      expect(fileUriToPath('file:///C:/x%20y/a.ttl')).toBe('C:/x y/a.ttl');
      expect(fileUriToPath('file:/C:/ws/a.ttl')).toBe('C:/ws/a.ttl');
    });

    it('converts macOS and Linux file URIs', () => {
      expect(fileUriToPath('file:/Users/x/a.ttl')).toBe('/Users/x/a.ttl');
      expect(fileUriToPath('file:///home/x/my%20ws/a.ttl')).toBe('/home/x/my ws/a.ttl');
      expect(fileUriToPath('file://localhost/home/x/a.ttl')).toBe('/home/x/a.ttl');
    });

    it('converts UNC file URIs', () => {
      expect(fileUriToPath('file://server/share/a.ttl')).toBe('//server/share/a.ttl');
    });

    it('decodes unicode and keeps invalid escape sequences', () => {
      expect(fileUriToPath('file:///home/j%C3%BCrgen/a.ttl')).toBe('/home/jürgen/a.ttl');
      expect(fileUriToPath('file:///home/100%/a.ttl')).toBe('/home/100%/a.ttl');
    });

    it('returns other values unchanged', () => {
      expect(fileUriToPath('/home/x/a.ttl')).toBe('/home/x/a.ttl');
      expect(fileUriToPath('https://github.com/a.ttl')).toBe('https://github.com/a.ttl');
    });
  });

  describe('parentDirectory', () => {
    it('returns the parent of macOS and Linux paths', () => {
      expect(parentDirectory('/Users/me/ws/a.ttl')).toBe('/Users/me/ws');
      expect(parentDirectory('/Users/me/ws/')).toBe('/Users/me');
      expect(parentDirectory('/a.ttl')).toBe('/');
      expect(parentDirectory('/')).toBe('/');
    });

    it('returns the parent of Windows paths', () => {
      expect(parentDirectory('C:\\ws\\org.example\\1.0.0\\a.ttl')).toBe('C:\\ws\\org.example\\1.0.0');
      expect(parentDirectory('C:/ws/a.ttl')).toBe('C:/ws');
      expect(parentDirectory('C:\\a.ttl')).toBe('C:\\');
      expect(parentDirectory('C:\\')).toBe('C:\\');
      expect(parentDirectory('\\\\server\\share\\a.ttl')).toBe('\\\\server\\share');
    });

    it('returns an empty string for a plain file name', () => {
      expect(parentDirectory('a.ttl')).toBe('');
    });
  });

  describe('withExternalEditorMenuLabels', () => {
    it('replaces the editor placeholder in the menu labels only', () => {
      const translation = {
        menu: {file: {openInExternalEditor: 'Open in {{editor}}', save: 'Save'}, edit: {nested: {label: '{{ editor }}!'}}},
        externalEditor: {openIn: 'Open in {{editor}}'},
      };

      const result = withExternalEditorMenuLabels(translation, 'Cursor');

      expect(result.menu.file).toEqual({openInExternalEditor: 'Open in Cursor', save: 'Save'});
      expect(result.menu.edit.nested.label).toBe('Cursor!');
      expect(result.externalEditor.openIn).toBe('Open in {{editor}}');
      expect(translation.menu.file.openInExternalEditor).toBe('Open in {{editor}}');
    });

    it('returns translations without menu unchanged', () => {
      const translation = {other: 'x'};
      expect(withExternalEditorMenuLabels(translation, 'VS Code')).toBe(translation);
      expect(withExternalEditorMenuLabels(null, 'VS Code')).toBeNull();
    });
  });
});
