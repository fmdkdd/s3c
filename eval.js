/* eslint-env browser */
/* eslint no-underscore-dangle: 0, no-eval: 0 */

(function() {
  function __evalCode(code) {
    var result = (function(__code){
      try { return (function(){return eval(__code);}()); }
      catch (e) { return e; }
    }(code));

    result = (function prettyValue(v) {
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
    }(result));

    // pad
    result = ' ' + result;

    // shouldn't go over the current line
    result = result.replace(/\n|\r/g, ' ');

    return result;
  }

  self.addEventListener('message', function(event) {
    postMessage({
      id: event.data.id,
      result: __evalCode(event.data.code),
    });
  });

}());
