# Event watcher example for the RewardDistributor contract

* Includes hardcoded ABI for RewardDistributor contract `0x16c60a50c0d9e2c191370e42aa9d2fb22b99f1fb`
* Uses web3
* Run it with `node`

To run it, you need to ensure you have a local [geth](https://github.com/ethereum/go-ethereum) up and running.

```
npm install
node event_watcher.js
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
