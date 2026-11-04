/**
 * Organizations page: lists the user's organizations (all of them for platform
 * admins) and manages members, groups, group members, and group roles through
 * /api/iam. The server enforces every permission; this page only hides controls
 * the user cannot use. User data is inserted with textContent, never as HTML.
 */
class OrganizationsPage {
  static MANAGER_ROLES = ['owner', 'admin'];
  static ORG_ROLES = ['member', 'admin', 'owner'];

  constructor(doc) {
    this.doc = doc;
    this.state = { isPlatformAdmin: false, organizations: [], org: null, group: null };
  }

  byId(id) {
    return this.doc.getElementById(id);
  }

  /**
   * Create an element with an optional class, text, attributes, and children.
   */
  el(tag, { className, text, attrs } = {}, children = []) {
    const node = this.doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    for (const [name, value] of Object.entries(attrs || {})) node.setAttribute(name, value);
    for (const child of children) node.appendChild(child);
    return node;
  }

  show(node, visible) {
    node.classList.toggle('hidden', !visible);
  }

  message(text, kind = 'success') {
    const status = this.byId('org-status');
    status.textContent = text;
    status.classList.remove('success', 'error');
    status.classList.add(kind);
    this.show(status, true);
  }

  /**
   * Call the IAM API; throw with the server's message on failure.
   */
  async api(method, path, body) {
    const response = await fetch(`/api/iam${path}`, {
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

  /**
   * Run an action, report its outcome, and refresh what it changed.
   * @returns {Promise<boolean>} true when the action succeeded
   */
  async act(work, successText, refresh) {
    try {
      await work();
      if (successText) this.message(successText);
      if (refresh) await refresh();
      return true;
    } catch (error) {
      this.message(error.message, 'error');
      return false;
    }
  }

  formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  canManage() {
    return (
      this.state.isPlatformAdmin ||
      OrganizationsPage.MANAGER_ROLES.includes(this.state.org?.my_role)
    );
  }

  // --------------------------------------------------------------- organizations

  async loadOrganizations() {
    const data = await this.api('GET', '/organizations');
    this.state.isPlatformAdmin = data.isPlatformAdmin;
    this.state.organizations = data.organizations;
    this.renderOrganizations();
    if (this.state.org) {
      const current = data.organizations.find((org) => org.org_id === this.state.org.org_id);
      if (current) await this.selectOrganization(current);
      else this.clearSelection();
    }
  }

  renderOrganizations() {
    const list = this.byId('org-list');
    list.replaceChildren();
    for (const org of this.state.organizations) {
      const meta = `${org.my_role || 'platform admin'} · ${org.member_count} members · ${org.group_count} groups${org.status === 'disabled' ? ' · disabled' : ''}`;
      const button = this.el('button', { attrs: { type: 'button' } }, [
        this.el('span', { text: org.name }),
        this.el('span', { className: 'org-list-meta', text: meta }),
      ]);
      button.classList.toggle('selected', org.org_id === this.state.org?.org_id);
      button.addEventListener('click', () => this.selectOrganization(org));
      list.appendChild(this.el('li', {}, [button]));
    }
    this.show(this.byId('org-empty'), this.state.organizations.length === 0);
    this.show(this.byId('org-create-form'), this.state.isPlatformAdmin);
  }

  clearSelection() {
    this.state.org = null;
    this.state.group = null;
    this.show(this.byId('org-detail'), false);
  }

  async selectOrganization(org) {
    this.state.org = org;
    if (this.state.group && this.state.group.org_id !== org.org_id) this.state.group = null;
    this.renderOrganizations();
    this.byId('org-detail-heading').textContent = org.name;
    this.byId('org-detail-meta').textContent =
      `${org.slug} · your role: ${org.my_role || 'platform admin'}`;
    this.byId('org-settings-name').value = org.name;
    this.byId('org-settings-status').value = org.status;
    for (const node of this.doc.querySelectorAll('.org-manager-only')) {
      this.show(node, this.canManage());
    }
    this.show(this.byId('org-delete'), this.state.isPlatformAdmin);
    this.show(this.byId('org-detail'), true);
    await Promise.all([this.loadMembers(), this.loadGroups()]);
  }

  // --------------------------------------------------------------------- members

  async loadMembers() {
    const data = await this.api('GET', `/organizations/${this.state.org.org_id}/members`);
    const rows = this.byId('member-rows');
    rows.replaceChildren();
    for (const member of data.members) rows.appendChild(this.memberRow(member));
  }

  memberRow(member) {
    const name = this.el('td', { className: 'member-name', text: member.username }, [
      this.el('span', { className: 'member-full-name', text: member.full_name || '' }),
    ]);
    const roleCell = this.el('td');
    const actions = this.el('td');
    if (this.canManage()) {
      const select = this.el('select', { attrs: { 'aria-label': `Role of ${member.username}` } });
      for (const role of OrganizationsPage.ORG_ROLES) {
        select.appendChild(this.el('option', { text: role, attrs: { value: role } }));
      }
      select.value = member.org_role;
      select.addEventListener('change', () => this.changeMemberRole(member, select.value));
      roleCell.appendChild(select);
      const remove = this.el('button', {
        className: 'btn-danger',
        text: 'Remove',
        attrs: { type: 'button', 'aria-label': `Remove ${member.username}` },
      });
      remove.addEventListener('click', () => this.removeMember(member));
      actions.appendChild(remove);
    } else {
      roleCell.textContent = member.org_role;
    }
    return this.el('tr', {}, [name, roleCell, actions]);
  }

  changeMemberRole(member, orgRole) {
    return this.act(
      () =>
        this.api('PUT', `/organizations/${this.state.org.org_id}/members/${member.user_id}`, {
          orgRole,
        }),
      `${member.username} is now ${orgRole}`,
      () => this.loadMembers()
    );
  }

  removeMember(member) {
    if (!window.confirm(`Remove ${member.username} from ${this.state.org.name}?`)) return null;
    return this.act(
      () => this.api('DELETE', `/organizations/${this.state.org.org_id}/members/${member.user_id}`),
      `${member.username} removed`,
      () => this.loadOrganizations()
    );
  }

  // ---------------------------------------------------------------------- groups

  async loadGroups() {
    const data = await this.api('GET', `/organizations/${this.state.org.org_id}/groups`);
    const list = this.byId('group-list');
    list.replaceChildren();
    for (const group of data.groups) list.appendChild(this.groupItem(group));
    this.show(this.byId('group-empty'), data.groups.length === 0);
    const selected = data.groups.find((group) => group.group_id === this.state.group?.group_id);
    if (selected) await this.selectGroup(selected);
    else this.show(this.byId('group-detail'), false);
  }

  groupItem(group) {
    const label = `${group.name} (${group.member_count} members)${group.description ? ` · ${group.description}` : ''}`;
    const select = this.el('button', {
      className: 'group-select',
      text: label,
      attrs: { type: 'button', 'data-group-id': group.group_id },
    });
    select.classList.toggle('selected', group.group_id === this.state.group?.group_id);
    select.addEventListener('click', () => this.selectGroup(group));
    const item = this.el('li', {}, [select]);
    if (this.canManage()) {
      const remove = this.el('button', {
        className: 'btn-danger',
        text: 'Delete',
        attrs: { type: 'button', 'aria-label': `Delete group ${group.name}` },
      });
      remove.addEventListener('click', () => this.deleteGroup(group));
      item.appendChild(remove);
    }
    return item;
  }

  deleteGroup(group) {
    if (!window.confirm(`Delete group ${group.name}?`)) return null;
    return this.act(
      () => this.api('DELETE', `/groups/${group.group_id}`),
      `Group ${group.name} deleted`,
      () => this.loadOrganizations()
    );
  }

  async selectGroup(group) {
    this.state.group = group;
    for (const button of this.doc.querySelectorAll('#group-list .group-select')) {
      button.classList.toggle('selected', button.dataset.groupId === group.group_id);
    }
    this.byId('group-detail-heading').textContent = `Group: ${group.name}`;
    this.show(this.byId('group-detail'), true);
    await Promise.all([this.loadGroupMembers(), this.loadGroupRoles()]);
  }

  chip(text, removeLabel, onRemove) {
    const chip = this.el('li', { className: 'chip' }, [this.el('span', { text })]);
    if (this.canManage()) {
      const remove = this.el('button', {
        text: '×',
        attrs: { type: 'button', 'aria-label': removeLabel },
      });
      remove.addEventListener('click', onRemove);
      chip.appendChild(remove);
    }
    return chip;
  }

  async loadGroupMembers() {
    const data = await this.api('GET', `/groups/${this.state.group.group_id}/members`);
    const list = this.byId('group-member-list');
    list.replaceChildren();
    for (const member of data.members) {
      list.appendChild(
        this.chip(member.username, `Remove ${member.username} from the group`, () =>
          this.act(
            () =>
              this.api('DELETE', `/groups/${this.state.group.group_id}/members/${member.user_id}`),
            `${member.username} removed from the group`,
            () => this.loadGroups()
          )
        )
      );
    }
  }

  async loadGroupRoles() {
    const data = await this.api('GET', `/groups/${this.state.group.group_id}/roles`);
    const list = this.byId('group-role-list');
    list.replaceChildren();
    for (const role of data.roles) {
      const label = `${role.app_key || 'platform'} / ${role.role_name}`;
      list.appendChild(
        this.chip(label, `Revoke ${label}`, () =>
          this.act(
            () => this.api('DELETE', `/groups/${this.state.group.group_id}/roles/${role.role_id}`),
            `Revoked ${label}`,
            () => this.loadGroupRoles()
          )
        )
      );
    }
  }

  // ----------------------------------------------------------------------- forms

  bindForm(id, handler) {
    const form = this.byId(id);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const succeeded = await handler(this.formValues(form));
      if (succeeded === true) form.reset();
    });
  }

  bindForms() {
    this.bindForm('org-create-form', (values) =>
      this.act(
        () =>
          this.api('POST', '/organizations', {
            name: values.name,
            slug: values.slug,
            ownerUsername: values.ownerUsername || undefined,
          }),
        `Organization ${values.name} created`,
        () => this.loadOrganizations()
      )
    );
    this.bindForm('org-settings-form', (values) =>
      this.act(
        () => this.api('PUT', `/organizations/${this.state.org.org_id}`, values),
        'Organization updated',
        () => this.loadOrganizations()
      ).then(() => false)
    );
    this.bindForm('member-add-form', (values) =>
      this.act(
        () => this.api('POST', `/organizations/${this.state.org.org_id}/members`, values),
        `${values.username} added`,
        () => this.loadOrganizations()
      )
    );
    this.bindForm('group-create-form', (values) =>
      this.act(
        () =>
          this.api('POST', `/organizations/${this.state.org.org_id}/groups`, {
            name: values.name,
            description: values.description || undefined,
          }),
        `Group ${values.name} created`,
        () => this.loadOrganizations()
      )
    );
    this.bindForm('group-member-form', (values) =>
      this.act(
        () => this.api('POST', `/groups/${this.state.group.group_id}/members`, values),
        `${values.username} added to the group`,
        () => this.loadGroups()
      )
    );
    this.bindForm('group-role-form', (values) =>
      this.act(
        () => this.api('POST', `/groups/${this.state.group.group_id}/roles`, values),
        `Granted ${values.appKey} / ${values.roleName}`,
        () => this.loadGroupRoles()
      )
    );
    this.byId('org-delete').addEventListener('click', () => {
      if (!window.confirm(`Delete ${this.state.org.name} and all of its groups?`)) return null;
      return this.act(
        () => this.api('DELETE', `/organizations/${this.state.org.org_id}`),
        'Organization deleted',
        () => {
          this.clearSelection();
          return this.loadOrganizations();
        }
      );
    });
  }

  async start() {
    const signedIn = this.doc.querySelector('main').dataset.loggedIn === 'true';
    this.show(this.byId('org-signed-out'), !signedIn);
    if (!signedIn) return;
    this.show(this.byId('org-layout'), true);
    this.bindForms();
    await this.act(() => this.loadOrganizations());
  }
}

document.addEventListener('DOMContentLoaded', () => new OrganizationsPage(document).start());
