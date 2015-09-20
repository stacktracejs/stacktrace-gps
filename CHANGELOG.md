## v2.2.1
* Upgrade source-map dependency
* Fix handling of webpack:// urls in source maps

## v2.2.0
* Add component(1) support

## v2.1.2
* .pinpoint() resolves to source-mapped stackframe even if other analysis fails.
* Fix stackframe dependency in CommonJS definition

## v2.1.0
* Revert change: allow cross-domain XHR in IE8 and IE9 - too unstable

## v2.0.0
* Return StackFrame objects instead of partial code locations
* Add StackTraceGPS.pinpoint(stackframe) enhancing location and function name

## v1.0.4
* Add "offline" option to prevent unwanted network requests
* Add "sourceCache" option to allow sources and source maps to be resolved offline

## v1.0.3
* Allow cross-domain XHR in IE8 and IE9

## v1.0.2
* Name functions such that they can can be filtered out by stacktrace.js

## v1.0.1
* Use Promise.catch() to handle unexpected errors

## v1.0.0
* Use es6-promise to polyfill Promise API

## v0.2.1
* Provide standard distribution (minified and unminified).
* Add draft source maps support

## v0.2.0
* Switch to Promise-based API
* Switch to Karma/Travis/Jasmine for testing and CI

## v0.1.0
* Initial port from stacktrace.js

