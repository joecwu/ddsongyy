# Event watcher example for the RewardDistributor contract

* Includes hardcoded ABI for RewardDistributor contract `0x16c60a50c0d9e2c191370e42aa9d2fb22b99f1fb`
* Uses web3 javascript library
* Run it with `node`
* We are using Infura endpoint `wss://ropsten.infura.io/ws` for Ropstan websocket

To run it, you need to ensure you have a local [geth](https://github.com/ethereum/go-ethereum) up and running.

```
npm install
node event_watcher.js
```

When an event is fired, an example looks like this.
```
$ node event_watcher.js 

{"address":"0x16C60A50c0d9E2C191370E42aA9d2FB22B99F1fB","blockNumber":4498435,"transactionHash":"0xad80ae6b993b6172c9f7a6dad1b7d6b053b778d55596aa0624256657a6284b36","transactionIndex":6,"blockHash":"0x40bc90effad300b780924a0e3fb07860ec7a054f6b9eabbcf2157ba50938ac48","logIndex":9,"removed":false,"id":"log_24d99f93","returnValues":{"0":"0xfa7bd28B71fCC26396cEAd29B344130925c76503","1":"0xfa7bd28B71fCC26396cEAd29B344130925c76503","2":"QmWkq4e1dnzqcapCca6rYn8scPPhzb6YL6MUgG66Hom6Qs","3":"282565000000","accesser":"0xfa7bd28B71fCC26396cEAd29B344130925c76503","dataowner":"0xfa7bd28B71fCC26396cEAd29B344130925c76503","ipfsMetadataHash":"QmWkq4e1dnzqcapCca6rYn8scPPhzb6YL6MUgG66Hom6Qs","tokenCost":"282565000000"},"event":"PurchaseTxRecord","signature":"0xa3befe72bc9cef7405d0f78a12f282694027a4c40b3a8ed0839a121be48c766a","raw":{"data":"0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000041ca2fbb40000000000000000000000000000000000000000000000000000000000000002e516d576b71346531646e7a716361704363613672596e3873635050687a6236594c364d5567473636486f6d365173","topics":["0xa3befe72bc9cef7405d0f78a12f282694027a4c40b3a8ed0839a121be48c766a","0x000000000000000000000000fa7bd28b71fcc26396cead29b344130925c76503","0x000000000000000000000000fa7bd28b71fcc26396cead29b344130925c76503"]}}
```


# Supplement

To run geth, you can clone and build a local `geth`. We use `release/1.8` which is the latest when
this document was written.

```
git clone -b release/1.8 https://github.com/ethereum/go-ethereum.git
pushd go-ethereum
make all
popd
```
