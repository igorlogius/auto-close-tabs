/* global browser */

const saveFolder = document.getElementById("saveFolder");

function recGetFolders(node, depth = 0) {
  let out = new Map();
  if (typeof node.url !== "string") {
    if (node.id !== "root________") {
      out.set(node.id, { depth: depth, title: node.title });
    }
    if (node.children) {
      for (let child of node.children) {
        out = new Map([...out, ...recGetFolders(child, depth + 1)]);
      }
    }
  }
  return out;
}

async function initSaveFolderSelect() {
  const nodes = await browser.bookmarks.getTree();
  let out = new Map();
  let depth = 1;
  for (const node of nodes) {
    out = new Map([...out, ...recGetFolders(node, depth)]);
  }
  for (const [k, v] of out) {
    //console.debug(k, v.title);
    saveFolder.add(new Option("-".repeat(v.depth) + " " + v.title, k));
  }
}

function onChange(evt) {
  let id = evt.target.id;
  let el = document.getElementById(id);

  let value = el.type === "checkbox" ? el.checked : el.value;
  let obj = {};

  if (el.type === "number") {
    try {
      value = parseInt(value);
      if (isNaN(value)) {
        value = el.min;
      }
      if (value < el.min) {
        value = el.min;
      }
    } catch (e) {
      value = el.min;
    }
  }

  obj[id] = value;
  //console.debug(id, value, el.type);
  browser.storage.local.set(obj).catch(console.error);
}

async function onLoad() {
  try {
    await initSaveFolderSelect();
  } catch (e) {
    console.error(e);
  }

  [
    "onlyClosePrivateTabs",
    "saveFolder",
    "closeThreshold",
    "minIdleTime",
    "minIdleTimeUnit",
    "autostart",
    "consider_active",
    "consider_hidden",
    "consider_audible",
    "consider_pinned",
    "consider_hasText",
    "matchers",
    "listmode",
  ].map((id) => {
    browser.storage.local
      .get(id)
      .then((obj) => {
        let el = document.getElementById(id);
        let val = obj[id];

        //console.debug('map', id, val);

        if (typeof val !== "undefined") {
          if (el.type === "checkbox") {
            el.checked = val;
          } else {
            el.value = val;
          }
        }
      })
      .catch(console.error);

    let el = document.getElementById(id);
    el.addEventListener("input", onChange);
  });
}

document.addEventListener("DOMContentLoaded", onLoad);
