/* global StackTraceGPS: false */
describe('StackTraceGPS', function () {
    describe('#findFunctionName', function () {
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

        it('rejects given invalid URL String', function () {
            runs(function() {
                new StackTraceGPS().findFunctionName(undefined).then(callback, errback);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalledWith(new TypeError('Given URL is not a String'));
            });
        });

        it('rejects given invalid line number', function () {
            runs(function() {
                new StackTraceGPS()
                        .findFunctionName('http://localhost:9999/file.js', undefined)
                        .then(callback, errback);
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalledWith(new TypeError('Given line number must be a positive integer'));
            });
        });

        it('rejects if source file could not be found', function () {
            runs(function() {
                new StackTraceGPS()
                        .findFunctionName('http://localhost:9999/file.js', 23)
                        .then(callback, errback);
                server.requests[0].respond(404, {}, 'Not Found');
            });
            waits(100);
            runs(function() {
                expect(callback).not.toHaveBeenCalled();
                expect(errback).toHaveBeenCalled();
            });
        });

        it('finds function name within function expression', function () {
            runs(function() {
                new StackTraceGPS()
                        .findFunctionName('http://localhost:9999/file.js', 1)
                        .then(callback, errback);
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
                new StackTraceGPS()
                        .findFunctionName('http://localhost:9999/file.js', 2)
                        .then(callback, errback);
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
                new StackTraceGPS()
                        .findFunctionName('http://localhost:9999/file.js', 3)
                        .then(callback, errback);
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
                new StackTraceGPS()
                        .findFunctionName('http://localhost:9999/file.js', 1)
                        .then(callback, errback);
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
                unit.findFunctionName('http://localhost:9999/file.js', 3).then(callback, errback);
                var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
                server.requests[0].respond(200, { 'Content-Type': 'application/x-javascript' }, source);
            });
            waits(100);
            runs(function() {
                unit.findFunctionName('http://localhost:9999/file.js', 2).then(callback, errback);
            });
            waits(100);
            runs(function() {
                expect(server.requests.length).toBe(1);
            });
        });
    });
});