// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/util.js
function resolveUrl(url, baseUrl) {
  if (url.match(/^[a-z]+:\/\//i)) {
    return url;
  }
  if (url.match(/^\/\//)) {
    return window.location.protocol + url;
  }
  if (url.match(/^[a-z]+:/i)) {
    return url;
  }
  const doc = document.implementation.createHTMLDocument();
  const base = doc.createElement("base");
  const a = doc.createElement("a");
  doc.head.appendChild(base);
  doc.body.appendChild(a);
  if (baseUrl) {
    base.href = baseUrl;
  }
  a.href = url;
  return a.href;
}
var uuid = /* @__PURE__ */ (() => {
  let counter = 0;
  const random = () => (
    // eslint-disable-next-line no-bitwise
    `0000${(Math.random() * 36 ** 4 << 0).toString(36)}`.slice(-4)
  );
  return () => {
    counter += 1;
    return `u${random()}${counter}`;
  };
})();
function toArray(arrayLike) {
  const arr = [];
  for (let i = 0, l = arrayLike.length; i < l; i++) {
    arr.push(arrayLike[i]);
  }
  return arr;
}
var styleProps = null;
function getStyleProperties(options = {}) {
  if (styleProps) {
    return styleProps;
  }
  if (options.includeStyleProperties) {
    styleProps = options.includeStyleProperties;
    return styleProps;
  }
  styleProps = toArray(window.getComputedStyle(document.documentElement));
  return styleProps;
}
function px(node, styleProperty) {
  const win = node.ownerDocument.defaultView || window;
  const val = win.getComputedStyle(node).getPropertyValue(styleProperty);
  return val ? parseFloat(val.replace("px", "")) : 0;
}
function getNodeWidth(node) {
  const leftBorder = px(node, "border-left-width");
  const rightBorder = px(node, "border-right-width");
  return node.clientWidth + leftBorder + rightBorder;
}
function getNodeHeight(node) {
  const topBorder = px(node, "border-top-width");
  const bottomBorder = px(node, "border-bottom-width");
  return node.clientHeight + topBorder + bottomBorder;
}
function getImageSize(targetNode, options = {}) {
  const width = options.width || getNodeWidth(targetNode);
  const height = options.height || getNodeHeight(targetNode);
  return { width, height };
}
function getPixelRatio() {
  let ratio;
  let FINAL_PROCESS;
  try {
    FINAL_PROCESS = process;
  } catch (e) {
  }
  const val = FINAL_PROCESS && FINAL_PROCESS.env ? FINAL_PROCESS.env.devicePixelRatio : null;
  if (val) {
    ratio = parseInt(val, 10);
    if (Number.isNaN(ratio)) {
      ratio = 1;
    }
  }
  return ratio || window.devicePixelRatio || 1;
}
var canvasDimensionLimit = 16384;
function checkCanvasDimensions(canvas) {
  if (canvas.width > canvasDimensionLimit || canvas.height > canvasDimensionLimit) {
    if (canvas.width > canvasDimensionLimit && canvas.height > canvasDimensionLimit) {
      if (canvas.width > canvas.height) {
        canvas.height *= canvasDimensionLimit / canvas.width;
        canvas.width = canvasDimensionLimit;
      } else {
        canvas.width *= canvasDimensionLimit / canvas.height;
        canvas.height = canvasDimensionLimit;
      }
    } else if (canvas.width > canvasDimensionLimit) {
      canvas.height *= canvasDimensionLimit / canvas.width;
      canvas.width = canvasDimensionLimit;
    } else {
      canvas.width *= canvasDimensionLimit / canvas.height;
      canvas.height = canvasDimensionLimit;
    }
  }
}
function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      img.decode().then(() => {
        requestAnimationFrame(() => resolve(img));
      });
    };
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
  });
}
async function svgToDataURL(svg) {
  return Promise.resolve().then(() => new XMLSerializer().serializeToString(svg)).then(encodeURIComponent).then((html) => `data:image/svg+xml;charset=utf-8,${html}`);
}
async function nodeToDataURL(node, width, height) {
  const xmlns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(xmlns, "svg");
  const foreignObject = document.createElementNS(xmlns, "foreignObject");
  svg.setAttribute("width", `${width}`);
  svg.setAttribute("height", `${height}`);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  foreignObject.setAttribute("width", "100%");
  foreignObject.setAttribute("height", "100%");
  foreignObject.setAttribute("x", "0");
  foreignObject.setAttribute("y", "0");
  foreignObject.setAttribute("externalResourcesRequired", "true");
  svg.appendChild(foreignObject);
  foreignObject.appendChild(node);
  return svgToDataURL(svg);
}
var isInstanceOfElement = (node, instance) => {
  if (node instanceof instance)
    return true;
  const nodePrototype = Object.getPrototypeOf(node);
  if (nodePrototype === null)
    return false;
  return nodePrototype.constructor.name === instance.name || isInstanceOfElement(nodePrototype, instance);
};

// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/clone-pseudos.js
function formatCSSText(style) {
  const content = style.getPropertyValue("content");
  return `${style.cssText} content: '${content.replace(/'|"/g, "")}';`;
}
function formatCSSProperties(style, options) {
  return getStyleProperties(options).map((name) => {
    const value = style.getPropertyValue(name);
    const priority = style.getPropertyPriority(name);
    return `${name}: ${value}${priority ? " !important" : ""};`;
  }).join(" ");
}
function getPseudoElementStyle(className, pseudo, style, options) {
  const selector = `.${className}:${pseudo}`;
  const cssText = style.cssText ? formatCSSText(style) : formatCSSProperties(style, options);
  return document.createTextNode(`${selector}{${cssText}}`);
}
function clonePseudoElement(nativeNode, clonedNode, pseudo, options) {
  const style = window.getComputedStyle(nativeNode, pseudo);
  const content = style.getPropertyValue("content");
  if (content === "" || content === "none") {
    return;
  }
  const className = uuid();
  try {
    clonedNode.className = `${clonedNode.className} ${className}`;
  } catch (err) {
    return;
  }
  const styleElement = document.createElement("style");
  styleElement.appendChild(getPseudoElementStyle(className, pseudo, style, options));
  clonedNode.appendChild(styleElement);
}
function clonePseudoElements(nativeNode, clonedNode, options) {
  clonePseudoElement(nativeNode, clonedNode, ":before", options);
  clonePseudoElement(nativeNode, clonedNode, ":after", options);
}

// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/mimes.js
var WOFF = "application/font-woff";
var JPEG = "image/jpeg";
var mimes = {
  woff: WOFF,
  woff2: WOFF,
  ttf: "application/font-truetype",
  eot: "application/vnd.ms-fontobject",
  png: "image/png",
  jpg: JPEG,
  jpeg: JPEG,
  gif: "image/gif",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  webp: "image/webp"
};
function getExtension(url) {
  const match = /\.([^./]*?)$/g.exec(url);
  return match ? match[1] : "";
}
function getMimeType(url) {
  const extension = getExtension(url).toLowerCase();
  return mimes[extension] || "";
}

// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/dataurl.js
function getContentFromDataUrl(dataURL) {
  return dataURL.split(/,/)[1];
}
function isDataUrl(url) {
  return url.search(/^(data:)/) !== -1;
}
function makeDataUrl(content, mimeType) {
  return `data:${mimeType};base64,${content}`;
}
async function fetchAsDataURL(url, init, process2) {
  const res = await fetch(url, init);
  if (res.status === 404) {
    throw new Error(`Resource "${res.url}" not found`);
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onloadend = () => {
      try {
        resolve(process2({ res, result: reader.result }));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsDataURL(blob);
  });
}
var cache = {};
function getCacheKey(url, contentType, includeQueryParams) {
  let key = url.replace(/\?.*/, "");
  if (includeQueryParams) {
    key = url;
  }
  if (/ttf|otf|eot|woff2?/i.test(key)) {
    key = key.replace(/.*\//, "");
  }
  return contentType ? `[${contentType}]${key}` : key;
}
async function resourceToDataURL(resourceUrl, contentType, options) {
  const cacheKey = getCacheKey(resourceUrl, contentType, options.includeQueryParams);
  if (cache[cacheKey] != null) {
    return cache[cacheKey];
  }
  if (options.cacheBust) {
    resourceUrl += (/\?/.test(resourceUrl) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime();
  }
  let dataURL;
  try {
    const content = await fetchAsDataURL(resourceUrl, options.fetchRequestInit, ({ res, result }) => {
      if (!contentType) {
        contentType = res.headers.get("Content-Type") || "";
      }
      return getContentFromDataUrl(result);
    });
    dataURL = makeDataUrl(content, contentType);
  } catch (error) {
    dataURL = options.imagePlaceholder || "";
    let msg = `Failed to fetch resource: ${resourceUrl}`;
    if (error) {
      msg = typeof error === "string" ? error : error.message;
    }
    if (msg) {
      console.warn(msg);
    }
  }
  cache[cacheKey] = dataURL;
  return dataURL;
}

// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/clone-node.js
async function cloneCanvasElement(canvas) {
  const dataURL = canvas.toDataURL();
  if (dataURL === "data:,") {
    return canvas.cloneNode(false);
  }
  return createImage(dataURL);
}
async function cloneVideoElement(video, options) {
  if (video.currentSrc) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    ctx === null || ctx === void 0 ? void 0 : ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataURL2 = canvas.toDataURL();
    return createImage(dataURL2);
  }
  const poster = video.poster;
  const contentType = getMimeType(poster);
  const dataURL = await resourceToDataURL(poster, contentType, options);
  return createImage(dataURL);
}
async function cloneIFrameElement(iframe, options) {
  var _a;
  try {
    if ((_a = iframe === null || iframe === void 0 ? void 0 : iframe.contentDocument) === null || _a === void 0 ? void 0 : _a.body) {
      return await cloneNode(iframe.contentDocument.body, options, true);
    }
  } catch (_b) {
  }
  return iframe.cloneNode(false);
}
async function cloneSingleNode(node, options) {
  if (isInstanceOfElement(node, HTMLCanvasElement)) {
    return cloneCanvasElement(node);
  }
  if (isInstanceOfElement(node, HTMLVideoElement)) {
    return cloneVideoElement(node, options);
  }
  if (isInstanceOfElement(node, HTMLIFrameElement)) {
    return cloneIFrameElement(node, options);
  }
  return node.cloneNode(isSVGElement(node));
}
var isSlotElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SLOT";
var isSVGElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SVG";
async function cloneChildren(nativeNode, clonedNode, options) {
  var _a, _b;
  if (isSVGElement(clonedNode)) {
    return clonedNode;
  }
  let children = [];
  if (isSlotElement(nativeNode) && nativeNode.assignedNodes) {
    children = toArray(nativeNode.assignedNodes());
  } else if (isInstanceOfElement(nativeNode, HTMLIFrameElement) && ((_a = nativeNode.contentDocument) === null || _a === void 0 ? void 0 : _a.body)) {
    children = toArray(nativeNode.contentDocument.body.childNodes);
  } else {
    children = toArray(((_b = nativeNode.shadowRoot) !== null && _b !== void 0 ? _b : nativeNode).childNodes);
  }
  if (children.length === 0 || isInstanceOfElement(nativeNode, HTMLVideoElement)) {
    return clonedNode;
  }
  await children.reduce((deferred, child) => deferred.then(() => cloneNode(child, options)).then((clonedChild) => {
    if (clonedChild) {
      clonedNode.appendChild(clonedChild);
    }
  }), Promise.resolve());
  return clonedNode;
}
function cloneCSSStyle(nativeNode, clonedNode, options) {
  const targetStyle = clonedNode.style;
  if (!targetStyle) {
    return;
  }
  const sourceStyle = window.getComputedStyle(nativeNode);
  if (sourceStyle.cssText) {
    targetStyle.cssText = sourceStyle.cssText;
    targetStyle.transformOrigin = sourceStyle.transformOrigin;
  } else {
    getStyleProperties(options).forEach((name) => {
      let value = sourceStyle.getPropertyValue(name);
      if (name === "font-size" && value.endsWith("px")) {
        const reducedFont = Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1;
        value = `${reducedFont}px`;
      }
      if (isInstanceOfElement(nativeNode, HTMLIFrameElement) && name === "display" && value === "inline") {
        value = "block";
      }
      if (name === "d" && clonedNode.getAttribute("d")) {
        value = `path(${clonedNode.getAttribute("d")})`;
      }
      targetStyle.setProperty(name, value, sourceStyle.getPropertyPriority(name));
    });
  }
}
function cloneInputValue(nativeNode, clonedNode) {
  if (isInstanceOfElement(nativeNode, HTMLTextAreaElement)) {
    clonedNode.innerHTML = nativeNode.value;
  }
  if (isInstanceOfElement(nativeNode, HTMLInputElement)) {
    clonedNode.setAttribute("value", nativeNode.value);
  }
}
function cloneSelectValue(nativeNode, clonedNode) {
  if (isInstanceOfElement(nativeNode, HTMLSelectElement)) {
    const clonedSelect = clonedNode;
    const selectedOption = Array.from(clonedSelect.children).find((child) => nativeNode.value === child.getAttribute("value"));
    if (selectedOption) {
      selectedOption.setAttribute("selected", "");
    }
  }
}
function decorate(nativeNode, clonedNode, options) {
  if (isInstanceOfElement(clonedNode, Element)) {
    cloneCSSStyle(nativeNode, clonedNode, options);
    clonePseudoElements(nativeNode, clonedNode, options);
    cloneInputValue(nativeNode, clonedNode);
    cloneSelectValue(nativeNode, clonedNode);
  }
  return clonedNode;
}
async function ensureSVGSymbols(clone, options) {
  const uses = clone.querySelectorAll ? clone.querySelectorAll("use") : [];
  if (uses.length === 0) {
    return clone;
  }
  const processedDefs = {};
  for (let i = 0; i < uses.length; i++) {
    const use = uses[i];
    const id = use.getAttribute("xlink:href");
    if (id) {
      const exist = clone.querySelector(id);
      const definition = document.querySelector(id);
      if (!exist && definition && !processedDefs[id]) {
        processedDefs[id] = await cloneNode(definition, options, true);
      }
    }
  }
  const nodes = Object.values(processedDefs);
  if (nodes.length) {
    const ns = "http://www.w3.org/1999/xhtml";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("xmlns", ns);
    svg.style.position = "absolute";
    svg.style.width = "0";
    svg.style.height = "0";
    svg.style.overflow = "hidden";
    svg.style.display = "none";
    const defs = document.createElementNS(ns, "defs");
    svg.appendChild(defs);
    for (let i = 0; i < nodes.length; i++) {
      defs.appendChild(nodes[i]);
    }
    clone.appendChild(svg);
  }
  return clone;
}
async function cloneNode(node, options, isRoot) {
  if (!isRoot && options.filter && !options.filter(node)) {
    return null;
  }
  return Promise.resolve(node).then((clonedNode) => cloneSingleNode(clonedNode, options)).then((clonedNode) => cloneChildren(node, clonedNode, options)).then((clonedNode) => decorate(node, clonedNode, options)).then((clonedNode) => ensureSVGSymbols(clonedNode, options));
}

// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/embed-resources.js
var URL_REGEX = /url\((['"]?)([^'"]+?)\1\)/g;
var URL_WITH_FORMAT_REGEX = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g;
var FONT_SRC_REGEX = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
function toRegex(url) {
  const escaped = url.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp(`(url\\(['"]?)(${escaped})(['"]?\\))`, "g");
}
function parseURLs(cssText) {
  const urls = [];
  cssText.replace(URL_REGEX, (raw, quotation, url) => {
    urls.push(url);
    return raw;
  });
  return urls.filter((url) => !isDataUrl(url));
}
async function embed(cssText, resourceURL, baseURL, options, getContentFromUrl) {
  try {
    const resolvedURL = baseURL ? resolveUrl(resourceURL, baseURL) : resourceURL;
    const contentType = getMimeType(resourceURL);
    let dataURL;
    if (getContentFromUrl) {
      const content = await getContentFromUrl(resolvedURL);
      dataURL = makeDataUrl(content, contentType);
    } else {
      dataURL = await resourceToDataURL(resolvedURL, contentType, options);
    }
    return cssText.replace(toRegex(resourceURL), `$1${dataURL}$3`);
  } catch (error) {
  }
  return cssText;
}
function filterPreferredFontFormat(str, { preferredFontFormat }) {
  return !preferredFontFormat ? str : str.replace(FONT_SRC_REGEX, (match) => {
    while (true) {
      const [src, , format] = URL_WITH_FORMAT_REGEX.exec(match) || [];
      if (!format) {
        return "";
      }
      if (format === preferredFontFormat) {
        return `src: ${src};`;
      }
    }
  });
}
function shouldEmbed(url) {
  return url.search(URL_REGEX) !== -1;
}
async function embedResources(cssText, baseUrl, options) {
  if (!shouldEmbed(cssText)) {
    return cssText;
  }
  const filteredCSSText = filterPreferredFontFormat(cssText, options);
  const urls = parseURLs(filteredCSSText);
  return urls.reduce((deferred, url) => deferred.then((css) => embed(css, url, baseUrl, options)), Promise.resolve(filteredCSSText));
}

// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/embed-images.js
async function embedProp(propName, node, options) {
  var _a;
  const propValue = (_a = node.style) === null || _a === void 0 ? void 0 : _a.getPropertyValue(propName);
  if (propValue) {
    const cssString = await embedResources(propValue, null, options);
    node.style.setProperty(propName, cssString, node.style.getPropertyPriority(propName));
    return true;
  }
  return false;
}
async function embedBackground(clonedNode, options) {
  ;
  await embedProp("background", clonedNode, options) || await embedProp("background-image", clonedNode, options);
  await embedProp("mask", clonedNode, options) || await embedProp("-webkit-mask", clonedNode, options) || await embedProp("mask-image", clonedNode, options) || await embedProp("-webkit-mask-image", clonedNode, options);
}
async function embedImageNode(clonedNode, options) {
  const isImageElement = isInstanceOfElement(clonedNode, HTMLImageElement);
  if (!(isImageElement && !isDataUrl(clonedNode.src)) && !(isInstanceOfElement(clonedNode, SVGImageElement) && !isDataUrl(clonedNode.href.baseVal))) {
    return;
  }
  const url = isImageElement ? clonedNode.src : clonedNode.href.baseVal;
  const dataURL = await resourceToDataURL(url, getMimeType(url), options);
  await new Promise((resolve, reject) => {
    clonedNode.onload = resolve;
    clonedNode.onerror = options.onImageErrorHandler ? (...attributes) => {
      try {
        resolve(options.onImageErrorHandler(...attributes));
      } catch (error) {
        reject(error);
      }
    } : reject;
    const image = clonedNode;
    if (image.decode) {
      image.decode = resolve;
    }
    if (image.loading === "lazy") {
      image.loading = "eager";
    }
    if (isImageElement) {
      clonedNode.srcset = "";
      clonedNode.src = dataURL;
    } else {
      clonedNode.href.baseVal = dataURL;
    }
  });
}
async function embedChildren(clonedNode, options) {
  const children = toArray(clonedNode.childNodes);
  const deferreds = children.map((child) => embedImages(child, options));
  await Promise.all(deferreds).then(() => clonedNode);
}
async function embedImages(clonedNode, options) {
  if (isInstanceOfElement(clonedNode, Element)) {
    await embedBackground(clonedNode, options);
    await embedImageNode(clonedNode, options);
    await embedChildren(clonedNode, options);
  }
}

// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/apply-style.js
function applyStyle(node, options) {
  const { style } = node;
  if (options.backgroundColor) {
    style.backgroundColor = options.backgroundColor;
  }
  if (options.width) {
    style.width = `${options.width}px`;
  }
  if (options.height) {
    style.height = `${options.height}px`;
  }
  const manual = options.style;
  if (manual != null) {
    Object.keys(manual).forEach((key) => {
      style[key] = manual[key];
    });
  }
  return node;
}

// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/embed-webfonts.js
var cssFetchCache = {};
async function fetchCSS(url) {
  let cache2 = cssFetchCache[url];
  if (cache2 != null) {
    return cache2;
  }
  const res = await fetch(url);
  const cssText = await res.text();
  cache2 = { url, cssText };
  cssFetchCache[url] = cache2;
  return cache2;
}
async function embedFonts(data, options) {
  let cssText = data.cssText;
  const regexUrl = /url\(["']?([^"')]+)["']?\)/g;
  const fontLocs = cssText.match(/url\([^)]+\)/g) || [];
  const loadFonts = fontLocs.map(async (loc) => {
    let url = loc.replace(regexUrl, "$1");
    if (!url.startsWith("https://")) {
      url = new URL(url, data.url).href;
    }
    return fetchAsDataURL(url, options.fetchRequestInit, ({ result }) => {
      cssText = cssText.replace(loc, `url(${result})`);
      return [loc, result];
    });
  });
  return Promise.all(loadFonts).then(() => cssText);
}
function parseCSS(source) {
  if (source == null) {
    return [];
  }
  const result = [];
  const commentsRegex = /(\/\*[\s\S]*?\*\/)/gi;
  let cssText = source.replace(commentsRegex, "");
  const keyframesRegex = new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})", "gi");
  while (true) {
    const matches = keyframesRegex.exec(cssText);
    if (matches === null) {
      break;
    }
    result.push(matches[0]);
  }
  cssText = cssText.replace(keyframesRegex, "");
  const importRegex = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi;
  const combinedCSSRegex = "((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})";
  const unifiedRegex = new RegExp(combinedCSSRegex, "gi");
  while (true) {
    let matches = importRegex.exec(cssText);
    if (matches === null) {
      matches = unifiedRegex.exec(cssText);
      if (matches === null) {
        break;
      } else {
        importRegex.lastIndex = unifiedRegex.lastIndex;
      }
    } else {
      unifiedRegex.lastIndex = importRegex.lastIndex;
    }
    result.push(matches[0]);
  }
  return result;
}
async function getCSSRules(styleSheets, options) {
  const ret = [];
  const deferreds = [];
  styleSheets.forEach((sheet) => {
    if ("cssRules" in sheet) {
      try {
        toArray(sheet.cssRules || []).forEach((item, index) => {
          if (item.type === CSSRule.IMPORT_RULE) {
            let importIndex = index + 1;
            const url = item.href;
            const deferred = fetchCSS(url).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
              try {
                sheet.insertRule(rule, rule.startsWith("@import") ? importIndex += 1 : sheet.cssRules.length);
              } catch (error) {
                console.error("Error inserting rule from remote css", {
                  rule,
                  error
                });
              }
            })).catch((e) => {
              console.error("Error loading remote css", e.toString());
            });
            deferreds.push(deferred);
          }
        });
      } catch (e) {
        const inline = styleSheets.find((a) => a.href == null) || document.styleSheets[0];
        if (sheet.href != null) {
          deferreds.push(fetchCSS(sheet.href).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
            inline.insertRule(rule, inline.cssRules.length);
          })).catch((err) => {
            console.error("Error loading remote stylesheet", err);
          }));
        }
        console.error("Error inlining remote css file", e);
      }
    }
  });
  return Promise.all(deferreds).then(() => {
    styleSheets.forEach((sheet) => {
      if ("cssRules" in sheet) {
        try {
          toArray(sheet.cssRules || []).forEach((item) => {
            ret.push(item);
          });
        } catch (e) {
          console.error(`Error while reading CSS rules from ${sheet.href}`, e);
        }
      }
    });
    return ret;
  });
}
function getWebFontRules(cssRules) {
  return cssRules.filter((rule) => rule.type === CSSRule.FONT_FACE_RULE).filter((rule) => shouldEmbed(rule.style.getPropertyValue("src")));
}
async function parseWebFontRules(node, options) {
  if (node.ownerDocument == null) {
    throw new Error("Provided element is not within a Document");
  }
  const styleSheets = toArray(node.ownerDocument.styleSheets);
  const cssRules = await getCSSRules(styleSheets, options);
  return getWebFontRules(cssRules);
}
function normalizeFontFamily(font) {
  return font.trim().replace(/["']/g, "");
}
function getUsedFonts(node) {
  const fonts = /* @__PURE__ */ new Set();
  function traverse(node2) {
    const fontFamily = node2.style.fontFamily || getComputedStyle(node2).fontFamily;
    fontFamily.split(",").forEach((font) => {
      fonts.add(normalizeFontFamily(font));
    });
    Array.from(node2.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        traverse(child);
      }
    });
  }
  traverse(node);
  return fonts;
}
async function getWebFontCSS(node, options) {
  const rules = await parseWebFontRules(node, options);
  const usedFonts = getUsedFonts(node);
  const cssTexts = await Promise.all(rules.filter((rule) => usedFonts.has(normalizeFontFamily(rule.style.fontFamily))).map((rule) => {
    const baseUrl = rule.parentStyleSheet ? rule.parentStyleSheet.href : null;
    return embedResources(rule.cssText, baseUrl, options);
  }));
  return cssTexts.join("\n");
}
async function embedWebFonts(clonedNode, options) {
  const cssText = options.fontEmbedCSS != null ? options.fontEmbedCSS : options.skipFonts ? null : await getWebFontCSS(clonedNode, options);
  if (cssText) {
    const styleNode = document.createElement("style");
    const sytleContent = document.createTextNode(cssText);
    styleNode.appendChild(sytleContent);
    if (clonedNode.firstChild) {
      clonedNode.insertBefore(styleNode, clonedNode.firstChild);
    } else {
      clonedNode.appendChild(styleNode);
    }
  }
}

// ../node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/index.js
async function toSvg(node, options = {}) {
  const { width, height } = getImageSize(node, options);
  const clonedNode = await cloneNode(node, options, true);
  await embedWebFonts(clonedNode, options);
  await embedImages(clonedNode, options);
  applyStyle(clonedNode, options);
  const datauri = await nodeToDataURL(clonedNode, width, height);
  return datauri;
}
async function toCanvas(node, options = {}) {
  const { width, height } = getImageSize(node, options);
  const svg = await toSvg(node, options);
  const img = await createImage(svg);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const ratio = options.pixelRatio || getPixelRatio();
  const canvasWidth = options.canvasWidth || width;
  const canvasHeight = options.canvasHeight || height;
  canvas.width = canvasWidth * ratio;
  canvas.height = canvasHeight * ratio;
  if (!options.skipAutoScale) {
    checkCanvasDimensions(canvas);
  }
  canvas.style.width = `${canvasWidth}`;
  canvas.style.height = `${canvasHeight}`;
  if (options.backgroundColor) {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function toPng(node, options = {}) {
  const canvas = await toCanvas(node, options);
  return canvas.toDataURL();
}

// visual-edit.mts
var LOC_ATTR = "data-chef-loc";
var OVERLAY_ID = "stunning-visual-editor-overlay";
var active = false;
var parentWindow = null;
var parentOrigin = "*";
var overlay = null;
var hoverOutline = null;
var selectedEl = null;
var passive = false;
var hoverBadge = null;
var passiveHoverEl = null;
var BADGE_ID = OVERLAY_ID + "-badge";
function makeBox(id, color, bg) {
  const el = document.createElement("div");
  el.id = id;
  el.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 2147483646;
    border: 2px solid ${color};
    background: ${bg};
    border-radius: 3px;
    transition: top 0.06s ease-out, left 0.06s ease-out, width 0.06s ease-out, height 0.06s ease-out;
    display: none;
    box-sizing: border-box;
  `;
  return el;
}
function ensureOverlays() {
  if (!overlay) {
    overlay = makeBox(OVERLAY_ID, "#10B981", "rgba(16,185,129,0.08)");
    document.body.appendChild(overlay);
  }
  if (!hoverOutline) {
    hoverOutline = makeBox(OVERLAY_ID + "-hover", "rgba(156,163,175,0.55)", "rgba(156,163,175,0.05)");
    document.body.appendChild(hoverOutline);
  }
}
function positionBox(box, el) {
  if (!box) {
    return;
  }
  const rect = el.getBoundingClientRect();
  box.style.top = `${rect.top}px`;
  box.style.left = `${rect.left}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  box.style.display = "block";
}
function closestStamped(el) {
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    if (node.id === OVERLAY_ID || node.id === OVERLAY_ID + "-hover" || node.id === BADGE_ID) {
      return null;
    }
    if (node.hasAttribute && node.hasAttribute(LOC_ATTR)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
function getEditableText(el) {
  let textNodeCount = 0;
  let value = null;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return null;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent ?? "";
      if (raw.trim().length === 0) {
        continue;
      }
      textNodeCount++;
      if (textNodeCount > 1) {
        return null;
      }
      value = raw;
    }
  }
  return value;
}
function buildSelection(el) {
  const loc = el.getAttribute(LOC_ATTR);
  if (!loc) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  const editableText = getEditableText(el);
  return {
    loc,
    tagName: el.tagName.toLowerCase(),
    className: el.getAttribute("class") ?? "",
    text: editableText !== null ? editableText.trim() : null,
    isSingleTextNode: editableText !== null,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
  };
}
function onMouseMove(e) {
  if (!active) {
    return;
  }
  const el = closestStamped(e.target);
  if (!el || el === selectedEl) {
    if (hoverOutline) {
      hoverOutline.style.display = "none";
    }
    return;
  }
  positionBox(hoverOutline, el);
}
function onClick(e) {
  if (!active) {
    return;
  }
  const el = closestStamped(e.target);
  if (!el) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  selectedEl = el;
  positionBox(overlay, el);
  if (hoverOutline) {
    hoverOutline.style.display = "none";
  }
  const payload = buildSelection(el);
  if (payload && parentWindow) {
    parentWindow.postMessage({ type: "stunningVisualEdit", kind: "elementSelected", payload }, parentOrigin);
  }
}
function onScrollOrResize() {
  if (!active) {
    return;
  }
  if (selectedEl) {
    positionBox(overlay, selectedEl);
  }
}
function ensureHoverBadge() {
  if (hoverBadge) {
    return hoverBadge;
  }
  const b = document.createElement("div");
  b.id = BADGE_ID;
  b.setAttribute("aria-label", "Edit this element");
  b.title = "Edit this element";
  b.textContent = "\u270E";
  b.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    pointer-events: auto;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: rgba(107, 114, 128, 0.85);
    color: #FFFFFF;
    font: 12px/1 system-ui, -apple-system, sans-serif;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
    user-select: none;
  `;
  b.addEventListener("click", onBadgeClick, true);
  document.body.appendChild(b);
  hoverBadge = b;
  return b;
}
function positionBadge(el) {
  const badge = ensureHoverBadge();
  const rect = el.getBoundingClientRect();
  badge.style.top = `${Math.max(2, rect.top + 4)}px`;
  badge.style.left = `${Math.max(2, rect.right - 26)}px`;
  badge.style.display = "flex";
}
function hidePassiveAffordance() {
  if (hoverBadge) {
    hoverBadge.style.display = "none";
  }
  if (hoverOutline && !active) {
    hoverOutline.style.display = "none";
  }
}
function onPassiveMouseMove(e) {
  if (!passive || active) {
    return;
  }
  if (hoverBadge && e.target === hoverBadge) {
    return;
  }
  const el = closestStamped(e.target);
  if (!el) {
    hidePassiveAffordance();
    return;
  }
  passiveHoverEl = el;
  positionBox(hoverOutline, el);
  positionBadge(el);
}
function onBadgeClick(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!passiveHoverEl) {
    return;
  }
  const payload = buildSelection(passiveHoverEl);
  if (payload && parentWindow) {
    parentWindow.postMessage({ type: "stunningVisualEdit", kind: "requestEnable", payload }, parentOrigin);
  }
}
function enablePassiveHover(source, origin) {
  parentWindow = source;
  parentOrigin = origin;
  if (passive) {
    return;
  }
  passive = true;
  ensureOverlays();
  ensureHoverBadge();
  document.addEventListener("mousemove", onPassiveMouseMove, true);
}
function disablePassiveHover() {
  passive = false;
  passiveHoverEl = null;
  hidePassiveAffordance();
  document.removeEventListener("mousemove", onPassiveMouseMove, true);
}
function enableVisualEdit(source, origin) {
  parentWindow = source;
  parentOrigin = origin;
  hidePassiveAffordance();
  if (active) {
    return;
  }
  active = true;
  ensureOverlays();
  document.body.style.cursor = "crosshair";
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize, true);
  if (parentWindow) {
    parentWindow.postMessage({ type: "stunningVisualEdit", kind: "enabled" }, parentOrigin);
  }
}
function disableVisualEdit() {
  active = false;
  selectedEl = null;
  document.body.style.cursor = "";
  if (overlay) {
    overlay.style.display = "none";
  }
  if (hoverOutline) {
    hoverOutline.style.display = "none";
  }
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("click", onClick, true);
  window.removeEventListener("scroll", onScrollOrResize, true);
  window.removeEventListener("resize", onScrollOrResize, true);
  if (parentWindow) {
    parentWindow.postMessage({ type: "stunningVisualEdit", kind: "disabled" }, parentOrigin);
  }
}
function applyEphemeralEdit(payload) {
  if (!payload || !payload.loc) {
    return;
  }
  const el = selectedEl && selectedEl.getAttribute(LOC_ATTR) === payload.loc ? selectedEl : document.querySelector(`[${LOC_ATTR}="${CSS.escape(payload.loc)}"]`);
  if (!el) {
    return;
  }
  if (typeof payload.className === "string") {
    el.setAttribute("class", payload.className);
  }
  if (typeof payload.text === "string" && getEditableText(el) !== null) {
    setEditableText(el, payload.text);
  }
  if (el === selectedEl) {
    positionBox(overlay, el);
  }
}
function setEditableText(el, newText) {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0) {
      node.textContent = newText;
      return;
    }
  }
  el.textContent = newText;
}

// worker.mts
async function respondToMessage(message) {
  if (message.source !== window.parent) {
    return;
  }
  if (message.data.type !== "stunningPreviewRequest") {
    return;
  }
  if (message.data.request === "ping") {
    message.source.postMessage({ type: "pong" }, message.origin);
  }
  if (message.data.request === "enableVisualEdit") {
    enableVisualEdit(message.source, message.origin);
  }
  if (message.data.request === "disableVisualEdit") {
    disableVisualEdit();
  }
  if (message.data.request === "enablePassiveHover") {
    enablePassiveHover(message.source, message.origin);
  }
  if (message.data.request === "disablePassiveHover") {
    disablePassiveHover();
  }
  if (message.data.request === "applyEphemeralEdit") {
    applyEphemeralEdit(message.data.payload);
  }
  if (message.data.request === "screenshot") {
    try {
      const images = document.querySelectorAll("img");
      const imagePromises = [];
      images.forEach((img) => {
        if (img.src.startsWith("data:") || img.src.startsWith(window.location.origin)) {
          return;
        }
        if (!img.crossOrigin) {
          const src = img.src;
          const promise = new Promise((resolve) => {
            const onDone = () => {
              img.removeEventListener("load", onDone);
              img.removeEventListener("error", onDone);
              resolve();
            };
            img.addEventListener("load", onDone);
            img.addEventListener("error", onDone);
            img.crossOrigin = "anonymous";
            img.src = src;
          });
          imagePromises.push(promise);
        }
      });
      const videos = document.querySelectorAll("video");
      videos.forEach((video) => {
        const src = video.currentSrc || video.src;
        if (!src || src.startsWith("data:") || src.startsWith(window.location.origin)) {
          return;
        }
        if (!video.crossOrigin) {
          const promise = new Promise((resolve) => {
            const onDone = () => {
              video.removeEventListener("loadeddata", onDone);
              video.removeEventListener("error", onDone);
              resolve();
            };
            video.addEventListener("loadeddata", onDone);
            video.addEventListener("error", onDone);
            video.crossOrigin = "anonymous";
            video.src = src;
            video.play?.().catch(() => {
            });
          });
          imagePromises.push(promise);
        }
      });
      document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        const href = link.href;
        if (!href || href.startsWith(window.location.origin)) {
          return;
        }
        if (link.crossOrigin || link.dataset.chefCorsClone || document.querySelector(`link[data-chef-cors-clone][href="${CSS.escape(href)}"]`)) {
          return;
        }
        const promise = new Promise((resolve) => {
          const clone = document.createElement("link");
          clone.rel = "stylesheet";
          clone.crossOrigin = "anonymous";
          clone.dataset.chefCorsClone = "true";
          clone.addEventListener("load", () => {
            link.remove();
            resolve();
          });
          clone.addEventListener("error", () => resolve());
          clone.href = href;
          document.head.appendChild(clone);
        });
        imagePromises.push(promise);
      });
      await Promise.race([
        Promise.all(imagePromises),
        new Promise((r) => setTimeout(r, 3e3))
      ]);
      const viewportHeight = window.innerHeight;
      const shotOptions = {
        height: viewportHeight,
        style: {
          maxHeight: `${viewportHeight}px`,
          overflow: "hidden"
        },
        fetchRequestInit: {
          mode: "cors",
          credentials: "omit"
        }
      };
      let imageData;
      try {
        imageData = await toPng(document.body, shotOptions);
      } catch (err) {
        console.warn("[Screenshot] Retrying without video/canvas nodes:", err);
        imageData = await toPng(document.body, {
          ...shotOptions,
          filter: (node) => {
            const tag = node.tagName;
            return tag !== "VIDEO" && tag !== "CANVAS";
          }
        });
      }
      message.source.postMessage({ type: "screenshot", data: imageData }, message.origin);
    } catch (error) {
      console.error("[Screenshot] Failed:", error);
      message.source.postMessage({ type: "screenshot", data: null }, message.origin);
    }
  }
}
export {
  respondToMessage
};
