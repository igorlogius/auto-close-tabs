const temporary = browser.runtime.id.endsWith('@temporary-addon'); // debugging?
const manifest = browser.runtime.getManifest();
const extname = manifest.name;

async function getFromStorage(storeid,fallback) {
	return (await (async () => {
		try {
			//console.log('storeid', storeid)
			let tmp = await browser.storage.local.get(storeid);
			//console.log(tmp);
			if (typeof tmp[storeid] !== 'undefined'){
				return tmp[storeid];
				
			}
		}catch(e){
			console.error(e);
		}
		return (fallback)?fallback:undefined;
	})());
}

async function tabCleanUp(){

	// get non active, hidden, audible, highlighted or pinned tabs
	const tabs = await browser.tabs.query({
		active: false,  
		hidden: false,  
		audible: false, 
		highlighted: false, 
		pinned: false, 
	});


	const closeThreshold = await getFromStorage('closeThreshold', 7)
	//console.log('closeThreshold', closeThreshold);

	if(tabs.length > closeThreshold) {

		let nb_of_tabs_to_close = tabs.length - closeThreshold;
			
		if(nb_of_tabs_to_close < 1) { return; }

		// check idle time
		const epoch_now = new Date().getTime();
		const minIdleTime = await getFromStorage('minIdleTime', 1000*60*15)

		//console.log('minIdleTime', minIdleTime);

		tabs.sort((a,b) => {a.lastAccessed - b.lastAccessed});

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
							await browser.tabs.remove(tab.id);
						}
					}catch(e){
						console.error(e);
					}
				}else{
					await browser.tabs.remove(tab.id);
				}
			}
		}
	}
}

setInterval(tabCleanUp, (temporary?5000:3*60*1000)); // check every 5 seconds in debug, else every 3 minutes


