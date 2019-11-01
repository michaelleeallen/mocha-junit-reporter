const xml = require('xml');
const Base = require('mocha').reporters.Base;
const fs = require('fs');
const path = require('path');
const debug = require('debug')('mocha-junit-reporter');
const mkdirp = require('mkdirp');
const md5 = require('md5');
const stripAnsi = require('strip-ansi');

let createStatsCollector;
let mocha6plus = false;

try {
  const json = JSON.parse(
    fs.readFileSync(path.dirname(require.resolve('mocha')) + "/package.json", "utf8")
  );
  const version = json.version;
  if (version >= "6") {
    createStatsCollector = require("mocha/lib/stats-collector");
    mocha6plus = true;
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn("Couldn't determine Mocha version");
}
module.exports = MochaJUnitReporter;

// A subset of invalid characters as defined in http://www.w3.org/TR/xml/#charsets that can occur in e.g. stacktraces
// regex lifted from https://github.com/MylesBorins/xml-sanitizer/ (licensed MIT)
const INVALID_CHARACTERS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007f-\u0084\u0086-\u009f\uD800-\uDFFF\uFDD0-\uFDFF\uFFFF\uC008]/g; //eslint-disable-line no-control-regex

function configureDefaults(options = {}) {
  debug(options);
  const { reporterOptions: config = {} } = options;
  config.mochaFile = getSetting(config.mochaFile, 'MOCHA_FILE', 'test-results.xml');
  config.attachments = getSetting(config.attachments, 'ATTACHMENTS', false);
  config.antMode = getSetting(config.antMode, 'ANT_MODE', false);
  config.jenkinsMode = getSetting(config.jenkinsMode, 'JENKINS_MODE', false);
  config.properties = getSetting(config.properties, 'PROPERTIES', null, parsePropertiesFromEnv);
  config.toConsole = !!config.toConsole;
  config.rootSuiteTitle = config.rootSuiteTitle || 'Root Suite';
  config.testsuitesTitle = config.testsuitesTitle || 'Mocha Tests';

  if (config.antMode) {
    updateOptionsForAntMode(config);
  }

  if (config.jenkinsMode) {
    updateOptionsForJenkinsMode(config);
  }

  config.suiteTitleSeparedBy = config.suiteTitleSeparedBy || ' ';
  config.suiteTitleSeparatedBy = config.suiteTitleSeparatedBy || config.suiteTitleSeparedBy;

  return config;
}

function updateOptionsForAntMode(config) {
  config.antHostname = getSetting(config.antHostname, 'ANT_HOSTNAME', process.env.HOSTNAME);

  if (!config.properties) {
    config.properties = {};
  }
}

function updateOptionsForJenkinsMode(config) {
  if (config.useFullSuiteTitle === undefined) {
    config.useFullSuiteTitle = true;
  }
  debug('jenkins mode - testCaseSwitchClassnameAndName', config.testCaseSwitchClassnameAndName);
  if (config.testCaseSwitchClassnameAndName === undefined) {
    config.testCaseSwitchClassnameAndName = true;
  }
  if (config.suiteTitleSeparedBy === undefined) {
    config.suiteTitleSeparedBy = '.';
  }
}

/**
 * Determine an option value.
 * 1. If `key` is present in the environment, then use the environment value
 * 2. If `value` is specified, then use that value
 * 3. Fall back to `defaultVal`
 * @module mocha-junit-reporter
 * @param {Object} value - the value from the reporter options
 * @param {String} key - the environment variable to check
 * @param {Object} defaultVal - the fallback value
 * @param {function} transform - a transformation function to be used when loading values from the environment
 */
function getSetting(value, key, defaultVal, transform) {
  if (process.env[key] !== undefined) {
    const envVal = process.env[key];
    return (typeof transform === 'function') ? transform(envVal) : envVal;
  }
  if (value !== undefined) {
    return value;
  }
  return defaultVal;
}

function defaultSuiteTitle(suite) {
  if (suite.root && suite.title === '') {
    return stripAnsi(this._options.rootSuiteTitle);
  }
  return stripAnsi(suite.title);
}

function fullSuiteTitle(suite) {
  const parent = suite.parent;
  const title = [suite.title];

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
  if (envValue) {
    debug('Parsing from env', envValue);
    return envValue.split(',').reduce(function (properties, prop) {
      const property = prop.split(':');
      properties[property[0]] = property[1];
      return properties;
    }, []);
  }

  return null;
}

function generateProperties(options) {
  const props = options.properties;
  if (!props) {
    return [];
  }
  return Object.keys(props).reduce(function (properties, name) {
    const value = props[name];
    properties.push({ property: { _attr: { name: name, value: value } } });
    return properties;
  }, []);
}

function getJenkinsClassname(test) {
  debug('Building jenkins classname for', test);
  const parent = test.parent;
  const titles = [];
  while (parent) {
    parent.title && titles.unshift(parent.title);
    parent = parent.parent;
  }
  return titles.join('.');
}

/**
 * JUnit reporter for mocha.js.
 * @module mocha-junit-reporter
 * @param {EventEmitter} runner - the test runner
 * @param {Object} options - mocha options
 */
class MochaJUnitReporter extends Base {
  constructor(runner, options) {
    super(runner, options);

    if (mocha6plus) {
      createStatsCollector(runner);
    }
    this._options = configureDefaults(options);
    this._runner = runner;
    this._generateSuiteTitle = this._options.useFullSuiteTitle ? fullSuiteTitle : defaultSuiteTitle;
    this._antId = 0;

    this._testsuites = [];

    this._runner.on('start', this.onStart.bind(this));
    this._runner.on('suite', this.onSuite.bind(this));
    this._runner.on('pass', this.onPass.bind(this));
    this._runner.on('fail', this.onFail.bind(this));
    this._runner.on('end', this.onEnd.bind(this));

    if (this._options.includePending) {
      this._runner.on('pending', this.onPending.bind(this));
    }
  }

  addTest(test) {
    return this._testsuites[this._testsuites.length - 1].push(test);
  }

  onStart() {
    if (fs.existsSync(this._options.mochaFile)) {
      debug('removing report file', this._options.mochaFile);
      fs.unlinkSync(this._options.mochaFile);
    }
  }

  onSuite(suite) {
    if (!isInvalidSuite(suite)) {
      this._testsuites.push(this.getTestsuiteData(suite));
    }
  }

  onPass(test) {
    addTest(this.getTestcaseData(test));
  }

  onFail(test, err) {
    addTest(this.getTestcaseData(test, err));
  }

  onPending(test) {
    const testcase = this.getTestcaseData(test);

    testcase.testcase.push({ skipped: null });
    addTest(testcase);
  }

  onEnd() {
    this.flush(testsuites);
  }

  /**
   * Produces an xml node for a test suite
   * @param  {Object} suite - a test suite
   * @return {Object}       - an object representing the xml node
   */
  getTestsuiteData(suite) {
    const antMode = this._options.antMode;

    const _attr = {
      name: this._generateSuiteTitle(suite),
      timestamp: new Date().toISOString().slice(0, -5),
      tests: suite.tests.length
    };
    const testSuite = { testsuite: [{ _attr: _attr }] };


    if (suite.file) {
      testSuite.testsuite[0]._attr.file = suite.file;
    }

    const properties = generateProperties(this._options);
    if (properties.length || antMode) {
      testSuite.testsuite.push({
        properties: properties
      });
    }

    if (antMode) {
      _attr.package = _attr.name;
      _attr.hostname = this._options.antHostname;
      _attr.id = this._antId;
      _attr.errors = 0;
      this._antId += 1;
    }

    return testSuite;
  };

  /**
   * Produces an xml config for a given test case.
   * @param {object} test - test case
   * @param {object} err - if test failed, the failure object
   * @returns {object}
   */
  getTestcaseData(test, err) {
    const jenkinsMode = this._options.jenkinsMode;
    const flipClassAndName = this._options.testCaseSwitchClassnameAndName;
    const name = stripAnsi(jenkinsMode ? getJenkinsClassname(test) : test.fullTitle());
    const classname = stripAnsi(test.title);
    const testcase = {
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
    const systemOutLines = [];
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
      testcase.testcase.push({ 'system-out': this.removeInvalidCharacters(stripAnsi(systemOutLines.join('\n'))) });
    }

    if (this._options.outputs && (test.consoleErrors && test.consoleErrors.length > 0)) {
      testcase.testcase.push({ 'system-err': this.removeInvalidCharacters(stripAnsi(test.consoleErrors.join('\n'))) });
    }

    if (err) {
      const message;
      if (err.message && typeof err.message.toString === 'function') {
        message = err.message + '';
      } else if (typeof err.inspect === 'function') {
        message = err.inspect() + '';
      } else {
        message = '';
      }
      const failureMessage = err.stack || message;
      const failureElement = {
        _attr: {
          message: this.removeInvalidCharacters(message) || '',
          type: err.name || ''
        },
        _cdata: this.removeInvalidCharacters(failureMessage)
      };

      testcase.testcase.push({ failure: failureElement });
    }
    return testcase;
  };

  /**
   * @param {string} input
   * @returns {string} without invalid characters
   */
  removeInvalidCharacters(input) {
    if (!input) {
      return input;
    }
    return input.replace(INVALID_CHARACTERS_REGEX, '');
  };

  /**
   * Writes xml to disk and ouputs content if "toConsole" is set to true.
   * @param {Array.<Object>} testsuites - a list of xml configs
   */
  flush(testsuites) {
    const xml = this.getXml(testsuites);

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
  getXml(testsuites) {
    const totalSuitesTime = 0;
    const totalTests = 0;
    const stats = this._runner.stats;
    const antMode = this._options.antMode;
    const hasProperties = (!!this._options.properties) || antMode;

    testsuites.forEach(function (suite) {
      const _suiteAttr = suite.testsuite[0]._attr;
      // testsuite is an array: [attrs, properties?, testcase, testcase, …]
      // we want to make sure that we are grabbing test cases at the correct index
      const _casesIndex = hasProperties ? 2 : 1;
      const _cases = suite.testsuite.slice(_casesIndex);
      const missingProps;

      _suiteAttr.failures = 0;
      _suiteAttr.time = 0;
      _suiteAttr.skipped = 0;

      _cases.forEach(function (testcase) {
        const lastNode = testcase.testcase[testcase.testcase.length - 1];

        _suiteAttr.skipped += Number('skipped' in lastNode);
        _suiteAttr.failures += Number('failure' in lastNode);
        _suiteAttr.time += testcase.testcase[0]._attr.time;
      });

      if (antMode) {
        missingProps = ['system-out', 'system-err'];
        suite.testsuite.forEach(function (item) {
          missingProps = missingProps.filter(function (prop) {
            return !item[prop];
          });
        });
        missingProps.forEach(function (prop) {
          const obj = {};
          obj[prop] = [];
          suite.testsuite.push(obj);
        });
      }

      if (!_suiteAttr.skipped) {
        delete _suiteAttr.skipped;
      }

      totalSuitesTime += _suiteAttr.time;
      totalTests += _suiteAttr.tests;
    });


    if (!antMode) {
      const rootSuite = {
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
      testsuites = [rootSuite].concat(testsuites);
    }

    return xml({ testsuites: testsuites }, { declaration: true, indent: '  ' });
  };

  /**
   * Writes a JUnit test report XML document.
   * @param {string} xml - xml string
   * @param {string} filePath - path to output file
   */
  writeXmlToDisk(xml, filePath) {
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

}
