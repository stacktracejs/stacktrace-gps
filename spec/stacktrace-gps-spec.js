// jscs:disable maximumLineLength
describe('StackTraceGPS', function() {
    beforeEach(function() {
        if (typeof Promise === 'undefined') {
            ES6Promise.polyfill();
        }
        jasmine.Ajax.install();
    });

    afterEach(function() {
        jasmine.Ajax.uninstall();
    });

    describe('#Constructor', function() {
        it('allows for overriding the "ajax" function via the "ajax" option', function(done) {
            function ajax() {
                return Promise.resolve('');
            }

            var stackTraceGPS = new StackTraceGPS({ajax: ajax});
            stackTraceGPS._get('http://localhost:9999/test.min.js').then(done, done.fail);
        });
    });

    describe('#_get', function() {
        it('avoids multiple in-flight network requests', function(done) {
            jasmine.Ajax.stubRequest('http://localhost:9999/test.min.js').andReturn({responseText: 'OK'});

            var stackTraceGPS = new StackTraceGPS();
            stackTraceGPS._get('http://localhost:9999/test.min.js').then(callback, done.fail);
            stackTraceGPS._get('http://localhost:9999/test.min.js').then(callback, done.fail);

            var callCount = 0;

            function callback() {
                callCount++;
                if (callCount === 2) {
                    expect(jasmine.Ajax.requests.count()).toBe(1);
                    done();
                }
            }
        });
    });

    describe('#_getSourceMapConsumer', function() {
        it('avoids duplicate SourceMapConsumers', function(done) {
            var sourceMap = '{"version":3,"sources":["./test.js"],"names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"test.min.js"}';
            var sourceMapUrl = 'http://localhost:9999/test.js.map';
            jasmine.Ajax.stubRequest(sourceMapUrl).andReturn({responseText: sourceMap});

            var stackTraceGPS = new StackTraceGPS();
            stackTraceGPS._getSourceMapConsumer(sourceMapUrl).then(callback, done.fail);
            stackTraceGPS._getSourceMapConsumer(sourceMapUrl).then(callback, done.fail);

            var callCount = 0;
            function callback() {
                callCount++;
                if (callCount === 1) {
                    expect(stackTraceGPS.sourceMapConsumerCache[sourceMapUrl]).toBeTruthy();
                } else if (callCount === 2) {
                    expect(Object.keys(stackTraceGPS.sourceMapConsumerCache).length).toBe(1);
                    done();
                }
            }
        });
    });

    describe('#findFunctionName', function() {
        it('rejects given non-object StackFrame', function(done) {
            StackTraceGPS().findFunctionName('').then(done.fail, done); // jshint ignore:line
        });

        it('rejects given invalid URL String', function(done) {
            new StackTraceGPS().findFunctionName(new StackFrame()).then(done.fail, done);
        });

        it('rejects given invalid line number', function(done) {
            var stackframe = new StackFrame({fileName: 'http://localhost:9999/file.js'});
            new StackTraceGPS().findFunctionName(stackframe).then(done.fail, done);
        });

        it('rejects given invalid column number', function(done) {
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 10, columnNumber: -1});
            new StackTraceGPS().findFunctionName(stackframe).then(done.fail, done);
        });

        it('rejects if source file could not be found', function(done) {
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({status: 404});
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 23, columnNumber: 0});
            new StackTraceGPS().findFunctionName(stackframe).then(done.fail, errback);
            function errback(error) {
                expect(error.message).toEqual('HTTP status: 404 retrieving http://localhost:9999/file.js');
                done();
            }
        });

        // Expected spy errback to have been called with [ { line : 123, column : 63, sourceURL : '/Users/ewendelin/src/stacktracejs/stacktrace-gps/spec/stacktrace-gps-spec.js' } ] but actual calls were [ { line : 9, column : 9351, sourceURL : '/Users/ewendelin/src/stacktracejs/stacktrace-gps/stacktrace-gps.js' } ]
        it('rejects in offline mode if sources not in source cache', function(done) {
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 23, columnNumber: 0});
            new StackTraceGPS({offline: true}).findFunctionName(stackframe).then(done.fail, done);
        });

        it('resolves sources from given sourceCache', function(done) {
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 4});
            var sourceCache = {'http://localhost:9999/file.js': 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")'};
            new StackTraceGPS({sourceCache: sourceCache})
                .findFunctionName(stackframe)
                .then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(new StackFrame({functionName: 'foo', args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 4}));
                done();
            }
        });

        it('resolves source for class method', function(done) {
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 2, columnNumber: 0});
            var sourceCache = {'http://localhost:9999/file.js': 'class Foo {\nbar () {\n}\n }\n'};
            new StackTraceGPS({sourceCache: sourceCache})
                .findFunctionName(stackframe)
                .then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe.functionName).toEqual('bar');
                done();
            }
        });

        it('resolves source for fat arrow functions', function(done) {
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 4});
            var sourceCache = {'http://localhost:9999/file.js': 'var meow = () => { }'};
            new StackTraceGPS({sourceCache: sourceCache})
                .findFunctionName(stackframe)
                .then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe.functionName).toEqual('meow');
                done();
            }
        });

        it('finds function name within function expression', function(done) {
            var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({responseText: source});
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 4});
            new StackTraceGPS().findFunctionName(stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe.functionName).toEqual('foo');
                done();
            }
        });

        it('finds function name within function declaration', function(done) {
            var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({responseText: source});
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 2, columnNumber: 0});
            new StackTraceGPS().findFunctionName(stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe.functionName).toEqual('bar');
                done();
            }
        });

        it('ignores special case invalid function declaration', function(done) {
            var source = 'true ? warning(ReactCurrentOwner.current == null, \'_renderNewRootComponent(): Render methods should be a pure function \' + \'of props and state; triggering nested component updates from \' + \'render is not allowed. If necessary, trigger nested updates in \' + \'componentDidUpdate. Check the render method of %s.\', ReactCurrentOwner.current && ReactCurrentOwner.current.getName() || \'ReactCompositeComponent\') : void 0;';
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({responseText: source});
            var originalStackFrame = new StackFrame({functionName: '@test@', args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 0});
            new StackTraceGPS().findFunctionName(originalStackFrame).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(originalStackFrame);
                done();
            }
        });

        it('finds function name within function evaluation', function(done) {
            var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({responseText: source});
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 3, columnNumber: 3});
            new StackTraceGPS().findFunctionName(stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe.functionName).toEqual('baz');
                done();
            }
        });

        it('finds function name within static functions', function(done) {
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 2, columnNumber: 8});
            var sourceCache = {'http://localhost:9999/file.js': 'class Foo {\nstatic woof() {\n}\n}'};
            new StackTraceGPS({sourceCache: sourceCache}).findFunctionName(stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe.functionName).toEqual('woof');
                done();
            }
        });

        it('ignores special case interpreting control structures as the function parameter list', function(done) {
            var source = 'if (a) { foo(); } else if (b) { bar(); }';
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({responseText: source});
            var originalStackFrame = new StackFrame({functionName: '@test@', args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 0});
            new StackTraceGPS().findFunctionName(originalStackFrame).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(originalStackFrame);
                done();
            }
        });

        it('ignores special case interpreting control structures as the function name', function(done) {
            var source = 'functionCall()\nif (condition) {';
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({responseText: source});
            var originalStackFrame = new StackFrame({functionName: '@test@', args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 2, columnNumber: 0});
            new StackTraceGPS().findFunctionName(originalStackFrame).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(originalStackFrame);
                done();
            }
        });

        it('ignores commented out function definitions', function(done) {
            var source = 'var foo = function() {};\n//function bar() {}\nvar baz = eval("XXX")';
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({responseText: source});
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 2, columnNumber: 0});
            new StackTraceGPS().findFunctionName(stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(new StackFrame({functionName: 'foo', args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 2, columnNumber: 0}));
                done();
            }
        });

        it('resolves to undefined if function name could not be found', function(done) {
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({status: 200});
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 0});
            new StackTraceGPS().findFunctionName(stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 0}));
                done();
            }
        });

        it('does not replace non-anonymous function name with anonymous', function(done) {
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({status: 200});
            var originalStackFrame = new StackFrame({functionName: 'foo', args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 0});
            new StackTraceGPS().findFunctionName(originalStackFrame).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(originalStackFrame);
                done();
            }
        });

        it('caches subsequent requests to the same location', function(done) {
            var unit = new StackTraceGPS();
            var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({responseText: source});

            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 3, columnNumber: 3});
            unit.findFunctionName(stackframe).then(callback, done.fail);

            var stackframe2 = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 2, columnNumber: 0});
            unit.findFunctionName(stackframe2).then(callback, done.fail);

            var callCount = 0;

            function callback() {
                if (++callCount == 2) {
                    expect(jasmine.Ajax.requests.count()).toBe(1);
                    done();
                }
            }
        });
    });

    describe('#getMappedLocation', function() {
        it('rejects given invalid StackFrame', function(done) {
            new StackTraceGPS().getMappedLocation('BOGUS').then(done.fail, done);
        });

        it('rejects if sourceMapURL not found', function(done) {
            var source = 'var foo=function(){};function bar(){}var baz=eval("XXX");';
            jasmine.Ajax.stubRequest('http://localhost:9999/file.js').andReturn({responseText: source});
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 23, columnNumber: 0});
            new StackTraceGPS().getMappedLocation(stackframe).then(done.fail, done);
        });

        it('rejects if source map file 404s', function(done) {
            var source = 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//# sourceMappingURL=test.js.map';
            jasmine.Ajax.stubRequest('http://localhost:9999/test.js').andReturn({responseText: source});
            jasmine.Ajax.stubRequest('http://localhost:9999/test.js.map').andReturn({status: 404});
            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/test.js', lineNumber: 23, columnNumber: 0});
            new StackTraceGPS().getMappedLocation(stackframe).then(done.fail, done);
        });

        describe('with inline sourcemaps', function() {
            beforeEach(function() {
                var sourceMin = 'var foo=function(){};function bar(){}var baz=eval("XXX");//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlc3QuanMiXSwibmFtZXMiOlsiZm9vIiwiYmFyIiwiYmF6IiwiZXZhbCJdLCJtYXBwaW5ncyI6IkFBQUEsR0FBSUEsS0FBTSxZQUdWLFNBQVNDLFFBRVQsR0FBSUMsS0FBTUMsS0FBTSJ9';
                jasmine.Ajax.stubRequest('test.min.js').andReturn({responseText: sourceMin});
                this.stackframe = new StackFrame({args: [], fileName: 'test.min.js', lineNumber: 1, columnNumber: 47});
            });

            it('supports inline source maps', function(done) {
                new StackTraceGPS().getMappedLocation(this.stackframe).then(callback, done.fail);

                function callback(stackframe) {
                    expect(stackframe).toEqual(new StackFrame({functionName: 'eval', args: [], fileName: 'test.js', lineNumber: 6, columnNumber: 10}));
                    done();
                }
            });

            it('uses opts.atob if it was supplied in options', function(done) {
                var atobSpy = jasmine.createSpy('atobSpy').and.callFake(function(str) {
                    return window.atob(str);
                });
                new StackTraceGPS({atob: atobSpy}).getMappedLocation(this.stackframe).then(callback);

                function callback() {
                    expect(atobSpy).toHaveBeenCalled();
                    done();
                }
            });

            it('rejects if atob() does not exist', function(done) {
                var oldAtob = window.atob;
                window.atob = null;
                new StackTraceGPS().getMappedLocation(this.stackframe).then(done.fail, errback)['catch'](errback);

                function errback(error) {
                    expect(error.message).toEqual('You must supply a polyfill for window.atob in this environment');
                    window.atob = oldAtob;
                    done();
                }
            });
        });

        it('tolerates inline source maps with parameters set', function(done) {
            var sourceMin = 'var foo=function(){};function bar(){}var baz=eval("XXX");//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlc3QuanMiXSwibmFtZXMiOlsiZm9vIiwiYmFyIiwiYmF6IiwiZXZhbCJdLCJtYXBwaW5ncyI6IkFBQUEsR0FBSUEsS0FBTSxZQUdWLFNBQVNDLFFBRVQsR0FBSUMsS0FBTUMsS0FBTSJ9';
            jasmine.Ajax.stubRequest('test.min.js').andReturn({responseText: sourceMin});
            this.stackframe = new StackFrame({args: [], fileName: 'test.min.js', lineNumber: 1, columnNumber: 47});
            new StackTraceGPS().getMappedLocation(this.stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(new StackFrame({functionName: 'eval', args: [], fileName: 'test.js', lineNumber: 6, columnNumber: 10}));
                done();
            }
        });

        it('ignores all but the last sourceMappingURL in the file', function (done) {
            var source = 'var foo=function(){};\n//# sourceMappingURL=ignoreme.js.map\nfunction bar(){}var baz=eval("XXX");\n//@ sourceMappingURL=test.js.map';
            jasmine.Ajax.stubRequest('http://localhost:9999/test.min.js').andReturn({responseText: source});
            var sourceMap = '{"version":3,"sources":["./test.js"],"names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"test.min.js"}';
            jasmine.Ajax.stubRequest('http://localhost:9999/test.js.map').andReturn({responseText: sourceMap});

            var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/test.min.js', lineNumber: 1, columnNumber: 5});
            new StackTraceGPS().getMappedLocation(stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(new StackFrame({functionName: 'foo', args: [], fileName: 'http://localhost:9999/test.js', lineNumber: 1, columnNumber: 4}));
                done();
            }
        });

        describe('given source and source map that resolves', function() {
            beforeEach(function() {
                var source = 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//@ sourceMappingURL=test.js.map\n//# sourceURL=test.js';
                jasmine.Ajax.stubRequest('http://localhost:9999/test.min.js').andReturn({responseText: source});
                var sourceMap = '{"version":3,"sources":["./test.js"],"names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"test.min.js"}';
                jasmine.Ajax.stubRequest('http://localhost:9999/test.js.map').andReturn({responseText: sourceMap});
            });

            it('retrieves source mapped location for function expressions', function(done) {
                var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/test.min.js', lineNumber: 1, columnNumber: 5});
                new StackTraceGPS().getMappedLocation(stackframe).then(callback, done.fail);

                function callback(stackframe) {
                    expect(stackframe).toEqual(new StackFrame({functionName: 'foo', args: [], fileName: 'http://localhost:9999/test.js', lineNumber: 1, columnNumber: 4}));
                    done();
                }
            });

            it('retrieves source mapped location for function declarations', function(done) {
                var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/test.min.js', lineNumber: 1, columnNumber: 32});
                new StackTraceGPS().getMappedLocation(stackframe).then(callback, done.fail);

                function callback(stackframe) {
                    expect(stackframe).toEqual(new StackFrame({functionName: 'bar', args: [], fileName: 'http://localhost:9999/test.js', lineNumber: 2, columnNumber: 9}));
                    done();
                }
            });

            it('retrieves source mapped location for eval', function(done) {
                var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/test.min.js', lineNumber: 1, columnNumber: 47});
                new StackTraceGPS().getMappedLocation(stackframe).then(callback, done.fail);

                function callback(stackframe) {
                    expect(stackframe).toEqual(new StackFrame({functionName: 'eval', args: [], fileName: 'http://localhost:9999/test.js', lineNumber: 3, columnNumber: 10}));
                    done();
                }
            });

            it('does not replace non-empty functionName with empty value', function(done) {
                var stackframe = new StackFrame({functionName: 'foo', args: [], fileName: 'http://localhost:9999/test.min.js', lineNumber: 2000, columnNumber: 4200});
                new StackTraceGPS().getMappedLocation(stackframe).then(callback, done.fail);

                function callback(stackframe) {
                    expect(stackframe).toEqual(stackframe);
                    done();
                }
            });
        });

        describe('given cache entry for source map', function() {
            it('resolves SourceMapConsumer from cache', function(done) {
                var stackframe = new StackFrame({args: [], fileName: 'http://localhost:9999/file.min.js', lineNumber: 1, columnNumber: 4});
                var sourceCache = {'http://localhost:9999/file.min.js': 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//# sourceMappingURL=file.js.map'};
                var sourceMap = '{"version":3,"sources":["./file.js"],"sourceRoot":"http://localhost:9999/","names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"file.min.js"}';
                var sourceMapConsumerCache = {'http://localhost:9999/file.js.map': new SourceMap.SourceMapConsumer(sourceMap)};
                new StackTraceGPS({sourceCache: sourceCache, sourceMapConsumerCache: sourceMapConsumerCache})
                    .getMappedLocation(stackframe)
                    .then(callback, done.fail);

                function callback(stackframe) {
                    expect(stackframe).toEqual(new StackFrame({functionName: 'foo', args: [], fileName: 'http://localhost:9999/file.js', lineNumber: 1, columnNumber: 4}));
                    done();
                }
            });
        });
    });

    describe('#pinpoint', function() {
        beforeEach(function() {
            var sourceMin = 'var foo=function(){};function bar(){}var baz=eval("XXX");\n//@ sourceMappingURL=test.js.map';
            jasmine.Ajax.stubRequest('test.min.js').andReturn({responseText: sourceMin});
            var sourceMap = '{"version":3,"sources":["./test.js"],"names":["foo","bar","baz","eval"],"mappings":"AAAA,GAAIA,KAAM,YACV,SAASC,QACT,GAAIC,KAAMC,KAAK","file":"test.min.js"}';
            jasmine.Ajax.stubRequest('test.js.map').andReturn({responseText: sourceMap});
        });

        it('combines findFunctionName and getMappedLocation', function(done) {
            var source = 'var foo = function() {};\nfunction bar() {}\nvar baz = eval("XXX")';
            jasmine.Ajax.stubRequest('test.js').andReturn({responseText: source});

            var stackframe = new StackFrame({args: [], fileName: 'test.min.js', lineNumber: 1, columnNumber: 47});
            new StackTraceGPS().pinpoint(stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(new StackFrame({functionName: 'baz', args: [], fileName: 'test.js', lineNumber: 3, columnNumber: 10}));
                done();
            }
        });

        it('resolves with mapped location even if find function name fails', function(done) {
            jasmine.Ajax.stubRequest('test.js').andError();

            var stackframe = new StackFrame({args: [], fileName: 'test.min.js', lineNumber: 1, columnNumber: 47});
            new StackTraceGPS().pinpoint(stackframe).then(callback, done.fail);

            function callback(stackframe) {
                expect(stackframe).toEqual(new StackFrame({functionName: 'eval', args: [], fileName: 'test.js', lineNumber: 3, columnNumber: 10}));
                done();
            }
        });
    });
});
