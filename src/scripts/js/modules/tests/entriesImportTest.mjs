import assert from 'node:assert/strict';
import test from 'node:test';
import { entriesRouter } from '../routes/entriesRouter.mjs';
import { entriesService } from '../auth/entriesService.mjs';
import { userSettingsService } from '../auth/userSettingsService.mjs';

test('entry import preserves option handling for new and existing cards', async () => {
  const methods = [
    'getStorageUsage',
    'getFlashcardByQuestion',
    'createFlashcard',
    'resolveBlock',
    'updateFlashcard',
    'replaceFlashcardOptions',
  ];
  const originals = Object.fromEntries(methods.map((name) => [name, entriesService[name]]));
  const originalLimit = userSettingsService.getStorageLimit;
  const created = [];
  const replaced = [];
  try {
    entriesService.getStorageUsage = async () => 0;
    userSettingsService.getStorageLimit = async () => null;
    entriesService.getFlashcardByQuestion = async (_user, question) =>
      question === 'existing' ? { flashcard_id: 'card-1' } : null;
    entriesService.createFlashcard = async (...args) => {
      created.push(args[6].options);
      return { flashcard_id: `new-${created.length}` };
    };
    entriesService.resolveBlock = async () => ['text', null];
    entriesService.updateFlashcard = async () => ({ flashcard_id: 'card-1' });
    entriesService.replaceFlashcardOptions = async (_id, options) => replaced.push(options);

    const option = { text: 'yes', isCorrect: true, form: 'text' };
    const request = {
      session: { userId: 'synthetic-user' },
      body: {
        entries: [
          { question: 'new', answer: 'a', options: [option] },
          { question: 'absent', answer: 'a' },
          { question: 'invalid-options', answer: 'a', options: 'not-an-array' },
          { question: 'existing', answer: 'a', options: [option] },
        ],
      },
    };
    const response = {
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    const route = entriesRouter.router.stack.find((layer) => layer.route?.path === '/import').route;
    await route.stack.at(-1).handle(request, response);
    assert.equal(response.code, 201);
    assert.equal(response.body.errors, null);
    assert.equal(response.body.created, 3);
    assert.equal(response.body.updated, 1);
    assert.deepEqual(created, [[option], undefined, undefined]);
    assert.deepEqual(replaced, [[option]]);
  } finally {
    Object.assign(entriesService, originals);
    userSettingsService.getStorageLimit = originalLimit;
  }
});
