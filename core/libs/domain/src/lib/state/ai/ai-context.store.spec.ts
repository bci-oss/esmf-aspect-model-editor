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

import {TestBed} from '@angular/core/testing';
import {of, Subject, throwError} from 'rxjs';
import {beforeEach, describe, expect, it} from 'vitest';
import {AiAttachment, AiChatContext} from '../../model-api';
import {AiContextStore} from './ai-context.store';
import {AiErrorStore} from './ai-error.store';
import {setupAiStoreTest} from './ai-stores.fixture';

describe('AiContextStore', () => {
  let store: AiContextStore;
  let errors: AiErrorStore;
  let fixture: ReturnType<typeof setupAiStoreTest>;

  const attachment: AiAttachment = {id: 'a1', name: 'spec.pdf', kind: 'pdf', size: 10, characters: 100, pages: 2, truncated: false};
  const pdf = () => new File(['%PDF'], 'spec.pdf', {type: 'application/pdf'});
  const build = (mentionedElementUrns?: string[]) => {
    let context: AiChatContext | undefined;
    store.build({message: 'Hi', mentionedElementUrns}, ['en']).subscribe(value => (context = value));
    return context;
  };

  beforeEach(() => {
    fixture = setupAiStoreTest();
    store = TestBed.inject(AiContextStore);
    errors = TestBed.inject(AiErrorStore);
  });

  it('shows a chip while a file is uploaded and replaces it by the attachment', () => {
    store.attachFiles([pdf()]);
    expect(fixture.api.uploadAttachment).toHaveBeenCalledTimes(1);
    expect(store.items()[0]).toMatchObject({kind: 'file', label: 'spec.pdf', uploading: true});
    expect(store.uploading()).toBe(true);

    fixture.upload$.next(attachment);
    fixture.upload$.complete();
    expect(store.items()[0]).toMatchObject({kind: 'file', label: 'spec.pdf', attachment});
    expect(store.items()[0].uploading).toBeFalsy();
    expect(store.uploading()).toBe(false);
  });

  it('removes the chip and shows the error when the upload fails', () => {
    store.attachFiles([pdf()]);
    fixture.upload$.error({code: 'attachment_unreadable', message: 'Broken'});
    expect(store.items()).toEqual([]);
    expect(errors.error()).toEqual({code: 'attachment_unreadable', message: 'Broken'});
  });

  it('refuses unsupported and too large files without uploading them', () => {
    store.attachFiles([new File(['x'], 'tool.exe')]);
    expect(errors.error()?.code).toBe('attachment_unsupported');
    const large = new File(['x'], 'large.pdf');
    Object.defineProperty(large, 'size', {value: 21 * 1024 * 1024});
    store.attachFiles([large]);
    expect(errors.error()?.code).toBe('attachment_too_large');
    expect(fixture.api.uploadAttachment).not.toHaveBeenCalled();
    expect(store.items()).toEqual([]);
  });

  it('deletes the attachment when its chip is removed, also while it is uploaded', () => {
    store.attachFiles([pdf()]);
    fixture.upload$.next(attachment);
    store.removeItem(store.items()[0].id);
    expect(fixture.api.deleteAttachment).toHaveBeenCalledWith('a1');

    const second$ = new Subject<AiAttachment>();
    fixture.api.uploadAttachment.mockReturnValueOnce(second$);
    store.attachFiles([pdf()]);
    store.removeItem(store.items()[0].id);
    second$.next({...attachment, id: 'a2'});
    expect(fixture.api.deleteAttachment).toHaveBeenCalledWith('a2');
    expect(store.items()).toEqual([]);
  });

  it('ignores errors when deleting an attachment', () => {
    fixture.api.deleteAttachment.mockReturnValueOnce(throwError(() => ({code: 'offline', message: 'x'})));
    store.attachFiles([pdf()]);
    fixture.upload$.next(attachment);
    store.removeItem(store.items()[0].id);
    expect(errors.error()).toBeNull();
  });

  it('adds models, namespaces and sources only once', () => {
    store.addModel({sourcePath: '/ws', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl'}, 'Movement.ttl');
    store.addModel({sourcePath: '/ws', namespace: 'org.example', version: '1.0.0', fileName: 'Movement.ttl'}, 'Movement.ttl');
    store.addModel({sourcePath: '/ws', namespace: 'org.example', version: '1.0.0'}, 'org.example:1.0.0');
    store.addModel({sourcePath: '/ws'}, 'ws', {sourceType: 'workspace', detail: '/ws'});
    store.addModel({}, 'nothing');
    expect(store.items().map(item => item.kind)).toEqual(['model', 'namespace', 'source']);
    expect(store.items()[2]).toMatchObject({sourceType: 'workspace', detail: '/ws'});
  });

  it('adds elements once and errors', () => {
    store.addElement('urn:samm:x:1.0.0#speed');
    store.addElement('urn:samm:x:1.0.0#speed');
    store.addError({message: 'Missing unit', focusNode: 'urn:samm:x:1.0.0#b'});
    expect(store.items()).toMatchObject([
      {kind: 'element', label: 'speed', urn: 'urn:samm:x:1.0.0#speed'},
      {kind: 'error', label: 'Missing unit', urn: 'urn:samm:x:1.0.0#b'},
    ]);
  });

  it('replaces only elements and errors by those of an editor action', () => {
    store.addModel({sourcePath: '/ws'}, 'ws');
    store.addElement('urn:samm:x:1.0.0#a');
    store.addError({message: 'Old'});
    store.replaceEditorItems({message: 'Describe it', elementUrns: ['urn:samm:x:1.0.0#speed']});
    expect(store.items().map(item => item.kind)).toEqual(['source', 'element']);
    expect(store.items()[1].label).toBe('speed');
  });

  it('loads the candidates of the workspace', () => {
    store.loadCandidates();
    expect(fixture.modelApi.loadNamespacesStructure).toHaveBeenCalled();
    expect(store.candidates()[0].candidates.map(candidate => candidate.kind)).toEqual(['namespace', 'namespace', 'model']);
    expect(store.candidatesLoading()).toBe(false);

    store.addCandidate(store.candidates()[0].candidates[2]);
    expect(store.items()[0]).toMatchObject({kind: 'model', label: 'Movement.ttl', detail: 'org.example:1.0.0'});
  });

  it('offers no candidates when the workspace cannot be loaded', () => {
    fixture.modelApi.loadNamespacesStructure.mockReturnValueOnce(throwError(() => new Error('down')));
    store.loadCandidates();
    expect(store.candidates()).toEqual([]);
  });

  describe('context of a message', () => {
    it('contains the open model, the selection, the mentions, the attachments and the models', () => {
      fixture.editor.selectedElementUrn.set('urn:samm:x:1.0.0#a');
      store.addElement('urn:samm:x:1.0.0#b');
      store.attachFiles([pdf()]);
      fixture.upload$.next(attachment);
      store.addModel({sourcePath: '/ws', namespace: 'org.example', version: '1.0.0'}, 'org.example:1.0.0');
      expect(build(['urn:samm:x:1.0.0#b', 'urn:samm:x:1.0.0#c'])).toEqual({
        modelTurtle: '@prefix',
        modelUrn: 'urn:samm:org.example:1.0.0#Movement',
        languages: ['en'],
        selectedElementUrn: 'urn:samm:x:1.0.0#a',
        mentionedElementUrns: ['urn:samm:x:1.0.0#b', 'urn:samm:x:1.0.0#c'],
        attachmentIds: ['a1'],
        contextModels: [{sourcePath: '/ws', namespace: 'org.example', version: '1.0.0'}],
      });
      expect(store.refs()).toEqual([
        {kind: 'file', label: 'spec.pdf'},
        {kind: 'namespace', label: 'org.example:1.0.0'},
      ]);
    });

    it('leaves out the model and the selection when removed from the context', () => {
      fixture.editor.selectedElementUrn.set('urn:samm:x:1.0.0#a');
      store.setIncludeModel(false);
      store.excludeSelection();
      expect(store.selectedElementUrn()).toBeNull();
      store.addError({message: 'Missing unit', focusNode: 'urn:samm:x:1.0.0#b'});
      expect(build()).toEqual({languages: ['en'], validationErrors: [{message: 'Missing unit', focusNode: 'urn:samm:x:1.0.0#b'}]});
      expect(fixture.editor.currentContext).not.toHaveBeenCalled();

      fixture.editor.selectedElementUrn.set('urn:samm:x:1.0.0#c');
      expect(store.selectedElementUrn()).toBe('urn:samm:x:1.0.0#c');
    });

    it('drops the model of the editor when it cannot be read', () => {
      fixture.editor.currentContext.mockReturnValueOnce(throwError(() => new Error('broken')) as never);
      expect(build()).toEqual({languages: ['en']});
    });

    it('drops a selection the editor context contains when nothing is selected', () => {
      fixture.editor.currentContext.mockReturnValueOnce(of({selectedElementUrn: 'urn:samm:x:1.0.0#old'}) as never);
      expect(build()).toEqual({languages: ['en']});
    });
  });

  it('gives access to the elements of the editor', () => {
    expect(store.openModel()).toEqual({label: 'Movement.ttl', readOnly: false});
    expect(store.modelElements()).toEqual([]);
    store.navigateToElement('urn:samm:x:1.0.0#a');
    expect(fixture.editor.navigateToElement).toHaveBeenCalledWith('urn:samm:x:1.0.0#a');
  });
});
