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

import {FileContentModel} from '@ame/shared';
import {Observable} from 'rxjs';
import {
  AasImportCandidate,
  AsyncApi,
  DiagramFormat,
  ElementUsageReport,
  FileEntry,
  FileInformation,
  JavaClassesOptions,
  OpenApi,
  SqlDialect,
  ViolationError,
  WorkspaceStructure,
} from '../model-api';

/** Backend aspect model API (persistence, validation, generators). Implemented by infrastructure. */
export abstract class ModelApiPort {
  abstract checkElementExists(aspectModelUrn: string, fileName: string): Observable<boolean>;
  abstract fetchAspectMetaModel(aspectModelUrn: string): Observable<{content: string; sourceLocation: string | null}>;
  /**
   * Loads the files defining the requested elements. Elements that no workspace file defines are left out, and files
   * whose own references cannot be resolved are returned as they are, so that one broken file does not fail the request.
   */
  abstract fetchAllAspectMetaModel(fileEntries: Array<FileEntry>): Observable<Array<FileInformation>>;
  abstract fetchFormatedAspectModel(rdfContent: string, sourceLocation?: string): Observable<string>;
  /** `targetWorkspace` selects the workspace of a new file; existing files are saved where they are. */
  abstract saveAspectModel(
    rdfContent: string,
    aspectModelUrn: string,
    absoluteModelName?: string,
    targetWorkspace?: string,
  ): Observable<string>;
  abstract deleteAspectModel(aspectModelUrn: string): Observable<string>;
  abstract importPackage(file: File, workspace?: string): Observable<any>;
  /** The Aspect Models an Asset Administration Shell file (AASX, XML or JSON) would be imported as. */
  abstract previewAasImport(file: File, workspace?: string): Observable<AasImportCandidate[]>;
  /** Imports the Aspect Models of an Asset Administration Shell file; fails with 409 if a file exists already. */
  abstract importAas(file: File, workspace?: string): Observable<WorkspaceStructure>;
  /** The elements of all sources referring to the element. */
  abstract getElementUsage(aspectModelUrn: string): Observable<ElementUsageReport>;
  abstract loadNamespacesStructure(onlyAspectModel?: boolean): Observable<WorkspaceStructure>;
  abstract validate(rdfContent: string, sourceLocation?: string, validInfo?: boolean): Observable<Array<ViolationError>>;
  abstract migrateAspectModel(rdfContent: string, sourceLocation?: string): Observable<string>;
  abstract fetchAllNamespaceFilesContent(): Observable<FileContentModel[]>;
  abstract generateDocumentation(rdfContent: string, language: string, sourceLocation?: string): Observable<string>;
  abstract generateJsonSample(rdfContent: string, sourceLocation?: string): Observable<string>;
  abstract generateJsonSchema(rdfContent: string, language: string, sourceLocation?: string): Observable<string>;
  abstract generateOpenApiSpec(rdfContent: string, openApi: OpenApi, sourceLocation?: string): Observable<string>;
  abstract generateAsyncApiSpec(rdfContent: string, asyncApi: AsyncApi, sourceLocation?: string): Observable<any>;
  abstract generateAASX(rdfContent: string, sourceLocation?: string): Observable<string>;
  abstract generatetAASasXML(rdfContent: string, sourceLocation?: string): Observable<string>;
  abstract generateDiagram(rdfContent: string, language: string, format: DiagramFormat, sourceLocation?: string): Observable<Blob>;
  abstract generateSql(rdfContent: string, language: string, dialect: SqlDialect, sourceLocation?: string): Observable<string>;
  abstract generateJsonLd(rdfContent: string, sourceLocation?: string): Observable<string>;
  /** Resolves to a ZIP archive with the Java source files. */
  abstract generateJavaClasses(rdfContent: string, options: JavaClassesOptions, sourceLocation?: string): Observable<Blob>;
  /** Resolves to a sample payload in the Apache Parquet format. */
  abstract generateParquetPayload(rdfContent: string, sourceLocation?: string): Observable<Blob>;
}
