/* eslint-env browser */
/* global CodeMirror */

(function(){

  var delimiter = '//:';
  var timeout = 1000;

  document.addEventListener('DOMContentLoaded', init);

  var editor;

  function init() {
    editor = CodeMirror(document.body, {
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

    // Backup text when leaving page.  Restore from localStorage.
    var text = localStorage.getItem('backup');
    if (text) editor.setValue(text);

    window.addEventListener('beforeunload', function() {
      localStorage.setItem('backup', editor.getValue());
    });
  }

  var worker = null;
  var backlog = [];

  function write(marker, data, isError) {
    editor.replaceRange(data, marker.from, marker.to);
    if (isError) {
      // Line has changed, so the `to` marker is obsolete.
      var to = {
        line: marker.from.line,
        ch: marker.from.ch + data.length
      };
      editor.markText(marker.from, to, {className: 's3c-runtime-error'});
    }
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
      var m = backlog[event.data.id];
      clearTimeout(m.timeout);
      write(m, event.data.result, event.data.isError);
      delete backlog[event.data.id];
    };

    // Eval each block up to the delimiter
    var text = editor.getValue();
    var lines = text.split('\n');
    var code = '';

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

      worker.postMessage({
        id: id,
        code: code,
      });
    });
  }

}());
