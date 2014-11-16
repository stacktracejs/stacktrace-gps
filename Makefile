BROWSERS=Firefox,ChromeCanary,Opera,Safari

test: build/jshint.xml build/source-map-consumer.min.js
	@NODE_ENV=test ./node_modules/karma/bin/karma start --single-run --browsers $(BROWSERS)

build/jshint.xml: build
	./node_modules/.bin/jshint --reporter checkstyle ./spec/stacktrace-gps-spec.js ./stacktrace-gps.js > build/jshint.xml

test-ci: build/jshint.xml build/source-map-consumer.min.js
	@echo TRAVIS_JOB_ID $(TRAVIS_JOB_ID)
	@NODE_ENV=test ./node_modules/karma/bin/karma start karma.conf.ci.js --single-run && \
		cat ./coverage/Chrome*/lcov.info | ./node_modules/coveralls/bin/coveralls.js --verbose

build/source-map-consumer.min.js: build
	./node_modules/.bin/webpack node_modules/source-map/lib/source-map/source-map-consumer.js \
	 	--output-library SourceMap --optimize-minimize build/source-map-consumer.min.js

spec/fixtures/test.js.map:
	./node_modules/.bin/uglifyjs2 spec/fixtures/test.js -o spec/fixtures/test.min.js \
		--source-map spec/fixtures/test.js.map

clean:
	rm -fr build coverage dist *.log

build:
	mkdir build

dist: build/source-map-consumer.min.js
	mkdir dist
	cp build/source-map-consumer.min.js dist/source-map-consumer.min.js
	./node_modules/.bin/uglifyjs2 stacktrace-gps.js -o stacktrace-gps.min.js \
		--source-map stacktrace-gps.js.map
	cp stacktrace-gps.js dist/
	mv stacktrace-gps.min.js dist/
	mv stacktrace-gps.js.map dist/

.PHONY: clean test dist
