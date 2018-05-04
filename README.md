# s3c

A JavaScript editor with code evaluation.  Built for beginner JS
students, useful for all.  [Try it](https://0xc0de.fr/s3c).

## Features

- Inline code evaluation via a web worker
- Linting via [ESLint](http://eslint.org/)
- Content backup in local storage
- Editing features via [CodeMirror](http://codemirror.net/)

## Caveat

This editor is mainly intended for writing and evaluating small
snippets of JavaScript code.  Do not rely solely on local storage for
safekeeping, as the size limit varies from browser to browser.

Code evaluation uses `eval`, but is sandboxed in a web worker (so you cannot
interfere with the editor by redefining, say, `Object.prototype`).  The
evaluation timeouts after 1 second, outputting a ⌛.

Be aware that in a web worker, the identifier `self` is bound to the global
object, but `window` and `document` are undefined.

## Acknowledgments

Marijn Haverbeke and all the contributors for CodeMirror.  Nicholas
C. Zakas and contributors for ESLint.  Jonathan for the initial idea,
feedback and improvements.  My students for testing.
