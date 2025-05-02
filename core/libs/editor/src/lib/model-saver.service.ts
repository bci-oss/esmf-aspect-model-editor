import {Injectable} from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ModelSaverService {
  constructor() {}

  saveModel(model: any): void {
    // Implement logic to save the model
    console.log('Model saved:', model);
  }
}
