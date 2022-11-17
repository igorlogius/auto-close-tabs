/* global browser */

const temporary = browser.runtime.id.endsWith('@temporary-addon'); // debugging?
//const manifest = browser.runtime.getManifest();
//const extname = manifest.name;

const excluded_tabs = new Set();

async function getFromStorage(type, id, fallback) {
    let tmp = await browser.storage.local.get(id);
    return (typeof tmp[id] === type) ? tmp[id] : fallback;
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
	let tabs = (await browser.tabs.query(qryobj)).filter( t => (!excluded_tabs.has(t.id)) );


	if(onlyClosePrivateTabs){
		tabs = tabs.filter( t => t.incognito );
	}

	const closeThreshold = await getFromStorage('number','closeThreshold', 7)

	if(tabs.length > closeThreshold) {

		let nb_of_tabs_to_close = tabs.length - closeThreshold;

		if(nb_of_tabs_to_close < 1) { return; }

		// check idle time
		const epoch_now = new Date().getTime();
		const minIdleTime = await getFromStorage('number', 'minIdleTime', 1000*60*15)


		tabs.sort((a,b) => {a.lastAccessed - b.lastAccessed});

        const saveFolder = await getFromStorage('string','saveFolder','');

		for(const tab of tabs) {

			if(nb_of_tabs_to_close < 1) { break; }
			nb_of_tabs_to_close--;

			// check last activation time
			const delta = epoch_now - tab.lastAccessed
			if( delta > (temporary?5000:minIdleTime) ){ // every 5 seconds in debug, else every storage value or 15 minutes if not yet set

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

setInterval(tabCleanUp, (temporary?5000:3*60*1000)); // check every 5 seconds in debug, else every 3 minutes


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

