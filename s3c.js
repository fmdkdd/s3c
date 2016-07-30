/* eslint-env browser */
/* global CodeMirror */

(function(){

  document.addEventListener('DOMContentLoaded', init);

  var delimiter = '//:';

  function isEvaluationMarker(comment) {
    return comment.type === 'Line' && comment.value[0] === ':';
  }

  // How long before canceling evaluation
  var timeout = 1000;

  var logging_function_name = '_$deadb33f'; // Random enough?

  var editor;
  var runButton;
  var worker;
  var workerTimeout;

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
        "Ctrl-Enter": doReval,
        "Ctrl-/": "toggleComment",
        Tab: "insertSoftTab", // spaces instead of \t
      },
    });

    // Restore from localStorage.
    // FIXME: local storage may be too limited.  Maybe use DB instead?
    var text = localStorage.getItem('backup');
    if (text) editor.setValue(text);

    // Backup text when leaving page.
    window.addEventListener('beforeunload', function backupToLocalStorage() {
      localStorage.setItem('backup', editor.getValue());
    });

    runButton = document.getElementById('button-run')
    runButton.addEventListener('click', doReval);

    function doReval() {
      reval(editor);
    }
  }

  function maybeKillWorker(eachMark) {
    if (worker) {
      worker.terminate();
      worker = null;
    }

    // We don't need this timeout anymore
    clearTimeout(workerTimeout);
  }

  function write(marker, data, isError) {
    // +reval coalesces all writes made by this function into a single item in
    // CodeMirror's undo history.  So undo after an evaluation will revert /all/
    // markers, not just one marker at a time.
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

  function reval(editor) {
    // We kill the existing worker because we need a fresh
    // eval environment.
    maybeKillWorker();

    var text = editor.getValue();

    // To keep track of all markers
    var all_markers = [];

    // Parse code to find evaluation markers
    var ast = esprima.parse(text, {loc: true, attachComment: true});

    estraverse.replace(ast, {
      enter: function(node, parent) {
        if (node.type === 'ExpressionStatement') {

          // Collect all evaluation markers attached to this expression
          // statement.
          var markers = [];

          estraverse.traverse(node, {
            enter: function collectMarkers(node, parent) {
              if (node.trailingComments) {
                var m = node.trailingComments.filter(isEvaluationMarker);
                Array.prototype.push.apply(markers, m);
              }
            }
          });

          // If we have any marker
          if (markers.length > 0) {
            // We need to translate the markers line/column from Esprima to
            // CodeMirror coordinates.  Then we save them and use their id
            // number for talking with the worker.
            var markers_ids = [];

            markers.forEach(function saveMarkers(m) {
              var start = m.loc.start;
              var end = m.loc.end;

              // Esprima counts lines from 1, CodeMirror from 0
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

              // Collect the id of this marker as an AST node
              markers_ids.push({
                type: 'Literal',
                value: all_markers.length - 1
              });
            });

            // Wrap the expression in a call to the logging function
            return {
              type: 'ExpressionStatement',
              expression: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: logging_function_name },
                arguments: [
                  node.expression,
                  { type: 'ArrayExpression', elements: markers_ids }
                ]
              }
            };
          }
        }
      }
    });

    // Create new worker
    worker = new Worker('eval.js');
    worker.onmessage = function onMessage(event) {
      var d = event.data;
      write(all_markers[d.id], d.result, d.isError);
    };

    // Send code to worker for evaluation
    worker.postMessage({
      code: escodegen.generate(ast),
      loggingFunctionName: logging_function_name,
    });

    // If it takes too long, kill it.
    workerTimeout = setTimeout(maybeKillWorker, timeout);

    // Meanwhile, erase all markers content for visual feedback that evaluation
    // has started.  (this is actually ok to do after postMessage because we
    // won't process messages from the worker before we quit this function)
    all_markers.forEach(function clearMarker(m) {
      write(m, '');
    });
  }

}());
