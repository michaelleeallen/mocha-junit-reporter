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
    runner.start();

    runner.startSuite({
      title: 'Foo Bar module',
      tests: [1, 2]
    });
    runner.pass(new Test('Foo can weez the juice', 'can weez the juice', 1));
    runner.fail(new Test('Bar can narfle the garthog', 'can narfle the garthog', 1), {
      stack: options.invalidChar + 'expected garthog to be dead' + options.invalidChar
    });

    runner.startSuite({
      title: 'Another suite!',
      tests: [1]
    });
    runner.pass(new Test('Another suite', 'works', 4));

    if (options.includePending) {
      runner.startSuite({
        title: 'Pending suite!',
        tests: [1]
      });
      runner.pending(new Test('Pending suite', 'pending'));
    }

    runner.end();
  }

  function verifyMochaFile(path) {
    var now = (new Date()).toISOString();
    debug('verify', now);
    var output = fs.readFileSync(path, 'utf-8');
    expect(output).xml.to.be.valid();
    expect(output).xml.to.equal(mockXml(runner.stats));
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

  it('respects `--reporter-options mochaFile=`', function() {
    createReporter({mochaFile: 'test/results.xml'});
    executeTestRunner();

    verifyMochaFile(filePath);
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

  it('outputs pending tests if "includePending" is specified', function() {
    createReporter({mochaFile: 'test/mocha.xml', includePending: true});
    executeTestRunner({includePending: true});

    verifyMochaFile(filePath);
  });

  it('can output to the console', function() {
    createReporter({mochaFile: 'test/console.xml', toConsole: true})

    var stdout = testConsole.stdout.inspect();
    try {
      executeTestRunner();
      verifyMochaFile(filePath);
    } catch (e) {
      stdout.restore();
      throw e;
    }

    var xml = stdout.output[0];
    expect(xml).xml.to.be.valid();
    expect(xml).xml.to.equal(mockXml(runner.stats));
  });
});
