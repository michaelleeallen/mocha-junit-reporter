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

/**
 * JUnit reporter for mocha.js.
 * @module mocha-junit-reporter
 * @param {EventEmitter} runner - the test runner
 * @param {Object} options - mocha options
 */
function MochaJUnitReporter(runner, options) {
  debug(options);
  options = options || {};
  options = options.reporterOptions || {};
  options.mochaFile = options.mochaFile || process.env.MOCHA_FILE || 'test-results.xml';
  options.toConsole = options.toConsole || false;

  // a list of all test cases that have run
  var testcases = [];
  var testsuites = [];

  // get functionality from the Base reporter
  Base.call(this, runner);

  // remove old results
  runner.on('start', function() {
    if (fs.existsSync(options.mochaFile)) {
      debug('removing report file', options.mochaFile);
      fs.unlinkSync(options.mochaFile);
    }
  });

  runner.on('suite', function(suite) {
    if (suite.title === '' || suite.tests.length === 0) {
      return;
    }
    testsuites.push(this.getTestsuiteData(suite));
  }.bind(this));

  runner.on('pass', function(test) {
    testcases.push(this.getTestcaseData(test));
  }.bind(this));

  runner.on('fail', function(test, err) {
    testcases.push(this.getTestcaseData(test, err));
  }.bind(this));

  runner.on('end', function(){
    this.writeXmlToDisk(this.getXml(testsuites, testcases, runner.stats), options);
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
 * Produces an XML string from the given test data.
 * @param {Array.<Object>} testsuites - a list of xml configs
 * @param {Array.<Object>} testcases - a list of xml configs
 * @param {Object} stats - mocha statistics from the runner
 * @returns {string}
 */
MochaJUnitReporter.prototype.getXml = function(testsuites, testcases, stats) {
  var totalSuitesTime = 0;
  var totalTests = 0;

  var suites = testsuites.map(function(suite) {
    var _suite = Object.create(suite);
    var _suiteAttr = _suite.testsuite[0]._attr;
    var _cases = testcases.splice(0, _suiteAttr.tests);

    _suite.testsuite = _suite.testsuite.concat(_cases);

    _suiteAttr.failures = _cases.reduce(function(num, testcase) {
      return num + ((testcase.testcase.length > 1) ? 1 : 0);
    }, 0);
    _suiteAttr.time = _cases.reduce(function(suitDuration, testcase) {
      return suitDuration + testcase.testcase[0]._attr.time;
    }, 0);

    totalSuitesTime += _suiteAttr.time;
    totalTests += _suiteAttr.tests;

    return _suite;
  });

  return xml({
    testsuites: [{
      _attr: {
        name: 'Mocha Tests',
        time: totalSuitesTime,
        tests: totalTests,
        failures: stats.failures
      }
    }].concat(suites)
  }, { declaration: true, indent: '  ' });
};

/**
 * Writes a JUnit test report XML document.
 * @param {string} xml - xml string
 * @param {string} filePath - path to output file
 */
MochaJUnitReporter.prototype.writeXmlToDisk = function(xml, options){
  var filePath = options.mochaFile;

  if (filePath) {
    debug('writing file to', filePath);
    mkdirp.sync(path.dirname(filePath));

    fs.writeFileSync(filePath, xml, 'utf-8');
    debug('results written successfully');
  }

  if (options.toConsole === true) {
    console.log(xml);
  }
};
