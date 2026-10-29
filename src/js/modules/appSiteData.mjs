export class appSiteData {
  title;
  name;
  nameHeadingHelp;
  userId;
  username;
  isLoggedIn;

  constructor() {
    this.init('Home', '');
    this.userId = null;
    this.username = null;
    this.isLoggedIn = false;
  }

  init(title, name) {
    this.setTitle(title);
    this.setName(name);
    if (name === '') {
      this.setNameHeadingHelp('the ');
    } else {
      this.setNameHeadingHelp("' personal ");
    }
  }

  getTitle() {
    return this.title;
  }

  setTitle(title) {
    this.title = title;
  }

  getName() {
    return this.name;
  }

  setName(name) {
    this.name = name;
  }

  getNameHeadingHelp() {
    return this.nameHeadingHelp;
  }

  setNameHeadingHelp(nameHeadingHelp) {
    this.nameHeadingHelp = nameHeadingHelp;
  }

  getSiteTitle() {
    return `${this.getTitle()} - ${this.getName()}${this.getNameHeadingHelp()}Flash Card Service.`;
  }

  // User session management
  setUser(userId, username) {
    this.userId = userId;
    this.username = username;
    this.isLoggedIn = true;
  }

  clearUser() {
    this.userId = null;
    this.username = null;
    this.isLoggedIn = false;
  }

  getIsLoggedIn() {
    return this.isLoggedIn;
  }

  getUsername() {
    return this.username;
  }

  getUserId() {
    return this.userId;
  }
}
