/* global StackTraceGPS: false */
describe('StackTraceGPS', function () {
    describe('#findFunctionName', function() {
        var unit = new StackTraceGPS();
        it('throws an error given invalid URL String', function() {
            var fn = function () {
                unit.findFunctionName(undefined);
            };
            expect(fn).toThrow(new TypeError('Given URL is not a String'));
        });

        it('throws an error given invalid line number', function() {
            var fn = function () {
                unit.findFunctionName('https://raw.githubusercontent.com/stacktracejs/stacktrace.js/master/stacktrace.js', undefined);
            };
            expect(fn).toThrow(new TypeError('Given line number must be a positive integer'));
        });
    });
});