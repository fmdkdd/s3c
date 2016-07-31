s3c-bundle.min.js: codemirror/lib/codemirror.js \
                   codemirror/mode/javascript/javascript.js \
                   codemirror/addon/edit/matchbrackets.js \
                   codemirror/addon/edit/closebrackets.js \
                   codemirror/addon/comment/comment.js \
                   codemirror/addon/selection/active-line.js \
                   eslint/eslint.js \
                   addon/lint/javascript-lint.js \
                   codemirror/addon/lint/lint.js \
                   esprima/esprima.js \
                   esprima/estraverse.js \
                   esprima/escodegen.browser.js \
                   s3c.js
	uglifyjs $^ --compress --mangle > $@
