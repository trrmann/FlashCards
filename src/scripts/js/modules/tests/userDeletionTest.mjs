/**
 * User deletion test (phase 3d): FlashCards holds no foreign keys to the IAM's users; deleting a
 * user writes a notice at the IAM, and FlashCards' consumer removes that user's data.
 *
 * Checks: no foreign keys to iam.users remain; an admin deletes a user through the identity
 * gateway; the notice removes every row of theirs (cards, media, quiz, settings, shares, other
 * users' progress on their cards) and nothing of anyone else's; it is acknowledged; handling it
 * again changes nothing; a failed handling is retried; the orphan check finds data of an unknown
 * user, removes it, and refuses (removing nothing) when the IAM seems to have lost many users.
 * With `remoteIam: true` (npm run test:deletion:remote) through the IAM service over HTTP.
 */

import crypto from 'node:crypto';
import { userAuthService } from 'iam-service/services';
import { IamServer, ApplicationCredentials } from 'iam-service/server';
import { LocalTestCase } from './localTestCase.mjs';
import { LocalIdentityGateway, RemoteIdentityGateway } from '../identity/index.mjs';
import { entriesService } from '../auth/entriesService.mjs';
import { practiceService } from '../auth/practiceService.mjs';
import { userSettingsService } from '../auth/userSettingsService.mjs';
import { UserDataService, userDataService } from '../auth/userDataService.mjs';
import { UserEventConsumer } from '../auth/userEventConsumer.mjs';
import { QuizRouter } from '../routes/quizRouter.mjs';

export class UserDeletionTest extends LocalTestCase {
  static PASSWORD = 'Deletion#2026x';
  static IAM_PORT = 5094;
  static PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  constructor({ remoteIam = false, ...options } = {}) {
    super(options);
    this.remoteIam = remoteIam;
    this.quiet = { log: () => {}, warn: () => {} };
  }

  async startIdentity() {
    this.iamServer = null;
    if (!this.remoteIam) {
      this.identity = new LocalIdentityGateway();
      return;
    }
    const secret = crypto.randomBytes(32).toString('hex');
    this.iamServer = new IamServer({
      port: this.constructor.IAM_PORT,
      routerOptions: {
        credentials: new ApplicationCredentials({
          [ApplicationCredentials.envName('flashcards')]: secret,
        }),
      },
    });
    await this.iamServer.start();
    this.identity = new RemoteIdentityGateway({
      baseUrl: `http://127.0.0.1:${this.constructor.IAM_PORT}`,
      clientSecret: secret,
    });
    await this.identity.start();
  }

  async actor(username) {
    const req = { session: {} };
    const user = await this.identity.login(req, username, this.constructor.PASSWORD);
    req.session.userId = user.user_id;
    return req;
  }

  async userIdsWithData() {
    return new Set(
      (await this.database.query(UserDataService.queries.user_ids_with_data)).rows.map(
        (r) => r.user_id
      )
    );
  }

  async seed() {
    const make = (name) =>
      userAuthService.createUser(name, `${name}@example.test`, this.constructor.PASSWORD, name);
    const admin = await make('del_admin');
    await userAuthService.makeFirstAdmin(admin.user_id);
    const alice = await make('del_alice');
    const bob = await make('del_bob');

    const aliceCard = await entriesService.createFlashcard(
      alice.user_id,
      'Q?',
      'A',
      'L1',
      'C',
      'X',
      {
        questionBlock: { form: 'image', media: this.constructor.PNG },
      }
    );
    const bobCard = await entriesService.createFlashcard(
      bob.user_id,
      'Bob Q?',
      'B',
      'L1',
      'C',
      'X'
    );
    const share = await entriesService.shareFlashcard(
      aliceCard.flashcard_id,
      alice.user_id,
      bob.user_id
    );
    await entriesService.acceptShare(share.share_id, bob.user_id);
    await practiceService.initializeAllCardsForUser(bob.user_id);
    await practiceService.recordPracticeAttemptWithSession(
      bob.user_id,
      aliceCard.flashcard_id,
      true,
      null,
      new Date(),
      null
    );
    const quiz = await this.database.query(QuizRouter.queries.insert_quiz, [
      alice.user_id,
      'Quiz',
      null,
    ]);
    await this.database.query(QuizRouter.queries.insert_quiz_result, [
      alice.user_id,
      quiz.rows[0].quiz_id,
      100,
      1,
      1,
    ]);
    await userSettingsService.setStorageLimit(alice.user_id, 2048);
    await userSettingsService.updateLastPageVisited(bob.user_id, '/practice');
    return { admin, alice, bob, bobCard };
  }

  async checkDeletion({ alice, bob, bobCard }) {
    console.log('Deleting a user');
    const q = LocalTestCase.testQueries;
    this.check(
      'no foreign keys from FlashCards to iam.users remain',
      (await this.database.query(q.count_foreign_keys_to_iam_users)).rows[0].count === 0
    );
    const before = await this.userIdsWithData();
    this.check('Alice and Bob have data', before.has(alice.user_id) && before.has(bob.user_id));

    const admin = await this.actor('del_admin');
    await this.identity.deleteUser(admin, alice.user_id);
    this.check(
      'until the notice is handled, her rows are still there',
      (await this.userIdsWithData()).has(alice.user_id)
    );
    const consumer = new UserEventConsumer({ identity: this.identity, logger: this.quiet });
    const handled = await consumer.pull();
    const after = await this.userIdsWithData();
    this.check('the notice was handled', handled === 1, String(handled));
    this.check("every row of Alice's is gone", !after.has(alice.user_id));
    const bobCards = await entriesService.getUserFlashcards(bob.user_id);
    this.check(
      "Bob keeps his own card and settings; his progress on Alice's card and her share are gone",
      after.has(bob.user_id) &&
        bobCards.some((card) => card.flashcard_id === bobCard.flashcard_id) &&
        (await userSettingsService.getLastPageVisited(bob.user_id)) === '/practice'
    );
    this.check('the notice was acknowledged', (await this.identity.pullEvents()).length === 0);
    this.check('pulling again handles nothing', (await consumer.pull()) === 0);
    this.check(
      'removing her data again changes nothing',
      (await userDataService.deleteUserData(alice.user_id)) === 0
    );
  }

  async checkRetry({ bob }) {
    console.log('\nA failed handling is retried');
    const admin = await this.actor('del_admin');
    await this.identity.deleteUser(admin, bob.user_id);
    let calls = 0;
    const flaky = {
      deleteUserData: async (id) => {
        calls += 1;
        if (calls === 1) throw new Error('database restarting');
        return userDataService.deleteUserData(id);
      },
    };
    const consumer = new UserEventConsumer({
      identity: this.identity,
      userData: flaky,
      logger: this.quiet,
    });
    let failed = null;
    try {
      await consumer.pull();
    } catch (error) {
      failed = error;
    }
    this.check(
      'a failure leaves the notice unacknowledged',
      failed !== null && (await this.identity.pullEvents()).length === 1
    );
    await consumer.pull();
    this.check(
      'the next pull handles it',
      !(await this.userIdsWithData()).has(bob.user_id) &&
        (await this.identity.pullEvents()).length === 0
    );
  }

  async checkOrphans() {
    console.log('\nThe orphan check (admin-run)');
    // A known user with data, so the IAM confirms someone.
    const admin = (await this.actor('del_admin')).session.userId;
    await entriesService.createFlashcard(admin, 'Admin Q?', 'A', 'L1', 'C', 'X');
    const orphan = crypto.randomUUID();
    await this.database.query(LocalTestCase.testQueries.insert_orphan_lesson, [orphan]);
    const found = await userDataService.findOrphans(this.identity);
    this.check(
      'finds data of a user the IAM does not know',
      found.orphans.length === 1 && found.orphans[0] === orphan,
      JSON.stringify(found)
    );
    const removed = await userDataService.removeOrphans(this.identity);
    this.check(
      'removes it',
      removed.removedRows === 1 && !(await this.userIdsWithData()).has(orphan)
    );

    const emptyIam = { getUserSummaries: async () => new Map() };
    let refused = null;
    const before = await this.userIdsWithData();
    try {
      await userDataService.removeOrphans(emptyIam);
    } catch (error) {
      refused = error;
    }
    this.check(
      'refuses (409) and removes nothing when the IAM confirms none of the users (even just one)',
      refused?.status === 409 && (await this.userIdsWithData()).size === before.size,
      refused?.message
    );
  }

  async run() {
    this.assertLocalTarget();
    console.log(
      `User deletion test (local scratch database; identity ${this.remoteIam ? 'over HTTP' : 'in-process'})\n`
    );
    await this.resetDatabase();
    await this.startIdentity();
    try {
      const people = await this.seed();
      await this.checkDeletion(people);
      await this.checkRetry(people);
      await this.checkOrphans();
    } finally {
      await this.identity.stop();
      if (this.iamServer) await this.iamServer.stop();
    }
    return this.summary();
  }
}

export const userDeletionTest = new UserDeletionTest();
export default userDeletionTest;
