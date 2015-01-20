(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.
    if (typeof define === 'function' && define.amd) {
        define('stacktrace-gps', ['source-map', 'es6-promise'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('source-map/lib/source-map/source-map-consumer'), require('es6-promise'));
    } else {
        root.StackTraceGPS = factory(root.SourceMap, root.ES6Promise);
    }
}(this, function (SourceMap, ES6Promise) {
    'use strict';
    ES6Promise.polyfill();
    var Promise = ES6Promise.Promise;

    /**
     * Create XHR or equivalent object for this environment.
     * @returns XMLHttpRequest, XDomainRequest or ActiveXObject
     * @private
     */
    function _createXMLHTTPObject() {
        var xmlhttp;
        var XMLHttpFactories = [
            function () {
                // Test XDomainRequest first to maximize availability of cross-domain XHR
                return new XDomainRequest();
            }, function () {
                return new XMLHttpRequest();
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
        req.open('get', url);
        req.onerror = errback;

        if (req instanceof XMLHttpRequest || req instanceof ActiveXObject) {
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

    function _ensureSupportedEnvironment() {
        if (typeof Object.defineProperty !== 'function' || typeof Object.create !== 'function') {
            throw new Error('Unable to consume source maps in older browsers');
        }
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
        var m = /\/\/[#@] ?sourceMappingURL=([^\s'"]+)$/.exec(source);
        if (m && m[1]) {
            return m[1];
        } else {
            throw new Error('sourceMappingURL not found');
        }
    }

    function _newLocationInfoFromSourceMap(rawSourceMap, args, lineNumber, columnNumber) {
        var loc = new SourceMap.SourceMapConsumer(rawSourceMap)
            .originalPositionFor({line: lineNumber, column: columnNumber});
        return new StackFrame(loc.name, args, loc.source, loc.line, loc.column);
    }

    /**
     * @param opts: [Object] options.
     *      opts.sourceCache = {url: "Source String"} => preload source cache
     *      opts.offline = True to prevent network requests.
     *              Best effort without sources or source maps.
     */
    return function StackTraceGPS(opts) {
        if (!(this instanceof StackTraceGPS)) {
            return new StackTraceGPS(opts);
        }
        opts = opts || {};

        this.sourceCache = opts.sourceCache || {};

        this._get = function _get(location) {
            return new Promise(function (resolve, reject) {
                if (this.sourceCache[location]) {
                    resolve(this.sourceCache[location]);
                } else if (opts.offline) {
                    reject(new Error('Cannot make network requests in offline mode'));
                } else {
                    _xdr(location, function (source) {
                        this.sourceCache[location] = source;
                        resolve(source);
                    }.bind(this), reject);
                }
            }.bind(this));
        };

        /**
         * Given a StackFrame, enhance function name and use source maps for a
         * better StackFrame.
         *
         * @param stackframe - {StackFrame}-like object
         *      {fileName: 'path/to/file.js', lineNumber: 100, columnNumber: 5}
         * @return StackFrame with source-mapped location
         */
        this.pinpoint = function StackTraceGPS$$pinpoint(stackframe) {
            return this.getMappedLocation(stackframe)
                .then(this.findFunctionName.bind(this));
        };

        /**
         * Given a StackFrame, guess function name from location information.
         *
         * @param stackframe - {StackFrame}-like object
         *      {fileName: 'path/to/file.js', lineNumber: 100, columnNumber: 5}
         * @return StackFrame with guessed function name
         */
        this.findFunctionName = function StackTraceGPS$$findFunctionName(stackframe) {
            return new Promise(function (resolve, reject) {
                _ensureStackFrameIsLegit(stackframe);
                this._get(stackframe.fileName).then(function getSourceCallback(source) {
                    var guessedFunctionName = _findFunctionName(source, stackframe.lineNumber, stackframe.columnNumber);
                    resolve(new StackFrame(guessedFunctionName, stackframe.args, stackframe.fileName, stackframe.lineNumber, stackframe.columnNumber));
                }, reject);
            }.bind(this));
        };

        /**
         * Given a StackFrame, seek source-mapped location and return new enhanced StackFrame.
         *
         * @param stackframe - {StackFrame}-like object
         *      {fileName: 'path/to/file.js', lineNumber: 100, columnNumber: 5}
         * @return StackFrame with source-mapped location
         */
        this.getMappedLocation = function StackTraceGPS$$getMappedLocation(stackframe) {
            return new Promise(function (resolve, reject) {
                _ensureSupportedEnvironment();
                _ensureStackFrameIsLegit(stackframe);

                // TODO: support multi-level source maps
                this._get(stackframe.fileName).then(function (source) {
                    this._get(_findSourceMappingURL(source)).then(function (map) {
                        var lineNumber = stackframe.lineNumber;
                        var columnNumber = stackframe.columnNumber;
                        resolve(_newLocationInfoFromSourceMap(map, stackframe.args, lineNumber, columnNumber));
                    }, reject)['catch'](reject);
                }.bind(this), reject)['catch'](reject);
            }.bind(this));
        };
    };
}));
