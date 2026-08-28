import {describe, expect, it} from 'vitest';
import * as models from './index';

describe('models index', () => {
  it('should export all model definitions and types', () => {
    expect(models.ModelInfo).toBeDefined();
    expect(models.ModelStyle).toBeDefined();
    expect(models.ModelStyleResolver).toBeDefined();
    expect(models.EdgeStyles).toBeDefined();
  });
});
