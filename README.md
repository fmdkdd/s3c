# s3c

A JavaScript editor with code evaluation.  Built for beginner JS
students, useful for all.  [Try it](http://fmdkdd.github.io/s3c).

## Features

- Inline code evaluation in a web worker
- Linting via [ESLint](http://eslint.org/)
- Content backup in local storage
- Editing features via [CodeMirror](http://codemirror.net/)

## Caveat

This editor is mainly intended for writing and evaluating small
snippets of JavaScript code.  Do not rely solely on local storage for
safekeeping, as the size limit varies from browser to browser.  Code
evaluation uses `eval` and is only slightly sandboxed as it runs in a
web worker (so you cannot interfere with the editor); you can still
interfere with the evaluation by, say, redefining `JSON.stringify`.

## Acknowledgments

Marijn Haverbeke and all the contributors for CodeMirror.  Nicholas
C. Zakas and contributors for ESLint.  Jonathan for the initial idea,
feedback and improvements.  My students for testing.
