import {ModelApiService} from '@ame/api';
import {Injectable, inject} from '@angular/core';
import {map} from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ModelCheckerService {
  private modelApiService = inject(ModelApiService);

  /**
   * Gets all files from workspace
   *
   * @returns all namespaces and their file information
   */
  detectWorkspace() {
    return this.modelApiService.getNamespacesStructure().pipe(
      map(structure => {
        const requests = {};
        for (const namespace in structure) {
          for (const element of structure[namespace]) {
            const elementType = element as any;
            for (const value of elementType.models) {
              const fileInformation = {namespace: namespace, model: value.model, version: elementType.version};
              requests[value.aspectModelUrn] = fileInformation;
            }
          }
        }

        return requests;
      }),
    );
  }
}
