describe('StackTraceGPS', function () {
    var server;
    var callback;
    var errback;

    beforeEach(function () {
        server = sinon.fakeServer.create();
        callback = jasmine.createSpy('callback');
        errback = jasmine.createSpy('errback');
    });
    afterEach(function () {
        server.restore();
    });

    describe('#findFunctionName', function () {
        it('rejects given non-object StackFrame', function () {
            runs(function() {
                new StackTraceGPS().findFunctionName('http://localhost:9999/file.js', callback, errback);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                //expect(errback).toHaveBeenCalledWith(new TypeError('Given StackFrame is not an object'));
            });
        });

        it('rejects given invalid URL String', function () {
            runs(function() {
                new StackTraceGPS().findFunctionName(undefined, callback, errback);
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
                new StackTraceGPS().findFunctionName(stackframe, callback, errback);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                //expect(errback).toHaveBeenCalledWith(new TypeError('Given line number must be a positive integer'));
            });
        });

        it('rejects if source file could not be found', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 23, 0);
                new StackTraceGPS().findFunctionName(stackframe, callback, errback);
                server.requests[0].respond(404, {}, 'Not Found');
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
                //expect(errback).toHaveBeenCalledWith(new Error('Unable to retrieve http://localhost:9999/file.js'));
            });
        });

        it('finds function name within function expression', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 1, 4);
                new StackTraceGPS().findFunctionName(stackframe, callback, errback);
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith('foo');
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('finds function name within function declaration', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 2, 0);
                new StackTraceGPS().findFunctionName(stackframe, callback, errback);
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith('bar');
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('finds function name within function evaluation', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 3, 3);
                new StackTraceGPS().findFunctionName(stackframe, callback, errback);
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith('baz');
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('resolves to undefined if function name could not be found', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 1, 0);
                new StackTraceGPS().findFunctionName(stackframe, callback, errback);
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, '');
            });
            waits(100);
            runs(function() {
                expect(callback).toHaveBeenCalledWith(undefined);
                expect(errback).not.toHaveBeenCalled();
            });
        });

        it('caches subsequent requests to the same location', function() {
            var unit = new StackTraceGPS();
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 3, 3);
                unit.findFunctionName(stackframe, callback, errback);
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/file.js', 2, 0);
                unit.findFunctionName(stackframe, callback, errback);
            });
            waits(100);
            runs(function() {
                expect(server.requests.length).toBe(1);
            });
        });
    });

    describe('#sourceMap', function () {
        it('rejects if source map file could not be found', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/test.js', 23, 0);
                new StackTraceGPS().getMappedLocation(stackframe, callback, errback);
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

        it('returns new location information given valid input', function () {
            runs(function() {
                var stackframe = new StackFrame(undefined, [], 'http://localhost:9999/test.min.js', 1, 30);
                new StackTraceGPS().getMappedLocation(stackframe, callback, errback);
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
                expect(callback).toHaveBeenCalledWith({source: './test.js', line: 2, column: 9, name: 'bar'});
                expect(errback).not.toHaveBeenCalled();
            });
        });
    });
});
