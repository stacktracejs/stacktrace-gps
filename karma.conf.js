module.exports = function (config) {
    config.set({
        basePath: '',
        frameworks: ['jasmine', 'sinon'],
        files: [
            'node_modules/stackframe/stackframe.js',
            'build/source-map-consumer.min.js',
            'stacktrace-gps.js',
            'spec/*-spec.js'
        ],
        reporters: ['progress', 'coverage'],
        preprocessors: {
            '*.js': 'coverage'
        },
        coverageReporter: {
            type: 'lcov',
            dir: 'coverage'
        },
        port: 9876,
        colors: true,
        logLevel: config.LOG_INFO,
        autoWatch: true,
        // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
        browsers: ['ChromeCanary', 'Firefox', 'Opera', 'Safari'],
        singleRun: false
    });
};
