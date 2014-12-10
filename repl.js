/* eslint-env browser */

(function(){

  var delimiter = '//:';
  var timeout = 1000;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    var editor = CodeMirror(document.body, {
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

  var workers = [];

  function reval(editor) {
    // Kill pending workers
    workers.forEach(function(w) {
      w.worker.terminate();
      clearTimeout(w.kill);
    });
    workers = [];

    var text = editor.getValue();
    var lines = text.split('\n');
    var code = '';

    lines.forEach(function(l, i) {
      code += l + '\n';

      var ev = l.indexOf('//:');
      if (ev === -1) return;

      var worker = new Worker('eval.js');
      var kill;
      worker.onmessage = function(event) {
        if (event.data === '!!started') {
          kill = setTimeout(function() {
            worker.terminate();
            write(' timeout');
          }, timeout);
        } else {
          clearTimeout(kill);
          write(event.data);
        }
      };

      workers.push({
        worker: worker,
        kill: kill,
      });

      worker.postMessage(code);

      function write(data) {
        editor.replaceRange(data,
                            {line: i, ch: ev + delimiter.length},
                            {line: i, ch: l.length});
      }
    });
  }

}());
