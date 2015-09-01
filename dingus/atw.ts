/// <reference path="../src/interp.ts" />
/// <reference path="../src/pretty.ts" />
/// <reference path="../src/type.ts" />

declare var parser : any;

const RUN_DELAY_MS = 200;
const HASH_CODE = '#code=';

// Run code and return:
// - an error, if any
// - the parse tree
// - the type
// - the result of interpretation
function atw_run(code: string) : [string, string, string, string] {
  // Parse.
  let tree: SyntaxNode;
  try {
    tree = parser.parse(code);
  } catch (e) {
    let err = 'parse error at '
              + e.line + ',' + e.column
              + ': ' + e.message;
    return [err, null, null, null];
  }

  // Log the parse tree.
  let parse_tree : string;
  try {
    parse_tree = JSON.stringify(tree, null, '  ');
  } catch (e) {
    return [e, null, null, null];
  }

  // Log the type.
  let type_str : string;
  try {
    type_str = pretty_type(typecheck(tree));
  } catch (e) {
    return [e, parse_tree, null, null];
  }

  // Show the result value.
  return [
    null,
    parse_tree,
    type_str,
    pretty_value(interpret(tree)),
  ];
}

function show(text: string, el: HTMLElement) {
  if (text) {
    el.textContent = text;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

document.addEventListener("DOMContentLoaded", function () {
  let codebox = <HTMLTextAreaElement> document.querySelector('textarea');
  let errbox = <HTMLElement> document.querySelector('#error');
  let treebox = <HTMLElement> document.querySelector('#tree');
  let typebox = <HTMLElement> document.querySelector('#type');
  let outbox = <HTMLElement> document.querySelector('#result');

  function run_code() {
    let code = codebox.value;
    if (code !== "") {
      let [err, tree, typ, res] = atw_run(code);
      show(err, errbox);
      show(tree, treebox);
      show(typ, typebox);
      show(res, outbox);
      location.hash = HASH_CODE + encodeURIComponent(code);
    } else {
      show(null, errbox);
      show(null, treebox);
      show(null, typebox);
      show(null, outbox);
      location.hash = '';
    }
  }

  function handle_hash() {
    let hash = location.hash;
    if (hash.indexOf(HASH_CODE) == 0) {
      codebox.value = decodeURIComponent(hash.slice(HASH_CODE.length));
    } else {
      codebox.value = '';
    }
    run_code();
  }

  let tid : number = null;
  codebox.addEventListener('input', function () {
    if (tid) {
      clearTimeout(tid);
    }
    tid = setTimeout(run_code, RUN_DELAY_MS);
  });

  window.addEventListener('hashchange', function () {
    handle_hash();
  });

  handle_hash();
});
