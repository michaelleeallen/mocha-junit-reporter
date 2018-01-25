/* eslint-env mocha */
'use-strict';

var Reporter = require('../index');
var Runner = require('./helpers/mock-runner');
var Test = require('./helpers/mock-test');

var fs = require('fs');
var path = require('path');

var chai = require('chai');
var expect = chai.expect;
var chaiXML = require('chai-xml');
var mockXml = require('./mock-results');
var testConsole = require('test-console');

var debug = require('debug')('mocha-junit-reporter:tests');

chai.use(chaiXML);

describe('mocha-junit-reporter', function() {
  var runner;
  var filePath;
  var MOCHA_FILE;

  function executeTestRunner(options) {
    options = options || {};
    options.invalidChar = options.invalidChar || '';
    options.title = options.title || 'Foo Bar module';
    options.root = (typeof options.root !== 'undefined') ? options.root : false;
    runner.start();

    runner.startSuite({
      title: options.title,
      root: options.root,
      tests: [1, 2]
    });

    if (!options.skipPassedTests) {
      runner.pass(new Test('Foo can weez the juice', 'can weez the juice', 1));
    }

    runner.fail(new Test('Bar can narfle the garthog', 'can narfle the garthog', 1), {
      stack: options.invalidChar + 'expected garthog to be dead' + options.invalidChar
    });

    runner.fail(new Test('Baz can behave like a flandip', 'can behave like a flandip', 1), {
      name: 'BazError',
      message: 'expected baz to be masher, a hustler, an uninvited grasper of cone'
    });

    runner.startSuite({
      title: 'Another suite!',
      tests: [1]
    });
    runner.pass(new Test('Another suite', 'works', 4));

    if (options && options.includePending) {
      runner.startSuite({
        title: 'Pending suite!',
        tests: [1]
      });
      runner.pending(new Test('Pending suite', 'pending'));
    }

    runner.end();
  }

  function verifyMochaFile(path, options) {
    var now = (new Date()).toISOString();
    debug('verify', now);
    var output = fs.readFileSync(path, 'utf-8');
    expect(output).xml.to.be.valid();
    expect(output).xml.to.equal(mockXml(runner.stats, options));
    fs.unlinkSync(path);
    debug('done', now);
  }

  function removeTestPath() {
    var testPath = '/subdir/foo/mocha.xml';
    var parts = testPath.slice(1).split('/');

    parts.reduce(function(testPath) {
      if (fs.existsSync(__dirname + testPath)) {
        var removeFile = testPath.indexOf('.') === -1 ? 'rmdirSync' : 'unlinkSync';
        fs[removeFile](__dirname + testPath);
      }

      return path.dirname(testPath);
    }, testPath);
  }

  function createReporter(options) {
    options = options || {};
    filePath = path.join(path.dirname(__dirname), options.mochaFile || '');

    return new Reporter(runner, { reporterOptions: options });
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

  before(function() {
    // cache this
    MOCHA_FILE = process.env.MOCHA_FILE;
  });

  after(function() {
    // reset this
    process.env.MOCHA_FILE = MOCHA_FILE;
  });

  beforeEach(function() {
    runner = new Runner();
    filePath = undefined;
    delete process.env.MOCHA_FILE;
    delete process.env.PROPERTIES;
  });

  afterEach(function() {
    debug('after');
  });

  it('can produce a JUnit XML report', function() {
    createReporter({mochaFile: 'test/mocha.xml'});
    executeTestRunner();

    verifyMochaFile(filePath);
  });

  it('respects `process.env.MOCHA_FILE`', function() {
    process.env.MOCHA_FILE = 'test/results.xml';
    createReporter();
    executeTestRunner();

    verifyMochaFile(process.env.MOCHA_FILE);
  });

  it('respects `process.env.PROPERTIES`', function() {
    process.env.PROPERTIES = 'CUSTOM_PROPERTY:ABC~123';
    createReporter({mochaFile: 'test/properties.xml'});
    executeTestRunner();
    verifyMochaFile(filePath, {
      properties: [
        {
          name: 'CUSTOM_PROPERTY',
          value: 'ABC~123'
        }
      ]
    });
  });

  it('respects `--reporter-options mochaFile=`', function() {
    createReporter({mochaFile: 'test/results.xml'});
    executeTestRunner();

    verifyMochaFile(filePath);
  });

  it('respects `[hash]` pattern in test results report filename', function() {
    var dir = 'test/';
    var path = dir + 'results.[hash].xml';
    createReporter({mochaFile: path});
    executeTestRunner();
    verifyMochaFile(dir + getFileNameWithHash(dir));
  });

  it('will create intermediate directories', function() {
    createReporter({mochaFile: 'test/subdir/foo/mocha.xml'});
    removeTestPath();
    executeTestRunner();

    verifyMochaFile(filePath);
    removeTestPath();
  });

  it('creates valid XML report for invalid message', function() {
    createReporter({mochaFile: 'test/mocha.xml'});
    executeTestRunner({invalidChar: '\u001b'});

    verifyMochaFile(filePath);
  });

  it('creates valid XML report even if title contain ANSI character sequences', function() {
    createReporter({mochaFile: 'test/mocha.xml'});
    executeTestRunner({title: '[38;5;104m[1mFoo Bar module[22m'});

    verifyMochaFile(filePath);
  });

  it('outputs pending tests if "includePending" is specified', function() {
    createReporter({mochaFile: 'test/mocha.xml', includePending: true});
    executeTestRunner({includePending: true});

    verifyMochaFile(filePath);
  });

  it('can output to the console', function() {
    createReporter({mochaFile: 'test/console.xml', toConsole: true});

    var stdout = testConsole.stdout.inspect();
    try {
      executeTestRunner();
      verifyMochaFile(filePath);
    } catch (e) {
      stdout.restore();
      throw e;
    }

    stdout.restore();

    var xml = stdout.output[0];
    expect(xml).xml.to.be.valid();
    expect(xml).xml.to.equal(mockXml(runner.stats));
  });

  it('properly outputs tests when amount of tests is wrong', function() {
    createReporter({mochaFile: 'test/mocha.xml'});
    // emulates exception in before each hook
    executeTestRunner({skipPassedTests: true});

    verifyMochaFile(filePath, {skipPassedTests: true});
  });

  describe('when "useFullSuiteTitle" option is specified', function() {
    var suiteTitles = ['test suite', 'when has parent'];

    it('generates full suite title', function() {
      var reporter = configureReporter({useFullSuiteTitle: true });

      expect(suiteName(reporter.suites[0])).to.equal(suiteTitles[0]);
      expect(suiteName(reporter.suites[1])).to.equal(suiteTitles.join(' '));
    });

    it('generates full suite title separated by "suiteTitleSeparatedBy" option', function() {
      var reporter = configureReporter({useFullSuiteTitle: true, suiteTitleSeparatedBy: '.'});
      expect(suiteName(reporter.suites[1])).to.equal(suiteTitles.join('.'));
    });

    it('respects the misspelled "suiteTitleSeparatedBy" option', function() {
      var reporter = configureReporter({useFullSuiteTitle: true, suiteTitleSeparedBy: '.'});
      expect(suiteName(reporter.suites[1])).to.equal(suiteTitles.join('.'));
    });

    function suiteName(suite) {
      return suite.testsuite[0]._attr.name;
    }

    function configureReporter(options) {
      var reporter = createReporter(options);

      reporter.flush = function(suites) {
        reporter.suites = suites;
      };

      suiteTitles.forEach(function(title) {
        runner.startSuite({title: title, suites: [1], tests: [1]});
      });
      runner.end();

      return reporter;
    }

  });

  describe('Output', function() {
    var reporter, testsuites;

    beforeEach(function() {
      reporter = spyingReporter();
    });

    it('skips suites with empty title', function() {
      runner.startSuite({title: '', tests: [1]});
      runner.end();

      expect(testsuites).to.be.empty;
    });

    it('skips suites without testcases and suites', function() {
      runner.startSuite({title: 'test me'});
      runner.end();

      expect(testsuites).to.be.empty;
    });

    it('does not skip suites with nested suites', function() {
      runner.startSuite({title: 'test me', suites: [1]});
      runner.end();

      expect(testsuites).to.have.length(1);
    });

    it('does not skip suites with nested tests', function() {
      runner.startSuite({title: 'test me', tests: [1]});
      runner.end();

      expect(testsuites).to.have.length(1);
    });

    it('does not skip root suite', function() {
      runner.startSuite({title: '', root: true, suites: [1]});
      runner.end();

      expect(testsuites).to.have.length(1);
    });

    it('uses "Root Suite" by default', function() {
      runner.startSuite({title: '', root: true, suites: [1]});
      runner.end();
      expect(testsuites[0].testsuite[0]._attr).to.have.property('name', 'Root Suite');
    });

    it('respects the `rootSuiteTitle`', function() {
      var name = 'The Root Suite!';
      reporter = spyingReporter({rootSuiteTitle: name});
      runner.startSuite({title: '', root: true, suites: [1]});
      runner.end();

      expect(testsuites[0].testsuite[0]._attr).to.have.property('name', name);
    });

    it('uses "Mocha Tests" by default', function() {
      runner.startSuite({title: '', root: true, suites: [1]});
      runner.end();
      var xml = reporter.getXml(testsuites);

      expect(xml.indexOf('testsuites name="Mocha Tests"')).not.to.equal(-1);
    });

    it('respects the `testsuitesTitle`', function() {
      var xml, title = 'SuitesTitle';

      reporter = spyingReporter({testsuitesTitle: title});
      runner.startSuite({title: '', root: true, suites: [1]});
      runner.end();
      xml = reporter.getXml(testsuites);
      expect(xml.indexOf('testsuites name="SuitesTitle"')).not.to.equal(-1);
    });

    function spyingReporter(options) {
      options = options || {};
      options.mochaFile = options.mochaFile || 'test/mocha.xml';

      reporter = createReporter(options);

      reporter.flush = function(suites) {
        testsuites = suites;
      };

      return reporter;
    }
  });

  describe('Feature "Configurable classname/name switch"', function() {
    var reporter, testsuites, mockedTestCase = {
      title: "should behave like so",
      timestamp: 123,
      tests: "1",
      failures: "0",
      time: "0.004",
      fullTitle: function() {
        return 'Super Suite ' + this.title
      }
    };

    it('should generate valid testCase for testCaseSwitchClassnameAndName default', function() {
      reporter = createReporter({mochaFile: 'test/mocha.xml'});
      var testCase = reporter.getTestcaseData(mockedTestCase)
      expect(testCase.testcase[0]._attr.name).to.equal(mockedTestCase.fullTitle());
      expect(testCase.testcase[0]._attr.classname).to.equal(mockedTestCase.title);
    });

    it('should generate valid testCase for testCaseSwitchClassnameAndName=false', function() {
      reporter = createReporter({mochaFile: 'test/mocha.xml', testCaseSwitchClassnameAndName: false});
      var testCase = reporter.getTestcaseData(mockedTestCase)
      expect(testCase.testcase[0]._attr.name).to.equal(mockedTestCase.fullTitle());
      expect(testCase.testcase[0]._attr.classname).to.equal(mockedTestCase.title);
    });

    it('should generate valid testCase for testCaseSwitchClassnameAndName=true', function() {
      reporter = createReporter({mochaFile: 'test/mocha.xml', testCaseSwitchClassnameAndName: true});
      var testCase = reporter.getTestcaseData(mockedTestCase)
      expect(testCase.testcase[0]._attr.name).to.equal(mockedTestCase.title);
      expect(testCase.testcase[0]._attr.classname).to.equal(mockedTestCase.fullTitle());
    });
  });
});
