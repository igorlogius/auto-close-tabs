/* global browser */

let closeThreshold = 7;
let saveFolder = "unfiled_____";
let setIntervalIds = [];
let autostart = false;
let ignoreRules = [];

function updateBadge(text, color) {
  browser.browserAction.setBadgeText({
    text,
  });
  browser.browserAction.setBadgeBackgroundColor({
    color,
  });
}

async function setToStorage(id, value) {
  let obj = {};
  obj[id] = value;
  return browser.storage.local.set(obj);
}

async function getFromStorage(type, id, fallback) {
  let tmp = await browser.storage.local.get(id);
  if (typeof tmp[id] === type) {
    return tmp[id];
  } else {
    setToStorage(id, fallback);
    return fallback;
  }
}

async function rebuildIgnoreRules(
  ignorerulesStr_container_regexs,
  ignorerulesStr_url_regexs,
) {
  ignoreRules = [];

  const container_regexs = ignorerulesStr_container_regexs.split("\n");
  const url_regexs = ignorerulesStr_url_regexs.split("\n");

  for (let i = 0; i < container_regexs.length && i < url_regexs.length; i++) {
    try {
      left = container_regexs[i].trim();
      right = url_regexs[i].trim();

      if (!left.startsWith("#") && !right.startsWith("#")) {
        const containerNameMatcher = left === "" ? null : new RegExp(left);
        const urlMatcher = right === "" ? null : new RegExp(right);
        if (urlMatcher !== null) {
          //console.debug(containerNameMatcher, urlMatcher);
          ignoreRules.push({ containerNameMatcher, urlMatcher });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
}

async function rebuildIntervalHandlers(
  intervalrulesStr_time_ms_and_container_regexs,
  intervalrulesStr_url_regexs,
) {
  //console.debug("rebuildIntervalHandlers");
  // now lets rebuild and start the new interval handlers

  const time_ms_and_container_regexs =
    intervalrulesStr_time_ms_and_container_regexs.split("\n");
  const url_regexs = intervalrulesStr_url_regexs.split("\n");

  for (
    let i = 0;
    i < time_ms_and_container_regexs.length && i < url_regexs.length;
    i++
  ) {
    try {
      let left = time_ms_and_container_regexs[i].trim();
      let right = url_regexs[i].trim();

      //console.debug(left, right);

      if (
        !left.startsWith("#") &&
        !right.startsWith("#") &&
        right !== "" &&
        left !== ""
      ) {
        left_parts = left.split(",");
        if (left_parts.length < 2) {
          continue;
        }

        const minIdleTimeMilliSecs = parseInt(left_parts[0].trim());

        left = left_parts.slice(1).join(",");

        const containerNameMatcher = left === "" ? null : new RegExp(left);
        const urlMatcher = right === "" ? null : new RegExp(right);

        //console.debug(minIdleTimeMilliSecs, containerNameMatcher, urlMatcher);

        setIntervalIds.push(
          setInterval(() => {
            tabCleanUp({
              minIdleTimeMilliSecs,
              containerNameMatcher,
              urlMatcher,
              //consider_hasText,
            });
          }, minIdleTimeMilliSecs),
        );
      }
    } catch (e) {
      console.error(e);
    }
  }

  return;
  /*intervalrulesStr.split("\n").forEach((line) => {
    try {
      line = line.trim();
      if (line !== "" && !line.startsWith("#")) {
        const parts = line.split(",");

        const minIdleTimeMilliSecs = parseInt(parts[0].trim());
        const containerNameMatcher =
          parts[1].trim() === "" ? null : new RegExp(parts[1].trim());
        const urlMatcher =
          parts[2].trim() === "" ? null : new RegExp(parts[2].trim());
        //const consider_hasText = parts[3].trim()[0] === "y";

        setIntervalIds.push(
          setInterval(() => {
            tabCleanUp({
              minIdleTimeMilliSecs,
              containerNameMatcher,
              urlMatcher,
              //consider_hasText,
            });
          }, minIdleTimeMilliSecs),
        );
      }
    } catch (e) {
      console.error(e);
    }
  });
    */
}

async function getContainerNameFromCookieStoreId(csid) {
  try {
    const contextualIdentity = await browser.contextualIdentities.get(csid);
    return contextualIdentity.name;
  } catch (e) {
    // not inside a container
  }
  return null;
}

// this is run for each rule
// but since JS is not executed in parallel
// we should get away with using the global closeThreshold
async function tabCleanUp(input) {
  //console.debug('tabCleanUp', input);
  if (!autostart) {
    return;
  }

  // to check idle time
  const epoch_now = new Date().getTime();

  let all_tabs = await browser.tabs.query({});

  let max_nb_of_tabs_to_close = all_tabs.length - closeThreshold;

  if (max_nb_of_tabs_to_close < 1) {
    return;
  }

  all_tabs.sort((a, b) => {
    a.lastAccessed - b.lastAccessed;
  });

  //const active_tab = all_tabs.find((t) => t.active === true);

  for (const t of all_tabs) {
    // stop when we reach the closeThreshold
    if (max_nb_of_tabs_to_close < 1) {
      continue;
    }

    // ignore tabs to the right of the active_tab
    /*if (t.index > active_tab.index) {
      continue;
    }*/

    // pins are special we assume them to important and ignore them
    if (t.pinned) {
      continue;
    }

    // generally when something is playing audio ... lets keep it open
    // users can close it themself or it gets closed when the state changes
    if (t.audible) {
      continue;
    }

    // check the ignoreRules
    let done = false;
    const cn = await getContainerNameFromCookieStoreId(t.cookieStoreId);
    for (const el of ignoreRules) {
      if (el.containerNameMatcher === null) {
        if (cn === null) {
          if (el.urlMatcher.test(t.url)) {
            done = true;
            break;
          }
        }
        continue;
      }
      if (cn === null) {
        continue;
      }
      // both are not null, so lets check
      if (el.containerNameMatcher.test(cn)) {
        if (el.urlMatcher.test(t.url)) {
          done = true;
          break;
        }
      }
    }

    if (done) {
      continue;
    }

    // check the container
    if (input.containerNameMatcher !== null) {
      if (cn !== null) {
        if (!input.containerNameMatcher.test(cn)) {
          continue;
        }
      } else {
        // cn := null
        continue;
      }
    } else {
      // containerNameMatcher === null
      if (cn !== null) {
        continue;
      }
      // cn === containerNameMatcher
    }

    // check the URL
    if (input.urlMatcher !== null) {
      if (!input.urlMatcher.test(t.url)) {
        continue;
      }
    }

    // check the idle aka. last accessed time of the tab
    const delta = epoch_now - t.lastAccessed;
    if (delta < input.minIdleTimeMilliSecs) {
      continue;
    }

    if (!t.url.startsWith("http")) {
      max_nb_of_tabs_to_close--;
      await browser.tabs.remove(t.id);
    } else {
      //
      try {
        // check if the tab contains text fields with input
        let mightHaveUserInput = false;
        if (t.discarded !== false && input.consider_hasText) {
          mightHaveUserInput = await browser.tabs.executeScript(t.id, {
            code: `(function(){
								let els = document.querySelectorAll('input[type="text"]');
								for(const el of els) {
									if (        el.type !== 'hidden' &&
									   el.style.display !== 'none'   &&
									    typeof el.value === 'string' &&
										       el.value !== ''
									) {
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
        }
        if (!mightHaveUserInput) {
          try {
            if (typeof saveFolder === "string" && saveFolder !== "") {
              let createdetails = {
                title: t.title,
                url: t.url,
                parentId: saveFolder,
              };
              browser.bookmarks.create(createdetails);
            }
          } catch (e) {
            console.error(e);
          }
          await browser.tabs.remove(t.id);
          max_nb_of_tabs_to_close--;
        }
      } catch (e) {
        console.error(e, t.url);
      }
    }
  }
}

async function onBAClicked(tab) {
  setToStorage("autostart", !autostart);
  onStorageChanged();
}

async function onStorageChanged() {
  //console.debug("onStorageChanged()");
  autostart = await getFromStorage("boolean", "autostart", false);
  saveFolder = await getFromStorage("string", "saveFolder", "unfiled_____");
  closeThreshold = await getFromStorage(
    "number",
    "closeThreshold",
    closeThreshold,
  );

  if (autostart) {
    updateBadge("on", "green");

    // stop all running intervals
    setIntervalIds.forEach((id) => {
      clearInterval(id);
    });
    setIntervalIds = [];

    rebuildIgnoreRules(
      await getFromStorage("string", "ignorerules_container_regex", ""),
      await getFromStorage("string", "ignorerules_url_regex", ""),
    );
    rebuildIntervalHandlers(
      await getFromStorage(
        "string",
        "intervalrules_time_ms_and_container_regex",
        "",
      ),
      await getFromStorage("string", "intervalrules_url_regex", ""),
    );
  } else {
    updateBadge("off", "red");
  }
}

(async () => {
  await onStorageChanged();
  //browser.storage.onChanged.addListener(onStorageChanged);
  browser.browserAction.onClicked.addListener(onBAClicked);
  browser.runtime.onMessage.addListener((data, sender) => {
    //console.debug(data);
    if (data.cmd === "storageChanged") {
      onStorageChanged();
    }
  });
})();

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }
  // >>> TODO: remove after v1.8.25
  else if (details.reason === "update") {
    setToStorage("autostart", false);
    browser.runtime.openOptionsPage();
  }
  // <<<
});
