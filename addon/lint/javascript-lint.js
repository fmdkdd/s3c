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
    parserOptions: {
      ecmaVersion: 6,
    },

    rules: {
      // Errors
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-irregular-whitespace': 'error',
      'no-obj-calls': 'error',

      // Warnings
      'no-ex-assign': 'warn',
      'no-negated-in-lhs': 'warn',
      'no-func-assign': 'warn',
      'no-inner-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'no-sparse-arrays': 'warn',
      'no-unreachable': 'warn',
      'use-isnan': 'warn',
      'valid-typeof': 'warn',
      'array-callback-return': 'warn',
      'eqeqeq': ['warn', 'smart'],
      'no-redeclare': 'warn',
      'no-self-assign': 'warn',
      'no-self-compare': 'warn',
      'no-useless-call': 'warn',
      'no-restricted-globals': ['warn', 'self', '_$deadb33f'],

      // Style warnings
      'no-extra-parens': 'warn',
      'no-extra-semi': 'warn',
      'no-unexpected-multiline': 'warn',
      'block-scoped-var': 'warn',
      'consistent-return': 'warn',
      'curly': 'warn',
      'default-case': 'warn',
      'no-return-assign': 'warn',
      'no-sequences': 'warn',
      'no-unused-vars': 'warn',
      'no-use-before-define': 'warn',
    }
  };

  // Will affect a special 'style' severity category for these rules, with a
  // distinct color in the editor.
  var style_rules = [
    'no-extra-parens',
    'no-extra-semi',
    'no-unexpected-multiline',
    'block-scoped-var',
    'consistent-return',
    'curly',
    'default-case',
    'no-return-assign',
    'no-sequences',
    'no-unused-vars',
    'no-use-before-define',
  ]

  function validator(text, options) {
    if (!window.eslint) return [];

    return eslint.verify(text, config).map(function(lint) {
      // Syntax error
      if (lint.fatal) {
        return {
          message: lint.message,
          severity: severity[lint.severity],
          from: CodeMirror.Pos(lint.line - 1, lint.column - 1),
          to: CodeMirror.Pos(lint.line - 1, lint.column),
        };
      }

      // ESLint rule triggered
      else {
        var m = {
          message: lint.message + ' (' + lint.ruleId + ')',
          severity: severity[lint.severity],
          from: CodeMirror.Pos(lint.line - 1, lint.column - 1),
        };

        if (style_rules.indexOf(lint.ruleId) > -1) {
          m.severity = 'style';
        }

        if (lint.endLine && lint.endColumn) {
          m.to = CodeMirror.Pos(lint.endLine - 1, lint.endColumn - 1);
        } else {
          m.to = CodeMirror.Pos(lint.line - 1, lint.olumn);
        }

        return m;
      }
    });
  }

  CodeMirror.registerHelper("lint", "javascript", validator);
});
