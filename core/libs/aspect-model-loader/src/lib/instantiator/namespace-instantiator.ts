import {NamedNode, Quad} from 'n3';
import {NamedElement} from '../aspect-meta-model/named-element';
import {getElementsCache} from '../shared/model-element-cache.service';
import {getRdfModel, getStore} from '../shared/rdf-model';
import {createAspect} from './aspect-instantiator';
import {createEntity} from './entity-instantiator';
import {getEvents} from './event-instantiator';
import {getOperations} from './operation-instantiator';
import {getProperties} from './property-instantiator';

export function createNamespaces(): Map<string, Array<NamedElement>> {
  const rdfModel = getRdfModel();
  const elementsCache = getElementsCache();
  const store = getStore();

  loadModelElements(rdfModel.samm.Aspect(), (quad: Quad) => createAspect(quad.subject.value));

  loadModelElements(rdfModel.samm.Entity(), (quad: Quad) => createEntity(store.getQuads(quad.object, null, null, null)));

  loadModelElements(rdfModel.samm.Event(), (quad: Quad) => getEvents(quad.subject));

  loadModelElements(rdfModel.samm.Operation(), (quad: Quad) => getOperations(quad.subject));

  loadModelElements(rdfModel.samm.Property(), (quad: Quad) => getProperties(quad.subject));

  const allElementsByNamespace = new Map<string, Array<NamedElement>>();
  elementsCache.filter(element => {
    if (!element.namespace || element.namespace.length == 0) {
      return true;
    }
    if (!allElementsByNamespace.has(element.namespace)) {
      allElementsByNamespace.set(element.namespace, []);
    }
    allElementsByNamespace.get(element.namespace).push(element);
    return false;
  });

  return allElementsByNamespace;
}

function loadModelElements(type: NamedNode, instantiatorFunction) {
  const rdfModel = getRdfModel();
  const store = getStore();

  store.getQuads(null, rdfModel.samm.RdfType(), type, null).forEach(instantiatorFunction);
}
