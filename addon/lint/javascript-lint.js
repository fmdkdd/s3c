// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";
  /* eslint-env browser */
  /* global eslint */

  var severity = {
    1: 'warning',
    2: 'error',
  };

  var config = {
    "env": {
      "browser": false,
      "node": false,
      "amd": false,
      "mocha": false,
      "jasmine": false
    },

    "globals": {
      "console": true
    },

    "rules": {
      "no-alert": 2,
      "no-array-constructor": 2,
      "no-bitwise": 0,
      "no-caller": 2,
      "no-catch-shadow": 2,
      "no-comma-dangle": 0,
      "no-cond-assign": [2, "except-parens"],
      "no-console": 0,
      "no-constant-condition": 2,
      "no-control-regex": 2,
      "no-debugger": 2,
      "no-delete-var": 2,
      "no-div-regex": 0,
      "no-dupe-keys": 2,
      "no-else-return": 0,
      "no-empty": 2,
      "no-empty-class": 2,
      "no-empty-label": 2,
      "no-eq-null": 0,
      "no-eval": 2,
      "no-ex-assign": 2,
      "no-extend-native": 2,
      "no-extra-bind": 2,
      "no-extra-boolean-cast": 2,
      "no-extra-parens": 1,
      "no-extra-semi": 2,
      "no-extra-strict": 2,
      "no-fallthrough": 2,
      "no-floating-decimal": 0,
      "no-func-assign": 2,
      "no-implied-eval": 2,
      "no-inline-comments": 0,
      "no-inner-declarations": [2, "functions"],
      "no-invalid-regexp": 2,
      "no-irregular-whitespace": 0,
      "no-iterator": 2,
      "no-label-var": 2,
      "no-labels": 2,
      "no-lone-blocks": 2,
      "no-lonely-if": 0,
      "no-loop-func": 2,
      "no-mixed-requires": [0, false],
      "no-mixed-spaces-and-tabs": [0, false],
      "no-multi-spaces": 2,
      "no-multi-str": 2,
      "no-multiple-empty-lines": [0, {"max": 2}],
      "no-native-reassign": 2,
      "no-negated-in-lhs": 2,
      "no-nested-ternary": 0,
      "no-new": 2,
      "no-new-func": 2,
      "no-new-object": 2,
      "no-new-require": 0,
      "no-new-wrappers": 2,
      "no-obj-calls": 2,
      "no-octal": 2,
      "no-octal-escape": 2,
      "no-path-concat": 0,
      "no-plusplus": 0,
      "no-process-env": 0,
      "no-process-exit": 2,
      "no-proto": 2,
      "no-redeclare": 2,
      "no-regex-spaces": 2,
      "no-reserved-keys": 0,
      "no-restricted-modules": 0,
      "no-return-assign": 2,
      "no-script-url": 2,
      "no-self-compare": 2,
      "no-sequences": 2,
      "no-shadow": 2,
      "no-shadow-restricted-names": 2,
      "no-space-before-semi": 1,
      "no-spaced-func": 1,
      "no-sparse-arrays": 2,
      "no-sync": 0,
      "no-ternary": 0,
      "no-trailing-spaces": 0,
      "no-undef": 2,
      "no-undef-init": 2,
      "no-undefined": 0,
      "no-underscore-dangle": 2,
      "no-unreachable": 2,
      "no-unused-expressions": 2,
      "no-unused-vars": 1,
      "no-use-before-define": [1, "nofunc"],
      "no-void": 0,
      "no-warning-comments": [0, { "terms": ["todo", "fixme", "xxx"], "location": "start" }],
      "no-with": 2,
      "no-wrap-func": 2,

      "block-scoped-var": 0,
      "brace-style": [0, "1tbs"],
      "camelcase": 0,
      "comma-spacing": 0,
      "comma-style": 0,
      "complexity": [0, 11],
      "consistent-return": 2,
      "consistent-this": [0, "that"],
      "curly": 0,
      "default-case": 1,
      "dot-notation": 2,
      "eol-last": 0,
      "eqeqeq": 2,
      "func-names": 0,
      "func-style": [0, "declaration"],
      "global-strict": [2, "never"],
      "guard-for-in": 0,
      "handle-callback-err": 0,
      "key-spacing": [2, { "beforeColon": false, "afterColon": true }],
      "max-depth": [0, 4],
      "max-len": [0, 80, 4],
      "max-nested-callbacks": [0, 2],
      "max-params": [0, 3],
      "max-statements": [0, 10],
      "new-cap": 2,
      "new-parens": 2,
      "one-var": 0,
      "operator-assignment": [0, "always"],
      "padded-blocks": 0,
      "quote-props": 0,
      "quotes": 0,
      "radix": 1,
      "semi": 2,
      "sort-vars": 0,
      "space-after-keywords": [1, "always"],
      "space-before-blocks": [1, "always"],
      "space-in-brackets": [0, "never"],
      "space-in-parens": [0, "never"],
      "space-infix-ops": 1,
      "space-return-throw-case": 2,
      "space-unary-ops": [2, { "words": true, "nonwords": false }],
      "spaced-line-comment": [0, "always"],
      "strict": 0,
      "use-isnan": 2,
      "valid-jsdoc": 0,
      "valid-typeof": 2,
      "vars-on-top": 0,
      "wrap-iife": 0,
      "wrap-regex": 0,
      "yoda": [2, "never"]
    }
  };

  function validator(text, options) {
    if (!window.eslint) return [];

    return eslint.verify(text, config).map(function(h) {
      if (h.fatal) // Syntax error
        return {
          message: h.message,
          severity: severity[h.severity],
          from: CodeMirror.Pos(h.line - 1, h.column - 1),
          to: CodeMirror.Pos(h.line - 1, h.column),
        };
      else {
        return {
          message: h.message + ' (' + h.ruleId + ')',
          severity: severity[h.severity],
          from: CodeMirror.Pos(h.node.loc.start.line - 1, h.node.loc.start.column),
          to: CodeMirror.Pos(h.node.loc.end.line - 1, h.node.loc.end.column),
        };
      }
    });
  }

  CodeMirror.registerHelper("lint", "javascript", validator);
});
