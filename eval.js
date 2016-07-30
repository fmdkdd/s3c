/* eslint-env browser */
/* eslint no-underscore-dangle: 0, no-eval: 0 */

(function() {
  // Save these built-ins functions to prevent evaluated code from overriding
  // them.
  var String = this.String;
  var Error = this.Error;
  var Date = this.Date;
  var Number = this.Number;
  var Boolean = this.Boolean;
  var RegExp = this.RegExp;
  var m2f = Function.prototype.bind.bind(Function.prototype.call);
  var _eval = eval;
  var isArray = Array.isArray;
  var keys = Object.keys;
  var stringify = JSON.stringify;
  var map = m2f(Array.prototype.map);
  var join = m2f(Array.prototype.join);
  var replace = m2f(String.prototype.replace);
  var split = m2f(String.prototype.split);
  var slice = m2f(String.prototype.slice);
  var objectToString = m2f(Object.prototype.toString);
  var postMessage = this.postMessage;


  var isError = false;
  var errorMsg;

  function collect(value, locations) {
    locations.forEach(function(l) {
      postMessage({
        from: l.from,
        to: l.to,
        value: ' ' + value.toString(),
        isError: isError,
        errorMsg: errorMsg,
        // isError: r.isError,
      });
    })
  }

  this.M = collect;


  function evalCode(code) {
    // We run the code inside eval, rather than Function because eval returns
    // the value of the last expression, and not Function, so eval behaves more
    // like a REPL.  Using Function we would need to add a `return` statement to
    // the last expression, but that would mean parsing and modifying the code,
    // which we don't do here.
    //
    // The call to eval is indirect, and is thus executed in the global
    // environment of the web worker (so it cannot access the variables inside
    // this function).
    //
    // However, in client code, `self` is an alias to `this`, which is the
    // global context of the web worker.
    //
    // Client code should not be able to trigger an error in the worker, since
    // we only refer to saved versions of global objects.
    // var isError = false;
    var result = (function(){
      try { return _eval(code); }
      catch (e) { isError = true; return e; }
    }());

    result = (function prettyValue(v) {
      if (v == null)
        return v;

      else if (typeof v === 'function')
        return 'function' + (v.name ? ' ' + v.name : '');

      else if (typeof v === 'string'
               || typeof v === 'object' && v instanceof String)
        return '"' + v + '"';

      else if (isArray(v))
        return '[' + join(map(v, prettyValue), ',') + ']';

      else if (typeof v === 'object')
        return prettyObject(v);

      return v;

      function prettyObject(o) {
        if (o instanceof Error ||
            o instanceof Date ||
            o instanceof Number ||
            o instanceof Boolean ||
            o instanceof RegExp)
          return o;

        var cyclic = (function(){
          try {stringify(o); return false;}
          catch (e) { return true; }
        }());

        var className = slice(split(objectToString(o), ' ')[1], 0, -1);

        if (cyclic)
          return className + ' {cyclic}';

        var ks = keys(o);

        return className + ' {' + join(map(ks, function(k) {
          return k + ':' + prettyValue(o[k]);
        }), ',') + '}';
      }
    }(result));

    // pad
    result = ' ' + result;

    // shouldn't go over the current line
    result = replace(result, /\n|\r/g, ' ');

    errorMsg = result;

    return {result: result,
            isError: isError};
  }

  this.addEventListener('message', function(event) {
    var r = evalCode(event.data.code);
    // postMessage({
    //   id: event.data.id,
    //   result: r.result,
    //   isError: r.isError,
    // });
  });

}());
