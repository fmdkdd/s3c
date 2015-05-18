/* eslint-env browser */
/* eslint no-underscore-dangle: 0, no-eval: 0 */

(function() {
  function __evalCode(__code) {
    // We run the code inside eval, rather than Function because eval returns
    // the value of the last expression, and not Function, so it behaves more
    // like a REPL.  Using Function we would need to add a `return` statement
    // to the last expression, but that would mean parsing and modifying the
    // code, which we don't do here.
    //
    // Because eval runs its argument in the current scope, we create a fresh
    // scope using an IIFE.  Unfortunately, the code will have the current
    // bindings in its scope, so we override them to `undefined` using the `var`
    // statement.  This is not the same as the binding being absent, as these
    // names will not trigger "TypeError: undefined" for instance, so we prefix
    // them with dunder to avoid surprises in client code.
    //
    // `self` is an alias to `this`, which is the global context of the web
    // worker.  We want the code to be able to access global objects like String,
    // Function, JSON, etc.  But `self` is a commonly-used word that can raise
    // unexpected behavior, so we hide it as well.
    //
    // The final trick is to pass the code via the arguments special keyword,
    // which prevents naming the naming the argument that we would not have been
    // able to hide.  But we can pretend the `arguments` binding does not exist
    // by adding it to the empty `var` statement.
    var __result = (function(){
      var self, __result, __evalCode, __code, arguments;
      try { return eval.call(null, arguments[0]); }
      catch (e) { return e; }
    }(__code));

    __result = (function prettyValue(v) {
      if (v == null)
        return v;

      else if (typeof v === 'function')
        return 'function' + (v.name ? ' ' + v.name : '');

      else if (typeof v === 'string'
               || typeof v === 'object' && v instanceof String)
        return '"' + v + '"';

      else if (Array.isArray(v))
        return '[' + v.map(prettyValue).join(',') + ']';

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
          try {JSON.stringify(o); return false;}
          catch (e) { return true; }
        }());

        var className = Object.prototype.toString
          .call(o)
          .split(' ')[1]
          .slice(0, -1);

        if (cyclic)
          return className + ' {cyclic}';

        var ks = Object.keys(o);

        return className + ' {' + ks.map(function(k) {
          return k + ':' + prettyValue(o[k]);
        }).join(',') + '}';
      }
    }(__result));

    // pad
    __result = ' ' + __result;

    // shouldn't go over the current line
    __result = __result.replace(/\n|\r/g, ' ');

    return __result;
  }

  self.addEventListener('message', function(event) {
    self.postMessage({
      id: event.data.id,
      result: __evalCode(event.data.code)
    });
  });

}());
