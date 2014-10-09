(function (root, factory) {
    'use strict';
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
     * Create XHR or equivalent object for this environment.
     * @returns XMLHttpRequest or ActiveXObject
     * @private
     */
    function _createXMLHTTPObject() {
        var xmlhttp, XMLHttpFactories = [
            function () {
                return new XMLHttpRequest();
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
                _createXMLHTTPObject = XMLHttpFactories[i];
                return xmlhttp;
            } catch (e) {
            }
        }
    }

    /**
     * Given a URL, GET it's contents and return.
     * @param url [String]
     * @returns [String] Content from URL
     * @private
     */
    function _ajax(url) {
        var req = _createXMLHTTPObject();
        if (req) {
            try {
                req.open('GET', url, false);
                //req.overrideMimeType('text/plain');
                //req.overrideMimeType('text/javascript');
                req.send(null);
                //return req.status == 200 ? req.responseText : '';
                return req.responseText;
            } catch (e) {
            }
        }
        return '';
    }

    /**
     * Get source code from given URL if within same domain.
     * @param url [String] JS source URL
     * @param gps reference to StackTraceGPS instance
     * @return Array[String] of source code lines
     */
    function _getSource(url, gps) {
        if (typeof url !== 'string') {
            throw new TypeError('Given URL is not a String');
        }
        if (!(url in gps.sourceCache) &&
                typeof location !== 'undefined' &&
                url.indexOf(location.hostname) !== -1) {
            gps.sourceCache[url] = _ajax(url).split('\n');
        }
        return gps.sourceCache[url];
    }

    function _findFunctionName(source, lineNumber, columnNumber) {
        if (typeof lineNumber !== 'number' || lineNumber % 1 !== 0 || lineNumber < 1) {
            throw new TypeError('Given line number must be a positive integer');
        }

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
         * @param location [String] URL/path to GET
         * @param lineNumber [Number]
         * @param columnNumber (Optional) [Number]
         * @returns String function name or undefined (which allows other enhancers a shot)
         */
        this.findFunctionName = function findFunctionName(location, lineNumber, columnNumber) {
            var source = _getSource(location, this);
            return _findFunctionName(source, Number(lineNumber), Number(columnNumber || 0));
        };
    };
}));
