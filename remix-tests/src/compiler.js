/* eslint no-extend-native: "warn" */
let fs = require('fs')
var async = require('async')
var path = require('path')
let RemixCompiler = require('remix-solidity').Compiler

String.prototype.regexIndexOf = function (regex, startpos) {
  var indexOf = this.substring(startpos || 0).search(regex)
  return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf
}

function writeTestAccountsContract (accounts) {
  var testAccountContract = require('../sol/tests_accounts.sol.js')
  var body = 'address[' + accounts.length + '] memory accounts;'
  if (!accounts.length) body += ';'
  else {
    accounts.map((address, index) => {
      body += `\naccounts[${index}] = ${address};\n`
    })
  }
  return testAccountContract.replace('>accounts<', body)
}

var userAgent = (typeof (navigator) !== 'undefined') && navigator.userAgent ? navigator.userAgent.toLowerCase() : '-'
var isBrowser = !(typeof (window) === 'undefined' || userAgent.indexOf(' electron/') > -1)

// TODO: replace this with remix's own compiler code
function compileFileOrFiles (filename, isDirectory, opts, cb) {
  let compiler, filepath
  let accounts = opts.accounts || []
  const sources = {
    'tests.sol': { content: require('../sol/tests.sol.js') },
    'remix_tests.sol': { content: require('../sol/tests.sol.js') },
    'remix_accounts.sol': { content: writeTestAccountsContract(accounts) }
  }
  // TODO: for now assumes filepath dir contains all tests, later all this
  // should be replaced with remix's & browser solidity compiler code
  filepath = (isDirectory ? filename : path.dirname(filename))

  fs.readdirSync(filepath).forEach(file => {
    // only process .sol files
    if (file.split('.').pop() === 'sol') {
      let c = fs.readFileSync(path.join(filepath, file)).toString()
      const s = /^(import)\s['"](remix_tests.sol|tests.sol)['"];/gm
      let includeTestLibs = '\nimport \'remix_tests.sol\';\n'
      if (file.indexOf('_test.sol') > 0 && c.regexIndexOf(s) < 0) {
        c = includeTestLibs.concat(c)
      }
      sources[file] = { content: c }
    }
  })

  async.waterfall([
    function loadCompiler (next) {
      compiler = new RemixCompiler()
      compiler.onInternalCompilerLoaded()
      // compiler.event.register('compilerLoaded', this, function (version) {
      next()
      // });
    },
    function doCompilation (next) {
      compiler.event.register('compilationFinished', this, function (success, data, source) {
        next(null, data)
      })
      compiler.compile(sources, filepath)
    }
  ], function (err, result) {
    let errors = (result.errors || []).filter((e) => e.type === 'Error' || e.severity === 'error')
    if (errors.length > 0) {
      if (!isBrowser) require('signale').fatal(errors)
      return cb(result.errors)
    }
    cb(err, result.contracts)
  })
}

function compileContractSources (sources, importFileCb, opts, cb) {
  let compiler, filepath
  let accounts = opts.accounts || []
  // Iterate over sources keys. Inject test libraries. Inject test library import statements.
  if (!('remix_tests.sol' in sources) && !('tests.sol' in sources)) {
    sources['remix_tests.sol'] = { content: require('../sol/tests.sol.js') }
    sources['remix_accounts.sol'] = { content: writeTestAccountsContract(accounts) }
  }
  const s = /^(import)\s['"](remix_tests.sol|tests.sol)['"];/gm
  let includeTestLibs = '\nimport \'remix_tests.sol\';\n'
  for (let file in sources) {
    const c = sources[file].content
    if (file.indexOf('_test.sol') > 0 && c && c.regexIndexOf(s) < 0) {
      sources[file].content = includeTestLibs.concat(c)
    }
  }

  async.waterfall([
    function loadCompiler (next) {
      compiler = new RemixCompiler(importFileCb)
      compiler.onInternalCompilerLoaded()
      // compiler.event.register('compilerLoaded', this, function (version) {
      next()
      // });
    },
    function doCompilation (next) {
      compiler.event.register('compilationFinished', this, function (success, data, source) {
        next(null, data)
      })
      compiler.compile(sources, filepath)
    }
  ], function (err, result) {
    let errors = (result.errors || []).filter((e) => e.type === 'Error' || e.severity === 'error')
    if (errors.length > 0) {
      if (!isBrowser) require('signale').fatal(errors)
      return cb(result.errors)
    }
    cb(err, result.contracts)
  })
}

module.exports = {
  compileFileOrFiles: compileFileOrFiles,
  compileContractSources: compileContractSources
}
