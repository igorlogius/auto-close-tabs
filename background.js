/* global browser */

const excluded_tabs = new Set();
const included_windows = new Set();

Array.prototype.asyncFilter = async function (f) {
  var array = this;
  var booleans = await Promise.all(array.map(f));
  return array.filter((x, i) => booleans[i]);
};

let onlyClosePrivateTabs;
let closeThreshold;
let minIdleTime;
let minIdleTimeUnit;
let saveFolder;
let setIntervalId = null;
let autostart = false;
let multipleHighlighted = false;
let consider_active = false;
let consider_hidden = false;
let consider_audible = false;
let consider_pinned = false;
let consider_hasText = false;

async function getFromStorage(type, id, fallback) {
  let tmp = await browser.storage.local.get(id);
  return typeof tmp[id] === type ? tmp[id] : fallback;
}

async function isWhitelisted(url) {
  const selectors = await (async () => {
    try {
      const tmp = await browser.storage.local.get("selectors");
      if (typeof tmp["selectors"] !== "undefined") {
        return tmp["selectors"];
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  })();

  for (const selector of selectors) {
    try {
      if (
        typeof selector.activ === "boolean" &&
        selector.activ === true &&
        typeof selector.url_regex === "string" &&
        selector.url_regex !== "" &&
        new RegExp(selector.url_regex).test(url)
      ) {
        return true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return false;
}

async function tabCleanUp() {
  const qryobj = {
    active: false,
    hidden: false,
    audible: false,
    pinned: false,
  };

  if (consider_active) {
    delete qryobj["active"];
  }
  if (consider_hidden) {
    delete qryobj["hidden"];
  }
  if (consider_audible) {
    delete qryobj["audible"];
  }
  if (consider_pinned) {
    delete qryobj["pinned"];
  }

  // get non active, hidden, audible, highlighted or pinned tabs
  // which are not excluded or in an excluded Window
  // or which match a whitelist expression
  let tabs = await browser.tabs.query(qryobj);
  if (autostart) {
    tabs = tabs.filter((t) => {
      return !included_windows.has(t.windowId);
    });
  } else {
    tabs = tabs.filter((t) => included_windows.has(t.windowId));
  }
  tabs = tabs.filter((t) => !excluded_tabs.has(t.id));
  tabs = await tabs.asyncFilter(async (t) => !(await isWhitelisted(t.url)));

  if (onlyClosePrivateTabs) {
    tabs = tabs.filter((t) => t.incognito);
  }

  if (tabs.length > closeThreshold) {
    let nb_of_tabs_to_close = tabs.length - closeThreshold;

    if (nb_of_tabs_to_close < 1) {
      return;
    }

    // check idle time
    const epoch_now = new Date().getTime();
    const minIdleTimeMilliSecs = minIdleTime * minIdleTimeUnit;

    tabs.sort((a, b) => {
      a.lastAccessed - b.lastAccessed;
    });

    for (const tab of tabs) {
      if (nb_of_tabs_to_close < 1) {
        break;
      }
      nb_of_tabs_to_close--;

      // check last activation time
      const delta = epoch_now - tab.lastAccessed;

      /*
      console.debug(
        "delta > minIdleTimeMilliSecs",
        delta,
        minIdleTimeMilliSecs
      );
        */

      if (delta > minIdleTimeMilliSecs) {
        if (tab.url.startsWith("http")) {
          try {
            // check if tab contains potential text fields with user input
            // exclude hidden and non visible stuff
            let mightHaveUserInput = false;
            if (tab.discarded !== false && consider_hasText) {
              mightHaveUserInput = await browser.tabs.executeScript(tab.id, {
                code: `(function(){
								let els = document.querySelectorAll('input[type="text"],input[type="password"]');
								for(const el of els) {
									if(         el.type !== 'hidden' &&
									   el.style.display !== 'none'   &&
									    typeof el.value === 'string' &&
										   el.value !== ''
									){
										return true;
									}
								}
								els = document.querySelectorAll('textarea');
								for(const el of els) {
									if( el.style.display !== 'none'   &&
									     typeof el.value === 'string' &&
										    el.value !== ''
									){
										return true;
									}
								}
								return false;
							  }());`,
              });
              mightHaveUserInput = mightHaveUserInput[0];

              /*
            console.debug(
              "tab",
              tab.index,
              tab.url,
              "mightHaveUserInput",
              mightHaveUserInput
            );
            */
            }
            if (!mightHaveUserInput) {
              try {
                if (typeof saveFolder === "string" && saveFolder !== "") {
                  let createdetails = {
                    title: tab.title,
                    url: tab.url,
                    parentId: saveFolder,
                  };
                  browser.bookmarks.create(createdetails);
                }
              } catch (e) {
                console.error(e);
              }
              await browser.tabs.remove(tab.id);
            }
          } catch (e) {
            console.error(e, tab.url);
          }
        } else {
          await browser.tabs.remove(tab.id);
        }
      }
    } // for tabs
  }
}

browser.menus.create({
  title: "Exclude",
  contexts: ["tab"],
  onclick: async (info, tab) => {
    if (multipleHighlighted) {
      const tabs = await browser.tabs.query({
        highlighted: true,
        currentWindow: true,
        hidden: false,
      });
      for (const t of tabs) {
        if (!excluded_tabs.has(t.id)) {
          excluded_tabs.add(t.id);
        }
      }
    } else {
      if (!excluded_tabs.has(tab.id)) {
        excluded_tabs.add(tab.id);
      }
    }
  },
});

browser.menus.create({
  title: "Include",
  contexts: ["tab"],
  onclick: async (info, tab) => {
    if (multipleHighlighted) {
      const tabs = await browser.tabs.query({
        highlighted: true,
        currentWindow: true,
        hidden: false,
      });
      for (const t of tabs) {
        if (excluded_tabs.has(t.id)) {
          excluded_tabs.delete(t.id);
        }
      }
    } else {
      if (excluded_tabs.has(tab.id)) {
        excluded_tabs.delete(tab.id);
      }
    }
  },
});

// include Windows ( better to be safe then sorry )
async function onBAClicked(tab) {
  if (autostart) {
    if (!included_windows.has(tab.windowId)) {
      included_windows.delete(tab.windowId);
      browser.browserAction.setBadgeText({
        text: "off",
        windowId: tab.windowId,
      });
      browser.browserAction.setBadgeBackgroundColor({
        color: "red",
        windowId: tab.windowId,
      });
    } else {
      included_windows.add(tab.windowId);
      browser.browserAction.setBadgeText({
        text: "on",
        windowId: tab.windowId,
      });
      browser.browserAction.setBadgeBackgroundColor({
        color: "green",
        windowId: tab.windowId,
      });
    }
  } else {
    if (included_windows.has(tab.windowId)) {
      included_windows.delete(tab.windowId);
      browser.browserAction.setBadgeText({
        text: "off",
        windowId: tab.windowId,
      });
      browser.browserAction.setBadgeBackgroundColor({
        color: "red",
        windowId: tab.windowId,
      });
    } else {
      included_windows.add(tab.windowId);
      browser.browserAction.setBadgeText({
        text: "on",
        windowId: tab.windowId,
      });
      browser.browserAction.setBadgeBackgroundColor({
        color: "green",
        windowId: tab.windowId,
      });
    }
  }
}

function onTabRemoved(tabId /*, removeInfo*/) {
  if (excluded_tabs.has(tabId)) {
    excluded_tabs.delete(tabId);
  }
}

function onWindowRemoved(windowId) {
  if (included_windows.has(windowId)) {
    included_windows.delete(windowId);
  }
}

async function onStorageChanged() {
  onlyClosePrivateTabs = await getFromStorage(
    "boolean",
    "onlyClosePrivateTabs",
    false,
  );
  autostart = await getFromStorage("boolean", "autostart", false);

  consider_active = await getFromStorage("boolean", "consider_active", false);
  consider_hidden = await getFromStorage("boolean", "consider_hidden", false);
  consider_audible = await getFromStorage("boolean", "consider_audible", false);
  consider_pinned = await getFromStorage("boolean", "consider_pinned", false);
  consider_hasText = await getFromStorage("boolean", "consider_hasText", false);

  if (autostart) {
    browser.browserAction.setBadgeText({ text: "on" });
    browser.browserAction.setBadgeBackgroundColor({ color: "green" });
  } else {
    // default state toolbar button/icon
    browser.browserAction.setBadgeText({ text: "off" });
    browser.browserAction.setBadgeBackgroundColor({ color: "red" });
  }

  const windows = await browser.windows.getAll({
    populate: false,
    windowTypes: ["normal"],
  });
  for (const win of windows) {
    if (autostart) {
      if (!included_windows.has(win.id)) {
        browser.browserAction.setBadgeText({
          text: "on",
          windowId: win.id,
        });
        browser.browserAction.setBadgeBackgroundColor({
          color: "green",
          windowId: win.id,
        });
      } else {
        browser.browserAction.setBadgeText({
          text: "off",
          windowId: win.id,
        });
        browser.browserAction.setBadgeBackgroundColor({
          color: "red",
          windowId: win.id,
        });
      }
    } else {
      if (included_windows.has(win.id)) {
        browser.browserAction.setBadgeText({
          text: "on",
          windowId: win.id,
        });
        browser.browserAction.setBadgeBackgroundColor({
          color: "green",
          windowId: win.id,
        });
      } else {
        browser.browserAction.setBadgeText({
          text: "off",
          windowId: win.id,
        });
        browser.browserAction.setBadgeBackgroundColor({
          color: "red",
          windowId: win.id,
        });
      }
    }
  }
  closeThreshold = await getFromStorage("number", "closeThreshold", 7);
  minIdleTime = await getFromStorage("number", "minIdleTime", 3);
  minIdleTimeUnit = parseInt(
    await getFromStorage("string", "minIdleTimeUnit", 86400000),
  );
  saveFolder = await getFromStorage("string", "saveFolder", "");

  clearInterval(setIntervalId);
  setIntervalId = setInterval(tabCleanUp, 1 * 60000); // every x minutes
}

function onTabsHighlighted(highlightInfo) {
  multipleHighlighted = highlightInfo.tabIds.length > 1;
}

(async () => {
  await onStorageChanged();
  browser.storage.onChanged.addListener(onStorageChanged);
  browser.tabs.onRemoved.addListener(onTabRemoved);
  browser.windows.onRemoved.addListener(onWindowRemoved);
  browser.browserAction.onClicked.addListener(onBAClicked);
  browser.tabs.onHighlighted.addListener(onTabsHighlighted);
})();

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }
});
