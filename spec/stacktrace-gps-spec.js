describe('StackTraceGPS', function () {
    var callback;
    var debugCallback;
    var errback;
    var debugErrback;
    var server;

    beforeEach(function () {
        if (typeof Promise === 'undefined') {
            ES6Promise.polyfill();
        }

        callback = jasmine.createSpy('callback');
        errback = jasmine.createSpy('errback');
        debugCallback = function (stackframes) {
            console.log(stackframes);
        };
        debugErrback = function (e) {
            console.log(e.message);
            console.log(e.stack);
        };
        server = sinon.fakeServer.create();
    });

    afterEach(function () {
        server.restore();
    });

    describe('#Constructor', function () {
        it('allows for overriding the "ajax" function via the "ajax" option property', function () {
            runs(function() {
                function ajax () {
                    return Promise.resolve('');
                }
                var stackTraceGPS = new StackTraceGPS({ajax: ajax});
                stackTraceGPS._get('http://localhost:9999/test.min.js').then(callback, errback);
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalled();
                expect(errback).not.toHaveBeenCalled();
            });
        });
    });

    describe('#_get', function () {
        it('avoids multiple in-flight network requests', function () {
            runs(function() {
                var stackTraceGPS = new StackTraceGPS();
                stackTraceGPS._get('http://localhost:9999/test.min.js').then(callback, errback);
                stackTraceGPS._get('http://localhost:9999/test.min.js').then(callback, errback);
                stackTraceGPS._get('http://localhost:9999/test.min.js').then(callback, errback);
                server.requests[0].respond(200, {}, 'OK');
            });
            waits(100);
            runs(function() {
                expect(server.requests.length).toBe(1);
                expect(callback).toHaveBeenCalled();
                expect(errback).not.toHaveBeenCalled();
            });
        });
    });

    describe('#findFunctionName', function () {
        it('rejects given non-object StackFrame', function () {
            runs(function() {
                StackTraceGPS().findFunctionName('').then(callback, errback); // jshint ignore:line
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                expect(errback.mostRecentCall.args[0].message).toEqual('Given StackFrame is not an object');
            });
        });

        it('rejects given invalid URL String', function () {
            runs(function() {
                new StackTraceGPS().findFunctionName(new StackFrame()).then(callback, errback);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                //expect(errback).toHaveBeenCalledWith(new TypeError('Given file name is not a String'));
            });
        });

        it('rejects given invalid line number', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js');
                new StackTraceGPS().findFunctionName(stackframe).then(callback, errback);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                //expect(errback).toHaveBeenCalledWith(new TypeError('Given line number must be a positive integer'));
            });
        });

        it('rejects given invalid column number', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 10, -1);
                new StackTraceGPS().findFunctionName(stackframe).then(callback, errback);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                //expect(errback).toHaveBeenCalledWith(new TypeError('Given line number must be a non-negative integer'));
            });
        });

        it('rejects if source file could not be found', function () {
            runs(function() {
                server.respondWith('GET', 'http://localhost:9999/file.js', [404, { 'Content-Type': 'application/x-javascript' }, '']);
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 23, 0);
                new StackTraceGPS().findFunctionName(stackframe).then(callback, errback);
                server.requests[0].respond(404, {}, 'Not Found');
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                expect(errback.mostRecentCall.args[0].message).toEqual('HTTP status: 404 retrieving http://localhost:9999/file.js');
            });
        });

        // Expected spy errback to have been called with [ { line : 123, column : 63, sourceURL : '/Users/ewendelin/src/stacktracejs/stacktrace-gps/spec/stacktrace-gps-spec.js' } ] but actual calls were [ { line : 9, column : 9351, sourceURL : '/Users/ewendelin/src/stacktracejs/stacktrace-gps/stacktrace-gps.js' } ]
        it('rejects in offline mode if sources not in source cache', function() {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 23, 0);
                new StackTraceGPS({offline: true}).findFunctionName(stackframe).then(callback, errback)['catch'](debugErrback);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                expect(errback.mostRecentCall.args[0].message).toEqual('Cannot make network requests in offline mode');
            });
        });

        it('resolves sources from given sourceCache', function() {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 1, 4);
                var sourceCache = {'http://localhost:9999/file.js': 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")'};
                new StackTraceGPS({sourceCache: sourceCache}).findFunctionName(stackframe).then(callback, errback)['catch'](debugErrback);
                // NOTE: no fake server response necessary
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('foo', [], 'http://localhost:9999/file.js', 1, 4));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('finds function name within function expression', function () {
            runs(function() {
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.respondWith('GET', 'http://localhost:9999/file.js', [200, { 'Content-Type': 'application/x-javascript' }, source]);
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 1, 4);
                new StackTraceGPS().findFunctionName(stackframe).then(callback, debugErrback)['catch'](debugErrback);
                server.respond();
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('foo', [], 'http://localhost:9999/file.js', 1, 4));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('finds function name within function declaration', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 2, 0);
                new StackTraceGPS().findFunctionName(stackframe).then(callback, errback)['catch'](debugErrback);
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('bar', [], 'http://localhost:9999/file.js', 2, 0));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('finds function name within function evaluation', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 3, 3);
                new StackTraceGPS().findFunctionName(stackframe).then(callback, errback);
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('baz', [], 'http://localhost:9999/file.js', 3, 3));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('ignores commented out function definitions', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 2, 0);
                new StackTraceGPS().findFunctionName(stackframe).then(callback, errback);
                var source = 'var foo = function() {\n//function bar() {}\nvar baz = eval("XXX")};';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                // Finds 'foo' because we search upward until we find a function definition
                expect(callback).toHaveBeenCalledWith(new StackFrame('foo', [], 'http://localhost:9999/file.js', 2, 0));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('resolves to undefined if function name could not be found', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 1, 0);
                new StackTraceGPS().findFunctionName(stackframe).then(callback, errback);
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, '');
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame(undefined, [], 'http://localhost:9999/file.js', 1, 0));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('caches subsequent requests to the same location', function() {
            var unit = new StackTraceGPS();
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 3, 3);
                unit.findFunctionName(stackframe).then(callback, errback);
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 2, 0);
                unit.findFunctionName(stackframe).then(callback, errback);
            });
            waits(100);
            runs(function() {
                expect(server.requests.length).toBe(1);
            });
        });
    });

    describe('#getMappedLocation', function () {
        it('rejects given invalid StackFrame', function() {
            runs(function() {
                new StackTraceGPS().getMappedLocation('BOGUS').then(callback, errback);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
            });
        });

        it('rejects if sourceMapURL not found', function() {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/test.js', 23, 0);
                new StackTraceGPS().getMappedLocation(stackframe).then(callback, errback);
                var source = 'var foo=function(){};function bar(){}var baz=eval("XXX");';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                //expect(errback).toHaveBeenCalledWith(new Error('sourceMappingURL not found'));
            });
        });

        it('rejects if source map file 404s', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/test.js', 23, 0);
                new StackTraceGPS().getMappedLocation(stackframe).then(callback, errback);
                var source = 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//@ sourceMappingURL=test.js.map';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                server.requests[1].respond(404, {}, 'Not Found');
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                //expect(errback).toHaveBeenCalledWith(new Error('sourceMappingURL not found'));
            });
        });

        it('retrieves source mapped location for function expressions', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/test.min.js', 1, 5);
                new StackTraceGPS().getMappedLocation(stackframe).then(callback, errback);
                var source = 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//@ sourceMappingURL=test.js.map';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                var sourceMap = '{"version":3,"sources":["./test.js"],"names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"test.min.js"}';
                server.requests[1].respond(200, { 'Content-Type': 'application/json' }, sourceMap);
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('foo', [], 'test.js', 1, 4));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('retrieves source mapped location for function declarations', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/test.min.js', 1, 32);
                new StackTraceGPS().getMappedLocation(stackframe).then(callback, errback);
                var source = 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//@ sourceMappingURL=test.js.map';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                var sourceMap = '{"version":3,"sources":["./test.js"],"names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"test.min.js"}';
                server.requests[1].respond(200, { 'Content-Type': 'application/json' }, sourceMap);
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('bar', [], 'test.js', 2, 9));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('retrieves source mapped location for eval', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/test.min.js', 1, 47);
                new StackTraceGPS().getMappedLocation(stackframe).then(callback, errback);
                var source = 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//@ sourceMappingURL=test.js.map';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                var sourceMap = '{"version":3,"sources":["./test.js"],"names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"test.min.js"}';
                server.requests[1].respond(200, { 'Content-Type': 'application/json' }, sourceMap);
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('eval', [], 'test.js', 3, 10));
                expect(errback).not.toHaveBeenCalled();
            });
        });
    });

    describe('#pinpoint', function () {
        it('combines findFunctionName and getMappedLocation', function() {
            runs(function() {
                var sourceMin = 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//@ sourceMappingURL=test.js.map';
                var sourceMap = '{"version":3,"sources":["./test.js"],"names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"test.min.js"}';
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.respondWith('GET', 'test.min.js', [200, { 'Content-Type': 'application/x-javascript' }, sourceMin]);
                server.respondWith('GET', 'test.js.map', [200, { 'Content-Type': 'application/x-javascript' }, sourceMap]);
                server.respondWith('GET', 'test.js', [200, { 'Content-Type': 'application/x-javascript' }, source]);

                var stackframe = new StackFrame(undefined, [], 'test.min.js', 1, 47);
                new StackTraceGPS().pinpoint(stackframe).then(callback, errback)['catch'](debugErrback);
            });
            waits(100);
            runs(function() {
                server.respond();
            });
            waits(100);
            runs(function() {
                server.respond();
            });
            waits(100);
            runs(function() {
                server.respond();
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('baz', [], 'test.js', 3, 10));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('resolves with mapped location even if find function name fails', function() {
            runs(function() {
                var sourceMin = 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//@ sourceMappingURL=test.js.map';
                var sourceMap = '{"version":3,"sources":["./test.js"],"names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"test.min.js"}';
                server.respondWith('GET', 'test.min.js', [200, { 'Content-Type': 'application/x-javascript' }, sourceMin]);
                server.respondWith('GET', 'test.js.map', [200, { 'Content-Type': 'application/x-javascript' }, sourceMap]);
                server.respondWith('GET', 'test.js', [404, { 'Content-Type': 'application/x-javascript' }, '']);

                var stackframe = new StackFrame(undefined, [], 'test.min.js', 1, 47);
                new StackTraceGPS().pinpoint(stackframe).then(callback, errback)['catch'](debugErrback);
            });
            waits(100);
            runs(function() {
                server.respond();
            });
            waits(100);
            runs(function() {
                server.respond();
            });
            waits(100);
            runs(function() {
                server.respond();
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('eval', [], 'test.js', 3, 10));
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('supports inline source maps', function() {
            runs(function() {
                var sourceMin = 'var foo=function(){};function bar(){}var baz=eval("XXX");//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlc3QuanMiXSwibmFtZXMiOlsiZm9vIiwiYmFyIiwiYmF6IiwiZXZhbCJdLCJtYXBwaW5ncyI6IkFBQUEsR0FBSUEsS0FBTSxZQUdWLFNBQVNDLFFBRVQsR0FBSUMsS0FBTUMsS0FBTSJ9';
                server.respondWith('GET', 'test.min.js', [200, { 'Content-Type': 'application/x-javascript' }, sourceMin]);

                var stackframe = new StackFrame(undefined, [], 'test.min.js', 1, 47);
                new StackTraceGPS().pinpoint(stackframe).then(callback, errback)['catch'](debugErrback);
            });
            waits(100);
            runs(function() {
                server.respond();
            });
            waits(100);
            runs(function() {
                server.respond();
            });
            waits(100);
            runs(function() {
                server.respond();
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(new StackFrame('eval', [], 'test.js', 6, 10));
                expect(errback).not.toHaveBeenCalled();
            });
        });
    });
});
