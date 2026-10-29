export class appSiteData {
  title;
  name;
  nameHeadingHelp;
  constructor() {
    this.init('Home', '');
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
}
