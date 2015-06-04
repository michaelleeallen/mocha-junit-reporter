'use-strict';

var xml = require('xml');
var Base = require('mocha').reporters.Base;
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

module.exports = MochaJUnitReporter;


/**
 * JUnit reporter for mocha.js.
 * @module mocha-junit-reporter
 * @param {EventEmitter} runner - the test runner
 * @param {Object} options - mocha options
 */
function MochaJUnitReporter(runner, options) {
  var filePath;
  if (options && options.reporterOptions && options.reporterOptions.mochaFile) {
    filePath = options.reporterOptions.mochaFile;
  } else {
    filePath = process.env.MOCHA_FILE || 'test-results.xml';
  }

  // a list of all test cases that have run
  var testcases = [];
  var testsuites = [];

  // get functionality from the Base reporter
  Base.call(this, runner);

  // remove old results
  runner.on('start', function() {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
    this.writeXmlToDisk(this.getXml(testsuites, testcases, runner.stats), filePath);
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
        className: test.title
      }
    }]
  };
  if ( err ) {
    config.testcase.push({failure: err.message});
  }
  return config;
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
        timestamp: stats.start.toISOString().slice(0,-5),
        time: totalSuitesTime,
        tests: totalTests,
        failures: stats.failures
      }
    }].concat(suites)
  }, { declaration: true });
};

/**
 * Writes a JUnit test report XML document.
 * @param {string} xml - xml string
 * @param {string} filePath - path to output file
 */
MochaJUnitReporter.prototype.writeXmlToDisk = function(xml, filePath){
  mkdirp.sync(path.dirname(filePath));

  fs.writeFileSync(filePath, xml, 'utf-8');
  console.log('test results written to', filePath);
};
