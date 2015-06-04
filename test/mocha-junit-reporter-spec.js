'use-strict';

var Reporter = require('../index');
var Runner = require('./helpers/mock-runner');
var Test = require('./helpers/mock-test');

var fs = require('fs');
var chai = require('chai');
var expect = chai.expect;
var chaiXML = require('chai-xml');
var mockXml = require('./mock-results');

chai.use(chaiXML);

describe('mocha-junit-reporter', function() {
  var runner;
  var MOCHA_FILE;

  before(function() {
    // cache this
    MOCHA_FILE = process.env.MOCHA_FILE;
  });

  beforeEach(function() {
    runner = new Runner();
  });

  after(function() {
    // reset this
    process.env.MOCHA_FILE = MOCHA_FILE;
  });

  it('can produce a JUnit XML report', function() {
    var reporter = new Reporter(runner);
    runner.start();

    runner.startSuite({
      title: 'Foo Bar module',
      tests: [1, 2]
    });
    runner.pass(new Test('Foo can weez the juice', 'can weez the juice', 1));
    runner.fail(new Test('Bar can narfle the garthog', 'can narfle the garthog', 1), {
      message: 'expected garthog to be dead'
    });

    runner.end();

    var output = fs.readFileSync(__dirname + '/mocha.xml', 'utf-8');
    expect(output).xml.to.be.valid();
    expect(output).xml.to.equal(mockXml(runner.stats));
  });

  it('will always create the XML report file', function() {
    process.env.MOCHA_FILE = './test/subdir/foo/mocha.xml';
    var reporter = new Reporter(runner);

    runner.start();

    runner.startSuite({
      title: 'Foo Bar module',
      tests: [1, 2]
    });
    runner.pass(new Test('Foo can weez the juice', 'can weez the juice', 1));
    runner.fail(new Test('Bar can narfle the garthog', 'can narfle the garthog', 1), {
      message: 'expected garthog to be dead'
    });

    runner.end();

    var output = fs.readFileSync(__dirname + '/subdir/foo/mocha.xml', 'utf-8');
    expect(output).xml.to.be.valid();
    expect(output).xml.to.equal(mockXml(runner.stats));
  });

  it('creates valid XML report for invalid message', function() {
    process.env.MOCHA_FILE = './test/subdir/foo/mocha.xml';
    var reporter = new Reporter(runner);
    var invalidChar = '\u001b';

    runner.start();

    runner.startSuite({
      title: 'Foo Bar module',
      tests: [1, 2]
    });
    runner.pass(new Test('Foo can weez the juice', 'can weez the juice', 1));
    runner.fail(new Test('Bar can narfle the garthog', 'can narfle the garthog', 1), {
      message: invalidChar + 'expected garthog to be dead' + invalidChar
    });

    runner.end();

    var output = fs.readFileSync(__dirname + '/subdir/foo/mocha.xml', 'utf-8');
    expect(output).xml.to.be.valid();
    expect(output).xml.to.equal(mockXml(runner.stats));
  });
});
