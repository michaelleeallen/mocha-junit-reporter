'use strict';

module.exports = {
  "env": {
    "browser": true,
    "node": true
  },
  "extends": "eslint:recommended",
  "rules": {
    "no-extra-semi": "warn",
    "semi": ["error", "always"],
    "space-in-parens": ["error", "never"],
    "space-infix-ops": "error",
    "strict": "error"
  }
};
