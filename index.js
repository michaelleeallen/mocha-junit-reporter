'use-strict';

var xml = require('xml');
var Base = require('mocha').reporters.Base;
var fs = require('fs');
var path = require('path');
var debug = require('debug')('mocha-junit-reporter');
var mkdirp = require('mkdirp');
var md5 = require('md5');
var stripAnsi = require('strip-ansi');

module.exports = MochaJUnitReporter;

// A subset of invalid characters as defined in http://www.w3.org/TR/xml/#charsets that can occur in e.g. stacktraces
// regex lifted from https://github.com/MylesBorins/xml-sanitizer/ (licensed MIT)
var INVALID_CHARACTERS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007f-\u0084\u0086-\u009f\uD800-\uDFFF\uFDD0-\uFDFF\uFFFF\uC008]/g; //eslint-disable-line no-control-regex

function configureDefaults(options) {
  debug(options);
  options = options || {};
  options = options.reporterOptions || {};
  options.mochaFile = options.mochaFile || process.env.MOCHA_FILE || 'test-results.xml';
  options.properties = options.properties || parsePropertiesFromEnv(process.env.PROPERTIES) || null;
  options.attachments = options.attachments || process.env.ATTACHMENTS || false;
  options.toConsole = !!options.toConsole;
  options.testCaseSwitchClassnameAndName = options.testCaseSwitchClassnameAndName || false;
  options.suiteTitleSeparedBy = options.suiteTitleSeparedBy || ' ';
  options.suiteTitleSeparatedBy = options.suiteTitleSeparatedBy || options.suiteTitleSeparedBy || ' ';
  options.rootSuiteTitle = options.rootSuiteTitle || 'Root Suite';
  options.testsuitesTitle = options.testsuitesTitle || 'Mocha Tests';

  return options;
}

function defaultSuiteTitle(suite) {
  if (suite.root && suite.title === '') {
      return stripAnsi(this._options.rootSuiteTitle);
  }
  return stripAnsi(suite.title);
}

function fullSuiteTitle(suite) {
  var parent = suite.parent;
  var title = [ suite.title ];

  while (parent) {
    if (parent.root && parent.title === '') {
      title.unshift(this._options.rootSuiteTitle);
    } else {
      title.unshift(parent.title);
    }
    parent = parent.parent;
  }

  return stripAnsi(title.join(this._options.suiteTitleSeparatedBy));
}

function isInvalidSuite(suite) {
  return (!suite.root && suite.title === '') || (suite.tests.length === 0 && suite.suites.length === 0);
}

function parsePropertiesFromEnv(envValue) {
  var properties = null;

  if (envValue) {
    properties = {};
    var propertiesArray = envValue.split(',');
    for (var i = 0; i < propertiesArray.length; i++) {
      var propertyArgs = propertiesArray[i].split(':');
      properties[propertyArgs[0]] = propertyArgs[1];
    }
  }

  return properties;
}

function generateProperties(options) {
  var properties = [];
  for (var propertyName in options.properties) {
    if (options.properties.hasOwnProperty(propertyName)) {
      properties.push({
        property: {
          _attr: {
            name: propertyName,
            value: options.properties[propertyName]
          }
        }
      });
    }
  }
  return properties;
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
  this._generateSuiteTitle = this._options.useFullSuiteTitle ? fullSuiteTitle : defaultSuiteTitle;

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
  var testSuite = {
    testsuite: [
      {
        _attr: {
          name: this._generateSuiteTitle(suite),
          timestamp: new Date().toISOString().slice(0,-5),
          tests: suite.tests.length
        }
      }
    ]
  };

  if(suite.file) {
    testSuite.testsuite[0]._attr.file =  suite.file;
  }

  var properties = generateProperties(this._options);
  if (properties.length) {
    testSuite.testsuite.push({
      properties: properties
    });
  }

  return testSuite;
};

/**
 * Produces an xml config for a given test case.
 * @param {object} test - test case
 * @param {object} err - if test failed, the failure object
 * @returns {object}
 */
MochaJUnitReporter.prototype.getTestcaseData = function(test, err) {
  var flipClassAndName = this._options.testCaseSwitchClassnameAndName;
  var name = stripAnsi(test.fullTitle());
  var classname = stripAnsi(test.title);
  var config = {
    testcase: [{
      _attr: {
        name: flipClassAndName ? classname : name,
        time: (typeof test.duration === 'undefined') ? 0 : test.duration / 1000,
        classname: flipClassAndName ? name : classname
      }
    }]
  };

  // We need to merge console.logs and attachments into one <system-out> -
  //  see JUnit schema (only accepts 1 <system-out> per test).
  var systemOutLines = [];
  if (this._options.outputs && (test.consoleOutputs && test.consoleOutputs.length > 0)) {
    systemOutLines = systemOutLines.concat(test.consoleOutputs);
  }
  if (this._options.attachments && test.attachments && test.attachments.length > 0) {
    systemOutLines = systemOutLines.concat(test.attachments.map(
      function (file) {
        return '[[ATTACHMENT|' + file + ']]';
      }
    ));
  }
  if (systemOutLines.length > 0) {
    config.testcase.push({'system-out': this.removeInvalidCharacters(stripAnsi(systemOutLines.join('\n')))});
  }

  if (this._options.outputs && (test.consoleErrors && test.consoleErrors.length > 0)) {
    config.testcase.push({'system-err': this.removeInvalidCharacters(stripAnsi(test.consoleErrors.join('\n')))});
  }

  if (err) {
    var message;
    if (err.message && typeof err.message.toString === 'function') {
      message = err.message + '';
    } else if (typeof err.inspect === 'function') {
      message = err.inspect() + '';
    } else {
      message = '';
    }
    var failureMessage = err.stack || message;
    var failureElement = {
      _attr: {
        message: this.removeInvalidCharacters(err.message) || '',
        type: err.name || ''
      },
      _cdata: this.removeInvalidCharacters(failureMessage)
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
  if (!input) {
    return input;
  }
  return input.replace(INVALID_CHARACTERS_REGEX, '');
};

/**
 * Writes xml to disk and ouputs content if "toConsole" is set to true.
 * @param {Array.<Object>} testsuites - a list of xml configs
 */
MochaJUnitReporter.prototype.flush = function(testsuites){
  var xml = this.getXml(testsuites);

  this.writeXmlToDisk(xml, this._options.mochaFile);

  if (this._options.toConsole === true) {
    console.log(xml); // eslint-disable-line no-console
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
  var hasProperties = !!this._options.properties;

  testsuites.forEach(function(suite) {
    var _suiteAttr = suite.testsuite[0]._attr;
    // properties are added before test cases so we want to make sure that we are grabbing test cases
    // at the correct index
    var _casesIndex = hasProperties ? 2 : 1;
    var _cases = suite.testsuite.slice(_casesIndex);

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
      name: this._options.testsuitesTitle,
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
    if (filePath.indexOf('[hash]') !== -1) {
      filePath = filePath.replace('[hash]', md5(xml));
    }

    debug('writing file to', filePath);
    mkdirp.sync(path.dirname(filePath));

    try {
        fs.writeFileSync(filePath, xml, 'utf-8');
    } catch (exc) {
        debug('problem writing results: ' + exc);
    }
    debug('results written successfully');
  }
};
