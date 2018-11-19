'use strict';

function replaceAll(s, search, replacement) {
    return s.split(search).join(replacement);
};

// simple object accessor using dotted notation and [] for array indices
function fetchFromObject(obj, prop, newValue) {
    //property not found
    if (typeof obj === 'undefined') return false;

    if ((prop === '$') || (prop === '@')) {
        prop = '';
    }

	if (!prop) {
		if (typeof newValue != 'undefined') {
			obj = newValue;
		}
		return obj;
	}

	var props = prop.split('.');
	var arr = props[0].split(/[\[\]]+/);
	var index = -1;
	if (arr.length>1) {
		index = parseInt(arr[1],10);
	}

    //property split found; recursive call
    if (props.length>1) {
		var pos = prop.indexOf('.');
        //get object at property (before split), pass on remainder
		if (index>=0) {
			return fetchFromObject(obj[arr[0]][index], prop.substr(pos+1), newValue); //was props
		}
		else {
			return fetchFromObject(obj[arr[0]], prop.substr(pos+1), newValue);
		}
	}
	//no split; get property[index] or property
	var source = obj;
	if (arr[0]) source = obj[prop];
	if (index>=0) {
		if (typeof newValue != 'undefined') source[index] = newValue;
		return source[index];
	}
    else {
		if (typeof newValue != 'undefined') obj[prop] = newValue;
		return obj[prop];
	}
}

module.exports = {
	fetchFromObject : fetchFromObject,
    jpath: fetchFromObject
};

