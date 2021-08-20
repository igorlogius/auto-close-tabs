const temporary = browser.runtime.id.endsWith('@temporary-addon'); // debugging?
const manifest = browser.runtime.getManifest();
const extname = manifest.name;

async function tabCleanUp(){
	console.log('tabCleanUp()');
	// get non-hidden, non-activ tabs 
	const tabs = await browser.tabs.query({
		active: false,  // ignore active
		hidden: false,  // ignore hidden
		audible: false, // ignore playing sounds
		highlighted: false, // ignnore highlighted
		pinned: false, // ignore pinned
	});
	if(tabs.length < 8) {return;}

	// check idle time
	const epoch_now = new Date().getTime();
	for(const tab of tabs) {

		// check last activation time
		const delta = epoch_now - tab.lastAccessed
		if( delta > (temporary?5000:1000*60*15) ){ // every 3 minutes in debug, else every 15


			if( tab.url.startsWith('http')) {


				console.log('found tab with idletime > 3/15 minutes', tab.url);

				// check if tab contains input fields
				try {
					let mightHaveUserInput = await browser.tabs.executeScript(tab.id, {
						code: `(function(){
					let els = document.querySelectorAll('input[type="text"],input[type="password"]');
					for(const el of els) {
						console.log(JSON.stringify(el.classList), el.value);
						if(el.type !== 'hidden' && el.style.display !== 'none' && typeof el.value === 'string' && el.value !== ''){
							return true;
						}
					}

					els = document.querySelectorAll('textarea');
					for(const el of els) {
						console.log(JSON.stringify(el.classList), el.value);
						if(el.style.display !== 'none' && typeof el.value === 'string' && el.value !== ''){
							return true;
						}
					}
					return false;
				  }());`
					});
					mightHaveUserInput = mightHaveUserInput[0];

					if(!mightHaveUserInput){
						console.log('removed tab ', tab.id, tab.url);
						await browser.tabs.remove(tab.id);
					}
				}catch(e){
					console.log('error',e);
				}
			}else{
				console.log('removed tab ', tab.id, tab.url);
				await browser.tabs.remove(tab.id);
			}
		}else{
			console.log('tab', tab.id, tab.url, ' no http proto');
		}
	}
}

setInterval(tabCleanUp, (temporary?5000:5*60*500)); // check every minute in debug, else every 5 minutes


