import {Store} from 'n3';
import {createAspect, createEntity, createEvent, getEvents, getPropertyInstantiator} from './instantiator';
import {BaseInitProps} from './shared/base-init-props';
import {ModelElementCache} from './shared/model-element-cache.service';
import {RdfModel} from './shared/rdf-model';

export function useLoader(init: BaseInitProps) {
  const rdfModel = init.rdfModel || new RdfModel(new Store());
  const cache = init.cache || new ModelElementCache();
  const baseInit: BaseInitProps = {rdfModel, cache};

  return {
    createAspect: createAspect(baseInit),
    createEntity: createEntity(baseInit),
    createEvent: createEvent(baseInit),
    createEvents: getEvents(baseInit),
    ...getPropertyInstantiator(baseInit),
  };
}
