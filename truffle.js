module.exports = {
  rpc: {
    host: 'localhost',
    port: 8545,
    gas: 4000000,
    // Gas price used for deploys. Default is 100000000000
    gasPrice: 0,
  },
  mocha: {
    reporter: 'spec',
  },
};
