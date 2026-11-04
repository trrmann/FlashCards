/**
 * Handles the IAM's notices (phase 3d): for each 'user.deleted', remove that user's FlashCards
 * data (UserDataService), then acknowledge, so the IAM can clean up its outbox. FlashCards holds
 * no foreign keys to users, so this is how a deletion reaches its data.
 *
 * Runs at start-up, every INTERVAL_MS while the server is up, and right after FlashCards' own
 * admin page deletes a user. One run at a time: a call during a run waits for that run. A notice
 * that fails stays unacknowledged and is tried again next time; handling one twice is harmless.
 * Pulling suits the free plan: a sleeping FlashCards misses nothing, the notices wait.
 */

import { userDataService } from './userDataService.mjs';

export class UserEventConsumer {
  static INTERVAL_MS = 10 * 60 * 1000;
  static HANDLED = new Set(['user.deleted']);

  /**
   * @param {object} options
   * @param {object} options.identity - The identity gateway (pullEvents, acknowledgeEvents)
   * @param {object} [options.userData] - UserDataService
   * @param {object} [options.logger]
   */
  constructor({ identity, userData = userDataService, logger = console }) {
    this.identity = identity;
    this.userData = userData;
    this.logger = logger;
    this.running = null;
    this.timer = null;
  }

  /** Handle every waiting notice. @returns {Promise<number>} notices handled */
  pull() {
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  async drain() {
    let handled = 0;
    for (;;) {
      const events = await this.identity.pullEvents();
      if (events.length === 0) return handled;
      for (const event of events) {
        if (this.constructor.HANDLED.has(event.event_type)) {
          const rows = await this.userData.deleteUserData(event.user_id);
          this.logger.log(
            `IAM notice ${event.event_id}: user deleted, ${rows} FlashCards row(s) removed`
          );
        }
        handled += 1;
      }
      await this.identity.acknowledgeEvents(events[events.length - 1].event_id);
    }
  }

  /** Pull now and every INTERVAL_MS; failures are logged and retried next time. */
  start() {
    const run = () =>
      this.pull().catch((error) =>
        this.logger.warn(`IAM notices not handled yet: ${error.message}`)
      );
    run();
    this.timer = setInterval(run, this.constructor.INTERVAL_MS);
    this.timer.unref?.();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running?.catch(() => {});
  }
}

export default UserEventConsumer;
