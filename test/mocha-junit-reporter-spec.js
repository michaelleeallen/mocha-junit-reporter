'use-strict';

var fs = require('fs');
var Reporter = require('../index');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var xml = require('xml');
var chai = require('chai');
var expect = chai.expect;
var chaiXML = require('chai-xml');
var mockXml = require('./mock-results');

chai.use(chaiXML);

// mock test runner
function Runner(){}
util.inherits(Runner, EventEmitter);


describe('mocha-junit-reporter', function(){
  it('can produce a JUnit XML report', function(){
    var runner = new Runner();
    var reporter = new Reporter(runner);
    runner.emit('start');
    runner.emit('suite', {
      title: 'Foo Bar module',
      tests: [1,2]
    });
    runner.emit('pass', {
      fullTitle: function(){ return 'Foo can weez the juice'; },
      title: 'can weez the juice',
      duration: 1,
      slow: function(){}
    });
    runner.emit('test end');
    runner.emit('fail', {
      fullTitle: function(){ return 'Bar can narfle the garthog'; },
      title: 'can narfle the garthog',
      duration: 1,
      slow: function(){}
    }, {
      message: 'expected garthog to be dead'
    });
    runner.emit('test end');
    runner.emit('end');

    var output = fs.readFileSync(__dirname+'/mocha.xml', 'utf-8');
    expect(output).xml.to.be.valid();
    expect(output).xml.to.equal(mockXml(runner.stats));
  });
});
