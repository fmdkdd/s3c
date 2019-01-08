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
  var Map = this.Map;
  var Set = this.Set;
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
  var mapKeys = m2f(Map.prototype.keys);
  var mapGet = m2f(Map.prototype.get);
  var setKeys = m2f(Set.prototype.keys);
  var postMessage = this.postMessage;

  // Make a presentable string out of a JavaScript value.
  function prettyValue(v) {
    if (v == null) {
      return v;
    }

    else if (typeof v === 'function') {
      return 'function' + (v.name ? ' ' + v.name : '');
    }

    else if (typeof v === 'string'
             || typeof v === 'object' && v instanceof String) {
      return '"' + v + '"';
    }

    else if (typeof v === 'symbol') {
      return String(v);
    }

    else if (isArray(v)) {
      return '[' + join(map(v, prettyValue), ',') + ']';
    }

    else if (v instanceof Map) {
      return 'Map {' + join(map([...mapKeys(v)], function(k) {
        return prettyValue(k) + ' => ' + prettyValue(mapGet(v, k));
      }), ',') + '}';
    }

    else if (v instanceof Set) {
      return 'Set {' + join(map([...setKeys(v)], prettyValue), ',') + '}';
    }

    else if (typeof v === 'object') {
      return prettyObject(v);
    }

    else {
      return v;
    }

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

      // Object.toString returns a string of the form:
      //   '[object ClassName OptionalSomething]'
      // We extract the strings after 'object' and drop the brackets.
      var className = slice(objectToString(o), 8, -1);

      if (cyclic) {
        return className + ' {cyclic}';
      }

      var ks = keys(o);

      return className + ' {' + join(map(ks, function(k) {
        return k + ':' + prettyValue(o[k]);
      }), ',') + '}';
    }
  }

  function prettyStringForMarker(v) {
    var r = prettyValue(v);

    // left pad
    r = ' ' + r;

    // shouldn't go over the current line, otherwise it won't be part of the
    // comment line!
    r = replace(r, /\n|\r/g, ' ');

    return r;
  }

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
    var isError = false;
    var msg = (function(){
      try { _eval(code); }
      catch (e) { isError = true; return e; }
    }());

    var msgString = prettyStringForMarker(msg);

    return {
      isError: isError,
      errorMsg: msgString
    }

  }

  // The logging function that will capture expression values and send them
  // back.
  function log(value, idArray, isError) {
    idArray.forEach(function sendLogBack(id) {
      postMessage({
        type: 'log',
        id: id,
        result: prettyStringForMarker(value),
        isError: isError,
      });
    })

    return value;
  }

  this.addEventListener('message', function onMessage(event) {
    self[event.data.loggingFunctionName] = log;
    var r = evalCode(event.data.code);
    postMessage({
      type: 'evaluation_done',
      isError: r.isError,
      errorMsg: r.errorMsg
    })
  });

}());
