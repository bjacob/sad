var pseudorandomstate = 0;

function ResetPseudoRandomState() {
  pseudorandomstate = 0;
}

function PseudoRandom() {
  pseudorandomstate = 331 * pseudorandomstate + 0.654321;
  pseudorandomstate -= Math.floor(pseudorandomstate);
  return pseudorandomstate;
}

function round(x) {
  return x.toPrecision(4);
}

function Test() {
  this.canvas = document.createElement("canvas");
  this.canvas.width = 256;
  this.canvas.height = 256;
  document.body.appendChild(this.canvas);
  this.gl = this.canvas.getContext("webgl");
  this.paths = [];

  this.iters = 1;
  this.frameIndex = 0;
  this.maxtiming = 0;
  this.firsttime = true;
}

Test.prototype.addPath = function(path) {
  this.paths.push(path);
}

Test.prototype.runPath = function(pathIndex, numIters) {
  var gl = this.gl;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  ResetPseudoRandomState();
  this.paths[pathIndex].drawFunc(numIters);
}

Test.prototype.testdrive = function() {
  var gl = this.gl;
  var w = gl.drawingBufferWidth;
  var h = gl.drawingBufferHeight;
  var s = w * h * 4;

  var referencePixels = new Uint8Array(s);
  var pixels = new Uint8Array(s);

  for (var pathIndex = 0; pathIndex < this.paths.length; pathIndex++) {
    this.runPath(pathIndex, 2);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE,
                  pathIndex == 0 ? referencePixels : pixels);
    if (pathIndex > 0) {
      for (var byte = 0; byte < s; byte++) {
        if (pixels[byte] != referencePixels[byte]) {
          throw "rendering differs between unified-shader and separate-shaders paths!";
        }
      }
    }
  }
}

Test.prototype.rafcallback = function() {
  if (this.firsttime) {
    this.testdrive();
    this.firsttime = false;
    requestAnimationFrame(this.rafcallback.bind(this));
    return;
  }
  var pathIndex = this.frameIndex % this.paths.length;
  if (pathIndex == 0 && (this.maxtiming > 100 || this.iters > 100000)) {
    this.finish();
    return;
  }
  if (pathIndex == 0) {
    this.iters *= 2;
  }

  this.gl.finish();
  var time_before = performance.now();
  this.runPath(pathIndex, this.iters);
  this.gl.finish();
  var time_after = performance.now();
  var timing = time_after - time_before;
  this.paths[pathIndex].timing = timing;
  this.paths[pathIndex].iterations = this.iters;
  this.maxtiming = Math.max(this.maxtiming, timing);

  this.frameIndex++;
  requestAnimationFrame(this.rafcallback.bind(this));
}

Test.prototype.finish = function() {
  var body = document.getElementById("b");
  body.style="";
  var resultdiv = document.createElement("div");
  body.appendChild(resultdiv);

  var resulthtml = "";

  this.paths.sort(function(a, b) { return a.timing > b.timing; });

  resulthtml += "Fastest: " + this.paths[0].description + "<br/><br/>";

  var iterations = this.paths[0].iterations;
  for (var i = 0; i < this.paths.length; i++) {
    if (this.paths[i].iterations != iterations) {
      throw "Didn't run the same number of iterations on all paths!";
    }
  }

  resulthtml += "Timings for " + iterations + " iterations:<br/><br/>";

  for (var i = 0; i < this.paths.length; i++) {
    resulthtml += this.paths[i].description + ": " + round(this.paths[i].timing) + "<br/>";
  }

  resultdiv.innerHTML = resulthtml;
}

Test.prototype.run = function() {
  requestAnimationFrame(this.rafcallback.bind(this));
}

function Shader(gl, id) {
  this.gl = gl;
  var element = document.getElementById(id);
  if (element.type == "x-shader/x-vertex") {
    this.shader = gl.createShader(gl.VERTEX_SHADER);
  } else if (element.type == "x-shader/x-fragment") {
    this.shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else {
    throw "bad shader type: " + element.type;
  }
  gl.shaderSource(this.shader, element.text);
  gl.compileShader(this.shader);
}

function Program(gl, vs, fs, attribs, uniforms) {
  this.gl = gl;
  this.program = gl.createProgram();
  gl.attachShader(this.program, vs.shader);
  gl.attachShader(this.program, fs.shader);
  gl.linkProgram(this.program);
  for (a in attribs) {
    this[attribs[a]] = gl.getAttribLocation(this.program, attribs[a]);
  }
  for (u in uniforms) {
    this[uniforms[u]] = gl.getUniformLocation(this.program, uniforms[u]);
  }
}

Program.prototype.use = function() {
  this.gl.useProgram(this.program);
}

function Texture(gl, img) {
  this.gl = gl;
  this.texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, this.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // so it works with this non-power-of-two texture
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
}

Texture.prototype.bindOnTextureUnit = function(texUnit) {
  this.gl.activeTexture(this.gl.TEXTURE0 + texUnit);
  this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
}

function ArrayBuffer(gl, array) {
  this.gl = gl;
  this.buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(array), gl.STATIC_DRAW);
}

ArrayBuffer.prototype.bind = function() {
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
}
