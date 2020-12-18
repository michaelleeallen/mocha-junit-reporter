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
          time: ((stats.duration || 0) / 1000).toFixed(4)
        }
      },
      {
        testsuite: [
          {
            _attr: {
              name: "Root Suite",
              timestamp: "1970-01-01T00:00:00", // ISO timestamp truncated to the second
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
              timestamp: "1970-01-01T00:00:00",
              tests: "3",
              failures: "2",
              time: "100.0010"
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
              timestamp: "1970-01-01T00:01:40", // new Date(100001).toISOString().slice(0, -5)
              tests: "1",
              failures: "0",
              time: "400.0050"
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
            timestamp: "1970-01-01T00:08:20", // new Date(100001 + 400005).toISOString().slice(0, -5)
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
