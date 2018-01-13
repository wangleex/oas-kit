'use strict';

const util = require('util');
const common = require('./common.js');
const jptr = require('reftools/lib/jptr.js').jptr;

const red = process.env.NODE_DISABLE_COLORS ? '' : '\x1b[31m';
const green = process.env.NODE_DISABLE_COLORS ? '' : '\x1b[32m';
const yellow = process.env.NODE_DISABLE_COLORS ? '' : '\x1b[33;1m';
const normal = process.env.NODE_DISABLE_COLORS ? '' : '\x1b[0m';

function scanExternalRefs(master, prefix, options) {
    return new Promise(function (res, rej) {
        let refs = options.externalRefs;

        if ((master === options.openapi) && (options.resolverDepth>0)) {
            // we only need to do any of this for the root object on pass #1
            return res(refs);
        }

        common.recurse(master, {identityDetection: true}, function (obj, key, state) {
            if (obj[key] && common.isRef(obj[key],'$ref')) {
                let $ref = obj[key].$ref;
                if (!$ref.startsWith('#')) {
                    if (!refs[$ref]) {
                        refs[$ref] = { resolved: false, paths: [], prefixes: [], sources: [], description: obj.description };
                    }
                    refs[$ref].paths.push(state.path);
                    refs[$ref].prefixes.push(prefix);
                    refs[$ref].sources.push(options.source);
                    if (refs[$ref].paths.length > 1) {
                        if (refs[$ref].resolved) {
                            obj[key].$ref = refs[$ref].data;
                        }
                        else if (options.rewriteRefs) {
                            // we've already seen it
                            let newRef = refs[$ref].paths[0]; // creating a ref from a path
                            if (options.verbose) console.log('Rewriting ref', $ref, newRef);
                            obj[key].$ref = newRef;
                        }
                    }
                }
            }
        });
        res(refs);
    });
}

function findExternalRefs(master, prefix, options) {
    return new Promise(function (res, rej) {

        scanExternalRefs(master, prefix, options)
            .then(function (refs) {
                for (let ref in refs) {

                    // we must check the ref's source matches ours
                    let forUs = false;
                    for (let source of refs[ref].sources) {
                        if (source === options.source) forUs = true;
                    }
                    if (!forUs && !refs[ref].resolved && options.verbose) console.log(yellow+'Not for us',ref,normal);

                    if ((!refs[ref].resolved) && forUs) {
                        prefix = refs[ref].paths[0];
                        let depth = options.resolverDepth;
                        if (depth>0) depth++;
                        options.resolverActions[depth].push(function () {
                            return common.resolveExternal(master, ref, options, function (data, source, options) {
                                refs[ref].resolved = true;
                                let external = {};
                                external.context = refs[ref];
                                external.$ref = ref;
                                external.original = common.clone(data);
                                external.updated = data;
                                external.source = source;
                                options.externals.push(external);
                                let localOptions = Object.assign({}, options, { source: source });
                                localOptions.resolverDepth = options.resolverActions.length-1;
                                localOptions.resolverTarget = data;
                                if (options.patch && refs[ref].description && !data.description) {
                                    data.description = refs[ref].description;
                                }
                                refs[ref].data = data;
                                let first = true;
                                let fptr = '';
                                for (let p in refs[ref].paths) {
                                    //let npref = refs[ref].prefixes[p];
                                    //let npath = refs[ref].paths[p].replace('#/','/');
                                    let npath = refs[ref].paths[p];
                                    //let ptr = npref + npath;
                                    let ptr = npath;
                                    if (!ptr.startsWith('#')) ptr = '#'+ptr;
                                    //ptr = ptr.replace('/$ref','');
                                    if (first) {
                                        fptr = ptr;
                                        if (options.verbose) console.log((data === false ? red : green)+'Setting data at', ptr, normal);
                                        //jptr(master, ptr, data);
                                        jptr(master, ptr, common.clone(data));
                                        first = false;
                                    }
                                    else if (ptr !== fptr) {
                                        //if (options.verbose) console.log('Creating pointer to data at', ptr);
                                        //jptr(master, ptr, { $ref: fptr });
                                        if (options.verbose) console.log('Creating clone of data at', ptr);
                                        //jptr(master, ptr, data);
                                        jptr(master, ptr, common.clone(data));
                                    }
                                }
                                //console.log('Queueing scan/find',prefix,localOptions.resolverDepth);
                                options.resolverActions[localOptions.resolverDepth].push(function () { return scanExternalRefs(data, prefix, localOptions) });
                                options.resolverActions[localOptions.resolverDepth].push(function () { return findExternalRefs(data, prefix, localOptions) });
                            })
                        });
                    }
                }
            });

        //res(options.resolverActions[options.resolverDepth]);
        let result = {options:options};
        result.actions = options.resolverActions[options.resolverDepth];
        res(result);
    });
}

const serial = funcs =>
    funcs.reduce((promise, func) =>
        promise.then(result => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]));

function loopReferences(options, res, rej) {
    options.resolverActions.push([]);
    findExternalRefs(options.resolverTarget, '', options)
        .then(function (data) {
            serial(data.actions)
                .then(function () {
                    if (options.resolverDepth>=options.resolverActions.length) {
                        console.warn('Ran off the end of resolver actions');
                        return res(true);
                    } else {
                        //console.log('There may be more actions, depth',options.resolverDepth);
                        options.resolverDepth++;
                        if (options.resolverActions[options.resolverDepth].length) {
                            //console.log('There are',data.options.source);
                            setTimeout(function () {
                                loopReferences(data.options, res, rej);
                            }, 0);
                        }
                        else {
                            //console.log('There are not');
                            res(options);
                        }
                    }
                })
                .catch(function (ex) {
                    throw new Error(ex);
                });
        });
}

function resolve(options) {
    options.resolverDepth = 0;
    options.resolverActions = [[]];
    options.resolverTarget = options.openapi;
    return new Promise(function (res, rej) {
        if (options.resolve)
            loopReferences(options, res, rej)
        else
            res(options);
    });
}

module.exports = {
    resolve: resolve
};
