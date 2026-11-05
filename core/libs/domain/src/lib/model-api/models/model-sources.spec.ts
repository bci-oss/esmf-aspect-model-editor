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
import {describeSourceError, isInSource, normalizeSourcePath, parseGithubRepositoryUrl} from './model-sources';

describe('parseGithubRepositoryUrl', () => {
  it('parses the owner/repo shorthand', () => {
    expect(parseGithubRepositoryUrl('eclipse-esmf/esmf-sdk')).toEqual({host: 'github.com', owner: 'eclipse-esmf', repository: 'esmf-sdk'});
  });

  it('parses repository URLs with .git suffix and trailing slashes', () => {
    expect(parseGithubRepositoryUrl(' https://github.com/org/repo.git ')).toEqual({host: 'github.com', owner: 'org', repository: 'repo'});
    expect(parseGithubRepositoryUrl('github.com/org/repo/')).toEqual({host: 'github.com', owner: 'org', repository: 'repo'});
  });

  it('takes ref and directory from tree URLs', () => {
    expect(parseGithubRepositoryUrl('https://GitHub.example.com/org/repo/tree/v1.2/models/aspects')).toEqual({
      host: 'github.example.com',
      owner: 'org',
      repository: 'repo',
      ref: 'v1.2',
      directory: 'models/aspects',
    });
  });

  it('parses SSH URLs', () => {
    expect(parseGithubRepositoryUrl('git@github.com:org/repo.git')).toEqual({host: 'github.com', owner: 'org', repository: 'repo'});
  });

  it('rejects input without owner and repository', () => {
    expect(parseGithubRepositoryUrl('')).toBeNull();
    expect(parseGithubRepositoryUrl('https://github.com/org')).toBeNull();
    expect(parseGithubRepositoryUrl('not a url')).toBeNull();
  });
});

describe('normalizeSourcePath', () => {
  it('converts file URIs and removes trailing slashes', () => {
    expect(normalizeSourcePath('file:///home/user/models/')).toBe('/home/user/models');
    expect(normalizeSourcePath('file:/home/user/my%20models')).toBe('/home/user/my models');
  });

  it('normalizes Windows paths case-insensitively', () => {
    expect(normalizeSourcePath('file:///C:/Users/Me/Models')).toBe('c:/users/me/models');
    expect(normalizeSourcePath('C:\\Users\\Me\\Models\\')).toBe('c:/users/me/models');
  });

  it('returns an empty string for missing input', () => {
    expect(normalizeSourcePath(undefined)).toBe('');
  });
});

describe('isInSource', () => {
  it('matches files inside the source but not sibling folders with the same prefix', () => {
    const source = {path: '/home/user/models'};
    expect(isInSource(source, 'file:///home/user/models/org.a/1.0.0/A.ttl')).toBe(true);
    expect(isInSource(source, '/home/user/models-old/org.a/1.0.0/A.ttl')).toBe(false);
    expect(isInSource(source, null)).toBe(false);
  });

  it('compares Windows paths case-insensitively', () => {
    expect(isInSource({path: 'C:\\Models'}, 'file:///c:/models/org.a/1.0.0/A.ttl')).toBe(true);
  });
});

describe('describeSourceError', () => {
  it('reads the backend error body, plain strings and errors', () => {
    expect(describeSourceError({error: {error: {message: 'Not found'}}})).toBe('Not found');
    expect(describeSourceError('keychain locked')).toBe('keychain locked');
    expect(describeSourceError(new Error('boom'))).toBe('boom');
    expect(describeSourceError(null)).toBe('');
  });
});
