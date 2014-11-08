(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.
    if (typeof define === 'function' && define.amd) {
        define(['source-map'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('source-map/lib/source-map/source-map-consumer'));
    } else {
        root.StackTraceGPS = factory(root.SourceMap);
    }
}(this, function (SourceMap) {
    'use strict';

    /**
     * Create XHR or equivalent object for this environment.
     * @returns XMLHttpRequest, XDomainRequest or ActiveXObject
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
                _createXMLHTTPObject = XMLHttpFactories[i]; // jshint ignore:line
                return xmlhttp;
            } catch (e) {
            }
        }
    }

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

        if (typeof XMLHttpRequest === 'function' || typeof ActiveXObject === 'function') {
            req.onreadystatechange = function onreadystatechange() {
                if (req.readyState === 4) {
                    if (req.status >= 200 && req.status < 400) {
                        return callback(req.responseText);
                    } else {
                        errback(new Error('Unable to retrieve ' + url));
                    }
                }
            };
            req.send();
        } else {
            req.onload = function onload() {
                callback(req.responseText);
            };

            // Avoid bug with concurrent requests in XDomainRequest API
            setTimeout(req.send, 0);
        }
    }

    function _getSource(location, cache, callback, errback) {
        if (cache[location]) {
            callback(cache[location]);
        } else {
            _xdr(location, function (source) {
                cache[location] = source;
                callback(source);
            }, errback);
        }
    }

    function _findFunctionName(source, lineNumber, columnNumber) {
        // function {name}({args}) m[1]=name m[2]=args
        var reFunctionDeclaration = /function\s+([^(]*?)\s*\(([^)]*)\)/;
        // {name} = function ({args}) TODO args capture
        var reFunctionExpression = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*function\b/;
        // {name} = eval()
        var reFunctionEvaluation = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*(?:eval|new Function)\b/;
        var lines = source.split("\n");

        // Walk backwards in the source lines until we find the line which matches one of the patterns above
        var code = '', line, maxLines = Math.min(lineNumber, 20), m, commentPos;
        for (var i = 0; i < maxLines; ++i) {
            // lineNo is 1-based, source[] is 0-based
            line = lines[lineNumber - i - 1];
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

    function _ensureStackFrameIsLegit(stackframe) {
        if (typeof stackframe !== 'object') {
            throw new TypeError('Given StackFrame is not an object');
        } else if (typeof stackframe.fileName !== 'string') {
            throw new TypeError('Given file name is not a String');
        } else if (typeof stackframe.lineNumber !== 'number' || stackframe.lineNumber % 1 !== 0 || stackframe.lineNumber < 1) {
            throw new TypeError('Given line number must be a positive integer');
        } else if (typeof stackframe.columnNumber !== 'number' || stackframe.columnNumber % 1 !== 0 || stackframe.columnNumber < 0) {
            throw new TypeError('Given column number must be a non-negative integer');
        }
        return true;
    }

    function _findSourceMappingURL(source) {
        // FIXME: failing on IE11 and 9
        var m = /\/\/[#@] ?sourceMappingURL=([^\s'"]+)$/.exec(source);
        if (m && m[1]) {
            return m[1];
        } else {
            throw new Error('sourceMappingURL not found');
        }
    }

    function _newLocationInfoFromSourceMap(rawSourceMap, lineNumber, columnNumber) {
        return new SourceMap.SourceMapConsumer(rawSourceMap)
            .originalPositionFor({line: lineNumber, column: columnNumber});
    }

    return function StackTraceGPS(opts) {
        if (!(this instanceof StackTraceGPS)) {
            return new StackTraceGPS(opts);
        }

        this.sourceCache = {};

        /**
         * Given location information for a Function definition, return the function name.
         *
         * @param stackframe - {StackFrame}-like object (e.g {fileName: 'path/to/file.js', lineNumber: 100, columnNumber: 5})
         * @param callback - {Function} called back with found function name or undefined
         * @param errback - {Function} called back with Error object with failure
         */
        this.findFunctionName = function findFunctionName(stackframe, callback, errback) {
            try {
                _ensureStackFrameIsLegit(stackframe);
                _getSource(stackframe.fileName, this.sourceCache, function(source) {
                    callback(_findFunctionName(source, stackframe.lineNumber, stackframe.columnNumber));
                }, errback);
            } catch(e) {
                errback(e);
            }
        };

        /**
         * Given location information for a Function definition, return the function name.
         *
         * @param stackframe - {StackFrame}-like object (e.g {fileName: 'path/to/file.js', lineNumber: 100, columnNumber: 5})
         * @param callback - {Function} called back with found function name or undefined
         * @param errback - {Function} called back with Error object with failure
         */
        this.getMappedLocation = function sourceMap(stackframe, callback, errback) {
            try {
                _ensureStackFrameIsLegit(stackframe);
                _getSource(stackframe.fileName, this.sourceCache, function(source) {
                    _getSource(_findSourceMappingURL(source), this.sourceCache, function(map) {
                        var lineNumber = stackframe.lineNumber;
                        var columnNumber = stackframe.columnNumber;
                        callback(_newLocationInfoFromSourceMap(map, lineNumber, columnNumber));
                    }, errback);
                }.bind(this), errback);
            } catch(e) {
                errback(e);
            }
        };
    };
}));
