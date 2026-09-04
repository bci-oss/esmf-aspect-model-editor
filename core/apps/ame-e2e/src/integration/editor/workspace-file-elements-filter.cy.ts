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

/// <reference types="cypress" />

import {SELECTOR_workspaceBtn} from '../../support/constants';

describe('Test workspace file elements filtering', () => {
  beforeEach(() => {
    cy.visitDefault();
    cy.fixture('all-characteristic').then(rdfString => cy.loadModel(rdfString));
  });

  it('can open workspace file elements and filter properties, characteristics, and entities', () => {
    // Open workspace sidebar
    cy.get(SELECTOR_workspaceBtn).click({force: true});
    cy.get('ame-workspace-file-list').should('be.visible');

    // Click on the current loaded aspect model file in the workspace
    cy.get('.file').first().click({force: true});

    // File elements view should be visible
    cy.get('ame-workspace-file-elements').should('be.visible');
    cy.get('[data-cy="fileElementsList"]').should('be.visible');

    // Check that sections are initially displayed
    cy.get('[data-cy="section-property"]').should('exist');
    cy.get('[data-cy="section-characteristic"]').should('exist');

    // Open filter menu
    cy.get('[data-cy="elementsFilterBtn"]').click({force: true});
    cy.get('.filter-menu').should('be.visible');

    // Toggle off Property filter
    cy.get('[data-cy="filterCheckbox-property"]').click({force: true});
    cy.get('[data-cy="section-property"]').should('not.exist');
    cy.get('[data-cy="section-characteristic"]').should('exist');

    // Toggle off Characteristic filter
    cy.get('[data-cy="filterCheckbox-characteristic"]').click({force: true});
    cy.get('[data-cy="section-characteristic"]').should('not.exist');

    // Toggle back on Property filter
    cy.get('[data-cy="filterCheckbox-property"]').click({force: true});
    cy.get('[data-cy="section-property"]').should('exist');

    // Toggle back on Characteristic filter
    cy.get('[data-cy="filterCheckbox-characteristic"]').click({force: true});
    cy.get('[data-cy="section-characteristic"]').should('exist');
  });
});
