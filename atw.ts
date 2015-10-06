/// <reference path="typings/node/node.d.ts" />
/// <reference path="src/interp.ts" />
/// <reference path="src/pretty.ts" />
/// <reference path="src/type.ts" />
/// <reference path="src/sugar.ts" />
/// <reference path="src/compile.ts" />
/// <reference path="src/backend_js.ts" />

let fs = require('fs');
let util = require('util');
let parser = require('./parser.js');

function parse(filename: string, f: (tree: SyntaxNode) => void) {
  fs.readFile(filename, function (err: any, data: any) {
    if (err) {
      console.log(err);
      process.exit(1);
    }
    let s = data.toString();

    let tree: SyntaxNode;
    try {
      tree = parser.parse(s);
    } catch (e) {
      if (e instanceof parser.SyntaxError) {
        let loc = e.location.start;
        console.log(
          'parse error at '
          + filename + ':' + loc.line + ',' + loc.column
          + ': ' + e.message
        );
        process.exit(1);
      } else {
        throw e;
      }
    }

    f(tree);
  });
}

function main() {
  let args = process.argv.slice(2);

  // Check for a verbose -v flag.
  let verbose = false;
  if (args[0] === "-v") {
    verbose = true;
    args.shift();
  }

  // And a compile -c flag.
  // TODO Use a real option parser.
  let compile = false;
  if (args[0] === "-c") {
    compile = true;
    args.shift();
  }

  // And, when compiling, actually execute the code.
  let execute = false;
  if (args[0] === "-x") {
    execute = true;
    args.shift();
  }

  // Get the filename.
  let fn = args.shift();
  if (!fn) {
    console.log("usage: " + process.argv[1] + " [-vc] PROGRAM");
    process.exit(1);
  }

  parse(fn, function (tree) {
    // Parse.
    try {
      if (verbose) {
        console.log(util.inspect(tree, false, null));
      }
    } catch (e) {
      console.log(e);
      return;
    }

    // Check and elaborate types.
    let elaborated : SyntaxNode;
    let type_table : TypeTable;
    try {
      [elaborated, type_table] = elaborate(tree);
      let [type, _] = type_table[elaborated.id];
      if (verbose) {
        console.log(pretty_type(type));
      }
    } catch (e) {
      console.log(e);
      return;
    }

    // Remove syntactic sugar.
    let sugarfree = desugar(elaborated, type_table);
    if (verbose) {
      console.log(util.inspect(sugarfree, false, null));
      let i = 0;
      for (let context of type_table) {
        console.log(i + ': ' + util.inspect(context, false, null));
        ++i;
      }
    }

    // Execute.
    if (compile) {
      // In verbose mode, show some intermediates.
      if (verbose) {
        let table = find_def_use(sugarfree);
        console.log('def/use: ' + util.inspect(table, false, null));

        let progs = quote_lift(sugarfree);
        console.log('progs: ' + util.inspect(progs, false, null));

        let [procs, main] = lambda_lift(sugarfree, table);
        console.log('procs: ' + util.inspect(procs, false, null));
        console.log('main: ' + util.inspect(main, false, null));
      }

      // Compile.
      let jscode: string;
      try {
        jscode = jscompile(sugarfree);
      } catch (e) {
        if (e === "unimplemented") {
          console.log(e);
          process.exit(1);
        } else {
          throw e;
        }
      }

      // Dump the resulting program or execute it.
      if (execute) {
        let res = eval(jscode);
        console.log(pretty_js_value(res));
      } else {
        console.log(jscode);
      }

    } else {
      // Interpret.
      console.log(pretty_value(interpret(sugarfree)));
    }
  });
}

main();
