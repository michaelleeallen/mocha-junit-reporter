/* eslint-env mocha */
'use strict';

var Reporter = require('../index');

var mochaVersion = process.env.MOCHA_VERSION || '';
var Mocha = require('mocha' + mochaVersion);
var Runner = Mocha.Runner;
var Suite = Mocha.Suite;
var Test = Mocha.Test;

var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');

var chai = require('chai');
var expect = chai.expect;
var FakeTimer = require('@sinonjs/fake-timers');
var xmllint = require('xmllint');
var chaiXML = require('chai-xml');
var mockXml = require('./mock-results');
var mockJunitSuites = require('./mock-junit-suites');
var testConsole = require('test-console');

var debug = require('debug')('mocha-junit-reporter:tests');

chai.use(chaiXML);

describe('mocha-junit-reporter', function() {
  var filePath;
  var MOCHA_FILE;
  var stdout;

  function mockStdout () {
    stdout = testConsole.stdout.inspect();
    return stdout;
  }

  function createTest(name, options, fn) {
    if (typeof options === 'function') {
      fn = options;
      options = null;
    }
    options = options || {};

    // null fn means no callback which mocha treats as pending test.
    // undefined fn means caller wants a default fn.
    if (fn === undefined) {
      fn = function () {};
    }

    var test = new Test(name, fn);

    var duration = options.duration;
    if (duration != null) {
      // mock duration so we have consistent output
      Object.defineProperty(test, 'duration', {
        set: function() {
          // do nothing
        },
        get: function() {
          return duration;
        }
      });
    }

    return test;
  }

  function runTests(reporter, options, callback) {
    if (!callback) {
      callback = options;
      options = null;
    }
    options = options || {};
    options.invalidChar = options.invalidChar || '';
    options.title = options.title || 'Foo Bar';

    var runner = reporter.runner;
    var rootSuite = runner.suite;

    var suite1 = Suite.create(rootSuite, options.title);
    suite1.addTest(createTest('can weez the juice', {
      duration: 101
    }));

    suite1.addTest(createTest('can narfle the garthog', {duration: 2002}, function(done) {
      var err = new Error(options.invalidChar + 'expected garthog to be dead' + options.invalidChar);
      err.stack = 'this is where the stack would be';
      done(err);
    }));

    suite1.addTest(createTest('can behave like a flandip', {duration: 30003}, function(done) {
      var err = new Error('expected baz to be masher, a hustler, an uninvited grasper of cone');
      err.name = 'BazError';
      err.stack = 'stack';
      done(err);
    }));

    var suite2 = Suite.create(rootSuite, 'Another suite!');
    suite2.addTest(createTest('works', {duration: 400004}));

    if (options.includePending) {
      var pendingSuite = Suite.create(rootSuite, 'Pending suite!');
      pendingSuite.addTest(createTest('pending', null, null));
    }

    var _onSuiteEnd = reporter._onSuiteEnd.bind(reporter);

    reporter._onSuiteEnd = function(suite) {
      if (suite === rootSuite) {
        // root suite took no time to execute
        reporter._Date.clock.tick(0);
      } else if (suite === suite1) {
        // suite1 took an arbitrary amount of time that includes time to run each test + setup and teardown
        reporter._Date.clock.tick(100001);
      } else if (suite === suite2) {
        reporter._Date.clock.tick(400005);
      }

      return _onSuiteEnd(suite);
    };

    runRunner(runner, callback);
  }

  function assertXmlEquals(actual, expected) {
    expect(actual).xml.to.be.valid();
    expect(actual).xml.to.equal(expected);
  }

  function verifyMochaFile(runner, path, options) {
    var now = (new Date()).toISOString();
    debug('verify', now);
    var output = fs.readFileSync(path, 'utf-8');
    assertXmlEquals(output, mockXml(runner.stats, options));
    debug('done', now);
  }

  function removeTestPath(callback) {
    rimraf(__dirname + '/output', function(err) {
      if (err) {
        return callback(err);
      }

      // tests that exercise defaults will write to $CWD/test-results.xml
      rimraf(__dirname + '/../test-results.xml', callback);
    });
  }

  function createRunner() {
    // mocha always has a root suite
    var rootSuite = new Suite('', 'root', true);

    // We don't want Mocha to emit timeout errors.
    // If we want to simulate errors, we'll emit them ourselves.
    rootSuite.timeout(0);

    return new Runner(rootSuite);
  }

  function createReporter(options) {
    options = options || {};
    filePath = path.join(path.dirname(__dirname), options.mochaFile || '');

    var mocha = new Mocha({
      reporter: Reporter,
      allowUncaught: true
    });

    return new mocha._reporter(createRunner(), {
      reporterOptions: options,
      Date: FakeTimer.createClock(0).Date
    });
  }

  function runRunner(runner, callback) {
    runner.run(function(failureCount) {
      if (runner.dispose) {
        // Ensure uncaught exception handlers are cleared before we execute test assertions.
        // Otherwise, this runner would intercept uncaught exceptions that were already handled by the mocha instance
        // running our tests.
        runner.dispose();
      }

      callback(failureCount);
    });
  }

  function getFileNameWithHash(path) {
    var filenames = fs.readdirSync(path);
    var expected = /(^results\.)([a-f0-9]{32})(\.xml)$/i;

    for (var i = 0; i < filenames.length; i++) {
      if (expected.test(filenames[i])) {
        return filenames[i];
      }
    }
  }

  before(function(done) {
    // cache this
    MOCHA_FILE = process.env.MOCHA_FILE;

    removeTestPath(done);
  });

  after(function() {
    // reset this
    process.env.MOCHA_FILE = MOCHA_FILE;
  });

  beforeEach(function() {
    filePath = undefined;
    delete process.env.MOCHA_FILE;
    delete process.env.PROPERTIES;
  });

  afterEach(function(done) {
    debug('after');
    if (stdout) {
      stdout.restore();
    }

    removeTestPath(done);
  });

  it('can produce a JUnit XML report', function(done) {
    var reporter = createReporter({mochaFile: 'test/output/mocha.xml'});
    runTests(reporter, function() {
      verifyMochaFile(reporter.runner, filePath);
      done();
    });
  });

  it('can handle getXml being called twice', function() {
    var reporter = createReporter({mochaFile: 'test/output/mocha.xml'});
    var testsuites = mockJunitSuites.withStringTimes();
    reporter.getXml(testsuites);
  });

  it('respects `process.env.MOCHA_FILE`', function(done) {
    process.env.MOCHA_FILE = 'test/output/results.xml';
    var reporter = createReporter();
    runTests(reporter, function() {
      verifyMochaFile(reporter.runner, process.env.MOCHA_FILE);
      done();
    });
  });

  it('respects `process.env.PROPERTIES`', function(done) {
    process.env.PROPERTIES = 'CUSTOM_PROPERTY:ABC~123';
    var reporter = createReporter({mochaFile: 'test/output/properties.xml'});
    runTests(reporter, function() {
      verifyMochaFile(reporter.runner, filePath, {
        properties: [
          {
            name: 'CUSTOM_PROPERTY',
            value: 'ABC~123'
          }
        ]
      });
      done();
    });
  });

  it('respects `--reporter-options mochaFile=`', function(done) {
    var reporter = createReporter({mochaFile: 'test/output/results.xml'});
    runTests(reporter, function() {
      verifyMochaFile(reporter.runner, filePath);
      done();
    });
  });

  it('respects `[hash]` pattern in test results report filename', function(done) {
    var dir = 'test/output/';
    var path = dir + 'results.[hash].xml';
    var reporter = createReporter({mochaFile: path});
    runTests(reporter, function() {
      verifyMochaFile(reporter.runner, dir + getFileNameWithHash(dir));
      done();
    });
  });


  it("respects `[testsuitesTitle]` pattern in test results report filename", function (done) {
    var dir = "test/output/";
    var path = dir + "results.[testsuitesTitle].xml";
    var reporter = createReporter({ mochaFile: path });
    runTests(reporter, function () {
      verifyMochaFile(
        reporter.runner,
        dir + "results." + reporter._options.testsuitesTitle + ".xml"
      );
      done();
    });
  });

  it("respects `[rootSuiteTitle]` pattern in test results report filename", function (done) {
    var dir = "test/output/";
    var path = dir + "results.[rootSuiteTitle].xml";
    var reporter = createReporter({ mochaFile: path });
    runTests(reporter, function () {
      verifyMochaFile(
        reporter.runner,
        dir +
          "results." +
          reporter._testsuites[0].testsuite[0]._attr.name +
          ".xml"
      );
      done();
    });
  });

  it("respects `[suiteFilename]` pattern in test results report filename", function (done) {
    var dir = "test/output/";
    var path = dir + "results.[suiteFilename].xml";
    var reporter = createReporter({ mochaFile: path });
    runTests(reporter, function () {
      verifyMochaFile(
        reporter.runner,
        dir +
          "results." +
          reporter._testsuites[0].testsuite[0]._attr.file +
          ".xml"
      );
      done();
    });
  });

  it("respects `[suiteName]` pattern in test results report filename", function (done) {
    var dir = "test/output/";
    var path = dir + "results.[suiteName].xml";
    var reporter = createReporter({ mochaFile: path });
    runTests(reporter, function () {
      verifyMochaFile(
        reporter.runner,
        dir +
          "results." +
          reporter._testsuites[1].testsuite[0]._attr.name +
          ".xml"
      );
      done();
    });
  });

  it('will create intermediate directories', function(done) {
    var reporter = createReporter({mochaFile: 'test/output/foo/mocha.xml'});
    runTests(reporter, function() {
      verifyMochaFile(reporter.runner, filePath);
      done();
    });
  });

  it('creates valid XML report for invalid message', function(done) {
    var reporter = createReporter({mochaFile: 'test/output/mocha.xml'});
    runTests(reporter, {invalidChar: '\u001b'}, function() {
      assertXmlEquals(reporter._xml, mockXml(reporter.runner.stats));
      done();
    });
  });

  it('creates valid XML report even if title contains ANSI character sequences', function(done) {
    var reporter = createReporter({mochaFile: 'test/output/mocha.xml'});
    runTests(reporter, {title: '[38;5;104m[1mFoo Bar'}, function() {
      verifyMochaFile(reporter.runner, filePath);
      done();
    });
  });

  it('outputs pending tests if "includePending" is specified', function(done) {
    var reporter = createReporter({mochaFile: 'test/output/mocha.xml', includePending: true});
    runTests(reporter, {includePending: true}, function() {
      verifyMochaFile(reporter.runner, filePath);
      done();
    });
  });

  it('can output to the console', function(done) {
    var reporter = createReporter({mochaFile: 'test/output/console.xml', toConsole: true});

    var stdout = mockStdout();
    runTests(reporter, function() {
      verifyMochaFile(reporter.runner, filePath);

      var xml = stdout.output[0];
      assertXmlEquals(xml, mockXml(reporter.runner.stats));

      done();
    });
  });

  it('properly outputs tests when error in beforeAll', function(done) {
    var reporter = createReporter();
    var rootSuite = reporter.runner.suite;
    var suite1 = Suite.create(rootSuite, 'failing beforeAll');
    suite1.beforeAll('failing hook', function() {
      throw new Error('error in before');
    });
    suite1.addTest(createTest('test 1'));

    var suite2 = Suite.create(rootSuite, 'good suite');
    suite2.addTest(createTest('test 2'));

    runRunner(reporter.runner, function() {
      if (reporter.runner.dispose) {
        reporter.runner.dispose();
      }

      expect(reporter._testsuites).to.have.lengthOf(3);
      expect(reporter._testsuites[1].testsuite[0]._attr.name).to.equal('failing beforeAll');
      expect(reporter._testsuites[1].testsuite[1].testcase).to.have.lengthOf(2);

      var failureMessage = 'failing beforeAll "before all" hook: failing hook';
      if (!['2', '3', '4', '5'].includes(mochaVersion)) {
        // newer versions of Mocha include the name of the test in the message
        failureMessage += ' for "test 1"';
      }
      expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal(failureMessage);
      expect(reporter._testsuites[1].testsuite[1].testcase[1].failure._attr.message).to.equal('error in before');
      expect(reporter._testsuites[2].testsuite[0]._attr.name).to.equal('good suite');
      expect(reporter._testsuites[2].testsuite[1].testcase).to.have.lengthOf(1);
      expect(reporter._testsuites[2].testsuite[1].testcase[0]._attr.name).to.equal('good suite test 2');
      done();
    });
  });

  it('properly diffs errors from Chai', function(done) {
    var reporter = createReporter();
    var rootSuite = reporter.runner.suite;
    var suite1 = Suite.create(rootSuite, 'failing with Chai');
    suite1.addTest(createTest('test 1', function () {
      expect({}).to.deep.equal({missingProperty: true});
    }));

    runRunner(reporter.runner, function() {
      if (reporter.runner.dispose) {
        reporter.runner.dispose();
      }

      expect(reporter._testsuites).to.have.lengthOf(2);
      expect(reporter._testsuites[1].testsuite[0]._attr.name).to.equal('failing with Chai');
      expect(reporter._testsuites[1].testsuite[1].testcase).to.have.lengthOf(2);
      expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal('failing with Chai test 1');
      expect(reporter._testsuites[1].testsuite[1].testcase[1].failure._attr.message).to.equal('expected {} to deeply equal { missingProperty: true }');
      expect(reporter._testsuites[1].testsuite[1].testcase[1].failure._cdata).to.match(/AssertionError: expected {} to deeply equal {\s*missingProperty:\s*true\s*}\n(?:\s* at .*?\n)*\n\s*\+ expected - actual\n+\s*-{}\n\s*\+{\n\s*\+\s*"missingProperty":\s*true\n\s*\+}[\s\S]*/);
      done();
    });
  });

  describe('when "useFullSuiteTitle" option is specified', function() {
    it('generates full suite title', function(done) {
      var reporter = createReporter({useFullSuiteTitle: true });
      runTests(reporter, function() {
        expect(suiteName(reporter._testsuites[0])).to.equal('');
        expect(suiteName(reporter._testsuites[1])).to.equal('Root Suite Foo Bar');
        expect(suiteName(reporter._testsuites[2])).to.equal('Root Suite Another suite!');
        done();
      });
    });

    it('generates full suite title separated by "suiteTitleSeparatedBy" option', function(done) {
      var reporter = createReporter({useFullSuiteTitle: true, suiteTitleSeparatedBy: '.'});
      runTests(reporter, function() {
        expect(suiteName(reporter._testsuites[0])).to.equal('');
        expect(suiteName(reporter._testsuites[1])).to.equal('Root Suite.Foo Bar');
        expect(suiteName(reporter._testsuites[2])).to.equal('Root Suite.Another suite!');
        done();
      });
    });

    function suiteName(suite) {
      return suite.testsuite[0]._attr.name;
    }
  });

  describe('when "outputs" option is specified', function() {
    it('adds output/error lines to xml report', function(done) {
      var reporter = createReporter({outputs: true});

      var test = createTest('has outputs');
      test.consoleOutputs = [ 'hello', 'world' ];
      test.consoleErrors = [ 'typical diagnostic info', 'all is OK' ];

      var suite = Suite.create(reporter.runner.suite, 'with console output and error');
      suite.addTest(test);

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites[1].testsuite[0]._attr.name).to.equal(suite.title);
        expect(reporter._testsuites[1].testsuite[1].testcase).to.have.length(3);
        expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal(test.fullTitle());
        expect(reporter._testsuites[1].testsuite[1].testcase[1]).to.have.property('system-out', 'hello\nworld');
        expect(reporter._testsuites[1].testsuite[1].testcase[2]).to.have.property('system-err', 'typical diagnostic info\nall is OK');

        expect(reporter._xml).to.include('<system-out>hello\nworld</system-out>');
        expect(reporter._xml).to.include('<system-err>typical diagnostic info\nall is OK</system-err>');

        done();
      });
    });

    it('does not add system-out if no outputs/errors were passed', function(done) {
      var reporter = createReporter({outputs: true});
      var test = createTest('has outputs');
      var suite = Suite.create(reporter.runner.suite, 'with console output and error');
      suite.addTest(test);

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites[1].testsuite[0]._attr.name).to.equal(suite.title);
        expect(reporter._testsuites[1].testsuite[1].testcase).to.have.length(1);
        expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal(test.fullTitle());

        expect(reporter._xml).not.to.include('<system-out>');
        expect(reporter._xml).not.to.include('<system-err>');

        done();
      });
    });

    it('does not add system-out if outputs/errors were empty', function(done) {
      var reporter = createReporter({outputs: true});
      var test = createTest('has outputs');
      test.consoleOutputs = [];
      test.consoleErrors = [];

      var suite = Suite.create(reporter.runner.suite, 'with console output and error');
      suite.addTest(test);

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites[1].testsuite[0]._attr.name).to.equal(suite.title);
        expect(reporter._testsuites[1].testsuite[1].testcase).to.have.length(1);
        expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal(test.fullTitle());

        expect(reporter._xml).not.to.include('<system-out>');
        expect(reporter._xml).not.to.include('<system-err>');

        done();
      });
    });
  });

  describe('when "attachments" option is specified', function() {
    it('adds attachments to xml report', function(done) {
      var filePath = '/path/to/file';
      var reporter = createReporter({attachments: true});
      var test = createTest('has attachment');
      test.attachments = [filePath];

      var suite = Suite.create(reporter.runner.suite, 'with attachments');
      suite.addTest(test);

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites[1].testsuite[0]._attr.name).to.equal(suite.title);
        expect(reporter._testsuites[1].testsuite[1].testcase).to.have.length(2);
        expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal(test.fullTitle());
        expect(reporter._testsuites[1].testsuite[1].testcase[1]).to.have.property('system-out', '[[ATTACHMENT|' + filePath + ']]');

        expect(reporter._xml).to.include('<system-out>[[ATTACHMENT|' + filePath + ']]</system-out>');

        done();
      });
    });

    it('does not add system-out if no attachments were passed', function(done) {
      var reporter = createReporter({attachments: true});
      var test = createTest('has attachment');

      var suite = Suite.create(reporter.runner.suite, 'with attachments');
      suite.addTest(test);

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites[1].testsuite[0]._attr.name).to.equal(suite.title);
        expect(reporter._testsuites[1].testsuite[1].testcase).to.have.lengthOf(1);
        expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal(test.fullTitle());

        expect(reporter._xml).to.not.include('<system-out>');

        done();
      });
    });

    it('does not add system-out if attachments array is empty', function(done) {
      var reporter = createReporter({attachments: true});
      var test = createTest('has attachment');
      test.attachments = [];

      var suite = Suite.create(reporter.runner.suite, 'with attachments');
      suite.addTest(test);

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites[1].testsuite[0]._attr.name).to.equal(suite.title);
        expect(reporter._testsuites[1].testsuite[1].testcase).to.have.lengthOf(1);
        expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal(test.fullTitle());

        expect(reporter._xml).to.not.include('<system-out>');

        done();
      });
    });

    it('includes both console outputs and attachments in XML', function(done) {
      var reporter = createReporter({attachments: true, outputs: true});
      var test = createTest('has attachment');
      var filePath = '/path/to/file';
      test.attachments = [filePath];
      test.consoleOutputs = [ 'first console line', 'second console line' ];

      var suite = Suite.create(reporter.runner.suite, 'with attachments and outputs');
      suite.addTest(test);

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites[1].testsuite[0]._attr.name).to.equal(suite.title);
        expect(reporter._testsuites[1].testsuite[1].testcase).to.have.length(2);
        expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal(test.fullTitle());
        expect(reporter._testsuites[1].testsuite[1].testcase[1]).to.have.property('system-out', 'first console line\nsecond console line\n[[ATTACHMENT|' + filePath + ']]');

        expect(reporter._xml).to.include('<system-out>first console line\nsecond console line\n[[ATTACHMENT|' + filePath + ']]</system-out>');

        done();
      });
    });
  });

  describe('Output', function() {
    it('skips suites with empty title', function(done) {
      var reporter = createReporter();
      var suite = Suite.create(reporter.runner.suite, '');
      suite.root = false; // mocha treats suites with empty title as root, so not sure this is possible
      suite.addTest(createTest('test'));

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites).to.have.lengthOf(1);
        expect(reporter._testsuites[0].testsuite[0]._attr.name).to.equal('Root Suite');
        done();
      });
    });

    it('skips suites without testcases and suites', function(done) {
      var reporter = createReporter();
      Suite.create(reporter.runner.suite, 'empty suite');

      // mocha won't emit the `suite` event if a suite has no tests in it, so we won't even output the root suite.
      // See https://github.com/mochajs/mocha/blob/c0137eb698add08f29035467ea1dc230904f82ba/lib/runner.js#L723.
      runRunner(reporter.runner, function() {
        expect(reporter._testsuites).to.have.lengthOf(0);
        done();
      });
    });

    it('skips suites without testcases even if they have nested suites', function(done) {
      var reporter = createReporter();
      var suite1 = Suite.create(reporter.runner.suite, 'suite');
      Suite.create(suite1, 'nested suite');

      runRunner(reporter.runner, function() {
        // even though we have nested suites, there are no tests so mocha won't emit the `suite` event
        expect(reporter._testsuites).to.have.lengthOf(0);
        done();
      });
    });

    it('does not skip suites with nested tests', function(done) {
      var reporter = createReporter();
      var suite = Suite.create(reporter.runner.suite, 'nested suite');
      suite.addTest(createTest('test'));

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites).to.have.lengthOf(2);
        expect(reporter._testsuites[0].testsuite[0]._attr.name).to.equal('Root Suite');
        expect(reporter._testsuites[1].testsuite[1].testcase).to.have.lengthOf(1);
        expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal('nested suite test');
        done();
      });
    });

    it('does not skip root suite', function(done) {
      var reporter = createReporter();
      reporter.runner.suite.addTest(createTest('test'));

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites).to.have.lengthOf(1);
        expect(reporter._testsuites[0].testsuite[0]._attr.name).to.equal('Root Suite');
        expect(reporter._testsuites[0].testsuite[1].testcase).to.have.lengthOf(1);

        var expectedName = 'test';
        if (['2', '3'].includes(mochaVersion)) {
          expectedName = ' ' + expectedName;
        }
        expect(reporter._testsuites[0].testsuite[1].testcase[0]._attr.name).to.equal(expectedName);
        done();
      });
    });

    it('respects the `rootSuiteTitle`', function(done) {
      var name = 'The Root Suite!';
      var reporter = createReporter({rootSuiteTitle: name});
      reporter.runner.suite.addTest(createTest('test'));

      runRunner(reporter.runner, function() {
        expect(reporter._testsuites).to.have.lengthOf(1);
        expect(reporter._testsuites[0].testsuite[0]._attr.name).to.equal(name);
        done();
      });
    });

    it('uses "Mocha Tests" by default', function(done) {
      var reporter = createReporter();
      reporter.runner.suite.addTest(createTest('test'));

      runRunner(reporter.runner, function() {
        expect(reporter._xml).to.include('testsuites name="Mocha Tests"');
        done();
      });
    });

    it('respects the `testsuitesTitle`', function(done) {
      var title = 'SuitesTitle';
      var reporter = createReporter({testsuitesTitle: title});
      reporter.runner.suite.addTest(createTest('test'));

      runRunner(reporter.runner, function() {
        expect(reporter._xml).to.include('testsuites name="SuitesTitle"');
        done();
      });
    });
  });

  describe('Feature "Configurable classname/name switch"', function() {
    var mockedTestCase = {
      title: "should behave like so",
      timestamp: 123,
      tests: "1",
      failures: "0",
      time: "0.004",
      fullTitle: function() {
        return 'Super Suite ' + this.title;
      }
    };

    it('should generate valid testCase for testCaseSwitchClassnameAndName default', function() {
      var reporter = createReporter();
      var testCase = reporter.getTestcaseData(mockedTestCase);
      expect(testCase.testcase[0]._attr.name).to.equal(mockedTestCase.fullTitle());
      expect(testCase.testcase[0]._attr.classname).to.equal(mockedTestCase.title);
    });

    it('should generate valid testCase for testCaseSwitchClassnameAndName=false', function() {
      var reporter = createReporter({testCaseSwitchClassnameAndName: false});
      var testCase = reporter.getTestcaseData(mockedTestCase);
      expect(testCase.testcase[0]._attr.name).to.equal(mockedTestCase.fullTitle());
      expect(testCase.testcase[0]._attr.classname).to.equal(mockedTestCase.title);
    });

    it('should generate valid testCase for testCaseSwitchClassnameAndName=true', function() {
      var reporter = createReporter({testCaseSwitchClassnameAndName: true});
      var testCase = reporter.getTestcaseData(mockedTestCase);
      expect(testCase.testcase[0]._attr.name).to.equal(mockedTestCase.title);
      expect(testCase.testcase[0]._attr.classname).to.equal(mockedTestCase.fullTitle());
    });
  });

  describe('XML format', function () {
    it('generates Jenkins compatible XML when in jenkinsMode', function(done) {
      this.timeout(10000); // xmllint is very slow

      var reporter = createReporter({jenkinsMode: true});
      var rootSuite = reporter.runner.suite;

      var suite1 = Suite.create(rootSuite, 'Inner Suite');
      suite1.addTest(createTest('test'));

      var suite2 = Suite.create(rootSuite, 'Another Suite');
      suite2.addTest(createTest('test', function(done) {
        done(new Error('failed test'));
      }));

      runRunner(reporter.runner, function() {
        var schema = fs.readFileSync(path.join(__dirname, 'resources', 'jenkins-junit.xsd'));
        var result = xmllint.validateXML({ xml: reporter._xml, schema: schema });
        expect(result.errors).to.equal(null, JSON.stringify(result.errors));

        done();
      });
    });

    it('generates Ant compatible XML when in antMode', function(done) {
      this.timeout(10000); // xmllint is very slow

      var reporter = createReporter({antMode: true});
      var rootSuite = reporter.runner.suite;

      var suite1 = Suite.create(rootSuite, 'Inner Suite');
      suite1.addTest(createTest('test'));

      var suite2 = Suite.create(rootSuite, 'Another Suite');
      suite2.addTest(createTest('test', function(done) {
        done(new Error('failed test'));
      }));

      runRunner(reporter.runner, function() {
        var schema = fs.readFileSync(path.join(__dirname, 'resources', 'JUnit.xsd'));
        var result = xmllint.validateXML({ xml: reporter._xml, schema: schema });
        expect(result.errors).to.equal(null, JSON.stringify(result.errors));

        done();
      });
    });

    describe('Jenkins format', function () {
      it('generates Jenkins compatible classnames and suite name', function(done) {
        var reporter = createReporter({jenkinsMode: true});
        var rootSuite = reporter.runner.suite;

        var suite1 = Suite.create(rootSuite, 'Inner Suite');
        suite1.addTest(createTest('test'));

        var suite2 = Suite.create(suite1, 'Another Suite');
        suite2.addTest(createTest('fail test', function(done) {
          done(new Error('failed test'));
        }));

        runRunner(reporter.runner, function() {
          expect(reporter._testsuites[0].testsuite[0]._attr.name).to.equal('');
          expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal('test');
          expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.classname).to.equal('Inner Suite');
          expect(reporter._testsuites[2].testsuite[0]._attr.name).to.equal('Root Suite.Inner Suite.Another Suite');
          expect(reporter._testsuites[2].testsuite[1].testcase[0]._attr.name).to.equal('fail test');
          expect(reporter._testsuites[2].testsuite[1].testcase[0]._attr.classname).to.equal('Inner Suite.Another Suite');

          done();
        });
      });
      it('prefix is added to a classname when jenkinsClassnamePrefix is specified', function(done) {
        var reporter = createReporter({jenkinsMode: true,  jenkinsClassnamePrefix: "Added Prefix"});
        var rootSuite = reporter.runner.suite;

        var suite1 = Suite.create(rootSuite, 'Inner Suite');
        suite1.addTest(createTest('test'));

        var suite2 = Suite.create(suite1, 'Another Suite');
        suite2.addTest(createTest('fail test', function(done) {
          done(new Error('failed test'));
        }));

        runRunner(reporter.runner, function() {
          expect(reporter._testsuites[0].testsuite[0]._attr.name).to.equal('');
          expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.name).to.equal('test');
          expect(reporter._testsuites[1].testsuite[1].testcase[0]._attr.classname).to.equal('Added Prefix.Inner Suite');
          expect(reporter._testsuites[2].testsuite[0]._attr.name).to.equal('Root Suite.Inner Suite.Another Suite');
          expect(reporter._testsuites[2].testsuite[1].testcase[0]._attr.name).to.equal('fail test');
          expect(reporter._testsuites[2].testsuite[1].testcase[0]._attr.classname).to.equal('Added Prefix.Inner Suite.Another Suite');

          done();
        });
      });
    });
  });
});
