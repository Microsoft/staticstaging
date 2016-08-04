# title: phong lighting
# mode: webgl
# ---

# Phong shader.
def phong(pos: Float3 Array, norm: Float3 Array, model: Mat4, lightpos: Vec3, color: Vec3, specular: Float) (
  var camera_pos = eye(view);

  vertex glsl<
    gl_Position = projection * view * model * vec4(pos, 1.0);

    fragment glsl<
      # Convert to world space.
      var position_world = vec3(model * vec4(pos, 1.0));
      var normal_world = normalize(vec3(model * vec4(norm, 0.0)));
      var view_dir_world = normalize(camera_pos - position_world);

      # Light.
      var light_direction = normalize(lightpos - position_world);

      # Diffuse.
      var ndl = vec3( max(0.0, dot(normal_world, light_direction)) );

      # Specular.
      var angle = normalize(view_dir_world + light_direction);
      var spec_comp_b = max(0.0, dot(normal_world, angle));
      var spec_comp = pow( spec_comp_b, max(1.0, specular) ) * 2.0;

      gl_FragColor = vec4(color * ndl + vec3(spec_comp), 1.0);
    >
  >;
);

# Simple, solid-color shader.
def solid(pos: Float3 Array, model: Mat4, color: Vec3) (
  vertex glsl<
    gl_Position = projection * view * model * vec4(pos, 1.0);
    fragment glsl<
      gl_FragColor = vec4(color, 1.0);
    >
  >;
);

# ---

# Load buffers and parameters for the main model.
var mesh = teapot;
var position = mesh_positions(mesh);
var normal = mesh_normals(mesh);
var indices = mesh_indices(mesh);
var size = mesh_size(mesh);

# Light-source marker model.
var b_position = mesh_positions(bunny);
var b_normal = mesh_normals(bunny);
var b_indices = mesh_indices(bunny);
var b_size = mesh_size(bunny);
var b_model = mat4.create();

# An identity matrix, which we'll use for model positioning.
var id = mat4.create();

# The parameters for the Phong shader.
var specular = 50.0;
var light_color = vec3(1.0, 0.2, 0.5);

render js<
  var t = Date.now();
  var light_position = vec3(
    Math.cos(t / 200) * 20.0,
    0.0,
    Math.sin(t / 200) * 20.0
  );

  phong(position, normal, id, light_position, light_color, specular);
  draw_mesh(indices, size);

  # Place the bunny at the light source, for illustrative purposes.
  mat4.translate(b_model, id, light_position);
  mat4.scale(b_model, b_model, vec3(0.1, 0.1, 0.1));
  solid(b_position, b_model, light_color);
  draw_mesh(b_indices, b_size);
>
