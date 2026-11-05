/**
 * Profile page, admin: FlashCards' own controls in the IAM's shared user-admin screen
 * (phase 3f). <iam-user-admin> raises `iam-user-row` for every user; this adds "Storage limit"
 * and "Reset stats", which use FlashCards' admin API (they are FlashCards data, not identity).
 */
class ProfileAdminControls {
  static MB = 1024 * 1024;

  constructor(doc) {
    this.doc = doc;
  }

  /** The user-admin screen, for its messages and refresh. */
  get screen() {
    return this.doc.querySelector('iam-user-admin');
  }

  async call(method, path, body) {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== 'success') {
      throw new Error(data.message || `Request failed (${response.status})`);
    }
    return data;
  }

  report(text, kind = 'success') {
    this.screen?.message(text, kind);
  }

  async setStorageLimit(user) {
    const answer = window.prompt(`Storage limit for ${user.username}, in MB:`, '25');
    if (answer === null) return;
    const megabytes = Number(answer);
    if (!Number.isFinite(megabytes) || megabytes < 0) {
      this.report('Enter a number of MB (0 or more)', 'error');
      return;
    }
    try {
      const data = await this.call(
        'PUT',
        `/api/admin/users/${encodeURIComponent(user.user_id)}/storage-limit`,
        { maxBytes: Math.round(megabytes * ProfileAdminControls.MB) }
      );
      this.report(
        `${user.username}: ${(data.maxBytes / ProfileAdminControls.MB).toFixed(1)} MB limit`
      );
    } catch (error) {
      this.report(error.message, 'error');
    }
  }

  async resetStats(user) {
    if (
      !window.confirm(`Reset all practice statistics of ${user.username}? Cards return to box 1.`)
    ) {
      return;
    }
    try {
      const data = await this.call(
        'POST',
        `/api/admin/users/${encodeURIComponent(user.user_id)}/reset-stats`
      );
      this.report(`${user.username}: ${data.cardsReset} card(s) reset`);
    } catch (error) {
      this.report(error.message, 'error');
    }
  }

  button(label, onClick) {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = 'flashcards-admin-action';
    button.addEventListener('click', onClick);
    return button;
  }

  start() {
    this.doc.addEventListener('iam-user-row', (event) => {
      const { user, actions } = event.detail;
      if (actions.querySelector('.iam-muted')) return; // the admin's own row has no actions
      actions.append(
        this.button('Storage limit', () => this.setStorageLimit(user)),
        this.button('Reset stats', () => this.resetStats(user))
      );
    });
  }
}

new ProfileAdminControls(document).start();
