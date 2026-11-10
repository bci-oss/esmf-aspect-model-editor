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

import {AiContextModel, ModelSource, WorkspaceStructure} from '../../model-api';

export type AiSourceType = 'workspace' | 'github';

/** A whole source, a namespace folder (with or without its version) or a model file the user can add to the context. */
export interface AiContextCandidate {
  kind: 'model' | 'namespace' | 'source';
  /** Shown on the chip and offered for `#`, e.g. `org.example:1.0.0` or `Movement.ttl`. */
  label: string;
  /** Shown in the folder tree of the picker, e.g. `1.0.0` below `org.example`. */
  name: string;
  /** Level in the folder tree: 0 namespace, 1 version, 2 model; a source is the root above the tree. */
  depth: 0 | 1 | 2;
  /** E.g. the namespace of a file or the source of a namespace. */
  detail: string;
  contextModel: AiContextModel;
  sourceType: AiSourceType;
  readOnly: boolean;
}

/** The candidates of one source as folder tree: each namespace, its versions and their files. */
export interface AiContextCandidateGroup {
  /** The name of the source, empty when the backend does not report sources. */
  label: string;
  path?: string;
  sourceType: AiSourceType;
  readOnly: boolean;
  /** Adds all models of the source, only when the backend reports the path of the source. */
  sourceCandidate?: AiContextCandidate;
  candidates: AiContextCandidate[];
}

interface SourceBucket {
  source?: ModelSource;
  namespaces: Map<string, {namespace: string; version: string; files: string[]}>;
}

/** Groups the namespaces of all sources into candidates for the context, sorted by name. */
export function aiContextCandidates(structure: WorkspaceStructure | null | undefined): AiContextCandidateGroup[] {
  const buckets = new Map<string, SourceBucket>();
  for (const [namespace, versions] of Object.entries(structure ?? {})) {
    for (const {version, models} of versions ?? []) {
      for (const model of models ?? []) {
        const key = model.source?.path ?? '';
        const bucket = buckets.get(key) ?? {source: model.source, namespaces: new Map()};
        buckets.set(key, bucket);
        const namespaceKey = `${namespace}:${version}`;
        const entry = bucket.namespaces.get(namespaceKey) ?? {namespace, version, files: []};
        bucket.namespaces.set(namespaceKey, entry);
        if (!entry.files.includes(model.name)) entry.files.push(model.name);
      }
    }
  }

  return [...buckets.values()]
    .map(bucket => toGroup(bucket))
    .sort((a, b) => Number(a.readOnly) - Number(b.readOnly) || a.label.localeCompare(b.label));
}

function toGroup({source, namespaces}: SourceBucket): AiContextCandidateGroup {
  const sourceType: AiSourceType = source?.type === 'github' ? 'github' : 'workspace';
  const readOnly = !!source?.readOnly;
  const sourcePath = source?.path;
  const sourceName = source?.name ?? '';
  const candidates: AiContextCandidate[] = [];
  const withSource = (model: AiContextModel): AiContextModel => (sourcePath ? {sourcePath, ...model} : model);
  const candidate = (
    kind: AiContextCandidate['kind'],
    label: string,
    name: string,
    depth: AiContextCandidate['depth'],
    detail: string,
    model: AiContextModel,
  ) => candidates.push({kind, label, name, depth, detail, contextModel: withSource(model), sourceType, readOnly});

  const sorted = [...namespaces.values()].sort((a, b) => a.namespace.localeCompare(b.namespace) || a.version.localeCompare(b.version));
  let previousNamespace: string | undefined;
  for (const {namespace, version, files} of sorted) {
    if (namespace !== previousNamespace) {
      candidate('namespace', namespace, namespace, 0, sourceName, {namespace});
      previousNamespace = namespace;
    }
    const versionLabel = `${namespace}:${version}`;
    candidate('namespace', versionLabel, version, 1, namespace, {namespace, version});
    for (const fileName of [...files].sort((a, b) => a.localeCompare(b))) {
      candidate('model', fileName, fileName, 2, versionLabel, {namespace, version, fileName});
    }
  }
  const sourceCandidate: AiContextCandidate | undefined = sourcePath
    ? {
        kind: 'source',
        label: sourceName || sourcePath,
        name: sourceName || sourcePath,
        depth: 0,
        detail: sourcePath,
        contextModel: {sourcePath},
        sourceType,
        readOnly,
      }
    : undefined;
  return {
    label: sourceName,
    ...(sourcePath ? {path: sourcePath} : {}),
    sourceType,
    readOnly,
    ...(sourceCandidate ? {sourceCandidate} : {}),
    candidates,
  };
}

/**
 * Keeps the candidates whose label or detail contains the query together with their parent folders, so the tree stays readable;
 * a group whose name matches keeps all candidates and groups without candidates are left out.
 */
export function filterContextCandidates(groups: AiContextCandidateGroup[], query: string): AiContextCandidateGroup[] {
  const lower = query.trim().toLowerCase();
  if (!lower) return groups;
  const matches = (candidate: AiContextCandidate) =>
    candidate.label.toLowerCase().includes(lower) || candidate.detail.toLowerCase().includes(lower);
  return groups
    .map(group => {
      if (group.label.toLowerCase().includes(lower)) return group;
      const kept: AiContextCandidate[] = [];
      const parents: AiContextCandidate[] = [];
      for (const candidate of group.candidates) {
        parents.length = candidate.depth;
        if (matches(candidate)) {
          for (const parent of parents) if (parent && !kept.includes(parent)) kept.push(parent);
          kept.push(candidate);
        }
        parents.push(candidate);
      }
      return {...group, candidates: kept};
    })
    .filter(group => group.candidates.length > 0);
}

/** Whether both describe the same models. */
export function sameContextModel(a: AiContextModel | undefined, b: AiContextModel | undefined): boolean {
  if (!a || !b) return false;
  return a.sourcePath === b.sourcePath && a.namespace === b.namespace && a.version === b.version && a.fileName === b.fileName;
}
