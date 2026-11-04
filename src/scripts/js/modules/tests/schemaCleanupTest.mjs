/**
 * Schema clean-up test: the FlashCards bootstrap drops empty leftover app tables in public
 * (copies an old server created after the tables moved to flashcards), and keeps any that
 * hold rows or that something outside public references. Also the phase 3c moves: on a
 * database from before them, the bootstrap copies FlashCards' per-user settings out of
 * iam.users and the live sessions out of iam.session, once; a later start copies nothing
 * (a signed-out session must not come back). Local scratch database only.
 */

import { userAuthService } from 'iam-service/services';
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

  async checkPhase3cMoves() {
    console.log('\nPhase 3c moves (user settings, sessions)');
    const q = LocalTestCase.testQueries;
    const user = await userAuthService.createUser(
      'move_alice',
      'move_alice@example.test',
      'Move#2026x'
    );
    await this.database.query(q.move_set_iam_user_settings, [user.user_id, 4096, '/quiz']);
    await this.database.query(q.move_insert_iam_session, ['live-session', '1 day']);
    await this.database.query(q.move_insert_iam_session, ['expired-session', '-1 day']);
    await this.database.query(q.move_drop_moved_tables);

    await this.database.initializeSchema();
    const settings = (await this.database.query(q.move_read_user_settings, [user.user_id])).rows[0];
    this.check(
      "a user's storage limit and last page are copied from iam.users",
      settings?.storage_max_bytes === 4096 && settings?.last_page_visited === '/quiz',
      JSON.stringify(settings)
    );
    const sessions = (await this.database.query(q.move_session_ids)).rows.map((row) => row.sid);
    this.check(
      'live sessions are copied from iam.session, expired ones are not',
      sessions.join(',') === 'live-session',
      sessions.join(',')
    );

    await this.database.query(q.move_delete_sessions);
    await this.database.initializeSchema();
    const after = (await this.database.query(q.move_session_ids)).rows.length;
    this.check('a later start copies nothing again (signed-out sessions stay out)', after === 0);
  }

  async run() {
    this.assertLocalTarget();
    console.log('Schema clean-up test (local scratch database)\n');
    await this.resetDatabase();
    try {
      await this.checkCleanup();
      await this.checkPhase3cMoves();
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
