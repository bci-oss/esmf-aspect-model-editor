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

import {expect, Page, test} from '@playwright/test';
import {AiBackendMock, answer, LOCAL_AI, mockAiBackend, presetAi} from '../../support/ai-mocks';
import {NAMESPACES_URL} from '../../support/api-mocks';
import {AppHelper} from '../../support/app-helper';
import {SELECTOR_tbUndoButton} from '../../support/constants';

const NAMESPACE = 'urn:samm:org.eclipse.examples.aspect:1.0.0#';

const PREFIXES = `@prefix samm: <urn:samm:org.eclipse.esmf.samm:meta-model:2.2.0#> .
@prefix samm-c: <urn:samm:org.eclipse.esmf.samm:characteristic:2.2.0#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;

/** The default model of `startModelling` with another description of `property1`. */
const CHANGED_MODEL = `${PREFIXES}@prefix : <${NAMESPACE}> .

:AspectDefault a samm:Aspect ;
    samm:preferredName "AspectDefault"@en ;
    samm:description "AspectDefault"@en ;
    samm:properties ( :property1 ) ;
    samm:operations () ;
    samm:events () .

:property1 a samm:Property ;
    samm:preferredName "Property1"@en ;
    samm:description "Described by the assistant"@en ;
    samm:characteristic :Characteristic1 .

:Characteristic1 a samm:Characteristic ;
    samm:preferredName "Characteristic1"@en ;
    samm:description "Characteristic1"@en ;
    samm:dataType xsd:string .
`;

const NEW_MODEL = `${PREFIXES}@prefix : <urn:samm:org.eclipse.examples.robot:1.0.0#> .

:RobotArm a samm:Aspect ;
    samm:properties ( :jointAngle ) ;
    samm:operations () ;
    samm:events () .

:jointAngle a samm:Property ;
    samm:characteristic samm-c:Text .
`;

const WORKSPACE = {type: 'workspace', id: '/e2e/models', name: 'models', path: '/e2e/models', readOnly: false, defaultWorkspace: true};

/** The workspace with one model besides the open one. */
const STRUCTURE = {
  'org.eclipse.examples.movement': [
    {
      version: '1.0.0',
      models: [
        {
          name: 'Movement.ttl',
          existing: true,
          version: '2.2.0',
          aspectModelUrn: 'urn:samm:org.eclipse.examples.movement:1.0.0#Movement',
          source: WORKSPACE,
        },
      ],
    },
  ],
};

const panel = (page: Page) => page.getByTestId('ai-panel');
const assistantMessages = (page: Page) => page.getByTestId('ai-message-assistant');

async function openPanel(page: Page): Promise<void> {
  await page.getByTestId('tbAiToggleButton').click();
  await expect(panel(page)).toBeVisible();
}

async function ask(page: Page, text: string): Promise<void> {
  await page.getByTestId('ai-input').fill(text);
  await page.getByTestId('ai-send').click();
}

async function selectedElementName(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const graph = (window as any)['angular.maxgraphAttributeService'].graph;
    return graph.getSelectionCell()?.getMetaModelElement?.()?.element?.name;
  });
}

async function recordClipboard(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText: (text: string) => ((window as any).__copied.push(text), Promise.resolve())},
    });
    document.execCommand = ((command: string) => {
      if (command === 'copy') (window as any).__copied.push((document.activeElement as HTMLTextAreaElement)?.value);
      return true;
    }) as typeof document.execCommand;
  });
}

test.describe('AI assistant', () => {
  let app: AppHelper;
  let ai: AiBackendMock;

  test.beforeEach(async ({page}) => {
    app = new AppHelper(page);
    ai = await mockAiBackend(page);
  });

  test('is hidden while it is disabled', async ({page}) => {
    await app.startModelling();
    await expect(page.getByTestId('tbAiToggleButton')).toHaveCount(0);
    await expect(page.getByTestId('tbAiButton')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+i');
    await expect(panel(page)).toHaveCount(0);
  });

  test('is enabled in the settings and set up with a connection test', async ({page}) => {
    await app.startModelling();
    await app.openSettings();
    await page.getByTestId('settings-node-aiConfiguration').click();
    await page.getByTestId('aiEnabledToggle').getByRole('switch').click();
    await app.closeDialog('[data-testid="settingsDialogOkButton"]');

    await openPanel(page);
    await expect(page.getByTestId('ai-setup')).toBeVisible();
    await page.getByTestId('ai-provider-openai').click();
    await page.getByTestId('ai-key-input').fill('sk-e2e');
    await page.getByTestId('ai-key-save').click();
    await expect(page.getByTestId('ai-key-stored')).toBeVisible();

    await page.getByTestId('ai-test-connection').click();
    await expect(page.getByTestId('ai-test-ok')).toBeVisible();
    expect(ai.requests).toContainEqual({method: 'POST', path: '/test', key: 'sk-e2e'});

    await page.getByTestId('ai-setup-done').click();
    await expect(page.getByTestId('ai-welcome')).toBeVisible();
    // the key is never stored with the settings
    expect(await page.evaluate(() => localStorage.getItem('settings'))).not.toContain('sk-e2e');
  });

  test.describe('with a local provider', () => {
    test.beforeEach(async ({page}) => {
      await presetAi(page, LOCAL_AI);
      await app.startModelling();
    });

    test('streams the answer and sends the open model as context', async ({page}) => {
      ai.replyWith(answer(['The aspect has ', '**one** property.']));
      await page.keyboard.press('ControlOrMeta+i');
      await expect(panel(page)).toBeVisible();

      await ask(page, 'What does the model describe?');

      await expect(page.getByTestId('ai-message-user')).toContainText('What does the model describe?');
      await expect(assistantMessages(page)).toContainText('The aspect has one property.');
      await expect(assistantMessages(page).locator('strong')).toHaveText('one');
      const request = ai.chatRequests[0];
      expect(request.provider).toMatchObject({kind: 'ollama', model: 'llama3'});
      expect(request.context.modelTurtle).toContain(':AspectDefault');
      expect(request.context.modelUrn).toBe(`${NAMESPACE}AspectDefault`);
    });

    test('sends an attached file as context', async ({page}) => {
      await openPanel(page);
      await page
        .getByTestId('ai-file-input')
        .setInputFiles({name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Speed is km/h.')});

      const chip = page.getByTestId('ai-chip-item').filter({hasText: 'notes.txt'});
      await expect(chip).toHaveAttribute('data-kind', 'file');
      await expect(chip).not.toHaveAttribute('aria-busy', 'true');
      expect(ai.requests).toContainEqual(expect.objectContaining({method: 'POST', path: '/attachments'}));

      await ask(page, 'Which unit does the speed have?');
      await expect.poll(() => ai.chatRequests.length).toBe(1);
      expect(ai.chatRequests[0].context.attachmentIds).toEqual([expect.stringMatching(/^att-/)]);
      await expect(page.getByTestId('ai-message-context')).toContainText('notes.txt');

      await chip.locator('.ai-chip__remove').click();
      await expect(chip).toHaveCount(0);
      await expect
        .poll(() => ai.requests.some(request => request.method === 'DELETE' && request.path.startsWith('/attachments/')))
        .toBe(true);
    });

    test('sends a model of the workspace as context', async ({page}) => {
      await page.route(NAMESPACES_URL, route =>
        route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(STRUCTURE)}),
      );
      await openPanel(page);
      await page.getByTestId('ai-attach').click();
      await page.getByTestId('ai-attach-model').click();

      const picker = page.getByTestId('ai-context-picker');
      await expect(picker).toBeVisible();
      await picker.getByTestId('ai-context-picker-search').fill('movement.ttl');
      // the parent folders stay visible as tree below the workspace, which can be added as a whole
      await expect(picker.locator('[data-testid="ai-context-candidate"][data-depth="0"]')).toHaveText(/org\.eclipse\.examples\.movement/);
      await expect(picker.getByTestId('ai-context-source')).toHaveCount(1);
      await picker.getByTestId('ai-context-candidate').filter({hasText: 'Movement.ttl'}).click();
      await expect(picker).toHaveCount(0);
      await expect(page.getByTestId('ai-chip-item').filter({hasText: 'Movement.ttl'})).toHaveAttribute('data-kind', 'model');

      await ask(page, 'Compare with the movement model');
      await expect.poll(() => ai.chatRequests.length).toBe(1);
      expect(ai.chatRequests[0].context.contextModels).toEqual([
        {sourcePath: '/e2e/models', namespace: 'org.eclipse.examples.movement', version: '1.0.0', fileName: 'Movement.ttl'},
      ]);
    });

    test('sends a whole workspace as context', async ({page}) => {
      await page.route(NAMESPACES_URL, route =>
        route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(STRUCTURE)}),
      );
      await openPanel(page);
      await page.getByTestId('ai-attach').click();
      await page.getByTestId('ai-attach-model').click();

      const picker = page.getByTestId('ai-context-picker');
      await picker.getByTestId('ai-context-source').click();
      await expect(picker).toHaveCount(0);
      await expect(page.getByTestId('ai-chip-item').filter({hasText: WORKSPACE.name})).toHaveAttribute('data-kind', 'source');

      await ask(page, 'Summarize the workspace');
      await expect.poll(() => ai.chatRequests.length).toBe(1);
      expect(ai.chatRequests[0].context.contextModels).toEqual([{sourcePath: '/e2e/models'}]);
    });

    test('applies a model change which can be undone', async ({page}) => {
      ai.replyWith(
        answer(
          ['I added a description.'],
          [{id: 'p1', kind: 'modelChange', title: 'Describe property1', turtle: CHANGED_MODEL, valid: true, validationErrors: []}],
        ),
      );
      await openPanel(page);
      await ask(page, '/describe property1');

      const proposal = page.getByTestId('ai-proposal');
      await expect(proposal).toContainText('Describe property1');
      await proposal.getByTestId('ai-proposal-apply').click();
      await expect(proposal.getByTestId('ai-proposal-state')).toBeVisible();
      await expect.poll(() => app.getUpdatedRDF()).toContain('Described by the assistant');

      await page.locator(SELECTOR_tbUndoButton).click();
      await expect.poll(() => app.getUpdatedRDF()).not.toContain('Described by the assistant');
      expect(await app.getUpdatedRDF()).toContain('"Property1"@en');
    });

    test('jumps to the element of a review finding and asks for its fix', async ({page}) => {
      const finding = {
        id: 'f1',
        severity: 'warning',
        category: 'description',
        elementUrn: `${NAMESPACE}property1`,
        message: 'The description repeats the name.',
        suggestion: 'Describe the meaning.',
        fixable: true,
      };
      ai.replyWith(answer(['Review done.'], [{id: 'r1', kind: 'review', title: 'Review', findings: [finding]}]), answer(['Fixed.']));

      await page.getByTestId('tbAiButton').click();
      await page.getByTestId('tbAiReview').click();
      await expect(panel(page)).toBeVisible();
      await expect(page.getByTestId('ai-finding')).toContainText('The description repeats the name.');
      expect(ai.chatRequests[0].command).toBe('review');

      await page.getByTestId('ai-finding-jump').click();
      await expect.poll(() => selectedElementName(page)).toBe('property1');

      await page.getByTestId('ai-finding-fix').click();
      await expect.poll(() => ai.chatRequests.length).toBe(2);
      expect(ai.chatRequests[1]).toMatchObject({command: 'fix', context: {mentionedElementUrns: [`${NAMESPACE}property1`]}});
    });

    test('copies generated example data', async ({page}) => {
      await recordClipboard(page);
      ai.replyWith(
        answer(
          ['Here is an example.'],
          [
            {
              id: 'e1',
              kind: 'payload',
              title: 'Example data',
              payload: [
                {name: 'valid', json: '{"property1":"abc"}'},
                {name: 'boundary', json: '{"property1":""}'},
              ],
            },
          ],
        ),
      );
      await page.getByTestId('tbAiButton').click();
      await page.getByTestId('tbAiExamples').click();

      await expect(page.getByTestId('ai-payload-json')).toContainText('"property1": "abc"');
      expect(ai.chatRequests[0].command).toBe('examples');
      await page.getByTestId('ai-payload-variant').filter({hasText: 'boundary'}).click();
      await page.getByTestId('ai-payload-copy').click();
      await expect
        .poll(() => page.evaluate(() => (window as any).__copied as string[]))
        .toEqual([JSON.stringify({property1: ''}, null, 2)]);
    });

    test('generates a new model and opens it', async ({page}) => {
      ai.replyWith(
        answer(
          ['Here is the model.'],
          [
            {
              id: 'n1',
              kind: 'newModel',
              title: 'Robot arm',
              turtle: NEW_MODEL,
              namespace: 'org.eclipse.examples.robot',
              version: '1.0.0',
              fileName: 'RobotArm.ttl',
              valid: true,
              validationErrors: [],
            },
          ],
        ),
      );
      await page.getByTestId('tbAiButton').click();
      await page.getByTestId('tbAiNewModel').click();
      await expect(page.getByTestId('ai-input')).toHaveValue(/^\/generate /);
      await ask(page, '/generate A robot arm with a joint angle');

      const proposal = page.getByTestId('ai-proposal');
      await expect(proposal).toContainText('Robot arm');
      await expect(proposal.getByTestId('ai-proposal-apply')).toHaveCount(0);
      await proposal.getByTestId('ai-proposal-create').click();

      await app.shapeExists('RobotArm');
      await app.shapeExists('jointAngle');
      expect(ai.chatRequests[0].command).toBe('generate');
    });
  });

  test('shows an invalid key with a way to the setup', async ({page}) => {
    await presetAi(
      page,
      {enabled: true, provider: 'openai', onlyLocal: false, languages: ['en'], cloudConsent: ['openai']},
      {provider: 'openai', value: 'sk-wrong'},
    );
    ai.replyWith({
      status: 400,
      body: {code: 'invalid_key', message: 'The API key was rejected.', error: {message: 'The API key was rejected.', code: 400}},
    });
    await app.startModelling();
    await openPanel(page);

    await ask(page, 'Hi');

    const error = page.getByTestId('ai-error').first();
    await expect(error).toHaveAttribute('data-code', 'invalid_key');
    await error.getByTestId('ai-error-action-openSetup').click();
    await expect(page.getByTestId('ai-setup')).toBeVisible();
  });
});
