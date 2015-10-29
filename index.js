'use-strict';

var xml = require('xml');
var Base = require('mocha').reporters.Base;
var fs = require('fs');
var path = require('path');
var debug = require('debug')('mocha-junit-reporter');
var mkdirp = require('mkdirp');

module.exports = MochaJUnitReporter;

// A subset of invalid characters as defined in http://www.w3.org/TR/xml/#charsets that can occur in e.g. stacktraces
var INVALID_CHARACTERS = ['\u001b'];

function configureDefaults(options) {
  debug(options);
  options = options || {};
  options = options.reporterOptions || {};
  options.mochaFile = options.mochaFile || process.env.MOCHA_FILE || 'test-results.xml';
  options.toConsole = !!options.toConsole;

  return options;
}

function isInvalidSuite(suite) {
  return suite.title === '' || suite.tests.length === 0 && suite.suites.length === 0;
}

/**
 * JUnit reporter for mocha.js.
 * @module mocha-junit-reporter
 * @param {EventEmitter} runner - the test runner
 * @param {Object} options - mocha options
 */
function MochaJUnitReporter(runner, options) {
  this._options = configureDefaults(options);
  this._runner = runner;

  var testsuites = [];

  function lastSuite() {
    return testsuites[testsuites.length - 1].testsuite;
  }

  // get functionality from the Base reporter
  Base.call(this, runner);

  // remove old results
  this._runner.on('start', function() {
    if (fs.existsSync(this._options.mochaFile)) {
      debug('removing report file', this._options.mochaFile);
      fs.unlinkSync(this._options.mochaFile);
    }
  }.bind(this));

  this._runner.on('suite', function(suite) {
    if (!isInvalidSuite(suite)) {
      testsuites.push(this.getTestsuiteData(suite));
    }
  }.bind(this));

  this._runner.on('pass', function(test) {
    lastSuite().push(this.getTestcaseData(test));
  }.bind(this));

  this._runner.on('fail', function(test, err) {
    lastSuite().push(this.getTestcaseData(test, err));
  }.bind(this));

  if (this._options.includePending) {
    this._runner.on('pending', function(test) {
      var testcase = this.getTestcaseData(test);

      testcase.testcase.push({ skipped: null });
      lastSuite().push(testcase);
    }.bind(this));
  }

  this._runner.on('end', function(){
    this.flush(testsuites);
  }.bind(this));
}

/**
 * Produces an xml node for a test suite
 * @param  {Object} suite - a test suite
 * @return {Object}       - an object representing the xml node
 */
MochaJUnitReporter.prototype.getTestsuiteData = function(suite) {
  return {
    testsuite: [
      {
        _attr: {
          name: suite.title,
          timestamp: new Date().toISOString().slice(0,-5),
          tests: suite.tests.length
        }
      }
    ]
  };
};

/**
 * Produces an xml config for a given test case.
 * @param {object} test - test case
 * @param {object} err - if test failed, the failure object
 * @returns {object}
 */
MochaJUnitReporter.prototype.getTestcaseData = function(test, err) {
  var config = {
    testcase: [{
      _attr: {
        name: test.fullTitle(),
        time: (typeof test.duration === 'undefined') ? 0 : test.duration / 1000,
        classname: test.title
      }
    }]
  };
  if (err) {
    var failureElement = {
      _cdata: this.removeInvalidCharacters(err.stack)
    };

    config.testcase.push({failure: failureElement});
  }
  return config;
};

/**
 * @param {string} input
 * @returns {string} without invalid characters
 */
MochaJUnitReporter.prototype.removeInvalidCharacters = function(input){
  return INVALID_CHARACTERS.reduce(function (text, invalidCharacter) {
    return text.replace(new RegExp(invalidCharacter, 'g'), '');
  }, input);
};

/**
 * Writes xml to disk and ouputs content if "toConsole" is set to true.
 * @param {Array.<Object>} testsuites - a list of xml configs
 */
MochaJUnitReporter.prototype.flush = function(testsuites){
  var xml = this.getXml(testsuites);

  this.writeXmlToDisk(xml, this._options.mochaFile);

  if (this._options.toConsole === true) {
    console.log(xml);
  }
};


/**
 * Produces an XML string from the given test data.
 * @param {Array.<Object>} testsuites - a list of xml configs
 * @returns {string}
 */
MochaJUnitReporter.prototype.getXml = function(testsuites) {
  var totalSuitesTime = 0;
  var totalTests = 0;
  var stats = this._runner.stats;

  testsuites.forEach(function(suite) {
    var _suiteAttr = suite.testsuite[0]._attr;
    var _cases = suite.testsuite.slice(1);

    _suiteAttr.failures = 0;
    _suiteAttr.time = 0;
    _suiteAttr.skipped = 0;

    _cases.forEach(function(testcase) {
      var lastNode = testcase.testcase[testcase.testcase.length - 1];

      _suiteAttr.skipped += Number('skipped' in lastNode);
      _suiteAttr.failures += Number('failure' in lastNode);
      _suiteAttr.time += testcase.testcase[0]._attr.time;
    });

    if (!_suiteAttr.skipped) {
      delete _suiteAttr.skipped;
    }

    totalSuitesTime += _suiteAttr.time;
    totalTests += _suiteAttr.tests;
  });

  var rootSuite = {
    _attr: {
      name: 'Mocha Tests',
      time: totalSuitesTime,
      tests: totalTests,
      failures: stats.failures
    }
  };

  if (stats.pending) {
    rootSuite._attr.skipped = stats.pending;
  }

  return xml({
    testsuites: [ rootSuite ].concat(testsuites)
  }, { declaration: true, indent: '  ' });
};

/**
 * Writes a JUnit test report XML document.
 * @param {string} xml - xml string
 * @param {string} filePath - path to output file
 */
MochaJUnitReporter.prototype.writeXmlToDisk = function(xml, filePath){
  if (filePath) {
    debug('writing file to', filePath);
    mkdirp.sync(path.dirname(filePath));

    fs.writeFileSync(filePath, xml, 'utf-8');
    debug('results written successfully');
  }
};
