const Comlink = require('comlink')

const TEXCACHEROOT = "/tex";
const WORKROOT = "/work";

self.memlog = "";
self.initmem = undefined;
self.mainfile = "main.tex";
self.texlive_endpoint = undefined;
self.extension = undefined

var Module = {
  print(a) {
    self.memlog += (a + "\n");
  },
  printErr(a) {
    self.memlog += (a + "\n");
    console.log(a);
  },
  preRun() {
    FS.mkdir(TEXCACHEROOT);
    FS.mkdir(WORKROOT);
  },
  postRun() {
    self.postMessage('wasm_initialized');
    self.initmem = dumpHeapMemory();
  },
  onAbort() {
    self.memlog += 'Engine crashed';
    console.error('full log', self.memlog)
  }
};

function _allocate(content) {
    let res = _malloc(content.length);
    HEAPU8.set(new Uint8Array(content), res);
    return res; 
}

function dumpHeapMemory() {
  var src = wasmMemory.buffer;
  var dst = new Uint8Array(src.byteLength);
  dst.set(new Uint8Array(src));
  return dst;
}

function restoreHeapMemory() {
  if (self.initmem) {
    var dst = new Uint8Array(wasmMemory.buffer);
    dst.set(self.initmem);
  }
}

function closeFSStreams() {
  for (var i = 0; i < FS.streams.length; i++) {
    var stream = FS.streams[i];
    if (!stream || stream.fd <= 2) {
      continue;
    }
    FS.close(stream);
  }
}

function prepareExecutionContext() {
  self.memlog = '';
  restoreHeapMemory();
  closeFSStreams();
  FS.chdir(WORKROOT);
}

function cleanDir(dir) {
  let l = FS.readdir(dir);
  for (let i in l) {
    let item = l[i];
    if (item === "." || item === "..") {
      continue;
    }
    item = dir + "/" + item;
    let fsStat = undefined;
    try {
      fsStat = FS.stat(item);
    } catch (err) {
      console.error("Not able to fsstat " + item);
      continue;
    }
    if (FS.isDir(fsStat.mode)) {
      cleanDir(item);
    } else {
      try {
        FS.unlink(item);
      } catch (err) {
        console.error("Not able to unlink " + item);
      }
    }
  }

  if (dir !== WORKROOT) {
    try {
      FS.rmdir(dir);
    } catch (err) {
      console.error("Not able to top level " + dir);
    }
  }
}

function compileLaTeXRoutine() {
  prepareExecutionContext();
  const setMainFunction = cwrap('setMainEntry', 'number', ['string']);
  setMainFunction(self.mainfile);

  let status = _compileLaTeX();
  if (status === 0) {
    let pdfArrayBuffer = null;
    _compileBibtex();
    let pdfurl = WORKROOT + "/" + self.mainfile.substr(0, self.mainfile.length - 4) + self.extension;
    try {
      pdfArrayBuffer = FS.readFile(pdfurl, {
        encoding: 'binary'
      });
    } catch (err) {
      console.error("Fetch content failed. " + pdfurl);
      console.error("full log", self.memlog);
      return;
    }
    return { status, log: self.memlog, pdf: pdfArrayBuffer.buffer };
  } else {
    console.error("Compilation failed, with status code " + status);
    console.error("full log", self.memlog);
  }
}

function compilePDFRoutine() {
  prepareExecutionContext();
  const setMainFunction = cwrap('setMainEntry', 'number', ['string']);
  setMainFunction(self.mainfile);

  let status = _compilePDF();
  if (status === 0) {
    let pdfArrayBuffer = null;
    let pdfurl = WORKROOT + "/" + self.mainfile.substr(0, self.mainfile.length - 4) + ".pdf"
    try {
      pdfArrayBuffer = FS.readFile(pdfurl, {
        encoding: 'binary'
      });
    } catch (err) {
      console.error("Fetch content failed. ", + pdfurl);
      console.error("full log", self.memlog);
      return;
    }
    return { status, log: self.memlog, pdf: pdfArrayBuffer.buffer };
  } else {
    console.error("Compilation failed, with status code " + status);
    console.error("full log", self.memlog);
  }
}

Comlink.expose({
  compileLaTeXRoutine,
  compilePDFRoutine,
  mkdirRoutine(dirname) {
    FS.mkdir(WORKROOT + "/" + dirname);
  },
  writeFileRoutine(filename, content) {
    FS.writeFile(WORKROOT + "/" + filename, content);
  },
  setTexliveEndpoint(url) {
    self.texlive_endpoint = url;
  },
  setExtension(extension) {
    self.extension = extension;
  },
  setMainFile(url) {
    self.mainfile = url;
  },
  flushCache() {
    cleanDir(WORKROOT);
  }
});

let texlive404_cache = {};
let texlive200_cache = {};

function kpse_find_file_impl(nameptr, format) {
  let reqname = UTF8ToString(nameptr);

  // It is a hack , since webassembly version latex engine stores 
  // all templates file inside /tex/, therefore, we have to fetch it again
  if (reqname.startsWith("/tex/")) {
    reqname = reqname.substr(5);
  }

  if (reqname.includes("/")) {
    return 0;
  }

  const cacheKey = format + "/" + reqname;

  if (cacheKey in texlive404_cache) {
    return 0;
  }

  if (cacheKey in texlive200_cache) {
    const savepath = texlive200_cache[cacheKey];
    return _allocate(intArrayFromString(savepath));
  }

  const remote_url = self.texlive_endpoint + cacheKey;
  let xhr = new XMLHttpRequest();
  xhr.open("GET", remote_url, false);
  xhr.timeout = 150000;
  xhr.responseType = "arraybuffer";
  console.log("Start downloading texlive file " + remote_url);
  try {
    xhr.send();
  } catch (err) {
    console.log("TexLive Download Failed " + remote_url);
    return 0;
  }

  if (xhr.status === 200) {
    let arraybuffer = xhr.response;
    const fileid = xhr.getResponseHeader('fileid');
    const savepath = TEXCACHEROOT + "/" + fileid;
    FS.writeFile(savepath, new Uint8Array(arraybuffer));
    texlive200_cache[cacheKey] = savepath;
    return _allocate(intArrayFromString(savepath));

  } else if (xhr.status === 301) {
    console.log("TexLive File not exists " + remote_url);
    texlive404_cache[cacheKey] = 1;
    return 0;
  }
  return 0;
}

// TODO: implement kpse_find_pk_impl