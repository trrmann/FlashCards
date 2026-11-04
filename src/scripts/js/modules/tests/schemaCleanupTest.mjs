/**
 * Schema clean-up test: the FlashCards bootstrap drops empty leftover app tables in public
 * (copies an old server created after the tables moved to flashcards), and keeps any that
 * hold rows or that something outside public references. Local scratch database only.
 */

import { LocalTestCase } from './localTestCase.mjs';

export class SchemaCleanupTest extends LocalTestCase {
  async exists(table) {
    const q = LocalTestCase.testQueries;
    return (await this.database.query(q.public_table_exists, [table])).rows[0].exists;
  }

  async createLeftovers() {
    const q = LocalTestCase.testQueries;
    for (const name of [
      'leftover_create_lessons',
      'leftover_create_flashcards',
      'leftover_create_quizzes_with_data',
      'leftover_insert_quiz',
      'leftover_create_media',
      'outside_reference_create',
    ]) {
      await this.database.query(q[name]);
    }
  }

  async checkCleanup() {
    console.log('Leftover public tables');
    await this.createLeftovers();
    this.check(
      'leftovers created',
      (await this.exists('lessons')) && (await this.exists('flashcards'))
    );
    await this.database.initializeSchema();
    this.check('empty public.flashcards dropped', !(await this.exists('flashcards')));
    this.check(
      'empty public.lessons dropped (its foreign key from a leftover too)',
      !(await this.exists('lessons'))
    );
    this.check('public.quizzes holding a row kept', await this.exists('quizzes'));
    this.check('public.media referenced from outside public kept', await this.exists('media'));
    await this.database.initializeSchema();
    this.check('running the bootstrap again changes nothing', await this.exists('quizzes'));
  }

  async run() {
    this.assertLocalTarget();
    console.log('Schema clean-up test (local scratch database)\n');
    await this.resetDatabase();
    try {
      await this.checkCleanup();
    } finally {
      const q = LocalTestCase.testQueries;
      await this.database.query(q.outside_reference_drop);
      await this.database.query(q.leftover_drop_remaining);
    }
    return this.summary();
  }
}

export const schemaCleanupTest = new SchemaCleanupTest();
export default schemaCleanupTest;
