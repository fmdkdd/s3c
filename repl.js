/* eslint-env browser */

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
      //    gutters: ["CodeMirror-lint-markers"],
      //    lint: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      extraKeys: {
        "Ctrl-Enter": function() {
          reval(editor);
        },
      },
    });

    // Backup text when leaving page.  Restore from localStorage.
    var text = localStorage.getItem('backup');
    if (text)
      editor.setValue(text);

    window.addEventListener('beforeunload', function() {
      localStorage.setItem('backup', editor.getValue());
    });
  }

  var worker = null;
  var markeds = [];

  function write(message, data) {
    editor.replaceRange(data, message.from, message.to);
  }

  function killWorker(eachMark) {
    return function() {
      worker.terminate();
      worker = null;

      markeds.forEach(function(m) {
        clearTimeout(m.kill);
        eachMark(m);
      });
      markeds = [];
    };
  }

  function reval(editor) {
    // Kill existing worker
    if (worker) {
      killWorker(function(){})();
    }

    // Create new worker
    if (worker == null) {
      worker = new Worker('eval.js');

      worker.onmessage = function(event) {
        var m = markeds[event.data.mid];
        clearTimeout(m.kill);
        write(m, event.data.change);
        delete markeds[event.data.mid];
      };
    }

    var text = editor.getValue();
    var lines = text.split('\n');
    var code = '';

    lines.forEach(function(l, i) {
      code += l + '\n';

      var ev = l.indexOf('//:');
      if (ev === -1) return;

      var mid = markeds.length;
      markeds[mid] = {
        code: code,
        from: {line: i, ch: ev + delimiter.length},
        to: {line: i, ch: l.length},
        kill: setTimeout(killWorker(function(m) { write(m, ' timeout'); }), timeout),
      };

      worker.postMessage({
        mid: mid,
        code: code,
      });
    });
  }

}());
