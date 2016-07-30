/* eslint-env browser */
/* global CodeMirror */

// TODO: update ESLint to fix obsolete parser issues and hopefully weight less
// than 671K.

// TODO: Add LICENSE files for esprima/escodegen/estraverse

// TODO: check if updating other dependencies breaks anything while I'm at it

// TODO: use //! to wrap an expression in try/catch?

// TODO: use //+ to collect multiple results to the same marker? (and just
// separate results by spaces)

// TODO: add usage examples on the bottom of the page

// TODO: if there can only be one error or timeout, just put it next to the Run
// button in a 'evaluation result' space

// TODO: disable run if there is a parse error?

(function(){

  document.addEventListener('DOMContentLoaded', init);

  var delimiter = '//:';

  function isEvaluationComment(comment) {
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
    // TODO: local storage may be too limited.  Maybe use DB instead?
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

  function write(marker, data, className) {
    // +reval coalesces all writes made by this function into a single item in
    // CodeMirror's undo history.  So undo after an evaluation will revert /all/
    // markers, not just one marker at a time.
    editor.replaceRange(data, marker.from, marker.to, '+reval');

    // Sets class of marker if provided
    if (className) {
      // We just changed the line, so the `to` marker is obsolete.
      var to = {
        line: marker.from.line,
        ch: marker.from.ch + data.length
      };
      editor.markText(marker.from, to, {className: className});
    }
  }

  function reval(editor) {
    // We kill the existing worker because we need a fresh
    // eval environment.
    maybeKillWorker();

    var text = editor.getValue();

    // We associate every comment object from Esprima to an evaluation marker
    // object with CodeMirror coordinates and housekeeping properties.
    var commentsToMarkers = new WeakMap();

    // To avoid treating the same comment object as two different evaluation
    // markers, we keep track of the comments we have seen already.
    var all_markers = [];

    // Parse code to find evaluation markers
    var ast;

    // Parsing will fail if there is a syntax error.  If there is an error, we
    // catch it, skip evaluation and disable evaluation.
    try {
      ast = esprima.parse(text, {loc: true, attachComment: true});
    } catch (err) {
      // TODO: handle parse errors
      console.log(err)
    }

    // We first have to associate all evaluation comments with their parent
    // expression statement.
    var expressionsToComments = new WeakMap();

    // The Esprima AST has no parent links, so we keep track of the current trail
    // to the root in this list.
    var root_trail = [];

    estraverse.traverse(ast, {
      enter: function(node, parent) {
        root_trail.unshift(node);

        if (node.trailingComments) {
          var coms = node.trailingComments.filter(isEvaluationComment);

          // If we have evaluation comments
          if (coms.length > 0) {

            // Find the first expression statement
            var exp = first(root_trail, isExpressionStatement);

            if (exp) {
              expressionsToComments.set(exp, coms);
            } else {
              console.log('No parent expression statement!  What do I do?', coms);
            }
          }
        }
      },

      leave: function(node, parent) {
        root_trail.shift();
      }
    });

    // Now we must wrap all the expression statements that have associated
    // evaluation comments.
    estraverse.replace(ast, {
      enter: function(node, parent) {
        if (expressionsToComments.has(node)) {
          var comments = expressionsToComments.get(node);

          // Now, for each comment.  If we have already seen this comment, then
          // just return its id.  If not, we need to translate the comment
          // line/column from Esprima to CodeMirror coordinates.  Then we save
          // the evaluation marker object and return its id number for talking
          // with the worker.

          var comments_ids_nodes = [];

          comments.forEach(function buildMarkerAndGetId(c) {

            if (!commentsToMarkers.has(c)) {
              var start = c.loc.start;
              var end = c.loc.end;

              // Esprima counts lines from 1, CodeMirror from 0
              var marker = {
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
              commentsToMarkers.set(c, marker);
              all_markers.push(marker);
            }

            // Collect the id of this marker as an AST node
            comments_ids_nodes.push({
              type: 'Literal',
              value: all_markers.indexOf(commentsToMarkers.get(c))
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
                { type: 'ArrayExpression', elements: comments_ids_nodes }
              ]
            }
          };
        }
      }
    });

    // Create new worker
    worker = new Worker('eval.js');
    worker.onmessage = function onMessage(event) {
      var d = event.data;

      // When we get data for a marker
      if (d.type === 'log') {

        // Write it
        write(all_markers[d.id], d.result);

        // Mark that we did already receive a log for this marker.  If we
        // timeout or have an error, we won't erase this marker's content.
        all_markers[d.id].receivedLog = true;
      }

      // When the evaluation is done
      else if (d.type === 'evaluation_done') {

        // We don't need the worker anymore
        maybeKillWorker();

        // If there was an error, report it to the user
        if (d.isError) {

          writeToRemainingMarkers(function reportError(m) {
            write(m, d.errorMsg, 's3c-runtime-error');
          });
        }
      }
    };

    // Send code to worker for evaluation
    worker.postMessage({
      code: escodegen.generate(ast),
      loggingFunctionName: logging_function_name,
    });

    // If it takes too long, kill it.
    workerTimeout = setTimeout(function onTimeout() {
      // Kill it with fire!
      maybeKillWorker();

      writeToRemainingMarkers(function reportTimeout(m) {
        write(m, '⌛ (timeout)', 's3c-timeout');
      });

    }, timeout);

    // Meanwhile, erase all markers content for visual feedback that evaluation
    // has started.  (this is actually ok to do after postMessage because we
    // won't process messages from the worker before we quit this function)
    all_markers.forEach(function clearMarker(m) {
      write(m, '');
    });

    function writeToRemainingMarkers(write_fn) {
      all_markers.filter(function hasReceivedLog(m) {
        return !m.receivedLog;
      })
        .forEach(write_fn);
    }
  }

  // Return first value in the array that matches the predicate, or undefined.
  function first(array, predicate) {
    for (var i = 0; i < array.length; ++i) {
      if (predicate(array[i]))
        return array[i];
    }

    return undefined;
  }

  function isExpressionStatement(node) {
    return node.type === 'ExpressionStatement';
  }

}());
