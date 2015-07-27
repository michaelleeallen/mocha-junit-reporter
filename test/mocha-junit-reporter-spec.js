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

  function executeTestRunner(char) {
    char = char || '';
    runner.start();

    runner.startSuite({
      title: 'Foo Bar module',
      tests: [1, 2]
    });
    runner.pass(new Test('Foo can weez the juice', 'can weez the juice', 1));
    runner.fail(new Test('Bar can narfle the garthog', 'can narfle the garthog', 1), {
      message: char + 'expected garthog to be dead' + char
    });

    runner.startSuite({
      title: 'Another suite!',
      tests: [1]
    });
    runner.pass(new Test('Another suite', 'works', 4));

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
    if (fs.existsSync(__dirname + '/subdir')) {
      if (fs.existsSync(__dirname + '/subdir/foo')) {
        if (fs.existsSync(__dirname + '/subdir/foo/mocha.xml')) {
          fs.unlinkSync(__dirname + '/subdir/foo/mocha.xml');
        }

        fs.rmdirSync(__dirname + '/subdir/foo');
      }

      fs.rmdirSync(__dirname + '/subdir');
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
  });

  afterEach(function() {
    debug('after');
  })

  it('can produce a JUnit XML report', function() {
    var reporter = new Reporter(runner, {
      reporterOptions: {mochaFile: 'test/mocha.xml'}
    });
    filePath = __dirname + '/mocha.xml';

    executeTestRunner();
    verifyMochaFile(filePath);
  });

  it('respects `process.env.MOCHA_FILE`', function() {
    process.env.MOCHA_FILE = 'test/results.xml';
    var reporter = new Reporter(runner);
    filePath = __dirname + '/results.xml';

    executeTestRunner();
    verifyMochaFile(filePath);
  });

  it('respects `--reporter-options mochaFile=`', function() {
    var opts = { mochaFile: 'test/results.xml' };
    var reporter = new Reporter(runner, { reporterOptions: opts });
    filePath = __dirname + '/results.xml';

    executeTestRunner();
    verifyMochaFile(filePath);
  });

  it('will create intermediate directories', function() {
    var reporter = new Reporter(runner, {
      reporterOptions: {mochaFile: 'test/subdir/foo/mocha.xml'}
    });
    filePath = __dirname + '/subdir/foo/mocha.xml';

    removeTestPath();
    executeTestRunner();
    verifyMochaFile(filePath);
    removeTestPath();
  });

  it('creates valid XML report for invalid message', function() {
    var reporter = new Reporter(runner, {
      reporterOptions: {mochaFile: 'test/mocha.xml'}
    });
    var invalidChar = '\u001b';
    filePath = __dirname + '/mocha.xml'

    executeTestRunner(invalidChar);
    verifyMochaFile(filePath);
  });

  it('can output to the console', function() {
    var reporter = new Reporter(runner, {
      reporterOptions: {mochaFile: 'test/console.xml', toConsole: true}
    });
    filePath = __dirname + '/console.xml';

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
