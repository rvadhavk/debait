export default function el(tagName, ...rest) {
  let properties = {}, children, initFn;
  if (typeof rest[0]?.[Symbol.iterator] === 'function') {
    properties = {};
    children = rest[0];
    initFn = rest[1];
  } else if (typeof rest[0] === 'function') {
    properties = {};
    children = [];
    initFn = rest[0];
  } else {
    properties = rest[0] ?? {};
    children = rest[1] ?? [];
    initFn = rest[2];
  }
  const element = document.createElement(tagName);
  mergeInto(element, properties);
  if (typeof children === 'string') {
    element.append(children);
  } else {
    element.append(...children);
  }
  initFn?.(element);
  return element;
}

function mergeInto(dest, src) {
  if (dest instanceof NamedNodeMap) {
    for (let key in src) {
      dest.setNamedItem(key).value = src[key];
    }
  } else if (dest instanceof DOMTokenList) {
    for (let value of src) {
      dest.add(value);
    }
  } else if (dest instanceof StylePropertyMap) {
    throw 'unsupported';
  } else if (dest instanceof Array) {
    dest.push(...src);
  } else {
    for (let key in src) {
      if (typeof (src[key]) !== 'object' || !(key in dest)) {
        dest[key] = src[key];
      } else {
        mergeInto(dest[key], src[key]);
      }
    }
  }
}
