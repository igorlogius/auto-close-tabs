
function onChange(evt) {

	id = evt.target.id;
	el = document.getElementById(id);

	let value = ( (el.type === 'checkbox') ? el.checked : el.value)
	let obj = {}

	console.log(id,value, el.type);
	if(value === ""){
		return;
	}
	if(el.type === 'number'){
		try {
			value = parseInt(value);
			if(value === NaN){
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
	console.log(id,value);
	browser.storage.local.set(obj).catch(console.error);
}

[ "closeThreshold","minIdleTime" ].map( (id) => {

	browser.storage.local.get(id).then( (obj) => {

		el = document.getElementById(id);
		val = obj[id];

		if(typeof val !== 'undefined') {
			if(el.type === 'checkbox') {
				el.checked = val;
			}
			else{
				el.value = val;
			}
		}

	}).catch( (err) => {} );

	el = document.getElementById(id);
	el.addEventListener('click', onChange);
	el.addEventListener('keyup', onChange);
	el.addEventListener('keypress',
		function allowOnlyNumbers(event) {
			if (event.key.length === 1 && /\D/.test(event.key)) {
				event.preventDefault();
			}
		});
});

