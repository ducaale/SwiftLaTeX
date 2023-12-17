import * as Comlink from 'comlink';

const EngineStatus = {
  Init: 1,
  Ready: 2,
  Busy: 3,
  Error: 4
}

class LaTeXEngine {
  latexWorker = undefined;
  latexWorkerProxy = undefined;
  latexWorkerStatus = EngineStatus.Init;

  constructor({extension, endpoint, workerPath}) {
    self.extension = extension
    self.endpoint = endpoint
    self.workerPath = workerPath
  }

  async loadEngine() {
    if (this.latexWorker !== undefined) {
      throw new Error('Other instance is running, abort()');
    }

    this.latexWorkerStatus = EngineStatus.Init;

    this.latexWorker = new Worker(self.workerPath);
    await new Promise((resolve) => {
      this.latexWorker.onmessage = (event) => {
        if (event.data === 'wasm_initialized') { resolve(); }
      }
    });

    this.latexWorkerProxy = Comlink.wrap(this.latexWorker);
    await this.latexWorkerProxy.setExtension(self.extension);
    await this.latexWorkerProxy.setTexliveEndpoint(self.endpoint);

    this.latexWorkerStatus = EngineStatus.Ready;
  }

  isReady() {
    return this.latexWorkerStatus === EngineStatus.Ready;
  }

  checkEngineStatus() {
    if (!this.isReady()) {
      throw Error('Engine is still spinning or not ready yet!');
    }
  }

  async compileLaTeX() {
    this.checkEngineStatus();
    this.latexWorkerStatus = EngineStatus.Busy;

    console.log('Engine compilation start');
    const startTime = performance.now();
    const {pdf, log, status} = await this.latexWorkerProxy.compileLaTeXRoutine();
    this.latexWorkerStatus = EngineStatus.Ready;
    console.log('Engine compilation finish ' + (performance.now() - startTime));

    return { status, log, pdf: new Uint8Array(pdf) };
  }

  async compilePDF() {
    this.checkEngineStatus();
    this.latexWorkerStatus = EngineStatus.Busy;

    console.log('Engine compilation start');
    const startTime = performance.now();
    const {pdf, log, status} = await this.latexWorkerProxy.compilePDFRoutine();
    this.latexWorkerStatus = EngineStatus.Ready;
    console.log('Engine compilation finish ' + (performance.now() - startTime));

    return { status, log, pdf: new Uint8Array(pdf) };
  }

  // TODO: compileFormat

  async setEngineMainFile(filename) {
    this.checkEngineStatus();
    if (this.latexWorker !== undefined) {
      await this.latexWorkerProxy.setMainFile(filename);
    }
  }

  async writeMemFSFile(filename, srccode) {
    this.checkEngineStatus();
    if (this.latexWorker !== undefined) {
      await this.latexWorkerProxy.writeFileRoutine(filename, srccode);
    }
  }

  async makeMemFSFolder(folder) {
    this.checkEngineStatus();
    if (this.latexWorker !== undefined) {
      if (folder === '' || folder === '/') {
        return;
      }
      await this.latexWorkerProxy.mkdirRoutine(folder);
    }
  }

  async flushCache() {
    this.checkEngineStatus();
    if (this.latexWorker !== undefined) {
      await this.latexWorkerProxy.flushCache();
    }
  }

  async setTexliveEndpoint(url) {
    if (this.latexWorker !== undefined) {
      await this.latexWorkerProxy.setTexliveEndpoint(url);
    }
  }

  closeWorker() {
    if (this.latexWorker !== undefined) {
      this.latexWorker.terminate();
      this.latexWorkerProxy[Comlink.releaseProxy]();
      this.latexWorker = undefined;
      this.latexWorkerProxy = undefined;
    }
  }
}

export class XeTeXEngine extends LaTeXEngine {
  constructor() {
    super({
      extension: '.xdv',
      endpoint: 'https://texlive2.swiftlatex.com/xetex/',
      workerPath: 'swiftlatexxetex.js'
    })
  }
}

export class DvipdfmxEngine extends LaTeXEngine {
  constructor() {
    super({
      extension: '.pdf',
      endpoint: 'https://texlive2.swiftlatex.com/xetex/',
      workerPath: 'swiftlatexdvipdfm.js'
    })
  }
}

export class PdfTeXEngine extends LaTeXEngine {
  constructor() {
    super({
      extension: '.pdf',
      endpoint: 'https://texlive2.swiftlatex.com/pdftex/',
      workerPath: 'swiftlatexpdftex.js'
    })
  }
}