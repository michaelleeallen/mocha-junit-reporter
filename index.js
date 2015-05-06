'use-strict';

var fs      = require('fs');
var path    = require('path');
var mkdirp  = require('mkdirp');

var xml     = require('xml');
var Base    = require('mocha').reporters.Base;

function FILE_PATH() {
  return path.resolve(process.env.MOCHA_FILE || 'test-results.xml');
}


module.exports = MochaJUnitReporter;


/**
 * JUnit reporter for mocha.js.
 * @module mocha-junit-reporter
 * @param {EventEmitter} runner - the test runner
 */
function MochaJUnitReporter(runner) {
  // a list of all test cases that have run
  var testcases = [];
  var testsuites = [];

  // get functionality from the Base reporter
  Base.call(this, runner);

  // remove old results
  runner.on('start', function() {
    if (fs.existsSync(FILE_PATH())) {
      fs.unlinkSync(FILE_PATH());
    }
  });

  runner.on('suite', function(suite){
    if (suite.title === '' || suite.tests.length === 0) return;
    testsuites.push(this.getTestsuiteData(suite));
  }.bind(this));

  runner.on('pass', function(test){
    testcases.push(this.getTestcaseData(test));
  }.bind(this));

  runner.on('fail', function(test, err){
    testcases.push(this.getTestcaseData(test, err));
  }.bind(this));

  runner.on('end', function(){
    this.writeXmlToDisk(this.getXml(testsuites, testcases, this.stats));
  }.bind(this));

}

/**
 * Produces an xml node for a test suite
 * @param  {Object} suite - a test suite
 * @return {Object}       - an object representing the xml node
 */
MochaJUnitReporter.prototype.getTestsuiteData = function(suite){
  return {
    testsuite: [
      {
        _attr: {
          name: suite.title,
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
MochaJUnitReporter.prototype.getTestcaseData = function(test, err){
  var config = {
    testcase: [{
      _attr: {
        name: test.fullTitle(),
        time: test.duration,
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
 * @param {array} testcases - a list of xml configs
 * @param {number} passes - number of tests passed
 * @param {number} failures - number tests failed
 * @returns {string}
 */
MochaJUnitReporter.prototype.getXml = function(testsuites, testcases, stats){
  var suites = testsuites.map(function(suite, i){
    var _suite = Object.create(suite);
    var _cases = testcases.slice(i, suite.tests);
    _suite.testsuite = _suite.testsuite.concat(_cases);
    _suite.testsuite[0]._attr.failures = _cases.reduce(function(num, testcase){
      return num + (testcase.testcase.length > 1)? 1 : 0;
    }, 0);
    _suite.testsuite[0]._attr.timestamp = stats.start;
    _suite.testsuite[0]._attr.time = stats.duration;
    return _suite;
  });
  return xml({ testsuites: suites }, { declaration: true });
};

/**
 * Writes a JUnit test report XML document.
 * @param {string} xml - xml string
 */
MochaJUnitReporter.prototype.writeXmlToDisk = function(xml){
  mkdirp.sync(path.dirname(FILE_PATH()));

  fs.writeFileSync(FILE_PATH(), xml, 'utf-8');
  console.log('test results written to', FILE_PATH());
};
