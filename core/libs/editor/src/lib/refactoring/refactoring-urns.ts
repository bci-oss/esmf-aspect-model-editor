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

import {RefactoringHistoryEntry, RefactoringRequest} from '@ame/domain';

const ELEMENT_URN = /^urn:samm:(.+):([^:#]+)#(.+)$/;

/** The parts of an element URN `urn:samm:<namespace>:<version>#<name>`. */
export interface ElementUrn {
  namespace: string;
  version: string;
  name: string;
}

export function parseElementUrn(urn: string | undefined | null): ElementUrn | null {
  const match = urn ? ELEMENT_URN.exec(urn) : null;
  return match ? {namespace: match[1], version: match[2], name: match[3]} : null;
}

export function elementUrn({namespace, version, name}: ElementUrn): string {
  return `urn:samm:${namespace}:${version}#${name}`;
}

/** The URN an element has after the refactoring; unchanged if the refactoring does not affect it or is unknown. */
export function relocatedUrn(urn: string, request: RefactoringRequest | undefined): string {
  const element = parseElementUrn(urn);
  if (!element || !request) return urn;

  switch (request.type) {
    case 'RENAME_ELEMENT':
      return urn === request.urn && request.newName ? elementUrn({...element, name: request.newName}) : urn;
    case 'MOVE_ELEMENT':
      return urn === request.urn
        ? elementUrn({
            ...element,
            namespace: request.targetNamespace || element.namespace,
            version: request.targetVersion || element.version,
          })
        : urn;
    case 'RENAME_NAMESPACE':
      return element.namespace === request.namespace && element.version === request.version
        ? elementUrn({
            ...element,
            namespace: request.targetNamespace || element.namespace,
            version: request.targetVersion || element.version,
          })
        : urn;
    default:
      return urn;
  }
}

/** The request that moves the URNs back; used to follow the open models when a refactoring is reverted. */
export function inverseRequest(request: RefactoringRequest): RefactoringRequest {
  const element = parseElementUrn(request.urn);
  switch (request.type) {
    case 'RENAME_ELEMENT':
      return element && request.newName
        ? {type: request.type, urn: elementUrn({...element, name: request.newName}), newName: element.name}
        : request;
    case 'MOVE_ELEMENT':
      return element
        ? {
            type: request.type,
            urn: relocatedUrn(elementUrn(element), request),
            targetNamespace: element.namespace,
            targetVersion: element.version,
          }
        : request;
    case 'RENAME_NAMESPACE':
      return {
        type: request.type,
        namespace: request.targetNamespace,
        version: request.targetVersion,
        targetNamespace: request.namespace,
        targetVersion: request.version,
      };
    case 'MOVE_FILE':
      return {
        type: request.type,
        namespace: request.targetNamespace,
        version: request.targetVersion,
        fileName: request.targetFileName || request.fileName,
        targetNamespace: request.namespace,
        targetVersion: request.version,
        targetFileName: request.fileName,
      };
    default:
      return request;
  }
}

/**
 * The URN of an element of a file that moved to another namespace version; unchanged for elements of other namespaces.
 * Covers moved files whose elements are not known from the request, e.g. `MOVE_FILE`.
 */
export function urnOfMovedFile(
  urn: string,
  from: Pick<ElementUrn, 'namespace' | 'version'>,
  to: Pick<ElementUrn, 'namespace' | 'version'>,
): string {
  const element = parseElementUrn(urn);
  return element && element.namespace === from.namespace && element.version === from.version
    ? elementUrn({...element, namespace: to.namespace, version: to.version})
    : urn;
}

/** A revert removes the created files and restores the removed ones. */
export function inverseChange(entry: RefactoringHistoryEntry): RefactoringHistoryEntry {
  return {...entry, created: entry.removed, removed: entry.created};
}
