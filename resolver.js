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
        common.recurse(master, {identityDetection: false}, function (obj, key, state) {
            if (obj[key] && common.isRef(obj[key],'$ref')) {
                let $ref = obj[key].$ref;
                if (!$ref.startsWith('#')) {
                    if (!refs[$ref]) {
                        refs[$ref] = { resolved: false, paths: [], prefixes: [], description: obj.description };
                    }
                    refs[$ref].paths.push(state.path);
                    refs[$ref].prefixes.push(prefix);
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

function findExternalRefs(master, prefix, options, actions, newActions) {
    return new Promise(function (res, rej) {

        scanExternalRefs(master, prefix, options)
            .then(function (refs) {
                for (let ref in refs) {
                    if (!refs[ref].resolved) {
                        prefix = refs[ref].paths[0];
                        actions.push(function () {
                            return common.resolveExternal(master, ref, options, function (data, source) {
                                refs[ref].resolved = true;
                                //console.log(util.inspect(refs));
                                let external = {};
                                external.context = refs[ref];
                                external.$ref = ref;
                                external.original = common.clone(data);
                                external.updated = data;
                                external.source = source;
                                options.externals.push(external);
                                let localOptions = Object.assign({}, options, { source: source });
                                newActions.push(function () { return scanExternalRefs(data, prefix, localOptions) });
                                newActions.push(function () { return findExternalRefs(data, prefix, localOptions, actions) });
                                if (options.patch && refs[ref].description && !data.description) {
                                    data.description = refs[ref].description;
                                }
                                refs[ref].data = data;
                                let first = true;
                                let fptr = '';
                                for (let p in refs[ref].paths) {
                                    let npref = refs[ref].prefixes[p];
                                    let npath = refs[ref].paths[p].replace('#/','/');
                                    let ptr = npref + npath;
                                    if (!ptr.startsWith('#')) ptr = '#'+ptr;
                                    ptr = ptr.replace('/$ref','');
                                    if (first) {
                                        fptr = ptr;
                                        if (options.verbose) console.log((data === false ? red : green)+'Setting data at', ptr, normal);
                                        jptr(master, ptr, common.clone(data));
                                        first = false;
                                    }
                                    else if (ptr !== fptr) {
                                        //if (options.verbose) console.log('Creating pointer to data at', ptr);
                                        //jptr(master, ptr, { $ref: fptr });
                                        if (options.verbose) console.log('Creating clone of data at', ptr);
                                        jptr(master, ptr, common.clone(data));
                                    }
                                }
                            })
                        });
                    }
                }
            });

        res(actions);
    });
}

const serial = funcs =>
    funcs.reduce((promise, func) =>
        promise.then(result => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]));

function loopReferences(actions, options, res) {
    let newActions = [];
    findExternalRefs(options.openapi, '', options, actions, newActions)
        .then(function (actions) {
            serial(actions)
                .then(function () {
                    if (!newActions.length) {
                        return res(true);
                    } else {
                        setTimeout(function () {
                            loopReferences(newActions, options, res);
                        }, 0);
                    }
                })
                .catch(function (ex) {
                    console.warn(ex);
                });
        });
}

function resolve(options) {
    return new Promise(function (res, rej) {
        if (options.resolve)
            loopReferences([], options, res)
        else
            res(options);
    });
}

module.exports = {
    resolve: resolve
};
