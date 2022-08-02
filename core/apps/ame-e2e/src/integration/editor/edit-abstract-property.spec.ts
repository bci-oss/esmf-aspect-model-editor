/*
 * Copyright (c) 2022 Robert Bosch Manufacturing Solutions GmbH
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

/// <reference types="Cypress" />

import {
  FIELD_descriptionen,
  FIELD_extends,
  FIELD_preferredNameen,
  FIELD_see,
  SELECTOR_dialogInputModel,
  SELECTOR_dialogStartButton,
  SELECTOR_ecAbstractProperty,
  SELECTOR_editorCancelButton,
  SELECTOR_editorSaveButton,
  SELECTOR_notificationsButton,
  SELECTOR_tbDeleteButton,
  SELECTOR_tbLoadButton,
  SNACK_BAR,
} from '../../support/constants';

describe('Create and Edit Abstract Property', () => {
  describe('Property -> Abstract Property', () => {
    it('should create', () => {
      cy.visitDefault();
      cy.startModelling().then(() => cy.dragElement(SELECTOR_ecAbstractProperty, 350, 300).then(() => cy.clickShape('abstractProperty1')));
    });

    it('should edit', () => {
      cy.dbClickShape('abstractProperty1')
        .then(() => cy.get(FIELD_preferredNameen).focus().type('Preferred Name'))
        .then(() => cy.get(FIELD_descriptionen).focus().type('Description'))
        .then(() => cy.get(FIELD_see).focus().type('http://test.com'))
        .then(() => cy.get(SELECTOR_editorSaveButton).click({force: true}))
        .then(() => cy.clickConnectShapes('abstractProperty1', 'property1'))
        .then(() => cy.getCellLabel('property1', 'preferredName').should('eq', 'Inherited\npreferredName = Preferred Name @en'))
        .then(() => cy.getCellLabel('property1', 'description').should('eq', 'Inherited\ndescription = Description @en'))
        .then(() => cy.getCellLabel('property1', 'see').should('eq', 'Inherited\nsee = http://test.com'));
    });

    it('should edit property1', () => {
      cy.dbClickShape('property1')
        .then(() => cy.get(FIELD_descriptionen).clear({force: true}).type('Property Description'))
        .then(() => cy.get(SELECTOR_editorSaveButton).click({force: true}))
        .then(() => cy.getCellLabel('property1', 'description').should('eq', 'description = Property Description @en'))
        .then(() => cy.getCellLabel('property1', 'preferredName').should('eq', 'Inherited\npreferredName = Preferred Name @en'))
        .then(() => cy.getCellLabel('property1', 'see').should('eq', 'Inherited\nsee = http://test.com'));
    });

    it('should connect to abstractProperty2', () => {
      cy.dragElement(SELECTOR_ecAbstractProperty, 350, 300)
        .then(() => cy.clickShape('abstractProperty2'))
        .then(() => cy.dbClickShape('property1'))
        .then(() => cy.get('[data-cy="clear-extends-button"]').click({force: true}))
        .then(() => cy.get(FIELD_extends).focus().type('abstractProperty2'))
        .then(() => cy.get('mat-option').contains('abstractProperty2').first().click({force: true}))
        .then(() => cy.get(SELECTOR_editorSaveButton).click({force: true}))
        .then(() => cy.getCellLabel('property1', 'extends').should('eq', 'extends = abstractProperty2'));
    });

    it('should reconnect to abstractProperty1', () => {
      cy.then(() => cy.clickConnectShapes('abstractProperty1', 'property1')).then(() =>
        cy.getCellLabel('property1', 'extends').should('eq', 'extends = abstractProperty1')
      );
    });
  });

  describe('Abstract Property -> Abstract Property', () => {
    it('should connect abstractProperty1 to abstractProperty2', () => {
      cy.visitDefault();
      cy.startModelling()
        .then(() => cy.dragElement(SELECTOR_ecAbstractProperty, 350, 300).then(() => cy.clickShape('abstractProperty1')))
        .then(() => cy.dragElement(SELECTOR_ecAbstractProperty, 350, 300).then(() => cy.clickShape('abstractProperty2')))
        .then(() => cy.clickConnectShapes('abstractProperty1', 'abstractProperty2'))
        .then(() => cy.get('[data-cy="formatButton"]').click({force: true}).wait(200))
        .then(() => cy.dbClickShape('abstractProperty1'))
        .then(() => cy.get(FIELD_extends).should('have.value', 'abstractProperty2'))
        .then(() => cy.get(SELECTOR_editorCancelButton).click({force: true}));
    });

    it('abstractProperty1 should have abstractProperty2 values', () => {
      cy.clickShape('abstractProperty2')
        .dbClickShape('abstractProperty2')
        .then(() => cy.get(FIELD_preferredNameen).focus().type('Preferred Name'))
        .then(() => cy.get(FIELD_descriptionen).focus().type('Description'))
        .then(() => cy.get(FIELD_see).focus().type('http://test.com'))
        .then(() => cy.get(SELECTOR_editorSaveButton).click({force: true}))
        .then(() => cy.dbClickShape('abstractProperty1'))
        .then(() => cy.get(FIELD_preferredNameen).should('have.value', 'Preferred Name'))
        .then(() => cy.get(FIELD_descriptionen).should('have.value', 'Description'))
        .then(() => cy.get(FIELD_see).should('have.value', 'http://test.com'))
        .then(() => cy.get(SELECTOR_editorCancelButton).click({force: true}));
    });

    it('should not connect recursively', () => {
      cy.clickConnectShapes('abstractProperty2', 'abstractProperty1')
        .then(() => cy.get(SELECTOR_notificationsButton).click({force: true}))
        .then(() => cy.wait(500).get('.mat-cell').contains('Recursive elements').should('exist'))
        .then(() => cy.wait(500).get('[data-cy="close-notifications"]').click({force: true}));
    });

    it('abstractProperty1 should not have abstractProperty2 values anymore', () => {
      cy.clickShape('abstractProperty2')
        .then(() => cy.get(SELECTOR_tbDeleteButton).click({force: true}))
        .then(() => cy.dbClickShape('abstractProperty1').wait(500))
        .then(() => cy.get(FIELD_preferredNameen).should('have.value', ''))
        .then(() => cy.get(FIELD_descriptionen).should('have.value', ''))
        .then(() => cy.get(FIELD_see).should('have.value', ''))
        .then(() => cy.get(SELECTOR_editorCancelButton).click({force: true}));
    });
  });

  describe('Abstract Property import', () => {
    it('should import', () => {
      cy.visitDefault();
      cy.startModelling();
      cy.fixture('abstract-property')
        .as('rdfString')
        .then(rdfString => {
          cy.get(SELECTOR_tbLoadButton).click({force: true});
          cy.get('[data-cy="create-model"]').click({force: true});
          cy.get(SELECTOR_dialogInputModel).invoke('val', rdfString).trigger('input');
        })
        .then(() => cy.get(SELECTOR_dialogStartButton).click({force: true}))
        .then(() => cy.clickShape('abstractProperty1'));
    });

    it('first property should have abstractProperty1 information', () => {
      cy.clickShape('propertyWithAbstractProperty1');
      cy.getCellLabel('propertyWithAbstractProperty1', 'extends').should('eq', 'extends = abstractProperty1');
      cy.getCellLabel('propertyWithAbstractProperty1', 'preferredName').should('eq', 'Inherited\npreferredName = Preferred Name @ro');
      cy.getCellLabel('propertyWithAbstractProperty1', 'description').should('eq', 'Inherited\ndescription = Description @en');
      cy.getCellLabel('propertyWithAbstractProperty1', 'see').should('eq', 'Inherited\nsee = http://test.com');
    });

    it('second property should have abstractProperty3 information', () => {
      cy.clickShape('propertyWithAbstractProperty2');
      cy.getCellLabel('propertyWithAbstractProperty2', 'extends').should('eq', 'extends = abstractProperty2');
      cy.getCellLabel('propertyWithAbstractProperty2', 'preferredName').should('eq', 'Inherited\npreferredName = Preferred Name @ro');
      cy.getCellLabel('propertyWithAbstractProperty2', 'description').should('eq', 'Inherited\ndescription = Description @en');
      cy.getCellLabel('propertyWithAbstractProperty2', 'see').should('eq', 'Inherited\nsee = http://test.com');
    });
  });

  describe('Abstract Property export', () => {
    it('should create model', () => {
      cy.visitDefault();
      cy.startModelling();
      cy.clickAddShapePlusIcon('Characteristic1')
        .then(() => cy.clickAddShapePlusIcon('Entity1'))
        .then(() => cy.clickAddShapePlusIcon('Entity1'))
        .then(() => cy.dragElement(SELECTOR_ecAbstractProperty, 350, 300).then(() => cy.clickShape('abstractProperty1')))
        .then(() => cy.dragElement(SELECTOR_ecAbstractProperty, 350, 300).then(() => cy.clickShape('abstractProperty2')))
        .then(() => cy.clickConnectShapes('property2', 'abstractProperty1'))
        .then(() => cy.clickConnectShapes('property3', 'abstractProperty2'))
        .then(() => cy.dbClickShape('abstractProperty1'))
        .then(() => cy.get(FIELD_preferredNameen).type('Preferred Name 1', {force: true}))
        .then(() => cy.get(FIELD_descriptionen).type('Description 1', {force: true}))
        .then(() => cy.get(FIELD_see).type('http://test1.com', {force: true}))
        .then(() => cy.get(SELECTOR_editorSaveButton).click({force: true}).wait(500))

        .then(() => cy.dbClickShape('abstractProperty2'))
        .then(() => cy.get(FIELD_preferredNameen).type('Preferred Name 2', {force: true}))
        .then(() => cy.get(FIELD_descriptionen).type('Description 2', {force: true}))
        .then(() => cy.get(FIELD_see).type('http://test2.com', {force: true}))
        .then(() => cy.get(SELECTOR_editorSaveButton).click({force: true}).wait(500));

      cy.getCellLabel('property2', 'extends').should('eq', 'extends = abstractProperty1');
      cy.getCellLabel('property2', 'preferredName').should('eq', 'Inherited\npreferredName = Preferred Name 1 @en');
      cy.getCellLabel('property2', 'description').should('eq', 'Inherited\ndescription = Description 1 @en');
      cy.getCellLabel('property2', 'see').should('eq', 'Inherited\nsee = http://test1.com');

      cy.getCellLabel('property3', 'extends').should('eq', 'extends = abstractProperty2');
      cy.getCellLabel('property3', 'preferredName').should('eq', 'Inherited\npreferredName = Preferred Name 2 @en');
      cy.getCellLabel('property3', 'description').should('eq', 'Inherited\ndescription = Description 2 @en');
      cy.getCellLabel('property3', 'see').should('eq', 'Inherited\nsee = http://test2.com');
    });

    it('should export', () => {
      cy.then(() => cy.getUpdatedRDF()).then(rdf => {
        expect(rdf).to.contain(`:property2 a bamm:Property;\n    bamm:name "property2";\n    bamm:extends :abstractProperty1.`);
        expect(rdf).to.contain(`:property3 a bamm:Property;\n    bamm:name "property3";\n    bamm:extends :abstractProperty2.`);
        expect(rdf).to.contain(
          `:abstractProperty1 a bamm:AbstractProperty;\n    bamm:name "abstractProperty1";\n    bamm:preferredName "Preferred Name 1"@en;\n    bamm:description "Description 1"@en;\n    bamm:see <http://test1.com>.`
        );
        expect(rdf).to.contain(
          `:abstractProperty2 a bamm:AbstractProperty;\n    bamm:name "abstractProperty2";\n    bamm:preferredName "Preferred Name 2"@en;\n    bamm:description "Description 2"@en;\n    bamm:see <http://test2.com>.`
        );
      });
    });
  });
});
