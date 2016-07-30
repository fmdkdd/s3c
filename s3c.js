/* eslint-env browser */
/* global CodeMirror */

(function(){

  var delimiter = '//:';
  var timeout = 1000;

  document.addEventListener('DOMContentLoaded', init);

  var editor;
  var runButton;

  function init() {
    editor = CodeMirror(document.getElementById('editor'), {
      autofocus: true,
      tabSize: 2,
      lineNumbers: true,
      gutters: ["CodeMirror-lint-markers"],
      lint: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      extraKeys: {
        "Ctrl-Enter": function() {
          reval(editor);
        },
        "Ctrl-/": "toggleComment",
        Tab: "insertSoftTab", // spaces instead of \t
      },
    });

    // Restore from localStorage.
    // FIXME: local storage may be too limited.  Maybe use DB instead?
    var text = localStorage.getItem('backup');
    if (text) editor.setValue(text);

    // Backup text when leaving page.
    window.addEventListener('beforeunload', function() {
      localStorage.setItem('backup', editor.getValue());
    });

    runButton = document.getElementById('button-run')

    runButton.addEventListener('click', function() {
      reval(editor);
    });
  }

  var worker = null;
  var backlog = [];

  function write(marker, data, isError) {
    // +reval coalesces all writes made by this function into a single item in
    // CodeMirror's undo history.  So undo after an evaluation will revert /all/
    // markers, not just one marker at a time.
    console.log(data, marker.from, marker.to)
    editor.replaceRange(data, marker.from, marker.to, '+reval');
    if (isError) {
      // Line has changed, so the `to` marker is obsolete.
      var to = {
        line: marker.from.line,
        ch: marker.from.ch + data.length
      };
      editor.markText(marker.from, to, {className: 's3c-runtime-error'});
    }
  }

  function isEvaluationMarker(comment) {
    return comment.type === 'Line' && comment.value[0] === ':';
  }

  function killWorker(eachMark) {
    worker.terminate();
    worker = null;

    backlog.forEach(function(m) {
      clearTimeout(m.timeout);
      if (eachMark) eachMark(m);
    });
    backlog = [];
  }

  function reval(editor) {
    // We kill the existing worker because we need a fresh
    // eval environment.
    if (worker)
      killWorker();

    // Create new worker
    worker = new Worker('eval.js');
    worker.onmessage = function(event) {
      console.log(event)
      // var m = backlog[event.data.id];
      // clearTimeout(m.timeout);
      var m = event.data
      write(m, event.data.value, event.data.isError);
      // delete backlog[event.data.id];
    };

    // Eval each block up to the delimiter
    var text = editor.getValue();
    // var lines = text.split('\n');
    // var code = '';

    var ast = esprima.parse(text, {loc: true, attachComment: true});
    window.ast = ast;

    // var markers_with_parents = [];

    // estraverse.traverse(ast, {
    //   enter: function(node, parent) {
    //     if (node.trailingComments) {
    //       var m = node.trailingComments.filter(isEvaluationMarker);
    //       m.forEach(m => { m.parent = node });
    //       Array.prototype.push.apply(markers_with_parents, m);
    //     }
    //   }});

    // console.log(markers_with_parents)

    console.log(ast)

    var all_markers = [];

    // Collect
    estraverse.replace(ast, {
      enter: function(node, parent) {
        if (node.type === 'ExpressionStatement') {

          // Collect all evaluation markers attached to this expression
          // statement.
          var markers = [];

          estraverse.traverse(node, {
            enter: function(node, parent) {
              if (node.trailingComments) {
                var m = node.trailingComments.filter(isEvaluationMarker);
                Array.prototype.push.apply(markers, m);
              }
            }
          });

          // If we have any, then wrap the expression
          if (markers.length > 0) {
            // Prepare marker location for the argument to M
            var markers_ast = markers.map(m => {
              var start = m.loc.start;
              var end = m.loc.end;

              // Esprima counts line from 1, CodeMirror from 0
              var cm_loc = {
                from: {
                  line: start.line - 1,
                  // Skip evaluation marker syntax
                  ch: start.column + delimiter.length
                },
                to: {
                  line: end.line - 1,
                  ch: end.column
                }
              };

              // Save that one to write to erase the value of the evaluation
              // marker, for visual feedback the evaluation started.
              all_markers.push(cm_loc);

              return esprima
                .parse(`({from: {line: ${cm_loc.from.line}, ch: ${cm_loc.from.ch}},
                            to: {line: ${cm_loc.to.line}, ch: ${cm_loc.to.ch}} })`)
                .body[0].expression
            });

            // Wrap the expression in a call to M
            return {
              type: 'ExpressionStatement',
              expression: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'M' },
                arguments: [
                  node.expression,
                  { type: 'ArrayExpression',
                    elements: markers_ast,
                  }
                ]
              }
            };
          }
        }
      }
    });

    var code_with_M = escodegen.generate(ast);

    console.debug(code_with_M);

    // Need to define M
    // var header = 'function M(value, results) {'
    //       + '  results.forEach(r => { r.value =  value });'
    //       + '};';


    // var final_code = header + '\n' + code_with_M;

    // eval(final_code)

    // console.log()

    worker.postMessage({
      code: code_with_M,
    });

    // Erase all markers content for visual feedback that evaluation has
    // started.
    all_markers.forEach(function(m) {
      write(m, '', '+reval');
    });

    return

    lines.forEach(function(l, i) {
      code += l + '\n';

      var ev = l.indexOf(delimiter);
      if (ev === -1) return;
      // XXX: We should not evaluate delimiters in a comment, but that
      // would require actually parsing the code.  As a temporary
      // workaround, we skip lines beginning with '//' (but not
      // '//:').
      if (l.indexOf('//') === 0 && ev > 0) return;

      var id = backlog.length;
      backlog[id] = {
        code: code,
        from: {line: i, ch: ev + delimiter.length},
        to: {line: i, ch: l.length},
        timeout: setTimeout(function() {
          killWorker(function(m) { write(m, ' ⌛'); });
        }, timeout),
      };

      // Erase current marker value for visual feedback that evaluation has
      // started.
      write(backlog[id], '');

      worker.postMessage({
        id: id,
        code: code,
      });

      code = '';
    });
  }

}());
