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
import {ModelData, ModelSource, WorkspaceStructure} from '../../model-api';
import {aiContextCandidates, filterContextCandidates, sameContextModel} from './ai-context-candidates';

const workspace: ModelSource = {type: 'workspace', id: '/home/ws', name: 'ws', path: '/home/ws', readOnly: false, defaultWorkspace: true};
const github: ModelSource = {
  type: 'github',
  id: 'gh1',
  name: 'eclipse/models@main',
  path: '/cache/gh1',
  readOnly: true,
  defaultWorkspace: false,
};

const model = (name: string, source?: ModelSource): ModelData => ({
  name,
  existing: true,
  version: '1.0.0',
  aspectModelUrn: `urn:samm:x:1.0.0#${name}`,
  ...(source ? {source} : {}),
});

describe('aiContextCandidates', () => {
  const structure: WorkspaceStructure = {
    'org.b': [{version: '1.0.0', models: [model('B.ttl', workspace)]}],
    'org.a': [
      {version: '2.0.0', models: [model('Z.ttl', workspace), model('A.ttl', workspace), model('Shared.ttl', github)]},
      {version: '1.0.0', models: [model('Old.ttl', workspace)]},
    ],
  };

  it('builds a folder tree of namespace, version and files per source, writable sources first', () => {
    const groups = aiContextCandidates(structure);
    expect(groups.map(group => [group.label, group.sourceType, group.readOnly])).toEqual([
      ['ws', 'workspace', false],
      ['eclipse/models@main', 'github', true],
    ]);
    expect(groups[0].candidates.map(candidate => `${candidate.depth}:${candidate.kind}:${candidate.name}`)).toEqual([
      '0:namespace:org.a',
      '1:namespace:1.0.0',
      '2:model:Old.ttl',
      '1:namespace:2.0.0',
      '2:model:A.ttl',
      '2:model:Z.ttl',
      '0:namespace:org.b',
      '1:namespace:1.0.0',
      '2:model:B.ttl',
    ]);
    expect(groups.flatMap(group => group.candidates).some(candidate => candidate.kind !== 'model' && candidate.kind !== 'namespace')).toBe(
      false,
    );
  });

  it('describes the models of each candidate', () => {
    const [ws, gh] = aiContextCandidates(structure);
    expect(ws.candidates[0]).toMatchObject({label: 'org.a', detail: 'ws', contextModel: {sourcePath: '/home/ws', namespace: 'org.a'}});
    expect(ws.candidates[0].contextModel.version).toBeUndefined();
    expect(ws.candidates[1]).toMatchObject({
      label: 'org.a:1.0.0',
      detail: 'org.a',
      contextModel: {sourcePath: '/home/ws', namespace: 'org.a', version: '1.0.0'},
    });
    expect(ws.candidates[2]).toMatchObject({
      label: 'Old.ttl',
      detail: 'org.a:1.0.0',
      contextModel: {sourcePath: '/home/ws', namespace: 'org.a', version: '1.0.0', fileName: 'Old.ttl'},
    });
    expect(gh.candidates.every(candidate => candidate.readOnly && candidate.sourceType === 'github')).toBe(true);
  });

  it('offers each source with a path as a whole', () => {
    const [ws, gh] = aiContextCandidates(structure);
    expect(ws.sourceCandidate).toMatchObject({
      kind: 'source',
      label: 'ws',
      detail: '/home/ws',
      contextModel: {sourcePath: '/home/ws'},
      sourceType: 'workspace',
      readOnly: false,
    });
    expect(gh.sourceCandidate).toMatchObject({kind: 'source', sourceType: 'github', readOnly: true});
    expect(aiContextCandidates({'org.c': [{version: '1.0.0', models: [model('C.ttl')]}]})[0].sourceCandidate).toBeUndefined();
  });

  it('handles models without source and empty structures', () => {
    const groups = aiContextCandidates({'org.c': [{version: '1.0.0', models: [model('C.ttl')]}]});
    expect(groups).toHaveLength(1);
    expect(groups[0].path).toBeUndefined();
    expect(groups[0].candidates.map(candidate => candidate.kind)).toEqual(['namespace', 'namespace', 'model']);
    expect(groups[0].candidates[2].contextModel).toEqual({namespace: 'org.c', version: '1.0.0', fileName: 'C.ttl'});
    expect(aiContextCandidates(null)).toEqual([]);
    expect(aiContextCandidates({})).toEqual([]);
  });

  it('filters by label and detail, keeps the parent folders and leaves out empty groups', () => {
    const groups = aiContextCandidates(structure);
    expect(filterContextCandidates(groups, '  ')).toBe(groups);
    const shared = filterContextCandidates(groups, 'shared');
    expect(shared).toHaveLength(1);
    expect(shared[0].candidates.map(candidate => candidate.label)).toEqual(['org.a', 'org.a:2.0.0', 'Shared.ttl']);
    const byNamespace = filterContextCandidates(groups, 'ORG.B');
    expect(byNamespace[0].candidates.map(candidate => candidate.label)).toEqual(['org.b', 'org.b:1.0.0', 'B.ttl']);
    const byFile = filterContextCandidates(groups, 'z.ttl');
    expect(byFile[0].candidates.map(candidate => candidate.label)).toEqual(['org.a', 'org.a:2.0.0', 'Z.ttl']);
    expect(filterContextCandidates(groups, 'nothing')).toEqual([]);
    const bySource = filterContextCandidates(groups, 'eclipse/models');
    expect(bySource).toHaveLength(1);
    expect(bySource[0]).toBe(groups[1]);
  });

  it('compares context models', () => {
    expect(sameContextModel({namespace: 'a', version: '1'}, {namespace: 'a', version: '1'})).toBe(true);
    expect(sameContextModel({namespace: 'a', version: '1'}, {namespace: 'a', version: '1', fileName: 'x'})).toBe(false);
    expect(sameContextModel(undefined, {namespace: 'a'})).toBe(false);
  });
});
