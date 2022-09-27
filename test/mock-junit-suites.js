'use strict';

module.exports = {
  withStringTimes: function() {
    return [
      {
        testsuite: [
          {
            _attr: {
              name: "Foo Bar",
              timestamp: "1970-01-01T00:00:00",
              tests: "3",
              failures: "2",
              time: "100.001"
            }
          },
          {
            testcase: [
              {
                _attr: {
                  name: "Foo Bar can narfle the garthog",
                  classname: "can narfle the garthog",
                  time: "2.002"
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
        ]
      },
    ];
  }
};
