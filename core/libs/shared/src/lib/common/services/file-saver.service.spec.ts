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
import {TranslocoService} from '@jsverse/transloco';
import {saveAs} from 'file-saver';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {IPC_RENDERER} from '../tauri-ipc.provider';
import {FileSaverService} from './file-saver.service';
import {NotificationsService} from './notifications.service';

vi.mock('file-saver', () => ({saveAs: vi.fn()}));

describe('FileSaverService', () => {
  const content = new Blob(['{}'], {type: 'application/json'});
  const notifications = {error: vi.fn()};
  const transloco = {translate: vi.fn((key: string, params?: Record<string, string>) => `${key}:${params?.['fileName']}`)};

  function setup(ipcRenderer?: unknown): FileSaverService {
    TestBed.configureTestingModule({
      providers: [
        {provide: NotificationsService, useValue: notifications},
        {provide: TranslocoService, useValue: transloco},
        ...(ipcRenderer ? [{provide: IPC_RENDERER, useValue: ipcRenderer}] : []),
      ],
    });
    return TestBed.inject(FileSaverService);
  }

  afterEach(() => vi.clearAllMocks());

  it('lets the desktop app ask where to save the file', async () => {
    const ipc = {saveFile: vi.fn().mockResolvedValue('/Users/me/Movement.json')};

    await expect(setup(ipc).save(content, 'Movement.json')).resolves.toBe('/Users/me/Movement.json');

    expect(ipc.saveFile).toHaveBeenCalledWith('Movement.json', content);
    expect(saveAs).not.toHaveBeenCalled();
  });

  it('resolves to null when the user cancels the dialog', async () => {
    const ipc = {saveFile: vi.fn().mockResolvedValue(null)};

    await expect(setup(ipc).save(content, 'Movement.json')).resolves.toBeNull();
  });

  it('downloads the file in the browser', async () => {
    await expect(setup().save(content, 'Movement.json')).resolves.toBeNull();

    expect(saveAs).toHaveBeenCalledWith(content, 'Movement.json');
  });

  it('rejects when the desktop app cannot write the file', async () => {
    const ipc = {saveFile: vi.fn().mockRejectedValue(new Error('disk full'))};

    await expect(setup(ipc).save(content, 'Movement.json')).rejects.toThrow('disk full');
  });

  it('reports a failed download to the user', async () => {
    const ipc = {saveFile: vi.fn().mockRejectedValue(new Error('disk full'))};

    setup(ipc).download(content, 'Movement.json');

    await vi.waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith({
        title: 'notificationService.fileSaveFailed:Movement.json',
        message: 'disk full',
        timeout: 5000,
      }),
    );
  });

  it('reports nothing when the download succeeds', async () => {
    const ipc = {saveFile: vi.fn().mockResolvedValue('/Users/me/Movement.json')};

    setup(ipc).download(content, 'Movement.json');
    await Promise.resolve();
    await Promise.resolve();

    expect(notifications.error).not.toHaveBeenCalled();
  });
});
