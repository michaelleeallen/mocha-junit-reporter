var xml = require('xml');

module.exports = function(stats) {
  var data = {
    testsuites: [
      {
        testsuite: [
          {
            _attr: {
              name: "Foo Bar module",
              timestamp: stats.start,
              tests: "2",
              failures: "1",
              time: stats.duration
            }
          },
          {
            testcase: {
              _attr: {
                name: "Foo can weez the juice",
                className: "can weez the juice",
                time: "1"
              }
            }
          },
          {
            testcase: [
              {
                _attr: {
                  name: "Bar can narfle the garthog",
                  className: "can narfle the garthog",
                  time: "1"
                }
              },
              {
                failure: "expected garthog to be dead"
              }
            ]
          }
        ]
      }
    ]
  };
  return xml(data, {declaration: true});
};
