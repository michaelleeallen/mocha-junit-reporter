#JUnit Reporter for Mocha

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
the command line argument `MOCAH_FILE`:

```shell
$ MOCHA_FILE=./path_to_your/file.xml mocha test --reporter mocha-junit-reporter
```
