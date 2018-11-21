'use strict';

function Test(fullTitle, title, duration) {
  return {
    title: title,
    duration: duration,
    fullTitle: function() { return fullTitle; },
    shortTitle: function(){ 
      return fullTitle.replace(title, '');
     },
    slow: function() {}
  };
}

module.exports = Test;
