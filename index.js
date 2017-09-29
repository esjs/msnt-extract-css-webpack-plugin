const path = require('path');

const ExtractTextPlugin = require('extract-text-webpack-plugin');
const Chunk = require("webpack/lib/Chunk");
const ExtractedModule = require("extract-text-webpack-plugin/ExtractedModule");
const SortableSet = require("webpack/lib/util/SortableSet");

class ExtractTextPluginCSS extends ExtractTextPlugin {
  constructor(ExtractTextPluginParams, params) {
    super(ExtractTextPluginParams);

    this.commonChunkPrefix = 'etpcss_chunk_';

    this.filenameChunk = params.filenameChunk || 'common-[index].css'
  }
  
  apply(compiler) {
    compiler.plugin('compilation', compilation => {
      var _extractedChunks = [];

      compilation.plugin('optimize-extracted-chunks', extractedChunks => {
        let chunkRequiredModules = {};
        let availableModules = {};
        // let modulesOrder = []; // correct modules load order

        extractedChunks.forEach(chunk => {
          let originalChunk = chunk.originalChunk;
          
          chunkRequiredModules[originalChunk.name] = [];

          // DO we need reorder like in extract-text-webpack-plugin?

          chunk.modules.forEach(mod => {
            if (!availableModules[mod._identifier]) {
              availableModules[mod._identifier] = mod.source();

              // modulesOrder.push(mod._identifier);
            }
            chunkRequiredModules[originalChunk.name].push(mod._identifier);
          });
        });

        this.updateAvailableModulesUsage(availableModules, chunkRequiredModules);

        let commonChunksCount = this.assignCommonIndexToAvailableModules(availableModules);

        _extractedChunks = this.extractCommonChunks(compilation, extractedChunks, availableModules, commonChunksCount);
        
        // override to prevent additional files for ExtractTextPlugin
        extractedChunks.length = 0;
      });

      compilation.plugin("additional-assets", callback => {
        _extractedChunks.forEach(chunk => {
          if(!chunk.modules.length) return;

          var source = this.renderExtractedChunk(chunk);
          var filename;

          if (chunk.name.includes(this.commonChunkPrefix)) {
            filename = this._getChunkPath(compilation, chunk);
          } else {
            filename = compilation.getPath(this.filename, {
              chunk: chunk
            });
          }

          compilation.assets[filename] = source;
          // debugger;
          chunk.files.push(filename);
        });

        callback();
      });
    });

    super.apply(compiler);
  }

  updateAvailableModulesUsage(modules, chunks) {
    for (const modIndex in modules) {
      let mod = modules[modIndex];
      mod.usedBy = [];

      for (const entry in chunks) {
        chunks[entry].forEach(dependency => {
          if (modIndex === dependency) {
            mod.usedBy.push(entry);
          }
        });
      }
    }
  }

  assignCommonIndexToAvailableModules(modules) {
    var index = 0,
        commonModulesIndex = {};

    // FIXME: this doesn't take into count media queries
    // of import statements which can break styles

    for (let modIndex in modules) {
      let mod = modules[modIndex],
          modKey = mod.usedBy.join('_');

      if (mod.usedBy.length === 1) continue;

      if (!commonModulesIndex.hasOwnProperty(modKey)) {
        mod.commonChunkId = index;
        commonModulesIndex[modKey] = index++;
      } else {
        mod.commonChunkId = commonModulesIndex[modKey];
      }
    }

    // return common chunks count
    return index;
  }

  calculateCommonChunks(modules) {
    var modulesUsage = {};

    for (const modIndex in modules) {
      let mod = modules[modIndex],
          moduleCombinedKey = mod.usedBy.join('_');

      if (!modulesUsage.hasOwnProperty(moduleCombinedKey)) {
        modulesUsage[moduleCombinedKey] = [mod._value];
      } else {
        modulesUsage[moduleCombinedKey].push(mod._value);
      }
    }

    return modulesUsage;
  }

  _getChunkPath(compilation, chunk, relative) {
    var index = chunk.name.replace(this.commonChunkPrefix, ''),
        targetPath = this.filenameChunk;

    if (relative) {
      targetPath = path.posix.relative(path.dirname(this.filename), this.filenameChunk);
    }
    
    var filename = compilation.getPath(targetPath, {
      chunk: chunk
    });

    return filename.replace(/\[index\]/, index);

    // return this.filenameChunk.replace(/\[index\]/, index);
  }

  extractCommonChunks(compilation, extractedChunks, availableModules, commonChunksCount) {
    var commonChunks = [],
        extractedModules = [];

    // create chunks for common modules
    for (let i = 0; i < commonChunksCount; i++) {
      commonChunks.push(new Chunk(`${this.commonChunkPrefix}${i}`));
    }

    extractedChunks.forEach(chunk => {
      var requiredCommonChunks = [];
      chunk.modules.forEach(mod => {
        var commonChunkId = availableModules[mod._identifier].commonChunkId;
        
        // if module shouldn't be extractet to common chunk, skip immidiatelly
        if (commonChunkId === undefined) return;

        // remove module from chunk, it will be extracted to common chunk
        chunk.removeModule(mod);

        // track extracted modules required by this chunk
        if (!requiredCommonChunks.includes(commonChunkId)) {
          requiredCommonChunks.push(commonChunkId);
        }

        // if module already extracted - continue
        if (extractedModules.includes(mod._identifier)) return;

        extractedModules.push(mod._identifier);

        debugger;
        
        // TODO: additionalInformation
        var newModule = new ExtractedModule(commonChunkId, mod, mod.source().source());

        // add extracted module to corresponding common chunk
        commonChunks[commonChunkId].addModule(newModule);
      });
      
      // if we have extracted modules we need to add imports instead of them
      if (requiredCommonChunks.length) {
        // convert chunk modules to array to have unshift operation
        // which is missing in Sets
        var modulesArray = Array.from(chunk.modules);
        requiredCommonChunks.reverse().forEach(commonChunkId => {
          var module = new ExtractedModule(`css-import-module-${commonChunkId}`, null, `@import "${this._getChunkPath(compilation, commonChunks[commonChunkId], true)}";\n`);

          modulesArray.unshift(module);
        });
        // override original seta
        chunk.modules = new SortableSet(modulesArray);
      }
    });

    return extractedChunks.concat(commonChunks);
  }
}

module.exports = ExtractTextPluginCSS;