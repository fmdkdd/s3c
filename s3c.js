/* eslint-env browser */
/* global CodeMirror */

// TODO: check if updating other dependencies breaks anything while I'm at it

// TODO: add usage examples on the bottom of the page

// TODO: can we use the debugger to debug the code evaluated by s3c?

(function(){

  document.addEventListener('DOMContentLoaded', init);

  // Delimiters can be
  //
  // - `//:` displays the value of the nearest (preceding or parent) expression.
  //   If that value is an error, its results will be displayed in red.
  //
  // - `//!` wraps the nearest expression in a try/catch and displays its value.
  //   This is useful because earlier evaluation results that throw exceptions
  //   will show up in later delimiters.  When a failure is expected, one can
  //   use this delimiter to signal it (but it's just syntactic sugar for
  //   try/catch).
  //
  // - `//+` displays the value of nearest expression, but will keep
  //   accumulating results in a single evaluation.  This is useful in loops.
  //   The `//:` delimiter only displays the last value, so in loops it will
  //   only show the value for the last iteration.  The `//+` delimiter will
  //   instead show the values for each iteration.
  var SEMI = {};
  var BANG = {};
  var PLUS = {};
  var delimiter_length = 3;

  var sampleText = "// Create some variable...\n\
\n\
var a = 1 + 2\n\
\n\
// And inspect its value using the '//:' marker\n\
\n\
a //:\n\
\n\
// Press Run, or Ctrl+Enter to evaluate all markers\n\
\n\
// It even works inside functions:\n\
\n\
function f(x, y) {\n\
  var d = Math.sqrt(x * x + y * y)\n\
  d //:\n\
  // The '//+' marker shows all values at this location,\n\
  // even among multiple calls:\n\
  d //+\n\
  return Math.floor(d)\n\
}\n\
\n\
f(1, 1) //:\n\
f(2, 2) //:\n\
\n\
// You can change the parameters inside `f` and run again to see the changes";

  function isEvaluationComment(comment) {
    return comment.type === 'Line'
      && (comment.value[0] === ':'
          || comment.value[0] === '!'
          || comment.value[0] === '+');
  }

  function evaluationCommentType(comment) {
    switch (comment.value[0]) {
    case ':': return SEMI;
    case '!': return BANG;
    case '+': return PLUS;
    default: return SEMI;
    }
  }

  // How long before canceling evaluation
  var timeout = 1000;

  var logging_function_name = '_$deadb33f'; // Random enough?

  var editor;
  var runButton;
  var worker;
  var workerTimeout;
  var refreshTimerTimeout;
  var errorMarkers = [];

  function resizeEditor() {
    document.querySelector('.CodeMirror').style.height
      = (window.innerHeight - 110) + 'px';
  }

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

    window.addEventListener('resize', resizeEditor);
    resizeEditor();

    // Add an overlay for syntax highlighting the delimiters differently (and
    // their results) from standard comments.  This corresponds to the
    // 'cm-s3c-delimiter' CSS rule.
    var query = /\/\/[:+!].*$/g;
    editor.addOverlay({
      token: function(stream) {
        query.lastIndex = stream.pos;
        var match = query.exec(stream.string);
        if (match && match.index == stream.pos) {
          stream.pos += match[0].length || 1;
          return "s3c-delimiter";
        } else if (match) {
          stream.pos = match.index;
        } else {
          stream.skipToEnd();
        }
      }
    }, {opaque: true});

    // Restore from localStorage.
    // TODO: local storage may be too limited.  Maybe use DB instead?
    var text = localStorage.getItem('backup');
    if (text) editor.setValue(text);
    // new users see the sample text
    else editor.setValue(sampleText);

    // Backup text when leaving page.
    window.addEventListener('beforeunload', function backupToLocalStorage() {
      localStorage.setItem('backup', editor.getValue());
    });

    // Backup text when user is idle.
    editor.on('changes', debounce(maybeSave, 5000));

    runButton = document.getElementById('button-run')
    runButton.addEventListener('click', doReval);

    timeoutInput = document.getElementById('timeout')
    timeoutInput.addEventListener('change', function changeTimeout() {
      timeout = this.value;
    });
    // Use the value in the form if it's already present.  It *should* be a
    // valid number already.  But it can be empty.
    timeout = timeoutInput.value || timeout;
    // Make sure the value we use is visible.
    timeoutInput.value = timeout;

    function doReval() {
      reval(editor);
    }
  }

  function maybeSave() {
    // Save editor contents if it hasn't changed since last time we saved.
    if (!editor.isClean()) {
      localStorage.setItem('backup', editor.getValue());
      editor.markClean();
    }
  }

  function maybeKillWorker(eachMark) {
    if (worker) {
      worker.terminate();
      worker = null;
    }

    // We don't need these timeouts anymore
    clearTimeout(workerTimeout);
    clearTimeout(refreshTimerTimeout);

    // Restore the 'Run' button
    runButton.innerText = 'Run';
    runButton.classList.remove('in-progress');
  }

  function erase(marker) {
    // Erase from the end of the delimiter to the end of the line, regardless
    // of the delimiter type.
    editor.replaceRange('', marker.from, {line: marker.from.line}, '+reval');
  }

  function write(marker, data, className) {
    // If it's a //+ delimiter, we want to append to the end of the line.
    // That's done by not passing any `to`, and inserting from the end (with
    // `ch` null).
    //
    // +reval coalesces all writes made by this function into a single item in
    // CodeMirror's undo history.  So undo after an evaluation will revert /all/
    // markers, not just one marker at a time.
    if (marker.type === PLUS) {
      editor.replaceRange(data, {line: marker.from.line}, undefined, '+reval');
    } else {
      editor.replaceRange(data, marker.from, {line: marker.from.line}, '+reval');
    }

    // Sets class of marker if provided.  This time we want to mark the whole
    // line unconditionally, including the evaluation marker.
    if (className) {
      errorMarkers.push(
        editor.markText({line: marker.from.line,
                         ch: marker.from.ch - delimiter_length},
                        {line: marker.from.line}, {className: className}));
    }
  }

  function reval(editor) {
    // First thing: save the editor content to avoid losing any work when
    // evaluating.
    maybeSave();

    // We kill the existing worker because we need a fresh
    // eval environment.
    maybeKillWorker();

    var text = editor.getValue();

    // Parse code to find evaluation markers.  Parsing will fail if there is a
    // syntax error.  If there is an error, we catch it, skip evaluation and
    // disable evaluation.
    var ast;

    try {
      ast = esprima.parse(text, {loc: true, attachComment: true});
      runButton.disabled = false;
      runButton.classList.remove('parse-error');
    } catch (err) {
      // If there is a parse error, abort and disable the Run button
      runButton.disabled = true;
      runButton.classList.add('parse-error');
      runButton.innerText = 'Parse error';
      return;
    }

    // We first have to associate all evaluation comments with their nearest
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

          // If any of these are evaluation comments
          if (coms.length > 0) {

            // Find the first expression statement
            var exp = first(root_trail, isExpressionStatement);

            // If there is no parent expression statement, we have a block with
            // a trailing comment.  We go traverse it and bind to the last
            // ExpressionStatement we find.  This is the legacy behavior of s3c.
            if (!exp) {
              estraverse.traverse(node, {
                enter: function(node, parent) {
                  if (isExpressionStatement(node)) {
                    exp = node;
                  }
                }
              });
            }

            // If we haven't found an expression statement this time...  Are you
            // sure you are using this thing right?
            if (!exp) {
              console.error('No nearest expression statement found!'
                            + '  Please report this error', coms);
            }

            else {
              // If the expressions is already in the map, we want to add
              // evaluation comments to it.
              if (expressionsToComments.has(exp)) {
                Array.prototype.push.apply(
                  expressionsToComments.get(exp),
                  coms
                );
              }

              // Otherwise, just set
              else {
                expressionsToComments.set(exp, coms);
              }
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

    // We associate every comment object from Esprima to an evaluation marker
    // object with CodeMirror coordinates and housekeeping properties.
    var commentsToMarkers = new WeakMap();

    // To avoid treating the same comment object as two different evaluation
    // markers, we keep track of the comments we have seen already.
    var all_markers = [];

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

          // If there is at least one error evaluation comment, we will wrap the
          // call to the log function in a try/catch.
          var wrap_in_trycatch = false;

          comments.forEach(function buildMarkerAndGetId(c) {

            if (!commentsToMarkers.has(c)) {
              var start = c.loc.start;
              var end = c.loc.end;

              // Esprima counts lines from 1, CodeMirror from 0
              var marker = {
                from: {
                  line: start.line - 1,
                  // Skip the delimiter syntax
                  ch: start.column + delimiter_length
                },

                type: evaluationCommentType(c)
              };

              wrap_in_trycatch = wrap_in_trycatch || marker.type === BANG;

              // Save that one to erase the value of the evaluation marker, for
              // visual feedback that the evaluation started.
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
          var replacement = wrapNodeWithLogCall([
            node.expression,
            { type: 'ArrayExpression', elements: comments_ids_nodes }
          ]);

          // And wrap /that/ in a try/catch if needed
          if (wrap_in_trycatch) {
            replacement = wrapNodeWithTryCatch(
              replacement,
              wrapNodeWithLogCall([
                { type: 'Identifier', name: 'e' },
                { type: 'ArrayExpression', elements: comments_ids_nodes },
                { type: 'Literal', value: true }
              ]));
          }

          return replacement;
        }
      }
    });

    // Create new worker
    worker = new Worker('eval.js');
    worker.onmessage = function onMessage(event) {
      var d = event.data;

      // When we get data for a marker
      if (d.type === 'log') {
        var marker = all_markers[d.id];

        // A bang marker expects an error.  A normal marker does not expect an
        // error.
        var className;
        var isError = marker.type === BANG ? !d.isError : d.isError;
        if (isError) {
          className = 's3c-runtime-error';
        }

        write(marker, d.result, className);

        // Mark that we did already receive a log for this marker.  If we
        // timeout or have an error, we won't erase this marker's content.
        marker.receivedLog = true;
      }

      // When the evaluation is done
      else if (d.type === 'evaluation_done') {
        // Don't kill the worker yet, as we don't know if the event loop is
        // actually empty.

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

    // Refresh the time since the task has been running, for visual feedback of
    // progress.
    var startTime = Date.now();
    refreshTimerTimeout = setInterval(function refreshTimer() {
      var elapsed = Date.now() - startTime;
      var remaining = Math.round((timeout - elapsed) / 1000);
      runButton.innerText = 'Running (' + remaining + 's)';
    }, 1000);
    // Immediate feedback that it has started
    runButton.innerText = 'Running';
    runButton.classList.add('in-progress');

    // Meanwhile, erase all markers content for visual feedback that evaluation
    // has started.  (this is actually ok to do after postMessage because we
    // won't process messages from the worker before we quit this function)
    all_markers.forEach(function clearMarker(m) {
      erase(m);
    });
    // Also clear up any error marker from the previous evaluation.
    errorMarkers.forEach(function clearErrorMarker(m) {
      m.clear();
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

  function wrapNodeWithLogCall(arguments) {
    return {
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: logging_function_name },
        arguments: arguments,
      }
    }
  }

  function wrapNodeWithTryCatch(try_node, catch_node) {
    return {
      type: 'TryStatement',
      block: {
        type: 'BlockStatement',
        body: [ try_node ],
      },
      handler: {
        type: 'CatchClause',
        param: {
          type: 'Identifier',
          name: 'e'
        },
        body: {
          type: 'BlockStatement',
          body: [ catch_node ]
        }
      }
    };
  }

  function debounce(func, wait) {
    var timeout;
    return function() {
      clearTimeout(timeout);
      timeout = setTimeout(func, wait);
    };
  }

}());
