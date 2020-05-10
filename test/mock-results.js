'use strict';

var xml = require('xml');

module.exports = function(stats, options) {
  var data = {
    testsuites: [
      {
        _attr: {
          name: "Mocha Tests",
          tests: 4,
          failures: "2",
          time: "432.1100"
        }
      },
      {
        testsuite: [
          {
            _attr: {
              name: "Root Suite",
              timestamp: stats.start.toISOString().substr(0,stats.start.toISOString().indexOf('.')),
              tests: "0",
              failures: "0",
              time: "0.0000"
            }
          }
        ]
      },
      {
        testsuite: [
          {
            _attr: {
              name: "Foo Bar",
              timestamp: stats.start.toISOString().substr(0,stats.start.toISOString().indexOf('.')),
              tests: "3",
              failures: "2",
              time: "32.1060"
            }
          },
          {
            testcase: {
              _attr: {
                name: "Foo Bar can weez the juice",
                classname: "can weez the juice",
                time: "0.1010"
              }
            }
          },
          {
            testcase: [
              {
                _attr: {
                  name: "Foo Bar can narfle the garthog",
                  classname: "can narfle the garthog",
                  time: "2.0020"
                }
              },
              {
                failure: {
                  _attr: {
                      message: "expected garthog to be dead",
                      type: "Error"
                  },
                  _cdata: "this is where the stack would be"
                }
              }
            ]
          },
          {
            testcase: [
              {
                _attr: {
                  name: "Foo Bar can behave like a flandip",
                  classname: "can behave like a flandip",
                  time: "30.0030"
                }
              },
              {
                failure: {
                  _attr: {
                      message: "expected baz to be masher, a hustler, an uninvited grasper of cone",
                      type: "BazError"
                  },
                  _cdata: "stack"
                }
              }
            ]
          }
        ]
      },
      {
        testsuite: [
          {
            _attr: {
              name: "Another suite!",
              timestamp: stats.start.toISOString().substr(0,stats.start.toISOString().indexOf('.')),
              tests: "1",
              failures: "0",
              time: "400.0040"
            }
          },
          {
            testcase: {
              _attr: {
                name: "Another suite! works",
                classname: "works",
                time: "400.0040"
              }
            }
          }
        ]
      }
    ]
  };

  if (options && options.properties) {
    var properties = {
      properties: []
    };
    for (var i = 0; i < options.properties.length; i++) {
      var property = options.properties[i];
      properties.properties.push({
        property: [
          {
            _attr: {
              name: property.name,
              value: property.value
            }
          }
        ]
      });
    }

    for (i = 1; i < data.testsuites.length; i++) {
      data.testsuites[i].testsuite.push(properties);
    }
  }

  if (stats.pending) {
    data.testsuites[0]._attr.tests += stats.pending;
    data.testsuites[0]._attr.skipped = stats.pending;
    data.testsuites.push({
      testsuite: [
        {
          _attr: {
            name: "Pending suite!",
            timestamp: stats.start.toISOString().substr(0,stats.start.toISOString().indexOf('.')),
            tests: "1",
            failures: "0",
            skipped: "1",
            time: "0.0000"
          }
        },
        {
          testcase: [
            {
              _attr: {
                name: "Pending suite! pending",
                classname: "pending",
                time: "0.0000"
              }
            },
            {
              skipped: null
            }
          ]
        }
      ]
    });
  }

  return xml(data, {declaration: true});
};
