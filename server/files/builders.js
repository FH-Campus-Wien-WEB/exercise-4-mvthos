export class ElementBuilder {
    constructor(tag) {
      this.element = document.createElement(tag);
    }
  
    id(id) {
      this.element.id = id;
      return this;
    }
  
    class(clazz) {
      this.element.classList.add(clazz);
      return this;
    }
  
    pluralizedText(content, array) {
      return this.text(array.length > 1 ? content + "s" : content);
    }
  
    text(content) {
      this.element.textContent = content;
      return this;
    }
  
    with(name, value) {
      this.element.setAttribute(name, value);
      return this;
    }
  
    listener(name, listener) {
      this.element.addEventListener(name, listener);
      return this;
    }
  
    append(child) {
      child.appendTo(this.element);
      return this;
    }
  
    appendTo(parent) {
      parent.append(this.element);
      return this.element;
    }
  
    insertBefore(parent, sibling) {
      parent.insertBefore(this.element, sibling);
      return this.element;
    }
  }
  
  export class ParentChildBuilder extends ElementBuilder {
    constructor(parentTag, childTag) {
      super(parentTag);
      this.childTag = childTag;
    }
  
    append(text) {
      const childCreator = new ElementBuilder(this.childTag).text(text);
      if (this.childClazz) {
        childCreator.class(this.childClazz);
      }
  
      super.append(childCreator);
    }
  
    childClass(childClazz) {
      this.childClazz = childClazz;
      return this;
    }
  
    items() {
      if (arguments.length === 1 && Array.isArray(arguments[0])) {
        arguments[0].forEach((item) => this.append(item));
      } else {
        for (var i = 0; i < arguments.length; i++) {
          this.append(arguments[i]);
        }
      }
  
      return this;
    }
  }