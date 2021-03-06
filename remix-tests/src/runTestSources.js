const async = require('async')
require('colors')

let Compiler = require('./compiler.js')
let Deployer = require('./deployer.js')
let TestRunner = require('./testRunner.js')

const Web3 = require('web3')
const Provider = require('remix-simulator').Provider

var createWeb3Provider = function () {
  let web3 = new Web3()
  web3.setProvider(new Provider())
  return web3
}

const runTestSources = function (contractSources, testCallback, resultCallback, finalCallback, importFileCb, opts) {
  opts = opts || {}
  let web3 = opts.web3 || createWeb3Provider()
  let accounts = opts.accounts || null
  async.waterfall([
    function getAccountList (next) {
      if (accounts) return next()
      web3.eth.getAccounts((_err, _accounts) => {
        accounts = _accounts
        next()
      })
    },
    function compile (next) {
        Compiler.compileContractSources(contractSources, importFileCb, { accounts }, next)
    },
    function deployAllContracts (compilationResult, next) {
      Deployer.deployAll(compilationResult, web3, function (err, contracts) {
        if (err) {
          next(err)
        }

        next(null, compilationResult, contracts)
      })
    },
    function determineTestContractsToRun (compilationResult, contracts, next) {
      let contractsToTest = []
      let contractsToTestDetails = []

      for (let filename in compilationResult) {
        if (filename.indexOf('_test.sol') < 0) {
          continue
        }

        var dict = compilationResult[filename]
        var items = Object.keys(dict).map(function (key) {
          return key
        })

         // Sort the array based on the second element
        items.sort(function (first, second) {
          return dict[first].evm.bytecode.sourceMap.split(':', 1) - dict[second].evm.bytecode.sourceMap.split(':', 1)
        })

        Object.keys(compilationResult[filename]).forEach(contractName => {
          contractsToTestDetails.push(compilationResult[filename][contractName])
          contractsToTest.push(contractName)
        })
      }

      next(null, contractsToTest, contractsToTestDetails, contracts)
    },
    function runTests (contractsToTest, contractsToTestDetails, contracts, next) {
      let totalPassing = 0
      let totalFailing = 0
      let totalTime = 0
      let errors = []

      var _testCallback = function (result) {
        if (result.type === 'testFailure') {
          errors.push(result)
        }
        testCallback(result)
      }

      var _resultsCallback = function (_err, result, cb) {
        resultCallback(_err, result, () => {})
        totalPassing += result.passingNum
        totalFailing += result.failureNum
        totalTime += result.timePassed
        cb()
      }

      async.eachOfLimit(contractsToTest, 1, (contractName, index, cb) => {
        TestRunner.runTest(contractName, contracts[contractName], contractsToTestDetails[index], { accounts }, _testCallback, (err, result) => {
          if (err) {
            return cb(err)
          }
          _resultsCallback(null, result, cb)
        })
      }, function (err, _results) {
        if (err) {
          return next(err)
        }

        let finalResults = {}

        finalResults.totalPassing = totalPassing || 0
        finalResults.totalFailing = totalFailing || 0
        finalResults.totalTime = totalTime || 0
        finalResults.errors = []

        errors.forEach((error, _index) => {
          finalResults.errors.push({context: error.context, value: error.value, message: error.errMsg})
        })

        next(null, finalResults)
      })
    }
  ], finalCallback)
}

module.exports = runTestSources
