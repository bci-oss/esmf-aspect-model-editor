import {ModelApiService} from '@ame/api';
import {LoadedFilesService} from '@ame/cache';
import {ExporterHelper} from '@ame/migrator';
import {RdfModelUtil} from '@ame/rdf/utils';
import {config} from '@ame/shared';
import {FileStatus} from '@ame/sidebar';
import {Injectable, inject} from '@angular/core';
import {Samm} from '@esmf/aspect-model-loader';
import {Observable, Subject, forkJoin, map, of, switchMap} from 'rxjs';
import {ModelLoaderService} from './model-loader.service';

@Injectable({
  providedIn: 'root',
})
export class ModelCheckerService {
  private modelApiService = inject(ModelApiService);
  private loadedFilesService = inject(LoadedFilesService);
  private modelLoader = inject(ModelLoaderService);

  /**
   * Gets all files from workspace and process if they have any error or missing dependencies
   *
   * @param signal used to get the current file in process
   * @returns
   */
  detectWorkspaceErrors(signal?: Subject<string>): Observable<Record<string, FileStatus>> {
    let namespacesStructure: Record<string, string[]>;

    const extractDependencies = (absoluteName: string) =>
      this.modelApiService.getAspectMetaModel(absoluteName).pipe(
        switchMap(rdf => this.modelLoader.parseRdfModel([rdf])),
        map(rdfModel => {
          const dependencies = RdfModelUtil.resolveExternalNamespaces(rdfModel)
            .map(external => external.replace(/urn:samm:|urn:bamm:|#/gi, ''))
            .filter(dependency => !`urn:samm:${dependency}`.includes(Samm.BASE_URI));

          const missingDependencies: string[] = [];

          for (const dependency of dependencies) {
            const [namespace, version] = dependency.split(':');
            if (!namespacesStructure[`${namespace}:${version}`]) missingDependencies.push(dependency);
          }
          const [, , fileName] = absoluteName.split(':');
          const status = new FileStatus(fileName);
          const currentFile = this.loadedFilesService.currentLoadedFile;

          status.dependencies = dependencies;
          status.missingDependencies = missingDependencies;
          status.unknownSammVersion = rdfModel.samm.version === 'unknown';
          status.outdated = ExporterHelper.isVersionOutdated(rdfModel.samm.version, config.currentSammVersion);
          status.loaded = currentFile?.absoluteName === absoluteName;
          status.errored = status.unknownSammVersion || Boolean(status.missingDependencies.length);

          signal?.next(absoluteName);

          return status;
        }),
      );

    return this.modelApiService.getNamespacesStructure().pipe(
      switchMap(structure => {
        namespacesStructure = structure;
        const requests = {};
        for (const namespace in structure) {
          for (const file of structure[namespace]) {
            const absoluteName = `${namespace}:${file}`;
            requests[absoluteName] = extractDependencies(absoluteName);
          }
        }

        return Object.keys(requests).length ? forkJoin(requests) : of({});
      }),
    );
  }
}
