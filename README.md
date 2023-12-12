# JUnit Reporter for Mocha

[![Build Status][travis-badge]][travis-build]
[![npm][npm-badge]][npm-listing]

Produces JUnit-style XML test results.

## Installation

```shell
$ npm install mocha-junit-reporter --save-dev
```

or as a global module
```shell
$ npm install -g mocha-junit-reporter
```

## Usage
Run mocha with `mocha-junit-reporter`:

```shell
$ mocha test --reporter mocha-junit-reporter
```
This will output a results file at `./test-results.xml`.
You may optionally declare an alternate location for results XML file by setting
the environment variable `MOCHA_FILE` or specifying `mochaFile` in `reporterOptions`:

```shell
$ MOCHA_FILE=./path_to_your/file.xml mocha test --reporter mocha-junit-reporter
```
or
```shell
$ mocha test --reporter mocha-junit-reporter --reporter-options mochaFile=./path_to_your/file.xml
```
or
```javascript
var mocha = new Mocha({
    reporter: 'mocha-junit-reporter',
    reporterOptions: {
        mochaFile: './path_to_your/file.xml'
    }
});
```

### Append properties to testsuite

You can also add properties to the report under `testsuite`. This is useful if you want your CI environment to add extra build props to the report for analytics purposes

```xml
<testsuites>
  <testsuite>
    <properties>
      <property name="BUILD_ID" value="4291"/>
    </properties>
    <testcase/>
    <testcase/>
    <testcase/>
  </testsuite>
</testsuites>
```

To do so pass them in via env variable:
```shell
PROPERTIES=BUILD_ID:4291 mocha test --reporter mocha-junit-reporter
```
or
```javascript
var mocha = new Mocha({
    reporter: 'mocha-junit-reporter',
    reporterOptions: {
        properties: {
            BUILD_ID: 4291
        }
    }
})
```

### Append properties to testcase

You can provide metadata for each testcase, i.e., properties for each `testcase`.
Some tools (e.g., Xray) may take advantage of this to provide additional information related to the execution of each testcase or to perform other operations while importing test results (e.g., linking results to existing test cases or stories on some tool, such as Jira).

Zero, one or more properties may be provided using this metadata. You can use whatever name and attributes for the properties.

Properties can be defined by:

- a name (string) and an inline value (string)
- a name (string) and a content (multiline string)
- or a name (string), and a set of objects having one or more attributes, and optionally content

```xml
<testsuites>
  <testsuite>
    <testcase name="should do some stuff" time="1.7390" classname="demo">
      <properties>
        <property name="test_key" value="CALC-1"/>
        <property name="test_description"><![CDATA[a sample test]]></property>
        <property name="testrun_evidence">
          <item name="dummy-evidence1.txt"><![CDATA[aGVsbG8=]]></item>
          <item name="dummy-evidence2.txt"><![CDATA[d29ybGQ=]]></item>
        </property>
      </properties>
    </testcase>
  </testsuite>
</testsuites>
```

To do so, set them on the test object using `testCaseMetadata`.
The syntax is pretty straighforward: the root keys on the `testCaseMetadata` object are mapped to properties, where the key is mapped directly to the `name` attribute. If it holds a string value, then it's mapped to the `value` attribute on the corresponding `property` element; if it holds an object having `_cdata`, then the content will be stored as cdata on the corresponding `property. A more complex scenario is supported, in the case you want to pass a property containing an array of objecs; in this case, the root key will be mapped to a XML element and its keys will be mapped with to attributes on that element.

`_cdata` is a special attribute name that will be used internally as a way to signal that we want to embed its value as cdata content on the corresponding XML element, instead of being mapped to an attribute.

As an example that showcases the different type of properties, in mocha this would be something like:

```javascript
  it('should do some stuff', function() {
          this.testCaseMetadata = {
              test_key: 'CALC-1',
              test_description: { _cdata: 'a sample test' },
              testrun_evidence: [
                { item: { name: "dummy-evidence1.txt", _cdata: 'aGVsbG8=' }},
                { item: { name: "dummy-evidence2.txt", _cdata: 'd29ybGQ=' }}
              ]
            };
          ...
  });
```

If using Cypress, this could be added directly as the second argument (i.e., the test configuration) on the `it()` block; mocha by itself doesn't provide this facility as shown above though.

```javascript
  it('should do some stuff', { testCaseMetadata: {
              test_key: 'CALC-1',
              test_description: { _cdata: 'a sample test' },
              testrun_evidence: [
                { item: { name: "dummy-evidence1.txt", _cdata: 'aGVsbG8=' }},
                { item: { name: "dummy-evidence2.txt", _cdata: 'd29ybGQ=' }}
              ]
            }}, function() {

          cy.visit('http://www.example.com');
          ...
  });
```

Most probably, your calls will be much simpler as you may need just to simple pass a property and its value, as shown in the following examples.

mocha:

```javascript
  it('should do some stuff', function() {
    this.testCaseMetadata = { test_key: 'CALC-1'};
    ...
  });
```

Cypress:

```javascript
  it('should do some stuff', { testCaseMetadata: { test_key: 'CALC-1'} }, function() {
          cy.visit('http://www.example.com');
          ...
  });
```

### Results Report

Results XML filename can contain `[hash]`, e.g. `./path_to_your/test-results.[hash].xml`. `[hash]` is replaced by MD5 hash of test results XML. This enables support of parallel execution of multiple `mocha-junit-reporter`'s writing test results in separate files. In addition to this these placeholders can also be used:

| placeholder         | output                                            |
| ------------------- | ------------------------------------------------- |
| `[testsuitesTitle]` | will be replaced by the `testsuitesTitle` setting |
| `[rootSuiteTitle]`  | will be replaced by the `rootSuiteTitle` setting  |
| `[suiteFilename]`   | will be replaced by the filename of the spec file |
| `[suiteName]`       | will be replaced by the name the first test suite |


In order to display full suite title (including parents) just specify `testsuitesTitle` option
```javascript
var mocha = new Mocha({
    reporter: 'mocha-junit-reporter',
    reporterOptions: {
        testsuitesTitle: true,
        suiteTitleSeparatedBy: '.' // suites separator, default is space (' '), or period ('.') in jenkins mode
    }
});
```

If you want to **switch classname and name** of the generated testCase XML entries, you can use the `testCaseSwitchClassnameAndName` reporter option.

```javascript
var mocha = new Mocha({
    reporter: 'mocha-junit-reporter',
    reporterOptions: {
        testCaseSwitchClassnameAndName: true
    }
});
```

Here is an example of the XML output when using the `testCaseSwitchClassnameAndName` option:

| value             | XML output                                                                              |
| ----------------- | --------------------------------------------------------------------------------------- |
| `true`            | `<testcase name="should behave like so" classname="Super Suite should behave like so">` |
| `false` (default) | `<testcase name="Super Suite should behave like so" classname="should behave like so">` |

You can also configure the `testsuites.name` attribute by setting `reporterOptions.testsuitesTitle` and the root suite's `name` attribute by setting `reporterOptions.rootSuiteTitle`.

### System out and system err
The JUnit format defines a pair of tags - `<system-out/>` and `<system-err/>` - for describing a test's generated output
and error streams, respectively. It is possible to pass the test outputs/errors as an array of text lines:
```js
it ('should report output', function () {
  this.test.consoleOutputs = [ 'line 1 of output', 'line 2 of output' ];
});
it ('should report error', function () {
  this.test.consoleErrors = [ 'line 1 of errors', 'line 2 of errors' ];
});
```

Since this module is only a reporter and not a self-contained test runner, it does not perform
output capture itself. Thus, the author of the tests is responsible for providing a mechanism
via which the outputs/errors array will be populated.

If capturing only console.log/console.error is an option, a simple (if a bit hack-ish) solution is to replace
the implementations of these functions globally, like so:
```js
var util = require('util');

describe('my console tests', function () {
  var originalLogFunction = console.log;
  var originalErrorFunction = console.error;
  beforeEach(function _mockConsoleFunctions() {
    var currentTest = this.currentTest;
    console.log = function captureLog() {
      var formattedMessage = util.format.apply(util, arguments);
      currentTest.consoleOutputs = (currentTest.consoleOutputs || []).concat(formattedMessage);
    };
    console.error = function captureError() {
      var formattedMessage = util.format.apply(util, arguments);
      currentTest.consoleErrors = (currentTest.consoleErrors || []).concat(formattedMessage);
    };
  });
  afterEach(function _restoreConsoleFunctions() {
    console.log = originalLogFunction;
    console.error = originalErrorFunction;
  });
  it('should output something to the console', function() {
    // This should end up in <system-out>:
    console.log('hello, %s', 'world');
  });
});
```

Remember to run with `--reporter-options outputs=true` if you want test outputs in XML.

### Attachments
enabling the `attachments` configuration option will allow for attaching files and screenshots in [JUnit Attachments Plugin](https://wiki.jenkins.io/display/JENKINS/JUnit+Attachments+Plugin) format.

Attachment path can be injected into the test object
```js
it ('should include attachment', function () {
  this.test.attachments = ['/absolut/path/to/file.png'];
});
```

If both attachments and outputs are enabled, and a test injects both consoleOutputs and attachments, then
the XML output will look like the following:
```xml
<system-out>output line 1
output line 2
[[ATTACHMENT|path/to/file]]</system-out>
```

### Full configuration options

| Parameter                      | Default                | Effect                                                                                                                  |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| mochaFile                      | `test-results.xml`     | configures the file to write reports to                                                                                 |
| includePending                 | `false`                | if set to a truthy value pending tests will be included in the report                                                   |
| properties                     | `null`                 | a hash of additional properties to add to each test suite                                                               |
| toConsole                      | `false`                | if set to a truthy value the produced XML will be logged to the console                                                 |
| useFullSuiteTitle              | `false`                | if set to a truthy value nested suites' titles will show the suite lineage                                              |
| suiteTitleSeparatedBy          | ` ` (space)            | the character to use to separate nested suite titles. (defaults to ' ', '.' if in jenkins mode)                         |
| testCaseSwitchClassnameAndName | `false`                | set to a truthy value to switch name and classname values                                                               |
| rootSuiteTitle                 | `Root Suite`           | the name for the root suite. (defaults to 'Root Suite')                                                                 |
| testsuitesTitle                | `Mocha Tests`          | the name for the `testsuites` tag (defaults to 'Mocha Tests')                                                           |
| outputs                        | `false`                | if set to truthy value will include console output and console error output                                             |
| attachments                    | `false`                | if set to truthy value will attach files to report in `JUnit Attachments Plugin` format (after console outputs, if any) |
| antMode                        | `false`                | set to truthy value to return xml compatible with [Ant JUnit schema][ant-schema]                                        |
| antHostname                    | `process.env.HOSTNAME` | hostname to use when running in `antMode`  will default to environment `HOSTNAME`                                       |
| jenkinsMode                    | `false`                | if set to truthy value will return xml that will display nice results in Jenkins                                        |
| jenkinsClassnamePrefix         | `undefined`            | adds a prefix to a classname when running  in `jenkinsMode`                                                             |

[travis-badge]: https://travis-ci.org/michaelleeallen/mocha-junit-reporter.svg?branch=master
[travis-build]: https://travis-ci.org/michaelleeallen/mocha-junit-reporter
[npm-badge]: https://img.shields.io/npm/v/mocha-junit-reporter.svg?maxAge=2592000
[npm-listing]: https://www.npmjs.com/package/mocha-junit-reporter
[ant-schema]: http://windyroad.org/dl/Open%20Source/JUnit.xsd
