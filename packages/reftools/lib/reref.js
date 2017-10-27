'use strict';

const recurse = require('./recurse.js').recurse;

/**
* Simply creates an object without self-references by replacing them
* with $ref pointers
*/

function reref(obj) {
    recurse(obj,{identityDetection:true},function(obj,key,state){
        if (state.identity) {
            obj[key] = { $ref: state.identityPath };
        }
    });
    return obj;
}

module.exports = {
    reref : reref
};
