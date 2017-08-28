"use strict";

/**
 *  Add default parameters to options
 *  @param options    the options object initially passed
 *  @param newOptions the default options to be used if missing
 *  @param override   overwrite the original objects key if found
 */
export function defaults(options = {}, newOptions = {}, override = false, maxDepth = false, depth = 0) {

    if (maxDepth && depth > maxDepth) {
        console.log("ERROR: Options.defaults");
        throw [options, newOptions];
    }

    for (let key in newOptions) {
        if (override || typeof options[key] == 'undefined') {
            options[key] = newOptions[key];
        }
    }

    return options;
}

/**
 *  Add default parameters but do not overwrite the original object
 *  @param options    the options object initially passed
 *  @param newOptions the default options to be used if missing
 *  @param override   overwrite the original objects key if found
 */
export function extend(options, newOptions = {}, override = false) {
    // TODO:
    console.log('TODO');
}

export default {
    defaults
};
