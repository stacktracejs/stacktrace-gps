var del = require('del');
var gulp = require('gulp');
var jshint = require('gulp-jshint');
var karma = require('karma').server;
var concat = require('gulp-concat');
var path = require("path");
var runSequence = require('run-sequence');
var sourcemaps = require('gulp-sourcemaps');
var uglify = require('gulp-uglify');
var webpack = require('webpack');

var dependencies = [
    './node_modules/stackframe/dist/stackframe.js',
    './build/source-map-consumer.js'
];
var sources = 'stacktrace-gps.js';
var minified = sources.replace('.js', '.min.js');

gulp.task('lint', function () {
    return gulp.src(sources)
        .pipe(jshint())
        .pipe(jshint.reporter('checkstyle'));
});

gulp.task('test', function (done) {
    karma.start({
        configFile: __dirname + '/karma.conf.js',
        singleRun: true
    }, done);
});

gulp.task('test-ci', function (done) {
    karma.start({
        configFile: __dirname + '/karma.conf.ci.js',
        singleRun: true
    }, done);
});

gulp.task('copy', function () {
    var app = gulp.src(sources)
        .pipe(gulp.dest('dist'));
});

gulp.task('webpack-source-consumer', function () {
    return webpack({
        entry: './node_modules/source-map/lib/source-map/source-map-consumer.js',
        output: {
            library: 'SourceMap',
            path: path.join(__dirname, 'build'),
            name: 'source-map-consumer.js'
        }
    }, function (err) {
        if (err) throw new Error('webpack', err);
    });
});

gulp.task('compress', ['webpack-source-consumer'], function () {
    return gulp.src(dependencies.concat(sources))
        .pipe(sourcemaps.init())
        .pipe(concat(minified))
        .pipe(uglify())
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('dist'));
});

gulp.task('clean', del.bind(null, ['dist']));

gulp.task('default', ['clean'], function (cb) {
    runSequence('lint', ['copy', 'compress'], cb);
});
