import Module from 'module';
import * as electronStub from './stubs/electron.js';

// Hook Node's Module.prototype.require to intercept CommonJS require('electron')
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id, ...args) {
  if (id === 'electron') {
    return {
      ...electronStub,
      default: electronStub,
    };
  }
  return originalRequire.call(this, id, ...args);
};
