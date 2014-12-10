/* eslint-env browser */

(function() {
  function __printFunction(f) {
    return 'function ' + f.name;
  }

  function __prettyPrint(result) {
    if (result == null) return result;
    else if (typeof result === 'function')
      return __printFunction(result);
    else {
      try {
        return JSON.stringify(result);
      } catch (e) {
        // Cyclic structure
        return 'cyclic object';
      }
    }
  }

  function evalCode(__data) {
    var __result;

    try {
      __result = (function(){return eval(__data.code);}());
    } catch (e) {
      __result = e.toString();
    }

    __result = __prettyPrint(__result);

    // pad
    __result = ' ' + __result;

    // shouldn't go over the current line
    __result = __result.replace(/\n/g, ' ');

    postMessage({
      mid: __data.mid,
      change: __result,
    });
  }

  self.onmessage = function(event) {
    evalCode(event.data);
  };

}());
