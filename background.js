/* global browser */

const temporary = browser.runtime.id.endsWith('@temporary-addon'); // debugging?
//const manifest = browser.runtime.getManifest();
//const extname = manifest.name;

const excluded_tabs = new Set();
const included_windows = new Set();

// default state toolbar button/icon
browser.browserAction.setBadgeText({text:'off'});
browser.browserAction.setBadgeBackgroundColor({color:'red'});

async function getFromStorage(type, id, fallback) {
    let tmp = await browser.storage.local.get(id);
    return (typeof tmp[id] === type) ? tmp[id] : fallback;
}

async function isWhitelisted(url){

    const selectors = await ((async () => {
        try {
            const tmp = await browser.storage.local.get('selectors');
            if(typeof tmp['selectors'] !== 'undefined') {
                return tmp['selectors'];
            }
        }catch(e){
            console.error(e);
        }
        return [];
    })());

    for(const selector of selectors) {
        try {
            if(    typeof selector.activ === 'boolean'
                && selector.activ === true
                && typeof selector.url_regex === 'string'
                && selector.url_regex !== ''
                && (new RegExp(selector.url_regex)).test(url)
            ){
                return true;
            }
        }catch(e){
            console.error(e);
        }
    }
    return false;
}

async function tabCleanUp(){

	const onlyClosePrivateTabs = await getFromStorage('boolean','onlyClosePrivateTabs', false)

	const qryobj =  {
		active: false,
		hidden: false,
		audible: false,
		highlighted: false,
		pinned: false
	};

	// get non active, hidden, audible, highlighted or pinned tabs 
	// which are not excluded or in an excluded Window
	// or which match a whitelist expression
	let tabs = (await browser.tabs.query(qryobj)).filter( async (t) => { return  (!excluded_tabs.has(t.id) && included_windows.has(t.windowId) && !(await isWhitelisted(t.url))); } );

	if(onlyClosePrivateTabs){
		tabs = tabs.filter( t => t.incognito );
	}

	const closeThreshold = await getFromStorage('number','closeThreshold', 7)

	if(tabs.length > closeThreshold) {

		let nb_of_tabs_to_close = tabs.length - closeThreshold;

		if(nb_of_tabs_to_close < 1) { return; }

		// check idle time
		const epoch_now = new Date().getTime();
		const minIdleTime = await getFromStorage('number', 'minIdleTime', 3); // 3x
		const minIdleTimeUnit = await getFromStorage('number', 'minIdleTimeUnit', 86400000) // day
		const minIdleTimeMilliSecs = minIdleTime*minIdleTimeUnit;

		tabs.sort((a,b) => {a.lastAccessed - b.lastAccessed});

        const saveFolder = await getFromStorage('string','saveFolder','');

		for(const tab of tabs) {

			if(nb_of_tabs_to_close < 1) { break; }
			nb_of_tabs_to_close--;

			// check last activation time
			const delta = epoch_now - tab.lastAccessed
			if( delta > (minIdleTimeMilliSecs) ){ // every 5 seconds in debug, else every storage value or 15 minutes if not yet set

				if( tab.url.startsWith('http')) {

					try {
						// check if tab contains potential text fields with user input
						// exclude hidden and non visible stuff
						let mightHaveUserInput = await browser.tabs.executeScript(tab.id, {
							code:
							`(function(){
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
							  }());`
						});
						mightHaveUserInput = mightHaveUserInput[0];

						if(!mightHaveUserInput){
                            try {
				    if(typeof saveFolder === 'string' && saveFolder !== ''){
					let createdetails = {
					    title: tab.title,
					    url: tab.url,
					    parentId: saveFolder
					}
					browser.bookmarks.create(createdetails);
				    }
                            }catch(e) {
                                console.error(e);
                            }
							await browser.tabs.remove(tab.id);
						}
					}catch(e){
						console.error(e, tab.url);
					}
				}else{
					await browser.tabs.remove(tab.id);
				}
			}
		} // for tabs
	}
}

setInterval(tabCleanUp, (10*60*1000)); // check every 10 minutes, close enough 


browser.menus.create({
	title: "Exclude",
	contexts: ["tab"],
	onclick: async (/*info ,tab*/) => {
	    const tabs = (await browser.tabs.query({highlighted:true, currentWindow: true, hidden: false}));
        for(const t of tabs){
            if(!excluded_tabs.has(t.id)){
                excluded_tabs.add(t.id);
            }
        }
	}
});

browser.menus.create({
	title: "Include",
	contexts: ["tab"],
	onclick: async (/*info, tab*/) => {
	    const tabs = (await browser.tabs.query({highlighted:true, currentWindow: true, hidden: false}));
        for(const t of tabs){
            if(excluded_tabs.has(t.id)){
                excluded_tabs.delete(t.id);
            }
        }
	}
});

// include Windows ( better to be safe then sorry ) 
async function BAonClicked(tab) {
	if(included_windows.has(tab.windowId)){
		included_windows.delete(tab.windowId);
		browser.browserAction.setBadgeText({text:'off', windowId: tab.windowId});
		browser.browserAction.setBadgeBackgroundColor({color:'red', windowId: tab.windowId});
	}else{
		included_windows.add(tab.windowId);
		browser.browserAction.setBadgeText({text:'on',windowId: tab.windowId});
		browser.browserAction.setBadgeBackgroundColor({color:'green', windowId: tab.windowId});
	}
}

browser.browserAction.onClicked.addListener(BAonClicked);


function onTabRemoved(tabId, removeInfo) {
            if(excluded_tabs.has(tabId)){
                excluded_tabs.delete(tabId);
            }
}

browser.tabs.onRemoved.addListener(onTabRemoved);

browser.windows.onRemoved.addListener((windowId) => {
            if(included_windows.has(windowId)){
                included_windows.delete(windowId);
            }
});

