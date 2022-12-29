/* global browser */


const saveFolder = document.getElementById('saveFolder');

function recGetFolders(node, depth = 0){
    let out = new Map();
    if(typeof node.url !== 'string'){
        if(node.id !== 'root________'){
            out.set(node.id, { 'depth': depth, 'title': node.title });
        }
        if(node.children){
            for(let child of node.children){
                out = new Map([...out, ...recGetFolders(child, depth+1) ]);
            }
        }
    }
    return out;
}

async function initSaveFolderSelect() {
    const nodes = await browser.bookmarks.getTree();
    let out = new Map();
    let depth = 1;
    for(const node of nodes){
        out = new Map([...out, ...recGetFolders(node, depth) ]);
    }
    for(const [k,v] of out){
        //console.debug(k, v.title);
        saveFolder.add(new Option("-".repeat(v.depth) + " " + v.title, k))
    }
}

function onChange(evt) {

	let id = evt.target.id;
	let el = document.getElementById(id);

	let value = ( (el.type === 'checkbox') ? el.checked : el.value)
	let obj = {}

	if(el.type === 'number'){
		try {
			value = parseInt(value);
			if(isNaN(value)){
				value = el.min;
			}
			if(value < el.min) {
				value = el.min;
			}
		}catch(e){
			value = el.min
		}
	}

	obj[id] = value;
	console.debug(id,value, el.type);
	browser.storage.local.set(obj).catch(console.error);
}


async function onLoad(){
    try {
    await initSaveFolderSelect();
    }catch(e){
        console.error(e);
    }

[ "onlyClosePrivateTabs", "saveFolder", "closeThreshold","minIdleTime", "minIdleTimeUnit" ].map( (id) => {

	browser.storage.local.get(id).then( (obj) => {

		let el = document.getElementById(id);
		let val = obj[id];

        	console.debug('map', id, val);

		if(typeof val !== 'undefined') {
			if(el.type === 'checkbox') {
				el.checked = val;
			}
			else{
				el.value = val;
			}
		}

	}).catch(console.error);

	let el = document.getElementById(id);
	el.addEventListener('input', onChange);
    /*
	el.addEventListener('keyup', onChange);
	el.addEventListener('keypress',
		function allowOnlyNumbers(event) {
			if (event.key.length === 1 && /\D/.test(event.key)) {
				event.preventDefault();
			}
		});
    */
});
}

//document.addEventListener('DOMContentLoaded', onLoad);


function deleteRow(rowTr) {
	var mainTableBody = document.getElementById('mainTableBody');
	mainTableBody.removeChild(rowTr);
}

function createTableRow(feed) {
	var mainTableBody = document.getElementById('mainTableBody');
	var tr = mainTableBody.insertRow();

	Object.keys(feed).sort().forEach( (key) => {

		if( key === 'activ'){
			var input = document.createElement('input');
			input.className = key;
			input.placeholder = key;
			input.style.width = '100%';
			input.type='checkbox';
			input.checked= (typeof feed[key] === 'boolean'? feed[key]: true);
			tr.insertCell().appendChild(input);

		}else
			if( key !== 'action'){
				input = document.createElement('input');
				input.className = key;
				input.placeholder = key;
				input.style.width = '100%';
				input.value = feed[key];
				tr.insertCell().appendChild(input);
			}
	});

	var button;
	if(feed.action === 'save'){
		button = createButton("Add", "saveButton", function() {}, true );
	}else{
		button = createButton("Delete", "deleteButton", function() { deleteRow(tr); }, false );
	}
	tr.insertCell().appendChild(button);
}

function collectConfig() {
	// collect configuration from DOM
	var mainTableBody = document.getElementById('mainTableBody');
	var feeds = [];
	for (var row = 0; row < mainTableBody.rows.length; row++) {
		try {
			var url_regex = mainTableBody.rows[row].querySelector('.url_regex').value.trim();
			var check = mainTableBody.rows[row].querySelector('.activ').checked;
			if(url_regex !== '' ) {
				feeds.push({
					'activ': check,
					'url_regex': url_regex
				});
			}
		}catch(e){
			console.error(e);
		}
	}
	return feeds;
}

function createButton(text, id, callback, submit) {
	var span = document.createElement('span');
	var button = document.createElement('button');
	button.id = id;
	button.textContent = text;
	button.className = "browser-style";
	if (submit) {
		button.type = "submit";
	} else {
		button.type = "button";
	}
	button.name = id;
	button.value = id;
	button.addEventListener("click", callback);
	span.appendChild(button);
	return span;
}

async function saveOptions() {
	var feeds = collectConfig();
	await browser.storage.local.set({ 'selectors': feeds });
}

async function restoreOptions() {

	onLoad();

	createTableRow({
		'activ': 1,
		'url_regex': '',
		'action':'save'
	});
	var res = await browser.storage.local.get('selectors');
	if ( !Array.isArray(res.selectors) ) { return; }
	res.selectors.forEach( (selector) => {
		selector.action = 'delete'
		createTableRow(selector);
	});
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);

const impbtnWrp = document.getElementById('impbtn_wrapper');
const impbtn = document.getElementById('impbtn');
const expbtn = document.getElementById('expbtn');

expbtn.addEventListener('click', async function () {
    var dl = document.createElement('a');
    var res = await browser.storage.local.get('selectors');
    var content = JSON.stringify(res.selectors);
    dl.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(content));
    dl.setAttribute('download', 'data.json');
    dl.setAttribute('visibility', 'hidden');
    dl.setAttribute('display', 'none');
    document.body.appendChild(dl);
    dl.click();
    document.body.removeChild(dl);
});

// delegate to real Import Button which is a file selector
impbtnWrp.addEventListener('click', function() {
	impbtn.click();
})

impbtn.addEventListener('input', function () {
	var file  = this.files[0];
	var reader = new FileReader();
	reader.onload = async function() {
        try {
            var config = JSON.parse(reader.result);
            await browser.storage.local.set({ 'selectors': config});
            document.querySelector("form").submit();
        } catch (e) {
            console.error('error loading file: ' + e);
        }
    };
    reader.readAsText(file);
});
