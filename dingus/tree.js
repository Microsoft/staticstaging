// Adapted from the D3 example at:
// http://www.d3noob.org/2014/01/tree-diagrams-in-d3js_11.html

var diagonal = d3.svg.diagonal()
 .projection(function(d) { return [d.y, d.x]; });

var margin_left = 75;

function tree_canvas(where, get_name, get_children) {
  var container = d3.select(where);

  // Set our size based on the size of the container.
  var rect = container.node().getBoundingClientRect();
  var width = rect.width;
  var height = rect.height;

  // Create an SVG context to draw into.
  var svg = container.append("svg")
   .attr("width", width)
   .attr("height", height)
    .append("g")
   .attr("transform", "translate(" + margin_left + ",0)");

  // Create the tree layout.
  var tree = d3.layout.tree()
   .size([height, width]);

  // Tell the layout how to find children.
  tree.children(get_children);

  return function(tree_data) {
    // Compute the new tree layout.
    var nodes = tree.nodes(tree_data).reverse(),
     links = tree.links(nodes);

    // Dictate the distance between "layers" in the tree.
    nodes.forEach(function(d) { d.y = d.depth * 50; });

    // Declare the nodes.
    var i = 0;
    svg.selectAll("g.node").remove();  // UGLY
    var node = svg.selectAll("g.node")
     .data(nodes, function(d) { return d.id || (d.id = ++i); });

    // Enter the nodes.
    var nodeEnter = node.enter().append("g")
     .attr("class", "node")
     .attr("transform", function(d) {
      return "translate(" + d.y + "," + d.x + ")"; });

    nodeEnter.append("circle")
     .attr("r", 10)
     .style("fill", "#fff");

    nodeEnter.append("text")
     .attr("x", function(d) {
      return d.children || d._children ? -13 : 13; })
     .attr("dy", ".35em")
     .attr("text-anchor", function(d) {
      return d.children || d._children ? "end" : "start"; })
     .text(get_name)
     .style("fill-opacity", 1);

    // Declare the links.
    svg.selectAll("path.link").remove();  // UGLY
    var link = svg.selectAll("path.link")
     .data(links, function(d) { return d.target.id; });

    // Enter the links.
    link.enter().insert("path", "g")
     .attr("class", "link")
     .attr("d", diagonal);
  };
}
