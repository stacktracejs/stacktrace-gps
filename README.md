stacktrace-gps - Turn partial code location into precise code location
===================
[![Build Status](https://travis-ci.org/stacktracejs/stackframe.svg?branch=master)](https://travis-ci.org/stacktracejs/stacktrace-gps) [![Coverage Status](https://img.shields.io/coveralls/stacktracejs/stacktrace-gps.svg)](https://coveralls.io/r/stacktracejs/stacktrace-gps) [![Code Climate](https://codeclimate.com/github/stacktracejs/stacktrace-gps/badges/gpa.svg)](https://codeclimate.com/github/stacktracejs/stacktrace-gps)

## Usage
```
var stackframe = new StackFrame(undefined, [], 'http://localhost:3000/file.js', 100, 0);
var callback = function myCallback(foundFunctionName) { console.log(foundFunctionName); };

// Such meta. Wow
var errback = function myErrback(error) { console.log(StackTrace.fromError(error)); };

var gps = new StackTraceGPS();

// Get function name from location information
gps.findFunctionName(stackframe, callback, errback);  // => 'functionName'

// Better location/name information from source maps
gps.getMappedLocation(stackframe, callback, errback); // => {source: './test.js', line: 2, column: 9, name: 'bar'}
```

## Installation
```
npm install stacktrace-gps
bower install stacktrace-gps
```
