var concat = require('gulp-concat');
var coveralls = require('gulp-coveralls');
var del = require('del');
var gulp = require('gulp');
var jshint = require('gulp-jshint');
var karma = require('karma').server;
var path = require('path');
var runSequence = require('run-sequence');
var sourcemaps = require('gulp-sourcemaps');
var uglify = require('gulp-uglify');
var webpack = require('webpack');

var polyfills = [
    './node_modules/es6-promise/dist/es6-promise.js',
    './polyfills.js'
];
var dependencies = [
    './node_modules/stackframe/dist/stackframe.js',
    './build/bundle.js'
];
var source = 'stacktrace-gps.js';

gulp.task('lint', function () {
    return gulp.src(source)
        .pipe(jshint())
        .pipe(jshint.reporter('default'))
        .pipe(jshint.reporter('fail'));
});

gulp.task('webpack-source-consumer', function () {
    return webpack({
        entry: './node_modules/source-map/lib/source-map-consumer.js',
        output: {
            library: 'SourceMap',
            path: path.join(__dirname, 'build'),
            name: 'bundle.js'
        }
    }, function (err) {
        if (err) throw new Error('webpack', err);
    });
});

gulp.task('test', ['webpack-source-consumer'], function (done) {
    karma.start({
        configFile: __dirname + '/karma.conf.js',
        singleRun: true
    }, done);
});

gulp.task('test-ci', ['copy', 'dist'], function (done) {
    karma.start({
        configFile: __dirname + '/karma.conf.ci.js',
        singleRun: true
    }, done);
});

gulp.task('copy', function () {
    return gulp.src(source)
        .pipe(gulp.dest('dist'));
});

gulp.task('dist', ['copy', 'webpack-source-consumer'], function () {
    // Build with ES6Promise and other polyfills
    gulp.src(polyfills.concat(dependencies.concat(source)))
        .pipe(sourcemaps.init())
        .pipe(concat(source.replace('.js', '-with-polyfills.min.js')))
        .pipe(uglify())
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('dist'));

    return gulp.src(dependencies.concat(source))
        .pipe(sourcemaps.init())
        .pipe(concat(source.replace('.js', '.min.js')))
        .pipe(uglify())
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('dist'));
});

gulp.task('clean', del.bind(null, ['build', 'coverage', 'dist']));

gulp.task('ci', ['lint', 'test-ci'], function () {
    gulp.src('./coverage/**/lcov.info')
        .pipe(coveralls());
});

gulp.task('default', ['clean'], function (cb) {
    runSequence('lint', ['copy', 'dist'], 'test', cb);
});
