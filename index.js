'use-strict';

var xml = require('xml');
var Base = require('mocha').reporters.Base;
var filePath = process.env.MOCHA_FILE || 'mocha.xml';
var fs = require('fs');

module.exports = MochaJUnitReporter;


/**
 * JUnit reporter for mocha.js.
 * @module mocha-junit-reporter
 * @param {EventEmitter} runner - the test runner
 */
function MochaJUnitReporter(runner) {
  // a list of all test cases that have run
  var testcases = [];

  // get functionality from the Base reporter
  Base.call(this, runner);

  // remove old results
  runner.on('start', function() {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  runner.on('pass', function(test){
    testcases.push(this.getTestcaseData(test));
  }.bind(this));

  runner.on('fail', function(test, err){
    testcases.push(this.getTestcaseData(test, err));
  }.bind(this));

  runner.on('end', function(){
    this.writeXmlToDisk(this.getXml(testcases, this.stats));
  }.bind(this));

}

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
MochaJUnitReporter.prototype.getXml = function(testcases, stats){
  var suites = {
    testsuites: [
      {
        testsuite: [{_attr: {
          name: '',
          timestamp: stats.start,
          tests: stats.tests,
          failures: stats.failures,
          time: stats.duration
        }}].concat(testcases)
      }
    ]
  };
  return xml(suites, { declaration: true });
};

/**
 * Writes a JUnit test report XML document.
 * @param {string} xml - xml string
 */
MochaJUnitReporter.prototype.writeXmlToDisk = function(xml){
  fs.writeFileSync(filePath, xml, 'utf-8');
  console.log('test results written to', filePath);
};
