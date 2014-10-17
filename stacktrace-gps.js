/* global ActiveXObject:false */
(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory();
    } else {
        root.StackTraceGPS = factory();
    }
}(this, function () {
    'use strict';

    /**
     * Make a X-Domain request to url and callback.
     *
     * @param url [String]
     * @param callback [Function] to callback on completion
     * @param errback [Function] to callback on error
     */
    function _xdr(url, callback, errback) {
        var req = _createXMLHTTPObject();

        if (!req) {
            errback(new Error('X-Domain request failed because no form of XHR is supported'));
        }

        req.open('get', url);
        req.onerror = errback;

        if (typeof req.onreadystatechange === 'function') { // XMLHttpRequest and ActiveXObject
            req.onreadystatechange = function onreadystatechange() {
                if (req.readyState === 4) {
                    if (req.status >= 200 && req.status < 400) {
                        callback(req.responseText);
                    } else {
                        errback(new Error('XD XHR returned non-OK status'));
                    }
                }
            };
            req.send();
        } else if (typeof req.onload === 'function') { // XDomainRequest
            req.onload = function onload() {
                callback(req.responseText);
            };

            // Avoid bug with concurrent requests in XDomainRequest API
            setTimeout(req.send, 0);
        } else {
            errback(new Error('X-Domain request failed because unknown XHR object was provided'));
        }
    }

    /**
     * Create XHR or equivalent object for this environment.
     * @returns XMLHttpRequest or ActiveXObject
     * @private
     */
    function _createXMLHTTPObject() {
        var xmlhttp;
        var XMLHttpFactories = [
            function () {
                return new XMLHttpRequest();
            }, function () {
                return new XDomainRequest();
            }, function () {
                return new ActiveXObject('Msxml2.XMLHTTP');
            }, function () {
                return new ActiveXObject('Msxml3.XMLHTTP');
            }, function () {
                return new ActiveXObject('Microsoft.XMLHTTP');
            }
        ];
        for (var i = 0; i < XMLHttpFactories.length; i++) {
            try {
                xmlhttp = XMLHttpFactories[i]();
                // Use memoization to cache the factory
//                _createXMLHTTPObject = XMLHttpFactories[i];
                return xmlhttp;
            } catch (e) {
            }
        }
    }

    function _findFunctionName(source, lineNumber, columnNumber) {
        // function {name}({args}) m[1]=name m[2]=args
        var reFunctionDeclaration = /function\s+([^(]*?)\s*\(([^)]*)\)/;
        // {name} = function ({args}) TODO args capture
        var reFunctionExpression = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*function\b/;
        // {name} = eval()
        var reFunctionEvaluation = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*(?:eval|new Function)\b/;

        // Walk backwards in the source lines until we find the line which matches one of the patterns above
        var code = '', line, maxLines = Math.min(lineNumber, 20), m, commentPos;
        for (var i = 0; i < maxLines; ++i) {
            // lineNo is 1-based, source[] is 0-based
            line = source[lineNumber - i - 1];
            commentPos = line.indexOf('//');
            if (commentPos >= 0) {
                line = line.substr(0, commentPos);
            }

            if (line) {
                code = line + code;
                m = reFunctionExpression.exec(code);
                if (m && m[1]) {
                    return m[1];
                }
                m = reFunctionDeclaration.exec(code);
                if (m && m[1]) {
                    //return m[1] + "(" + (m[2] || "") + ")";
                    return m[1];
                }
                m = reFunctionEvaluation.exec(code);
                if (m && m[1]) {
                    return m[1];
                }
            }
        }
        return undefined;
    }

    return function StackTraceGPS(opts) {
        this.sourceCache = {};

        /**
         * Given location information for a Function definition, return the function name.
         *
         * @param location [String] URL to GET
         * @param lineNumber [Number]
         * @param columnNumber (Optional) [Number]
         * @returns String function name or undefined (which allows other enhancers a shot)
         */
        this.findFunctionName = function findFunctionName(location, lineNumber, columnNumber) {
            if (typeof location !== 'string') {
                throw new TypeError('Given URL is not a String');
            } else if (typeof lineNumber !== 'number' || lineNumber % 1 !== 0 || lineNumber < 1) {
                throw new TypeError('Given line number must be a positive integer');
            }

            function callback(cache) {
                return function(source) {
                    cache[location] = source;
                    return _findFunctionName(cache[location], lineNumber, columnNumber || 0);
                };
            }

            function errback(err) {
                throw err;
            }

            if (!this.sourceCache[location]) {
                return _xdr(location, callback(this.sourceCache), errback);
            } else {
                // FIXME: duplication
                return _findFunctionName(this.sourceCache[location], lineNumber, columnNumber || 0);
            }
        };
    };
}));
