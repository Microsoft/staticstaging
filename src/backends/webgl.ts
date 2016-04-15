import { CompilerIR, Prog, Variant } from '../compile/ir';
import * as js from './js';
import * as glsl from './glsl';
import { Glue, get_glue, vtx_expr, render_expr, ProgKind, prog_kind,
  FLOAT4X4 } from './gl';
import { progsym, paren } from './emitutil';
import { Type, PrimitiveType } from '../type';
import { Emitter, emit, emit_main } from './emitter';
import { ASTVisit, ast_visit, compose_visit } from '../visit';
import * as ast from '../ast';

export const RUNTIME = `
// Shader management.
function compile_glsl(gl, type, src) {
  var shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    var errLog = gl.getShaderInfoLog(shader);
    console.error("error: compiling shader:", errLog);
  }
  return shader;
}
function get_shader(gl, vertex_source, fragment_source) {
  var vert = compile_glsl(gl, gl.VERTEX_SHADER, vertex_source);
  var frag = compile_glsl(gl, gl.FRAGMENT_SHADER, fragment_source);
  var program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    var errLog = gl.getProgramInfoLog(program);
    console.error("error linking program:", errLog);
  }
  return program;
}
function bind_attribute(gl, location, buffer) {
  if (!buffer) {
    throw "no buffer";
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(location);
}

// WebGL equivalents of GLSL functions.
function vec3(x, y, z) {
  var out = new Float32Array(3);
  out[0] = x || 0.0;
  out[1] = y || 0.0;
  out[2] = z || 0.0;
  return out;
}

function mat4mult(a, b) {
  var out = mat4.create();
  mat4.multiply(out, a, b);
  return out;
}
`.trim();

const GL_UNIFORM_FUNCTIONS: { [_: string]: string } = {
  "Int": "uniform1i",
  "Int3": "uniform3iv",
  "Int4": "uniform4iv",
  "Float": "uniform1f",
  "Float3": "uniform3fv",
  "Float4": "uniform4fv",
  "Float3x3": "uniformMatrix3fv",
  "Float4x4": "uniformMatrix4fv",
};

// Get a JavaScript variable name for a compiled shader program. Uses the ID
// of the outermost (vertex) shader Prog.
function shadersym(progid: number) {
  return "s" + progid;
}

// Get a JavaScript variable name to hold a shader location. Uses the ID of
// the corresponding escape expression inside the shader, or the defining
// variable ID for free variables. Also needs the ID of the quote.
function locsym(scopeid: number, escid: number) {
  return "s" + scopeid + "l" + escid;
}

function get_prog_pair(ir: CompilerIR, progid: number) {
  let vertex_prog = ir.progs[progid];

  // Get the fragment program.
  if (vertex_prog.quote_children.length > 1 ||
      vertex_prog.quote_children.length < 1) {
    throw "error: vertex quote must have exactly one fragment quote";
  }
  let fragment_prog = ir.progs[vertex_prog.quote_children[0]];

  return [vertex_prog, fragment_prog];
}

// Emit the JavaScript variable declaration for a *location value* pointing to
// a shader variable. The `scopeid` is the ID of the quote for the shader
// where the variable is located.
function emit_loc_var(scopeid: number, attribute: boolean, varname: string,
    varid: number):
  string
{
  let func = attribute ? "getAttribLocation" : "getUniformLocation";
  let shader = shadersym(scopeid);
  return js.emit_var(
    locsym(scopeid, varid),
    `gl.${func}(${shader}, ${js.emit_string(varname)})`
  );
}

// Emit the setup declarations for a shader program. Takes the ID of a vertex
// (top-level) shader program.
function emit_shader_setup(ir: CompilerIR, glue: Glue[][],
    progid: number): string
{
  let [vertex_prog, fragment_prog] = get_prog_pair(ir, progid);

  // Compile and link the shader program.
  let out = js.emit_var(
    shadersym(vertex_prog.id),
    `get_shader(gl, ${progsym(vertex_prog.id)}, ${progsym(fragment_prog.id)})`
  ) + "\n";

  // Get the variable locations, for both explicit persists and for free
  // variables.
  for (let g of glue[vertex_prog.id]) {
    out += emit_loc_var(vertex_prog.id, g.attribute, g.name, g.id) + "\n";
  }

  return out;
}

// Emit a single WebGL binding call for a uniform or attribute. Takes the
// value to bind as a pre-compiled JavaScript string. You also provide the ID
// of the value being sent and the ID of the variable in the shader.
function emit_param_binding(scopeid: number, type: Type, varid: number,
    value: string, attribute: boolean): string
{
  if (!attribute) {
    if (type instanceof PrimitiveType) {
      let fname = GL_UNIFORM_FUNCTIONS[type.name];
      if (fname === undefined) {
        throw "error: unsupported uniform type " + type.name;
      }

      // Construct the call to gl.uniformX.
      let is_matrix = fname.indexOf("Matrix") !== -1;
      let locname = locsym(scopeid, varid);
      let out = `gl.${fname}(${locname}`;
      if (is_matrix) {
        // Transpose parameter.
        out += ", false";
      }
      out += `, ${paren(value)})`;
      return out;
    } else {
      throw "error: uniforms must be primitive types";
    }

  // Array types are bound as attributes.
  } else {
    if (type instanceof PrimitiveType) {
      // Call our runtime function to bind the attribute. The parameters are
      // the WebGL context, the attribute location, and the buffer.
      return `bind_attribute(gl, ${locsym(scopeid, varid)}, ${paren(value)})`;
      // TODO Actually use the type.
    } else {
      throw "error: attributes must be primitive types";
    }
  }
}

// Emit the JavaScript code to bind a shader (i.e., to tell WebGL to use the
// shader). This includes both the `useProgram` call and the `bindX` calls to
// set up the uniforms and attributes.
function emit_shader_binding(emitter: GLEmitter,
    progid: number) {
  let [vertex_prog, fragment_prog] = get_prog_pair(emitter.ir, progid);

  // Bind the shader program.
  let out = `gl.useProgram(${shadersym(vertex_prog.id)})`;

  // Emit and bind the uniforms and attributes.
  for (let g of emitter.glue[progid]) {
    let value: string;
    if (g.value_name) {
      value = g.value_name;
    } else {
      value = paren(emit(emitter, g.value_expr));
    }
    out += ",\n" + emit_param_binding(vertex_prog.id, g.type, g.id, value,
        g.attribute);
  }

  return out;
}

// Extend the JavaScript compiler with some WebGL specifics.
let compile_rules: ASTVisit<GLEmitter, string> =
  compose_visit(js.compile_rules, {
    // Compile calls to our intrinsics for binding shaders.
    visit_call(tree: ast.CallNode, emitter: GLEmitter): string {
      // Check for the intrinsic that indicates a shader invocation.
      if (vtx_expr(tree)) {
        // For the moment, we require a literal quote so we can statically
        // emit the bindings.
        if (tree.args[0].tag === "quote") {
          let quote = tree.args[0] as ast.QuoteNode;
          return emit_shader_binding(emitter, quote.id);
        } else {
          throw "dynamic `vtx` calls unimplemented";
        }

      // And our intrinsic for indicating the rendering stage.
      } else if (render_expr(tree)) {
        // Pass through the code argument.
        return emit(emitter, tree.args[0]);
      }

      // An ordinary function call.
      return ast_visit(js.compile_rules, tree, emitter);
    },

    visit_binary(tree: ast.BinaryNode, emitter: GLEmitter): string {
      // If this is a matrix/matrix multiply, emit a function call.
      if (tree.op === "*") {
        let [typ,] = emitter.ir.type_table[tree.id];
        if (typ === FLOAT4X4) {
          let lhs = paren(emit(emitter, tree.lhs));
          let rhs = paren(emit(emitter, tree.rhs));
          return `mat4mult(${lhs}, ${rhs})`;
        }
      }

      // Otherwise, use the ordinary JavaScript backend.
      return ast_visit(js.compile_rules, tree, emitter);
    },
  });

function compile(tree: ast.SyntaxNode, emitter: GLEmitter): string {
  return ast_visit(compile_rules, tree, emitter);
};

// Our WebGL emitter also has a function to emit GLSL code and a special
// summary of the cross-stage communication.
interface GLEmitter extends Emitter {
  glue: Glue[][],
}

function emit_glsl_prog(emitter: GLEmitter, prog: Prog): string {
  let out = "";

  // Emit subprograms.
  for (let subid of prog.quote_children) {
    let subprog = emitter.ir.progs[subid];
    if (subprog.annotation !== "s") {
      throw "error: subprograms not allowed in shaders";
    }
    out += emit_glsl_prog(emitter, subprog);
  }

  // Emit the shader program.
  let code = glsl.compile_prog(emitter.ir, emitter.glue, prog.id);
  out += js.emit_var(progsym(prog.id), js.emit_string(code), true) + "\n";

  // If it's a *vertex shader* quote (i.e., a top-level shader quote),
  // emit its setup code too.
  if (prog_kind(emitter.ir, prog.id) === ProgKind.vertex) {
    out += emit_shader_setup(emitter.ir, emitter.glue, prog.id);
  }

  return out;
}

// Compile the IR to a JavaScript program that uses WebGL and GLSL.
export function codegen(ir: CompilerIR): string {
  // Make some additional decisions about communication between shader stages.
  let glue: Glue[][] = [];
  for (let prog of ir.progs) {
    if (prog !== undefined) {
      if (prog.annotation === "s") {
        glue[prog.id] = get_glue(ir, prog);
      }
    }
  }

  let emitter: GLEmitter = {
    ir: ir,
    compile: compile,
    emit_proc: js.emit_proc,

    emit_prog(emitter: GLEmitter, prog: Prog) {
      // Choose between emitting JavaScript and GLSL.
      if (prog.annotation == "s") {
        return emit_glsl_prog(emitter, prog);
      } else {
        return js.emit_prog(emitter, prog);
      }
    },

    emit_prog_variant(emitter: Emitter, variant: Variant, prog: Prog) {
      // No GLSL variants yet.
      return js.emit_prog_variant(emitter, variant, prog);
    },
    glue: glue,
  };

  // Wrap up the setup code with the main function(s).
  return js.emit_main_wrapper(emit_main(emitter), false);
}
