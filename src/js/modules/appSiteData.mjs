export class appSiteData {
  title;
  name;
  nameHeadingHelp;
  userId;
  isLoggedIn;

  constructor() {
    this.init('Home', '');
    this.userId = null;
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
  setUser(userId, fullName) {
    this.userId = userId;
    this.name = fullName;
    this.isLoggedIn = true;
  }

  clearUser() {
    this.userId = null;
    this.name = '';
    this.isLoggedIn = false;
  }

  getIsLoggedIn() {
    return this.isLoggedIn;
  }

  getUserId() {
    return this.userId;
  }
}
