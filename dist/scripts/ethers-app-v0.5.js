(function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
(function (global){
'use strict';

var Contract = require('ethers/contracts/contract');
var providers = require('ethers/providers');
var utils = require('ethers/utils');

var ProviderBridge = require('ethers-web3-bridge');

function defineCallback(object, name) {
    var callback = null;

    Object.defineProperty(object, name, {
        enumerable: true,
        get: function() { return callback; },
        set: function(value) {
            callback = value;
        }
    });
}

function ethersLog() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Ethers Client Library]');
    var onlyStrings = true;
    args.forEach(function(arg) {
        if (typeof(arg) !== 'string') { onlyStrings = false; }
    });
    if (onlyStrings) { args = [ args.join(' ') ]; }
    console.log.apply(console, args);
}

function proxyObject(object, deferProperties, chainProperties, syncProperties) {
    var setProxy = null;
    var proxyTarget = null;
    var proxyPromise = new Promise(function(resolve) {
        setProxy = function(value) {
            proxyTarget = value;
            resolve(proxyTarget);
            setProxy = null;
        }
    });

    deferProperties.forEach(function(property) {
        utils.defineProperty(object, property, function() {
            var targetArgs = Array.prototype.slice.call(arguments);
            return proxyPromise.then(function(proxyTarget) {
                return proxyTarget[property].apply(proxyTarget, targetArgs);
            });
        });
    });

    chainProperties.forEach(function(property) {
        utils.defineProperty(object, property, function() {
            var targetArgs = Array.prototype.slice.call(arguments);
            proxyPromise.then(function(proxyTarget) {
                proxyTarget[property].apply(proxyTarget, targetArgs);
            });
            return object;
        });
    });

    syncProperties.forEach(function(property) {
        Object.defineProperty(object, property, {
            enumerable: true,
            get: function() {
                if (!proxyTarget) { throw new Error('cannot access property before connection: ' + property); }
                return proxyTarget[property];
            }
        });
    });

    utils.defineProperty(object, 'ready', function() {
        return proxyPromise.then(function(proxyTarget) {
            return null;
        });
    });

    return setProxy;
}


function Provider() { }
var provider = new Provider();
var setProviderProxyTarget = proxyObject(provider, [
    'getBlockNumber',
    'getGasPrice',
    'getBalance',
    'getTransactionCount',
    'getCode',
    'getStorageAt',
    'call',
    'estimateGas',
    'getBlock',
    'getTransaction',
    'getTransactionReceipt',
    'getLogs',
    'resolveName',
    'waitForTransaction',
], [
    'on',
    'once',
    'removeAllListeners',
    'removeListener'
], [
    'listenerCount',
    'listeners',
    'chainId',
    'ensAddress',
    'name',
]);


function Signer() { }
var signer = new Signer();
utils.defineProperty(signer, 'provider', provider);
var setSignerProxyTarget = proxyObject(signer, [
    'getAddress',
    'getBalance',
    'sendTransaction',
    'signMessage',
], [ ], [ ]);



var ethers = {}

utils.defineProperty(ethers, 'provider', provider);
utils.defineProperty(ethers, 'signer', signer);

var exportUtils = {};
utils.defineProperty(ethers, 'utils', exportUtils);

var blockchain = {};
utils.defineProperty(ethers, 'blockchain', blockchain);

// onready - After we have finished loading and registered with ethers.io
var onready = (function() {
    var ready = false;

    var callback = null;
    function trigger() {
        ethersLog('Ready');
        ready = true;
        if (!callback) { return; }
        var cb = callback;
        setTimeout(function() { cb(); });
    }

    Object.defineProperty(ethers, 'onready', {
        enumerable: true,
        get: function() { return callback; },
        set: function(value) {
            callback = value;
            if (ready) { trigger(); }
        }
    });

    return trigger;
})();

// onaccount - Whenever the user switches to a new account
defineCallback(ethers, 'onaccount');


// ethers
utils.defineProperty(ethers, 'getAddress', utils.getAddress);

utils.defineProperty(ethers, 'formatEther', utils.formatEther);
utils.defineProperty(ethers, 'parseEther', utils.parseEther);

utils.defineProperty(ethers, 'formatUnits', utils.formatUnits);
utils.defineProperty(ethers, 'parseUnits', utils.parseUnits);

utils.defineProperty(ethers, 'etherSymbol', utils.etherSymbol);


// ethers.utils
utils.defineProperty(exportUtils, 'arrayify', utils.arrayify);
utils.defineProperty(exportUtils, 'bigNumberify', utils.bigNumberify);
utils.defineProperty(exportUtils, 'concat', utils.concat);
utils.defineProperty(exportUtils, 'hexlify', utils.hexlify);
utils.defineProperty(exportUtils, 'id', utils.id);
utils.defineProperty(exportUtils, 'keccak256', utils.keccak256);
utils.defineProperty(exportUtils, 'sha256', utils.sha256);

utils.defineProperty(exportUtils, 'solidityKeccak256', utils.solidityKeccak256);
utils.defineProperty(exportUtils, 'soliditySha256', utils.soliditySha256);
utils.defineProperty(exportUtils, 'splitSignature', utils.splitSignature);

utils.defineProperty(exportUtils, 'namehash', utils.namehash);

utils.defineProperty(exportUtils, 'toUtf8Bytes', utils.toUtf8Bytes);
utils.defineProperty(exportUtils, 'toUtf8String', utils.toUtf8String);

utils.defineProperty(exportUtils, 'getContractAddress', utils.getContractAddress);


utils.defineProperty(ethers, 'getContract', function(address, abi) {
    if (arguments.length === 2) {
        return Promise.resolve(new Contract(address, abi, ethers.signer));
    }

    if (arguments.length === 1) {
        if (address.match(/\.json/)) {
            return Promise.all([
                providers.Provider.fetchJSON(address),
                ethers.getNetwork()
            ]).then(function(result) {
                var data = result[0];
                if (data) { data = data[result[1]]; }
                if (data) {
                    try {
                        var address = utils.getAddress(data.address);
                    } catch (error) {
                        return Promise.reject(new Error('error loading contract - address=' + data.address));
                    }
                    try {
                        return new Contract(data.address, data.interface, ethers.signer);
                    } catch (error) {
                        return Promise.reject(new Error('error loading contract - interface=' + data.interface));
                    }
                }
                return Promise.reject(new Error('could loading interface - ' + address));
            }, function(error) {
               return Promise.reject(error);
            });
        } else {
            return Promise.reject(new Error('ABI lookup not implemented yet'));
        }
    }
    throw new Error('must specify filename or address');
});


utils.defineProperty(ethers, 'getAccount', function() {
    return ethers.signer.getAddress();
});

utils.defineProperty(ethers, 'getNetwork', function() {
    return provider.ready().then(function() {
        return ethers.provider.name;
    });
});

utils.defineProperty(ethers, 'sendTransaction', function(tx) {
    return ethers.signer.sendTransaction(tx);
});

utils.defineProperty(ethers, 'send', function(addressOrName, amountWei) {
    return ethers.signer.sendTransaction({
        to: addressOrName,
        value: amountWei
    });
});

[
  'getBlockNumber',
  'getGasPrice',
  'getBalance',
  'getTransactionCount',
  'getCode',
  'getStorageAt',
  'call',
  'estimateGas',
  'getBlock',
  'getTransaction',
  'getTransactionReceipt',
  'getLogs',
//  'getEthersPrice',
  'resolveName',
  'waitForTransaction'
].forEach(function(method) {
    utils.defineProperty(blockchain, method, function() {
        var args = Array.prototype.slice.call(arguments);
        return ethers.provider[method].apply(ethers.provider, args);
    });
});


function Handler(parentUrl) {
    this.parentUrl = parentUrl;

    this.nextMessageId = 1;

    this.pending = [];
    this.inflightCallbacks = {};

    this.window = null;
}

utils.defineProperty(Handler.prototype, 'setupWindow', function(window) {
    if (this.window) { throw new Error('already has window'); }

    this.window = window;

    var self = this;
    this.window.addEventListener('message', function(event) {
        //if (event.origin !== parentUrl) { return; }

        var data = event.data;
        if (!data || data.ethers !== 'v\x01\n') { return; }

        try {
            if (data.id) {
                var callback = self.inflightCallbacks[data.id];
                delete self.inflightCallbacks[data.id];

                if (callback) {
                    var results = [null, data.result];
                    if (data.error) {
                        results[0] = new Error(data.error);
                    }

                    callback.apply(self.window, results);
                }

            } else {
                switch (data.action) {
                    case 'accountChanged':
                        if (ethers.onaccount) {
                            ethers.onaccount.call(self.window, data.account);
                        }
                        break;

                    case 'ready':
                        // Already know if we are ready from the connectEthers()
                        if (ethers.onaccount) {
                            ethers.onaccount.call(self.window, data.account);
                        }
                        break;

                    default:
                        throw new Error('Unknown Action: ' + data.action);
                }
            }
        } catch (error) {
            ethersLog(error);
        }
    }, false);

    // Send the 'ready' first
    var readyPayload = this.buildPayload('ready', { title: this.window.document.title })
    this.window.parent.postMessage(readyPayload, this.parentUrl);

    // Flush any pending requests made before the window was set up
    this.pending.forEach(function(operation) {
        this.window.parent.postMessage(JSON.parse(operation), this.parentUrl);
    }, this);

    this.pending = null;
});

utils.defineProperty(Handler.prototype, 'buildPayload', function(action, params) {
    return {
        action: action,
        ethers: 'v\x01\n',
        id: this.nextMessageId++,
        params: params
    };
});

utils.defineProperty(Handler.prototype, 'sendMessage', function(action, params, callback) {

    var payload = this.buildPayload(action, params);
    if (callback) {
        this.inflightCallbacks[payload.id] = callback;
    }

    if (this.window) {
        this.window.parent.postMessage(payload, this.parentUrl);

    } else {
        // Create an immutable copy for the deferred request
        this.pending.push(JSON.stringify(payload));
    }
});


function EthersSigner(handler) {
    utils.defineProperty(this, '_handler', handler);
}

utils.defineProperty(EthersSigner.prototype, 'getAddress', function() {
    var self = this;
    return new Promise(function(resolve, reject) {
        self._handler.sendMessage('getAccount', { }, function(error, address) {
            if (error) { return reject(new Error('no account')); }
            resolve(address);
        });
    });
});

utils.defineProperty(EthersSigner.prototype, 'getBalance', function(blockTag) {
    var self = this;
    return this.getAddress().then(function(address) {
        return ethers.provider.getBalance(address);
    });
});

utils.defineProperty(EthersSigner.prototype, 'sendTransaction', function(tx) {
    var hexTx = {};
    for (var key in tx) {
        if (tx[key] == null) { continue; }
        hexTx[key] = utils.hexlify(tx[key]);
    }

    var self = this;
    return new Promise(function(resolve, reject) {
        self._handler.sendMessage('sendTransaction', { transaction: hexTx }, function(error, tx) {
            if (error) { return reject(error); }
            resolve(tx);
        });
    });
});

utils.defineProperty(EthersSigner.prototype, 'signMessage', function(message) {
    var self = this;
    return new Promise(function(resolve, reject) {
        self._handler.sendMessage('signMessage', { message: message }, function(error, signature) {
            if (error) { return reject(error); }
            resolve(signature);
        });
    });
});


function connectEthers(window) {
    if (window.parent === window || window.ethersSkip) {
        return Promise.reject(new Error('no container'));
    }

    return new Promise(function(resolve, reject) {

        var handler = new Handler('*');

        var timer = null;
        handler.sendMessage('getNetwork', {}, function(error, network) {
            if (timer === null) {
                return reject(new Error('Ethers container took too long to reply. Not setting up.'));
            }

            ethersLog('Connected to Ethers Wallet Container: network=' + network);

            clearTimeout(timer);
            timer = null;

            if (network === 'mainnet') {
                network = 'homestead';
            } else if (network === 'testnet') {
                network = 'ropsten';
            }

            if (network.match(/^https?:/)) {
                setProviderProxyTarget(new providers.JsonRpcProvider(network, {
                    name: 'test',
                    chainId: 43
                }));
            } else {
                setProviderProxyTarget(providers.getDefaultProvider(network));
            }
            setSignerProxyTarget(new EthersSigner(handler));

            // @TODO: Make this available as a proxy?
            utils.defineProperty(ethers, 'loadApplication', function(url) {
                return new Promise(function(resolve, reject) {
                    handler.sendMessage('loadApplication', { url: url }, function(error) {
                        if (error) { return reject(error); }
                        resolve();
                    });
                });
            });

            resolve(ethers);
        });

        window.document.addEventListener('DOMContentLoaded', function() {
            handler.setupWindow(window);

            // If after 2 seconds, the container has not responded to our 'ready',
            // assume it is not an Ethers container.
            timer = setTimeout(function() {
                timer = null;
                reject(new Error('In a container, but not Ethers. Falling back.'));
            }, 2000);
        });
    });
}

function inject(window) {
    if (window.ethers) { ethers._ethers = window.ethers; }
    // We are going to migrate off of creating the global "ethers" and
    // start calling it "app" in the future to help keep the documentation
    // across the projects and libraries from confusing people.
    window.ethers = ethers;
    window.app = ethers;

    // Keep any existing web3 instance; if we cannot find a container, we will
    // hook it up to our bridge
    var oldWeb3 = window.web3;

    // A bridge that allows a Web3 instance to talk to an Ethers provider and signer
    var providerBridge = new ProviderBridge();

    if (window.Web3) {
        window.web3 = new window.Web3(providerBridge);
    } else {
        window.web3 = { currentProvider: providerBridge };
    }

    connectEthers(window).then(function(ethers) {
        providerBridge.connectEthers(ethers.provider, ethers.signer);
    }).catch(function(error) {
        var network = window.ethersNetwork || 'homestead';

        // MetaMask, Mist or such
        if (oldWeb3 && oldWeb3.currentProvider) {
            ethersLog('Connected Injected Web3: network=' + network);
            providerBridge.connectWeb3(oldWeb3.currentProvider);

            // Expose the Ethers API on injected Web3
            var web3Provider = new providers.Web3Provider(window.web3.currentProvider, network)
            setProviderProxyTarget(web3Provider);
            setSignerProxyTarget(web3Provider.getSigner());

        // No Ethers, MetaMask, Mist or anything else... Create a generic provider (no signer)
        } else {
            ethersLog('Connected Default Provider: network=' + network);
            setProviderProxyTarget(providers.getDefaultProvider(network));

            // No private keys to sign with
            var zeroSigner = new Signer();
            utils.defineProperty(zeroSigner, 'getAddress', function() { return Promise.resolve(null); });
            utils.defineProperty(zeroSigner, 'getBalance', function() { return Promise.reject(new Error('no signer')); });
            utils.defineProperty(zeroSigner, 'sendTransaction', function() { return Promise.reject(new Error('no signer')); });
            utils.defineProperty(zeroSigner, 'signMessage', function() { return Promise.reject(new Error('no signer')); });
            setSignerProxyTarget(zeroSigner);

            providerBridge.connectEthers(provider);
        }
    }).then(function() {
        onready();
    });
}

inject(global);

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"ethers-web3-bridge":30,"ethers/contracts/contract":32,"ethers/providers":37,"ethers/utils":50}],2:[function(require,module,exports){
(function (module, exports) {
  'use strict';

  // Utils
  function assert (val, msg) {
    if (!val) throw new Error(msg || 'Assertion failed');
  }

  // Could use `inherits` module, but don't want to move from single file
  // architecture yet.
  function inherits (ctor, superCtor) {
    ctor.super_ = superCtor;
    var TempCtor = function () {};
    TempCtor.prototype = superCtor.prototype;
    ctor.prototype = new TempCtor();
    ctor.prototype.constructor = ctor;
  }

  // BN

  function BN (number, base, endian) {
    if (BN.isBN(number)) {
      return number;
    }

    this.negative = 0;
    this.words = null;
    this.length = 0;

    // Reduction context
    this.red = null;

    if (number !== null) {
      if (base === 'le' || base === 'be') {
        endian = base;
        base = 10;
      }

      this._init(number || 0, base || 10, endian || 'be');
    }
  }
  if (typeof module === 'object') {
    module.exports = BN;
  } else {
    exports.BN = BN;
  }

  BN.BN = BN;
  BN.wordSize = 26;

  var Buffer;
  try {
    Buffer = require('buffer').Buffer;
  } catch (e) {
  }

  BN.isBN = function isBN (num) {
    if (num instanceof BN) {
      return true;
    }

    return num !== null && typeof num === 'object' &&
      num.constructor.wordSize === BN.wordSize && Array.isArray(num.words);
  };

  BN.max = function max (left, right) {
    if (left.cmp(right) > 0) return left;
    return right;
  };

  BN.min = function min (left, right) {
    if (left.cmp(right) < 0) return left;
    return right;
  };

  BN.prototype._init = function init (number, base, endian) {
    if (typeof number === 'number') {
      return this._initNumber(number, base, endian);
    }

    if (typeof number === 'object') {
      return this._initArray(number, base, endian);
    }

    if (base === 'hex') {
      base = 16;
    }
    assert(base === (base | 0) && base >= 2 && base <= 36);

    number = number.toString().replace(/\s+/g, '');
    var start = 0;
    if (number[0] === '-') {
      start++;
    }

    if (base === 16) {
      this._parseHex(number, start);
    } else {
      this._parseBase(number, base, start);
    }

    if (number[0] === '-') {
      this.negative = 1;
    }

    this.strip();

    if (endian !== 'le') return;

    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initNumber = function _initNumber (number, base, endian) {
    if (number < 0) {
      this.negative = 1;
      number = -number;
    }
    if (number < 0x4000000) {
      this.words = [ number & 0x3ffffff ];
      this.length = 1;
    } else if (number < 0x10000000000000) {
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff
      ];
      this.length = 2;
    } else {
      assert(number < 0x20000000000000); // 2 ^ 53 (unsafe)
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff,
        1
      ];
      this.length = 3;
    }

    if (endian !== 'le') return;

    // Reverse the bytes
    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initArray = function _initArray (number, base, endian) {
    // Perhaps a Uint8Array
    assert(typeof number.length === 'number');
    if (number.length <= 0) {
      this.words = [ 0 ];
      this.length = 1;
      return this;
    }

    this.length = Math.ceil(number.length / 3);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    var off = 0;
    if (endian === 'be') {
      for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
        w = number[i] | (number[i - 1] << 8) | (number[i - 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    } else if (endian === 'le') {
      for (i = 0, j = 0; i < number.length; i += 3) {
        w = number[i] | (number[i + 1] << 8) | (number[i + 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    }
    return this.strip();
  };

  function parseHex (str, start, end) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r <<= 4;

      // 'a' - 'f'
      if (c >= 49 && c <= 54) {
        r |= c - 49 + 0xa;

      // 'A' - 'F'
      } else if (c >= 17 && c <= 22) {
        r |= c - 17 + 0xa;

      // '0' - '9'
      } else {
        r |= c & 0xf;
      }
    }
    return r;
  }

  BN.prototype._parseHex = function _parseHex (number, start) {
    // Create possibly bigger array to ensure that it fits the number
    this.length = Math.ceil((number.length - start) / 6);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    // Scan 24-bit chunks and add them to the number
    var off = 0;
    for (i = number.length - 6, j = 0; i >= start; i -= 6) {
      w = parseHex(number, i, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      // NOTE: `0x3fffff` is intentional here, 26bits max shift + 24bit hex limb
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
      off += 24;
      if (off >= 26) {
        off -= 26;
        j++;
      }
    }
    if (i + 6 !== start) {
      w = parseHex(number, start, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
    }
    this.strip();
  };

  function parseBase (str, start, end, mul) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r *= mul;

      // 'a'
      if (c >= 49) {
        r += c - 49 + 0xa;

      // 'A'
      } else if (c >= 17) {
        r += c - 17 + 0xa;

      // '0' - '9'
      } else {
        r += c;
      }
    }
    return r;
  }

  BN.prototype._parseBase = function _parseBase (number, base, start) {
    // Initialize as zero
    this.words = [ 0 ];
    this.length = 1;

    // Find length of limb in base
    for (var limbLen = 0, limbPow = 1; limbPow <= 0x3ffffff; limbPow *= base) {
      limbLen++;
    }
    limbLen--;
    limbPow = (limbPow / base) | 0;

    var total = number.length - start;
    var mod = total % limbLen;
    var end = Math.min(total, total - mod) + start;

    var word = 0;
    for (var i = start; i < end; i += limbLen) {
      word = parseBase(number, i, i + limbLen, base);

      this.imuln(limbPow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }

    if (mod !== 0) {
      var pow = 1;
      word = parseBase(number, i, number.length, base);

      for (i = 0; i < mod; i++) {
        pow *= base;
      }

      this.imuln(pow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }
  };

  BN.prototype.copy = function copy (dest) {
    dest.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      dest.words[i] = this.words[i];
    }
    dest.length = this.length;
    dest.negative = this.negative;
    dest.red = this.red;
  };

  BN.prototype.clone = function clone () {
    var r = new BN(null);
    this.copy(r);
    return r;
  };

  BN.prototype._expand = function _expand (size) {
    while (this.length < size) {
      this.words[this.length++] = 0;
    }
    return this;
  };

  // Remove leading `0` from `this`
  BN.prototype.strip = function strip () {
    while (this.length > 1 && this.words[this.length - 1] === 0) {
      this.length--;
    }
    return this._normSign();
  };

  BN.prototype._normSign = function _normSign () {
    // -0 = 0
    if (this.length === 1 && this.words[0] === 0) {
      this.negative = 0;
    }
    return this;
  };

  BN.prototype.inspect = function inspect () {
    return (this.red ? '<BN-R: ' : '<BN: ') + this.toString(16) + '>';
  };

  /*

  var zeros = [];
  var groupSizes = [];
  var groupBases = [];

  var s = '';
  var i = -1;
  while (++i < BN.wordSize) {
    zeros[i] = s;
    s += '0';
  }
  groupSizes[0] = 0;
  groupSizes[1] = 0;
  groupBases[0] = 0;
  groupBases[1] = 0;
  var base = 2 - 1;
  while (++base < 36 + 1) {
    var groupSize = 0;
    var groupBase = 1;
    while (groupBase < (1 << BN.wordSize) / base) {
      groupBase *= base;
      groupSize += 1;
    }
    groupSizes[base] = groupSize;
    groupBases[base] = groupBase;
  }

  */

  var zeros = [
    '',
    '0',
    '00',
    '000',
    '0000',
    '00000',
    '000000',
    '0000000',
    '00000000',
    '000000000',
    '0000000000',
    '00000000000',
    '000000000000',
    '0000000000000',
    '00000000000000',
    '000000000000000',
    '0000000000000000',
    '00000000000000000',
    '000000000000000000',
    '0000000000000000000',
    '00000000000000000000',
    '000000000000000000000',
    '0000000000000000000000',
    '00000000000000000000000',
    '000000000000000000000000',
    '0000000000000000000000000'
  ];

  var groupSizes = [
    0, 0,
    25, 16, 12, 11, 10, 9, 8,
    8, 7, 7, 7, 7, 6, 6,
    6, 6, 6, 6, 6, 5, 5,
    5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5
  ];

  var groupBases = [
    0, 0,
    33554432, 43046721, 16777216, 48828125, 60466176, 40353607, 16777216,
    43046721, 10000000, 19487171, 35831808, 62748517, 7529536, 11390625,
    16777216, 24137569, 34012224, 47045881, 64000000, 4084101, 5153632,
    6436343, 7962624, 9765625, 11881376, 14348907, 17210368, 20511149,
    24300000, 28629151, 33554432, 39135393, 45435424, 52521875, 60466176
  ];

  BN.prototype.toString = function toString (base, padding) {
    base = base || 10;
    padding = padding | 0 || 1;

    var out;
    if (base === 16 || base === 'hex') {
      out = '';
      var off = 0;
      var carry = 0;
      for (var i = 0; i < this.length; i++) {
        var w = this.words[i];
        var word = (((w << off) | carry) & 0xffffff).toString(16);
        carry = (w >>> (24 - off)) & 0xffffff;
        if (carry !== 0 || i !== this.length - 1) {
          out = zeros[6 - word.length] + word + out;
        } else {
          out = word + out;
        }
        off += 2;
        if (off >= 26) {
          off -= 26;
          i--;
        }
      }
      if (carry !== 0) {
        out = carry.toString(16) + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    if (base === (base | 0) && base >= 2 && base <= 36) {
      // var groupSize = Math.floor(BN.wordSize * Math.LN2 / Math.log(base));
      var groupSize = groupSizes[base];
      // var groupBase = Math.pow(base, groupSize);
      var groupBase = groupBases[base];
      out = '';
      var c = this.clone();
      c.negative = 0;
      while (!c.isZero()) {
        var r = c.modn(groupBase).toString(base);
        c = c.idivn(groupBase);

        if (!c.isZero()) {
          out = zeros[groupSize - r.length] + r + out;
        } else {
          out = r + out;
        }
      }
      if (this.isZero()) {
        out = '0' + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    assert(false, 'Base should be between 2 and 36');
  };

  BN.prototype.toNumber = function toNumber () {
    var ret = this.words[0];
    if (this.length === 2) {
      ret += this.words[1] * 0x4000000;
    } else if (this.length === 3 && this.words[2] === 0x01) {
      // NOTE: at this stage it is known that the top bit is set
      ret += 0x10000000000000 + (this.words[1] * 0x4000000);
    } else if (this.length > 2) {
      assert(false, 'Number can only safely store up to 53 bits');
    }
    return (this.negative !== 0) ? -ret : ret;
  };

  BN.prototype.toJSON = function toJSON () {
    return this.toString(16);
  };

  BN.prototype.toBuffer = function toBuffer (endian, length) {
    assert(typeof Buffer !== 'undefined');
    return this.toArrayLike(Buffer, endian, length);
  };

  BN.prototype.toArray = function toArray (endian, length) {
    return this.toArrayLike(Array, endian, length);
  };

  BN.prototype.toArrayLike = function toArrayLike (ArrayType, endian, length) {
    var byteLength = this.byteLength();
    var reqLength = length || Math.max(1, byteLength);
    assert(byteLength <= reqLength, 'byte array longer than desired length');
    assert(reqLength > 0, 'Requested array length <= 0');

    this.strip();
    var littleEndian = endian === 'le';
    var res = new ArrayType(reqLength);

    var b, i;
    var q = this.clone();
    if (!littleEndian) {
      // Assume big-endian
      for (i = 0; i < reqLength - byteLength; i++) {
        res[i] = 0;
      }

      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[reqLength - i - 1] = b;
      }
    } else {
      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[i] = b;
      }

      for (; i < reqLength; i++) {
        res[i] = 0;
      }
    }

    return res;
  };

  if (Math.clz32) {
    BN.prototype._countBits = function _countBits (w) {
      return 32 - Math.clz32(w);
    };
  } else {
    BN.prototype._countBits = function _countBits (w) {
      var t = w;
      var r = 0;
      if (t >= 0x1000) {
        r += 13;
        t >>>= 13;
      }
      if (t >= 0x40) {
        r += 7;
        t >>>= 7;
      }
      if (t >= 0x8) {
        r += 4;
        t >>>= 4;
      }
      if (t >= 0x02) {
        r += 2;
        t >>>= 2;
      }
      return r + t;
    };
  }

  BN.prototype._zeroBits = function _zeroBits (w) {
    // Short-cut
    if (w === 0) return 26;

    var t = w;
    var r = 0;
    if ((t & 0x1fff) === 0) {
      r += 13;
      t >>>= 13;
    }
    if ((t & 0x7f) === 0) {
      r += 7;
      t >>>= 7;
    }
    if ((t & 0xf) === 0) {
      r += 4;
      t >>>= 4;
    }
    if ((t & 0x3) === 0) {
      r += 2;
      t >>>= 2;
    }
    if ((t & 0x1) === 0) {
      r++;
    }
    return r;
  };

  // Return number of used bits in a BN
  BN.prototype.bitLength = function bitLength () {
    var w = this.words[this.length - 1];
    var hi = this._countBits(w);
    return (this.length - 1) * 26 + hi;
  };

  function toBitArray (num) {
    var w = new Array(num.bitLength());

    for (var bit = 0; bit < w.length; bit++) {
      var off = (bit / 26) | 0;
      var wbit = bit % 26;

      w[bit] = (num.words[off] & (1 << wbit)) >>> wbit;
    }

    return w;
  }

  // Number of trailing zero bits
  BN.prototype.zeroBits = function zeroBits () {
    if (this.isZero()) return 0;

    var r = 0;
    for (var i = 0; i < this.length; i++) {
      var b = this._zeroBits(this.words[i]);
      r += b;
      if (b !== 26) break;
    }
    return r;
  };

  BN.prototype.byteLength = function byteLength () {
    return Math.ceil(this.bitLength() / 8);
  };

  BN.prototype.toTwos = function toTwos (width) {
    if (this.negative !== 0) {
      return this.abs().inotn(width).iaddn(1);
    }
    return this.clone();
  };

  BN.prototype.fromTwos = function fromTwos (width) {
    if (this.testn(width - 1)) {
      return this.notn(width).iaddn(1).ineg();
    }
    return this.clone();
  };

  BN.prototype.isNeg = function isNeg () {
    return this.negative !== 0;
  };

  // Return negative clone of `this`
  BN.prototype.neg = function neg () {
    return this.clone().ineg();
  };

  BN.prototype.ineg = function ineg () {
    if (!this.isZero()) {
      this.negative ^= 1;
    }

    return this;
  };

  // Or `num` with `this` in-place
  BN.prototype.iuor = function iuor (num) {
    while (this.length < num.length) {
      this.words[this.length++] = 0;
    }

    for (var i = 0; i < num.length; i++) {
      this.words[i] = this.words[i] | num.words[i];
    }

    return this.strip();
  };

  BN.prototype.ior = function ior (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuor(num);
  };

  // Or `num` with `this`
  BN.prototype.or = function or (num) {
    if (this.length > num.length) return this.clone().ior(num);
    return num.clone().ior(this);
  };

  BN.prototype.uor = function uor (num) {
    if (this.length > num.length) return this.clone().iuor(num);
    return num.clone().iuor(this);
  };

  // And `num` with `this` in-place
  BN.prototype.iuand = function iuand (num) {
    // b = min-length(num, this)
    var b;
    if (this.length > num.length) {
      b = num;
    } else {
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = this.words[i] & num.words[i];
    }

    this.length = b.length;

    return this.strip();
  };

  BN.prototype.iand = function iand (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuand(num);
  };

  // And `num` with `this`
  BN.prototype.and = function and (num) {
    if (this.length > num.length) return this.clone().iand(num);
    return num.clone().iand(this);
  };

  BN.prototype.uand = function uand (num) {
    if (this.length > num.length) return this.clone().iuand(num);
    return num.clone().iuand(this);
  };

  // Xor `num` with `this` in-place
  BN.prototype.iuxor = function iuxor (num) {
    // a.length > b.length
    var a;
    var b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = a.words[i] ^ b.words[i];
    }

    if (this !== a) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = a.length;

    return this.strip();
  };

  BN.prototype.ixor = function ixor (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuxor(num);
  };

  // Xor `num` with `this`
  BN.prototype.xor = function xor (num) {
    if (this.length > num.length) return this.clone().ixor(num);
    return num.clone().ixor(this);
  };

  BN.prototype.uxor = function uxor (num) {
    if (this.length > num.length) return this.clone().iuxor(num);
    return num.clone().iuxor(this);
  };

  // Not ``this`` with ``width`` bitwidth
  BN.prototype.inotn = function inotn (width) {
    assert(typeof width === 'number' && width >= 0);

    var bytesNeeded = Math.ceil(width / 26) | 0;
    var bitsLeft = width % 26;

    // Extend the buffer with leading zeroes
    this._expand(bytesNeeded);

    if (bitsLeft > 0) {
      bytesNeeded--;
    }

    // Handle complete words
    for (var i = 0; i < bytesNeeded; i++) {
      this.words[i] = ~this.words[i] & 0x3ffffff;
    }

    // Handle the residue
    if (bitsLeft > 0) {
      this.words[i] = ~this.words[i] & (0x3ffffff >> (26 - bitsLeft));
    }

    // And remove leading zeroes
    return this.strip();
  };

  BN.prototype.notn = function notn (width) {
    return this.clone().inotn(width);
  };

  // Set `bit` of `this`
  BN.prototype.setn = function setn (bit, val) {
    assert(typeof bit === 'number' && bit >= 0);

    var off = (bit / 26) | 0;
    var wbit = bit % 26;

    this._expand(off + 1);

    if (val) {
      this.words[off] = this.words[off] | (1 << wbit);
    } else {
      this.words[off] = this.words[off] & ~(1 << wbit);
    }

    return this.strip();
  };

  // Add `num` to `this` in-place
  BN.prototype.iadd = function iadd (num) {
    var r;

    // negative + positive
    if (this.negative !== 0 && num.negative === 0) {
      this.negative = 0;
      r = this.isub(num);
      this.negative ^= 1;
      return this._normSign();

    // positive + negative
    } else if (this.negative === 0 && num.negative !== 0) {
      num.negative = 0;
      r = this.isub(num);
      num.negative = 1;
      return r._normSign();
    }

    // a.length > b.length
    var a, b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }

    this.length = a.length;
    if (carry !== 0) {
      this.words[this.length] = carry;
      this.length++;
    // Copy the rest of the words
    } else if (a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    return this;
  };

  // Add `num` to `this`
  BN.prototype.add = function add (num) {
    var res;
    if (num.negative !== 0 && this.negative === 0) {
      num.negative = 0;
      res = this.sub(num);
      num.negative ^= 1;
      return res;
    } else if (num.negative === 0 && this.negative !== 0) {
      this.negative = 0;
      res = num.sub(this);
      this.negative = 1;
      return res;
    }

    if (this.length > num.length) return this.clone().iadd(num);

    return num.clone().iadd(this);
  };

  // Subtract `num` from `this` in-place
  BN.prototype.isub = function isub (num) {
    // this - (-num) = this + num
    if (num.negative !== 0) {
      num.negative = 0;
      var r = this.iadd(num);
      num.negative = 1;
      return r._normSign();

    // -this - num = -(this + num)
    } else if (this.negative !== 0) {
      this.negative = 0;
      this.iadd(num);
      this.negative = 1;
      return this._normSign();
    }

    // At this point both numbers are positive
    var cmp = this.cmp(num);

    // Optimization - zeroify
    if (cmp === 0) {
      this.negative = 0;
      this.length = 1;
      this.words[0] = 0;
      return this;
    }

    // a > b
    var a, b;
    if (cmp > 0) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }

    // Copy rest of the words
    if (carry === 0 && i < a.length && a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = Math.max(this.length, i);

    if (a !== this) {
      this.negative = 1;
    }

    return this.strip();
  };

  // Subtract `num` from `this`
  BN.prototype.sub = function sub (num) {
    return this.clone().isub(num);
  };

  function smallMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    var len = (self.length + num.length) | 0;
    out.length = len;
    len = (len - 1) | 0;

    // Peel one iteration (compiler can't do it, because of code complexity)
    var a = self.words[0] | 0;
    var b = num.words[0] | 0;
    var r = a * b;

    var lo = r & 0x3ffffff;
    var carry = (r / 0x4000000) | 0;
    out.words[0] = lo;

    for (var k = 1; k < len; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = carry >>> 26;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = (k - j) | 0;
        a = self.words[i] | 0;
        b = num.words[j] | 0;
        r = a * b + rword;
        ncarry += (r / 0x4000000) | 0;
        rword = r & 0x3ffffff;
      }
      out.words[k] = rword | 0;
      carry = ncarry | 0;
    }
    if (carry !== 0) {
      out.words[k] = carry | 0;
    } else {
      out.length--;
    }

    return out.strip();
  }

  // TODO(indutny): it may be reasonable to omit it for users who don't need
  // to work with 256-bit numbers, otherwise it gives 20% improvement for 256-bit
  // multiplication (like elliptic secp256k1).
  var comb10MulTo = function comb10MulTo (self, num, out) {
    var a = self.words;
    var b = num.words;
    var o = out.words;
    var c = 0;
    var lo;
    var mid;
    var hi;
    var a0 = a[0] | 0;
    var al0 = a0 & 0x1fff;
    var ah0 = a0 >>> 13;
    var a1 = a[1] | 0;
    var al1 = a1 & 0x1fff;
    var ah1 = a1 >>> 13;
    var a2 = a[2] | 0;
    var al2 = a2 & 0x1fff;
    var ah2 = a2 >>> 13;
    var a3 = a[3] | 0;
    var al3 = a3 & 0x1fff;
    var ah3 = a3 >>> 13;
    var a4 = a[4] | 0;
    var al4 = a4 & 0x1fff;
    var ah4 = a4 >>> 13;
    var a5 = a[5] | 0;
    var al5 = a5 & 0x1fff;
    var ah5 = a5 >>> 13;
    var a6 = a[6] | 0;
    var al6 = a6 & 0x1fff;
    var ah6 = a6 >>> 13;
    var a7 = a[7] | 0;
    var al7 = a7 & 0x1fff;
    var ah7 = a7 >>> 13;
    var a8 = a[8] | 0;
    var al8 = a8 & 0x1fff;
    var ah8 = a8 >>> 13;
    var a9 = a[9] | 0;
    var al9 = a9 & 0x1fff;
    var ah9 = a9 >>> 13;
    var b0 = b[0] | 0;
    var bl0 = b0 & 0x1fff;
    var bh0 = b0 >>> 13;
    var b1 = b[1] | 0;
    var bl1 = b1 & 0x1fff;
    var bh1 = b1 >>> 13;
    var b2 = b[2] | 0;
    var bl2 = b2 & 0x1fff;
    var bh2 = b2 >>> 13;
    var b3 = b[3] | 0;
    var bl3 = b3 & 0x1fff;
    var bh3 = b3 >>> 13;
    var b4 = b[4] | 0;
    var bl4 = b4 & 0x1fff;
    var bh4 = b4 >>> 13;
    var b5 = b[5] | 0;
    var bl5 = b5 & 0x1fff;
    var bh5 = b5 >>> 13;
    var b6 = b[6] | 0;
    var bl6 = b6 & 0x1fff;
    var bh6 = b6 >>> 13;
    var b7 = b[7] | 0;
    var bl7 = b7 & 0x1fff;
    var bh7 = b7 >>> 13;
    var b8 = b[8] | 0;
    var bl8 = b8 & 0x1fff;
    var bh8 = b8 >>> 13;
    var b9 = b[9] | 0;
    var bl9 = b9 & 0x1fff;
    var bh9 = b9 >>> 13;

    out.negative = self.negative ^ num.negative;
    out.length = 19;
    /* k = 0 */
    lo = Math.imul(al0, bl0);
    mid = Math.imul(al0, bh0);
    mid = (mid + Math.imul(ah0, bl0)) | 0;
    hi = Math.imul(ah0, bh0);
    var w0 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w0 >>> 26)) | 0;
    w0 &= 0x3ffffff;
    /* k = 1 */
    lo = Math.imul(al1, bl0);
    mid = Math.imul(al1, bh0);
    mid = (mid + Math.imul(ah1, bl0)) | 0;
    hi = Math.imul(ah1, bh0);
    lo = (lo + Math.imul(al0, bl1)) | 0;
    mid = (mid + Math.imul(al0, bh1)) | 0;
    mid = (mid + Math.imul(ah0, bl1)) | 0;
    hi = (hi + Math.imul(ah0, bh1)) | 0;
    var w1 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w1 >>> 26)) | 0;
    w1 &= 0x3ffffff;
    /* k = 2 */
    lo = Math.imul(al2, bl0);
    mid = Math.imul(al2, bh0);
    mid = (mid + Math.imul(ah2, bl0)) | 0;
    hi = Math.imul(ah2, bh0);
    lo = (lo + Math.imul(al1, bl1)) | 0;
    mid = (mid + Math.imul(al1, bh1)) | 0;
    mid = (mid + Math.imul(ah1, bl1)) | 0;
    hi = (hi + Math.imul(ah1, bh1)) | 0;
    lo = (lo + Math.imul(al0, bl2)) | 0;
    mid = (mid + Math.imul(al0, bh2)) | 0;
    mid = (mid + Math.imul(ah0, bl2)) | 0;
    hi = (hi + Math.imul(ah0, bh2)) | 0;
    var w2 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w2 >>> 26)) | 0;
    w2 &= 0x3ffffff;
    /* k = 3 */
    lo = Math.imul(al3, bl0);
    mid = Math.imul(al3, bh0);
    mid = (mid + Math.imul(ah3, bl0)) | 0;
    hi = Math.imul(ah3, bh0);
    lo = (lo + Math.imul(al2, bl1)) | 0;
    mid = (mid + Math.imul(al2, bh1)) | 0;
    mid = (mid + Math.imul(ah2, bl1)) | 0;
    hi = (hi + Math.imul(ah2, bh1)) | 0;
    lo = (lo + Math.imul(al1, bl2)) | 0;
    mid = (mid + Math.imul(al1, bh2)) | 0;
    mid = (mid + Math.imul(ah1, bl2)) | 0;
    hi = (hi + Math.imul(ah1, bh2)) | 0;
    lo = (lo + Math.imul(al0, bl3)) | 0;
    mid = (mid + Math.imul(al0, bh3)) | 0;
    mid = (mid + Math.imul(ah0, bl3)) | 0;
    hi = (hi + Math.imul(ah0, bh3)) | 0;
    var w3 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w3 >>> 26)) | 0;
    w3 &= 0x3ffffff;
    /* k = 4 */
    lo = Math.imul(al4, bl0);
    mid = Math.imul(al4, bh0);
    mid = (mid + Math.imul(ah4, bl0)) | 0;
    hi = Math.imul(ah4, bh0);
    lo = (lo + Math.imul(al3, bl1)) | 0;
    mid = (mid + Math.imul(al3, bh1)) | 0;
    mid = (mid + Math.imul(ah3, bl1)) | 0;
    hi = (hi + Math.imul(ah3, bh1)) | 0;
    lo = (lo + Math.imul(al2, bl2)) | 0;
    mid = (mid + Math.imul(al2, bh2)) | 0;
    mid = (mid + Math.imul(ah2, bl2)) | 0;
    hi = (hi + Math.imul(ah2, bh2)) | 0;
    lo = (lo + Math.imul(al1, bl3)) | 0;
    mid = (mid + Math.imul(al1, bh3)) | 0;
    mid = (mid + Math.imul(ah1, bl3)) | 0;
    hi = (hi + Math.imul(ah1, bh3)) | 0;
    lo = (lo + Math.imul(al0, bl4)) | 0;
    mid = (mid + Math.imul(al0, bh4)) | 0;
    mid = (mid + Math.imul(ah0, bl4)) | 0;
    hi = (hi + Math.imul(ah0, bh4)) | 0;
    var w4 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w4 >>> 26)) | 0;
    w4 &= 0x3ffffff;
    /* k = 5 */
    lo = Math.imul(al5, bl0);
    mid = Math.imul(al5, bh0);
    mid = (mid + Math.imul(ah5, bl0)) | 0;
    hi = Math.imul(ah5, bh0);
    lo = (lo + Math.imul(al4, bl1)) | 0;
    mid = (mid + Math.imul(al4, bh1)) | 0;
    mid = (mid + Math.imul(ah4, bl1)) | 0;
    hi = (hi + Math.imul(ah4, bh1)) | 0;
    lo = (lo + Math.imul(al3, bl2)) | 0;
    mid = (mid + Math.imul(al3, bh2)) | 0;
    mid = (mid + Math.imul(ah3, bl2)) | 0;
    hi = (hi + Math.imul(ah3, bh2)) | 0;
    lo = (lo + Math.imul(al2, bl3)) | 0;
    mid = (mid + Math.imul(al2, bh3)) | 0;
    mid = (mid + Math.imul(ah2, bl3)) | 0;
    hi = (hi + Math.imul(ah2, bh3)) | 0;
    lo = (lo + Math.imul(al1, bl4)) | 0;
    mid = (mid + Math.imul(al1, bh4)) | 0;
    mid = (mid + Math.imul(ah1, bl4)) | 0;
    hi = (hi + Math.imul(ah1, bh4)) | 0;
    lo = (lo + Math.imul(al0, bl5)) | 0;
    mid = (mid + Math.imul(al0, bh5)) | 0;
    mid = (mid + Math.imul(ah0, bl5)) | 0;
    hi = (hi + Math.imul(ah0, bh5)) | 0;
    var w5 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w5 >>> 26)) | 0;
    w5 &= 0x3ffffff;
    /* k = 6 */
    lo = Math.imul(al6, bl0);
    mid = Math.imul(al6, bh0);
    mid = (mid + Math.imul(ah6, bl0)) | 0;
    hi = Math.imul(ah6, bh0);
    lo = (lo + Math.imul(al5, bl1)) | 0;
    mid = (mid + Math.imul(al5, bh1)) | 0;
    mid = (mid + Math.imul(ah5, bl1)) | 0;
    hi = (hi + Math.imul(ah5, bh1)) | 0;
    lo = (lo + Math.imul(al4, bl2)) | 0;
    mid = (mid + Math.imul(al4, bh2)) | 0;
    mid = (mid + Math.imul(ah4, bl2)) | 0;
    hi = (hi + Math.imul(ah4, bh2)) | 0;
    lo = (lo + Math.imul(al3, bl3)) | 0;
    mid = (mid + Math.imul(al3, bh3)) | 0;
    mid = (mid + Math.imul(ah3, bl3)) | 0;
    hi = (hi + Math.imul(ah3, bh3)) | 0;
    lo = (lo + Math.imul(al2, bl4)) | 0;
    mid = (mid + Math.imul(al2, bh4)) | 0;
    mid = (mid + Math.imul(ah2, bl4)) | 0;
    hi = (hi + Math.imul(ah2, bh4)) | 0;
    lo = (lo + Math.imul(al1, bl5)) | 0;
    mid = (mid + Math.imul(al1, bh5)) | 0;
    mid = (mid + Math.imul(ah1, bl5)) | 0;
    hi = (hi + Math.imul(ah1, bh5)) | 0;
    lo = (lo + Math.imul(al0, bl6)) | 0;
    mid = (mid + Math.imul(al0, bh6)) | 0;
    mid = (mid + Math.imul(ah0, bl6)) | 0;
    hi = (hi + Math.imul(ah0, bh6)) | 0;
    var w6 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w6 >>> 26)) | 0;
    w6 &= 0x3ffffff;
    /* k = 7 */
    lo = Math.imul(al7, bl0);
    mid = Math.imul(al7, bh0);
    mid = (mid + Math.imul(ah7, bl0)) | 0;
    hi = Math.imul(ah7, bh0);
    lo = (lo + Math.imul(al6, bl1)) | 0;
    mid = (mid + Math.imul(al6, bh1)) | 0;
    mid = (mid + Math.imul(ah6, bl1)) | 0;
    hi = (hi + Math.imul(ah6, bh1)) | 0;
    lo = (lo + Math.imul(al5, bl2)) | 0;
    mid = (mid + Math.imul(al5, bh2)) | 0;
    mid = (mid + Math.imul(ah5, bl2)) | 0;
    hi = (hi + Math.imul(ah5, bh2)) | 0;
    lo = (lo + Math.imul(al4, bl3)) | 0;
    mid = (mid + Math.imul(al4, bh3)) | 0;
    mid = (mid + Math.imul(ah4, bl3)) | 0;
    hi = (hi + Math.imul(ah4, bh3)) | 0;
    lo = (lo + Math.imul(al3, bl4)) | 0;
    mid = (mid + Math.imul(al3, bh4)) | 0;
    mid = (mid + Math.imul(ah3, bl4)) | 0;
    hi = (hi + Math.imul(ah3, bh4)) | 0;
    lo = (lo + Math.imul(al2, bl5)) | 0;
    mid = (mid + Math.imul(al2, bh5)) | 0;
    mid = (mid + Math.imul(ah2, bl5)) | 0;
    hi = (hi + Math.imul(ah2, bh5)) | 0;
    lo = (lo + Math.imul(al1, bl6)) | 0;
    mid = (mid + Math.imul(al1, bh6)) | 0;
    mid = (mid + Math.imul(ah1, bl6)) | 0;
    hi = (hi + Math.imul(ah1, bh6)) | 0;
    lo = (lo + Math.imul(al0, bl7)) | 0;
    mid = (mid + Math.imul(al0, bh7)) | 0;
    mid = (mid + Math.imul(ah0, bl7)) | 0;
    hi = (hi + Math.imul(ah0, bh7)) | 0;
    var w7 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w7 >>> 26)) | 0;
    w7 &= 0x3ffffff;
    /* k = 8 */
    lo = Math.imul(al8, bl0);
    mid = Math.imul(al8, bh0);
    mid = (mid + Math.imul(ah8, bl0)) | 0;
    hi = Math.imul(ah8, bh0);
    lo = (lo + Math.imul(al7, bl1)) | 0;
    mid = (mid + Math.imul(al7, bh1)) | 0;
    mid = (mid + Math.imul(ah7, bl1)) | 0;
    hi = (hi + Math.imul(ah7, bh1)) | 0;
    lo = (lo + Math.imul(al6, bl2)) | 0;
    mid = (mid + Math.imul(al6, bh2)) | 0;
    mid = (mid + Math.imul(ah6, bl2)) | 0;
    hi = (hi + Math.imul(ah6, bh2)) | 0;
    lo = (lo + Math.imul(al5, bl3)) | 0;
    mid = (mid + Math.imul(al5, bh3)) | 0;
    mid = (mid + Math.imul(ah5, bl3)) | 0;
    hi = (hi + Math.imul(ah5, bh3)) | 0;
    lo = (lo + Math.imul(al4, bl4)) | 0;
    mid = (mid + Math.imul(al4, bh4)) | 0;
    mid = (mid + Math.imul(ah4, bl4)) | 0;
    hi = (hi + Math.imul(ah4, bh4)) | 0;
    lo = (lo + Math.imul(al3, bl5)) | 0;
    mid = (mid + Math.imul(al3, bh5)) | 0;
    mid = (mid + Math.imul(ah3, bl5)) | 0;
    hi = (hi + Math.imul(ah3, bh5)) | 0;
    lo = (lo + Math.imul(al2, bl6)) | 0;
    mid = (mid + Math.imul(al2, bh6)) | 0;
    mid = (mid + Math.imul(ah2, bl6)) | 0;
    hi = (hi + Math.imul(ah2, bh6)) | 0;
    lo = (lo + Math.imul(al1, bl7)) | 0;
    mid = (mid + Math.imul(al1, bh7)) | 0;
    mid = (mid + Math.imul(ah1, bl7)) | 0;
    hi = (hi + Math.imul(ah1, bh7)) | 0;
    lo = (lo + Math.imul(al0, bl8)) | 0;
    mid = (mid + Math.imul(al0, bh8)) | 0;
    mid = (mid + Math.imul(ah0, bl8)) | 0;
    hi = (hi + Math.imul(ah0, bh8)) | 0;
    var w8 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w8 >>> 26)) | 0;
    w8 &= 0x3ffffff;
    /* k = 9 */
    lo = Math.imul(al9, bl0);
    mid = Math.imul(al9, bh0);
    mid = (mid + Math.imul(ah9, bl0)) | 0;
    hi = Math.imul(ah9, bh0);
    lo = (lo + Math.imul(al8, bl1)) | 0;
    mid = (mid + Math.imul(al8, bh1)) | 0;
    mid = (mid + Math.imul(ah8, bl1)) | 0;
    hi = (hi + Math.imul(ah8, bh1)) | 0;
    lo = (lo + Math.imul(al7, bl2)) | 0;
    mid = (mid + Math.imul(al7, bh2)) | 0;
    mid = (mid + Math.imul(ah7, bl2)) | 0;
    hi = (hi + Math.imul(ah7, bh2)) | 0;
    lo = (lo + Math.imul(al6, bl3)) | 0;
    mid = (mid + Math.imul(al6, bh3)) | 0;
    mid = (mid + Math.imul(ah6, bl3)) | 0;
    hi = (hi + Math.imul(ah6, bh3)) | 0;
    lo = (lo + Math.imul(al5, bl4)) | 0;
    mid = (mid + Math.imul(al5, bh4)) | 0;
    mid = (mid + Math.imul(ah5, bl4)) | 0;
    hi = (hi + Math.imul(ah5, bh4)) | 0;
    lo = (lo + Math.imul(al4, bl5)) | 0;
    mid = (mid + Math.imul(al4, bh5)) | 0;
    mid = (mid + Math.imul(ah4, bl5)) | 0;
    hi = (hi + Math.imul(ah4, bh5)) | 0;
    lo = (lo + Math.imul(al3, bl6)) | 0;
    mid = (mid + Math.imul(al3, bh6)) | 0;
    mid = (mid + Math.imul(ah3, bl6)) | 0;
    hi = (hi + Math.imul(ah3, bh6)) | 0;
    lo = (lo + Math.imul(al2, bl7)) | 0;
    mid = (mid + Math.imul(al2, bh7)) | 0;
    mid = (mid + Math.imul(ah2, bl7)) | 0;
    hi = (hi + Math.imul(ah2, bh7)) | 0;
    lo = (lo + Math.imul(al1, bl8)) | 0;
    mid = (mid + Math.imul(al1, bh8)) | 0;
    mid = (mid + Math.imul(ah1, bl8)) | 0;
    hi = (hi + Math.imul(ah1, bh8)) | 0;
    lo = (lo + Math.imul(al0, bl9)) | 0;
    mid = (mid + Math.imul(al0, bh9)) | 0;
    mid = (mid + Math.imul(ah0, bl9)) | 0;
    hi = (hi + Math.imul(ah0, bh9)) | 0;
    var w9 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w9 >>> 26)) | 0;
    w9 &= 0x3ffffff;
    /* k = 10 */
    lo = Math.imul(al9, bl1);
    mid = Math.imul(al9, bh1);
    mid = (mid + Math.imul(ah9, bl1)) | 0;
    hi = Math.imul(ah9, bh1);
    lo = (lo + Math.imul(al8, bl2)) | 0;
    mid = (mid + Math.imul(al8, bh2)) | 0;
    mid = (mid + Math.imul(ah8, bl2)) | 0;
    hi = (hi + Math.imul(ah8, bh2)) | 0;
    lo = (lo + Math.imul(al7, bl3)) | 0;
    mid = (mid + Math.imul(al7, bh3)) | 0;
    mid = (mid + Math.imul(ah7, bl3)) | 0;
    hi = (hi + Math.imul(ah7, bh3)) | 0;
    lo = (lo + Math.imul(al6, bl4)) | 0;
    mid = (mid + Math.imul(al6, bh4)) | 0;
    mid = (mid + Math.imul(ah6, bl4)) | 0;
    hi = (hi + Math.imul(ah6, bh4)) | 0;
    lo = (lo + Math.imul(al5, bl5)) | 0;
    mid = (mid + Math.imul(al5, bh5)) | 0;
    mid = (mid + Math.imul(ah5, bl5)) | 0;
    hi = (hi + Math.imul(ah5, bh5)) | 0;
    lo = (lo + Math.imul(al4, bl6)) | 0;
    mid = (mid + Math.imul(al4, bh6)) | 0;
    mid = (mid + Math.imul(ah4, bl6)) | 0;
    hi = (hi + Math.imul(ah4, bh6)) | 0;
    lo = (lo + Math.imul(al3, bl7)) | 0;
    mid = (mid + Math.imul(al3, bh7)) | 0;
    mid = (mid + Math.imul(ah3, bl7)) | 0;
    hi = (hi + Math.imul(ah3, bh7)) | 0;
    lo = (lo + Math.imul(al2, bl8)) | 0;
    mid = (mid + Math.imul(al2, bh8)) | 0;
    mid = (mid + Math.imul(ah2, bl8)) | 0;
    hi = (hi + Math.imul(ah2, bh8)) | 0;
    lo = (lo + Math.imul(al1, bl9)) | 0;
    mid = (mid + Math.imul(al1, bh9)) | 0;
    mid = (mid + Math.imul(ah1, bl9)) | 0;
    hi = (hi + Math.imul(ah1, bh9)) | 0;
    var w10 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w10 >>> 26)) | 0;
    w10 &= 0x3ffffff;
    /* k = 11 */
    lo = Math.imul(al9, bl2);
    mid = Math.imul(al9, bh2);
    mid = (mid + Math.imul(ah9, bl2)) | 0;
    hi = Math.imul(ah9, bh2);
    lo = (lo + Math.imul(al8, bl3)) | 0;
    mid = (mid + Math.imul(al8, bh3)) | 0;
    mid = (mid + Math.imul(ah8, bl3)) | 0;
    hi = (hi + Math.imul(ah8, bh3)) | 0;
    lo = (lo + Math.imul(al7, bl4)) | 0;
    mid = (mid + Math.imul(al7, bh4)) | 0;
    mid = (mid + Math.imul(ah7, bl4)) | 0;
    hi = (hi + Math.imul(ah7, bh4)) | 0;
    lo = (lo + Math.imul(al6, bl5)) | 0;
    mid = (mid + Math.imul(al6, bh5)) | 0;
    mid = (mid + Math.imul(ah6, bl5)) | 0;
    hi = (hi + Math.imul(ah6, bh5)) | 0;
    lo = (lo + Math.imul(al5, bl6)) | 0;
    mid = (mid + Math.imul(al5, bh6)) | 0;
    mid = (mid + Math.imul(ah5, bl6)) | 0;
    hi = (hi + Math.imul(ah5, bh6)) | 0;
    lo = (lo + Math.imul(al4, bl7)) | 0;
    mid = (mid + Math.imul(al4, bh7)) | 0;
    mid = (mid + Math.imul(ah4, bl7)) | 0;
    hi = (hi + Math.imul(ah4, bh7)) | 0;
    lo = (lo + Math.imul(al3, bl8)) | 0;
    mid = (mid + Math.imul(al3, bh8)) | 0;
    mid = (mid + Math.imul(ah3, bl8)) | 0;
    hi = (hi + Math.imul(ah3, bh8)) | 0;
    lo = (lo + Math.imul(al2, bl9)) | 0;
    mid = (mid + Math.imul(al2, bh9)) | 0;
    mid = (mid + Math.imul(ah2, bl9)) | 0;
    hi = (hi + Math.imul(ah2, bh9)) | 0;
    var w11 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w11 >>> 26)) | 0;
    w11 &= 0x3ffffff;
    /* k = 12 */
    lo = Math.imul(al9, bl3);
    mid = Math.imul(al9, bh3);
    mid = (mid + Math.imul(ah9, bl3)) | 0;
    hi = Math.imul(ah9, bh3);
    lo = (lo + Math.imul(al8, bl4)) | 0;
    mid = (mid + Math.imul(al8, bh4)) | 0;
    mid = (mid + Math.imul(ah8, bl4)) | 0;
    hi = (hi + Math.imul(ah8, bh4)) | 0;
    lo = (lo + Math.imul(al7, bl5)) | 0;
    mid = (mid + Math.imul(al7, bh5)) | 0;
    mid = (mid + Math.imul(ah7, bl5)) | 0;
    hi = (hi + Math.imul(ah7, bh5)) | 0;
    lo = (lo + Math.imul(al6, bl6)) | 0;
    mid = (mid + Math.imul(al6, bh6)) | 0;
    mid = (mid + Math.imul(ah6, bl6)) | 0;
    hi = (hi + Math.imul(ah6, bh6)) | 0;
    lo = (lo + Math.imul(al5, bl7)) | 0;
    mid = (mid + Math.imul(al5, bh7)) | 0;
    mid = (mid + Math.imul(ah5, bl7)) | 0;
    hi = (hi + Math.imul(ah5, bh7)) | 0;
    lo = (lo + Math.imul(al4, bl8)) | 0;
    mid = (mid + Math.imul(al4, bh8)) | 0;
    mid = (mid + Math.imul(ah4, bl8)) | 0;
    hi = (hi + Math.imul(ah4, bh8)) | 0;
    lo = (lo + Math.imul(al3, bl9)) | 0;
    mid = (mid + Math.imul(al3, bh9)) | 0;
    mid = (mid + Math.imul(ah3, bl9)) | 0;
    hi = (hi + Math.imul(ah3, bh9)) | 0;
    var w12 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w12 >>> 26)) | 0;
    w12 &= 0x3ffffff;
    /* k = 13 */
    lo = Math.imul(al9, bl4);
    mid = Math.imul(al9, bh4);
    mid = (mid + Math.imul(ah9, bl4)) | 0;
    hi = Math.imul(ah9, bh4);
    lo = (lo + Math.imul(al8, bl5)) | 0;
    mid = (mid + Math.imul(al8, bh5)) | 0;
    mid = (mid + Math.imul(ah8, bl5)) | 0;
    hi = (hi + Math.imul(ah8, bh5)) | 0;
    lo = (lo + Math.imul(al7, bl6)) | 0;
    mid = (mid + Math.imul(al7, bh6)) | 0;
    mid = (mid + Math.imul(ah7, bl6)) | 0;
    hi = (hi + Math.imul(ah7, bh6)) | 0;
    lo = (lo + Math.imul(al6, bl7)) | 0;
    mid = (mid + Math.imul(al6, bh7)) | 0;
    mid = (mid + Math.imul(ah6, bl7)) | 0;
    hi = (hi + Math.imul(ah6, bh7)) | 0;
    lo = (lo + Math.imul(al5, bl8)) | 0;
    mid = (mid + Math.imul(al5, bh8)) | 0;
    mid = (mid + Math.imul(ah5, bl8)) | 0;
    hi = (hi + Math.imul(ah5, bh8)) | 0;
    lo = (lo + Math.imul(al4, bl9)) | 0;
    mid = (mid + Math.imul(al4, bh9)) | 0;
    mid = (mid + Math.imul(ah4, bl9)) | 0;
    hi = (hi + Math.imul(ah4, bh9)) | 0;
    var w13 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w13 >>> 26)) | 0;
    w13 &= 0x3ffffff;
    /* k = 14 */
    lo = Math.imul(al9, bl5);
    mid = Math.imul(al9, bh5);
    mid = (mid + Math.imul(ah9, bl5)) | 0;
    hi = Math.imul(ah9, bh5);
    lo = (lo + Math.imul(al8, bl6)) | 0;
    mid = (mid + Math.imul(al8, bh6)) | 0;
    mid = (mid + Math.imul(ah8, bl6)) | 0;
    hi = (hi + Math.imul(ah8, bh6)) | 0;
    lo = (lo + Math.imul(al7, bl7)) | 0;
    mid = (mid + Math.imul(al7, bh7)) | 0;
    mid = (mid + Math.imul(ah7, bl7)) | 0;
    hi = (hi + Math.imul(ah7, bh7)) | 0;
    lo = (lo + Math.imul(al6, bl8)) | 0;
    mid = (mid + Math.imul(al6, bh8)) | 0;
    mid = (mid + Math.imul(ah6, bl8)) | 0;
    hi = (hi + Math.imul(ah6, bh8)) | 0;
    lo = (lo + Math.imul(al5, bl9)) | 0;
    mid = (mid + Math.imul(al5, bh9)) | 0;
    mid = (mid + Math.imul(ah5, bl9)) | 0;
    hi = (hi + Math.imul(ah5, bh9)) | 0;
    var w14 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w14 >>> 26)) | 0;
    w14 &= 0x3ffffff;
    /* k = 15 */
    lo = Math.imul(al9, bl6);
    mid = Math.imul(al9, bh6);
    mid = (mid + Math.imul(ah9, bl6)) | 0;
    hi = Math.imul(ah9, bh6);
    lo = (lo + Math.imul(al8, bl7)) | 0;
    mid = (mid + Math.imul(al8, bh7)) | 0;
    mid = (mid + Math.imul(ah8, bl7)) | 0;
    hi = (hi + Math.imul(ah8, bh7)) | 0;
    lo = (lo + Math.imul(al7, bl8)) | 0;
    mid = (mid + Math.imul(al7, bh8)) | 0;
    mid = (mid + Math.imul(ah7, bl8)) | 0;
    hi = (hi + Math.imul(ah7, bh8)) | 0;
    lo = (lo + Math.imul(al6, bl9)) | 0;
    mid = (mid + Math.imul(al6, bh9)) | 0;
    mid = (mid + Math.imul(ah6, bl9)) | 0;
    hi = (hi + Math.imul(ah6, bh9)) | 0;
    var w15 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w15 >>> 26)) | 0;
    w15 &= 0x3ffffff;
    /* k = 16 */
    lo = Math.imul(al9, bl7);
    mid = Math.imul(al9, bh7);
    mid = (mid + Math.imul(ah9, bl7)) | 0;
    hi = Math.imul(ah9, bh7);
    lo = (lo + Math.imul(al8, bl8)) | 0;
    mid = (mid + Math.imul(al8, bh8)) | 0;
    mid = (mid + Math.imul(ah8, bl8)) | 0;
    hi = (hi + Math.imul(ah8, bh8)) | 0;
    lo = (lo + Math.imul(al7, bl9)) | 0;
    mid = (mid + Math.imul(al7, bh9)) | 0;
    mid = (mid + Math.imul(ah7, bl9)) | 0;
    hi = (hi + Math.imul(ah7, bh9)) | 0;
    var w16 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w16 >>> 26)) | 0;
    w16 &= 0x3ffffff;
    /* k = 17 */
    lo = Math.imul(al9, bl8);
    mid = Math.imul(al9, bh8);
    mid = (mid + Math.imul(ah9, bl8)) | 0;
    hi = Math.imul(ah9, bh8);
    lo = (lo + Math.imul(al8, bl9)) | 0;
    mid = (mid + Math.imul(al8, bh9)) | 0;
    mid = (mid + Math.imul(ah8, bl9)) | 0;
    hi = (hi + Math.imul(ah8, bh9)) | 0;
    var w17 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w17 >>> 26)) | 0;
    w17 &= 0x3ffffff;
    /* k = 18 */
    lo = Math.imul(al9, bl9);
    mid = Math.imul(al9, bh9);
    mid = (mid + Math.imul(ah9, bl9)) | 0;
    hi = Math.imul(ah9, bh9);
    var w18 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w18 >>> 26)) | 0;
    w18 &= 0x3ffffff;
    o[0] = w0;
    o[1] = w1;
    o[2] = w2;
    o[3] = w3;
    o[4] = w4;
    o[5] = w5;
    o[6] = w6;
    o[7] = w7;
    o[8] = w8;
    o[9] = w9;
    o[10] = w10;
    o[11] = w11;
    o[12] = w12;
    o[13] = w13;
    o[14] = w14;
    o[15] = w15;
    o[16] = w16;
    o[17] = w17;
    o[18] = w18;
    if (c !== 0) {
      o[19] = c;
      out.length++;
    }
    return out;
  };

  // Polyfill comb
  if (!Math.imul) {
    comb10MulTo = smallMulTo;
  }

  function bigMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    out.length = self.length + num.length;

    var carry = 0;
    var hncarry = 0;
    for (var k = 0; k < out.length - 1; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = hncarry;
      hncarry = 0;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = k - j;
        var a = self.words[i] | 0;
        var b = num.words[j] | 0;
        var r = a * b;

        var lo = r & 0x3ffffff;
        ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
        lo = (lo + rword) | 0;
        rword = lo & 0x3ffffff;
        ncarry = (ncarry + (lo >>> 26)) | 0;

        hncarry += ncarry >>> 26;
        ncarry &= 0x3ffffff;
      }
      out.words[k] = rword;
      carry = ncarry;
      ncarry = hncarry;
    }
    if (carry !== 0) {
      out.words[k] = carry;
    } else {
      out.length--;
    }

    return out.strip();
  }

  function jumboMulTo (self, num, out) {
    var fftm = new FFTM();
    return fftm.mulp(self, num, out);
  }

  BN.prototype.mulTo = function mulTo (num, out) {
    var res;
    var len = this.length + num.length;
    if (this.length === 10 && num.length === 10) {
      res = comb10MulTo(this, num, out);
    } else if (len < 63) {
      res = smallMulTo(this, num, out);
    } else if (len < 1024) {
      res = bigMulTo(this, num, out);
    } else {
      res = jumboMulTo(this, num, out);
    }

    return res;
  };

  // Cooley-Tukey algorithm for FFT
  // slightly revisited to rely on looping instead of recursion

  function FFTM (x, y) {
    this.x = x;
    this.y = y;
  }

  FFTM.prototype.makeRBT = function makeRBT (N) {
    var t = new Array(N);
    var l = BN.prototype._countBits(N) - 1;
    for (var i = 0; i < N; i++) {
      t[i] = this.revBin(i, l, N);
    }

    return t;
  };

  // Returns binary-reversed representation of `x`
  FFTM.prototype.revBin = function revBin (x, l, N) {
    if (x === 0 || x === N - 1) return x;

    var rb = 0;
    for (var i = 0; i < l; i++) {
      rb |= (x & 1) << (l - i - 1);
      x >>= 1;
    }

    return rb;
  };

  // Performs "tweedling" phase, therefore 'emulating'
  // behaviour of the recursive algorithm
  FFTM.prototype.permute = function permute (rbt, rws, iws, rtws, itws, N) {
    for (var i = 0; i < N; i++) {
      rtws[i] = rws[rbt[i]];
      itws[i] = iws[rbt[i]];
    }
  };

  FFTM.prototype.transform = function transform (rws, iws, rtws, itws, N, rbt) {
    this.permute(rbt, rws, iws, rtws, itws, N);

    for (var s = 1; s < N; s <<= 1) {
      var l = s << 1;

      var rtwdf = Math.cos(2 * Math.PI / l);
      var itwdf = Math.sin(2 * Math.PI / l);

      for (var p = 0; p < N; p += l) {
        var rtwdf_ = rtwdf;
        var itwdf_ = itwdf;

        for (var j = 0; j < s; j++) {
          var re = rtws[p + j];
          var ie = itws[p + j];

          var ro = rtws[p + j + s];
          var io = itws[p + j + s];

          var rx = rtwdf_ * ro - itwdf_ * io;

          io = rtwdf_ * io + itwdf_ * ro;
          ro = rx;

          rtws[p + j] = re + ro;
          itws[p + j] = ie + io;

          rtws[p + j + s] = re - ro;
          itws[p + j + s] = ie - io;

          /* jshint maxdepth : false */
          if (j !== l) {
            rx = rtwdf * rtwdf_ - itwdf * itwdf_;

            itwdf_ = rtwdf * itwdf_ + itwdf * rtwdf_;
            rtwdf_ = rx;
          }
        }
      }
    }
  };

  FFTM.prototype.guessLen13b = function guessLen13b (n, m) {
    var N = Math.max(m, n) | 1;
    var odd = N & 1;
    var i = 0;
    for (N = N / 2 | 0; N; N = N >>> 1) {
      i++;
    }

    return 1 << i + 1 + odd;
  };

  FFTM.prototype.conjugate = function conjugate (rws, iws, N) {
    if (N <= 1) return;

    for (var i = 0; i < N / 2; i++) {
      var t = rws[i];

      rws[i] = rws[N - i - 1];
      rws[N - i - 1] = t;

      t = iws[i];

      iws[i] = -iws[N - i - 1];
      iws[N - i - 1] = -t;
    }
  };

  FFTM.prototype.normalize13b = function normalize13b (ws, N) {
    var carry = 0;
    for (var i = 0; i < N / 2; i++) {
      var w = Math.round(ws[2 * i + 1] / N) * 0x2000 +
        Math.round(ws[2 * i] / N) +
        carry;

      ws[i] = w & 0x3ffffff;

      if (w < 0x4000000) {
        carry = 0;
      } else {
        carry = w / 0x4000000 | 0;
      }
    }

    return ws;
  };

  FFTM.prototype.convert13b = function convert13b (ws, len, rws, N) {
    var carry = 0;
    for (var i = 0; i < len; i++) {
      carry = carry + (ws[i] | 0);

      rws[2 * i] = carry & 0x1fff; carry = carry >>> 13;
      rws[2 * i + 1] = carry & 0x1fff; carry = carry >>> 13;
    }

    // Pad with zeroes
    for (i = 2 * len; i < N; ++i) {
      rws[i] = 0;
    }

    assert(carry === 0);
    assert((carry & ~0x1fff) === 0);
  };

  FFTM.prototype.stub = function stub (N) {
    var ph = new Array(N);
    for (var i = 0; i < N; i++) {
      ph[i] = 0;
    }

    return ph;
  };

  FFTM.prototype.mulp = function mulp (x, y, out) {
    var N = 2 * this.guessLen13b(x.length, y.length);

    var rbt = this.makeRBT(N);

    var _ = this.stub(N);

    var rws = new Array(N);
    var rwst = new Array(N);
    var iwst = new Array(N);

    var nrws = new Array(N);
    var nrwst = new Array(N);
    var niwst = new Array(N);

    var rmws = out.words;
    rmws.length = N;

    this.convert13b(x.words, x.length, rws, N);
    this.convert13b(y.words, y.length, nrws, N);

    this.transform(rws, _, rwst, iwst, N, rbt);
    this.transform(nrws, _, nrwst, niwst, N, rbt);

    for (var i = 0; i < N; i++) {
      var rx = rwst[i] * nrwst[i] - iwst[i] * niwst[i];
      iwst[i] = rwst[i] * niwst[i] + iwst[i] * nrwst[i];
      rwst[i] = rx;
    }

    this.conjugate(rwst, iwst, N);
    this.transform(rwst, iwst, rmws, _, N, rbt);
    this.conjugate(rmws, _, N);
    this.normalize13b(rmws, N);

    out.negative = x.negative ^ y.negative;
    out.length = x.length + y.length;
    return out.strip();
  };

  // Multiply `this` by `num`
  BN.prototype.mul = function mul (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return this.mulTo(num, out);
  };

  // Multiply employing FFT
  BN.prototype.mulf = function mulf (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return jumboMulTo(this, num, out);
  };

  // In-place Multiplication
  BN.prototype.imul = function imul (num) {
    return this.clone().mulTo(num, this);
  };

  BN.prototype.imuln = function imuln (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);

    // Carry
    var carry = 0;
    for (var i = 0; i < this.length; i++) {
      var w = (this.words[i] | 0) * num;
      var lo = (w & 0x3ffffff) + (carry & 0x3ffffff);
      carry >>= 26;
      carry += (w / 0x4000000) | 0;
      // NOTE: lo is 27bit maximum
      carry += lo >>> 26;
      this.words[i] = lo & 0x3ffffff;
    }

    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }

    return this;
  };

  BN.prototype.muln = function muln (num) {
    return this.clone().imuln(num);
  };

  // `this` * `this`
  BN.prototype.sqr = function sqr () {
    return this.mul(this);
  };

  // `this` * `this` in-place
  BN.prototype.isqr = function isqr () {
    return this.imul(this.clone());
  };

  // Math.pow(`this`, `num`)
  BN.prototype.pow = function pow (num) {
    var w = toBitArray(num);
    if (w.length === 0) return new BN(1);

    // Skip leading zeroes
    var res = this;
    for (var i = 0; i < w.length; i++, res = res.sqr()) {
      if (w[i] !== 0) break;
    }

    if (++i < w.length) {
      for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
        if (w[i] === 0) continue;

        res = res.mul(q);
      }
    }

    return res;
  };

  // Shift-left in-place
  BN.prototype.iushln = function iushln (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;
    var carryMask = (0x3ffffff >>> (26 - r)) << (26 - r);
    var i;

    if (r !== 0) {
      var carry = 0;

      for (i = 0; i < this.length; i++) {
        var newCarry = this.words[i] & carryMask;
        var c = ((this.words[i] | 0) - newCarry) << r;
        this.words[i] = c | carry;
        carry = newCarry >>> (26 - r);
      }

      if (carry) {
        this.words[i] = carry;
        this.length++;
      }
    }

    if (s !== 0) {
      for (i = this.length - 1; i >= 0; i--) {
        this.words[i + s] = this.words[i];
      }

      for (i = 0; i < s; i++) {
        this.words[i] = 0;
      }

      this.length += s;
    }

    return this.strip();
  };

  BN.prototype.ishln = function ishln (bits) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushln(bits);
  };

  // Shift-right in-place
  // NOTE: `hint` is a lowest bit before trailing zeroes
  // NOTE: if `extended` is present - it will be filled with destroyed bits
  BN.prototype.iushrn = function iushrn (bits, hint, extended) {
    assert(typeof bits === 'number' && bits >= 0);
    var h;
    if (hint) {
      h = (hint - (hint % 26)) / 26;
    } else {
      h = 0;
    }

    var r = bits % 26;
    var s = Math.min((bits - r) / 26, this.length);
    var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
    var maskedWords = extended;

    h -= s;
    h = Math.max(0, h);

    // Extended mode, copy masked part
    if (maskedWords) {
      for (var i = 0; i < s; i++) {
        maskedWords.words[i] = this.words[i];
      }
      maskedWords.length = s;
    }

    if (s === 0) {
      // No-op, we should not move anything at all
    } else if (this.length > s) {
      this.length -= s;
      for (i = 0; i < this.length; i++) {
        this.words[i] = this.words[i + s];
      }
    } else {
      this.words[0] = 0;
      this.length = 1;
    }

    var carry = 0;
    for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
      var word = this.words[i] | 0;
      this.words[i] = (carry << (26 - r)) | (word >>> r);
      carry = word & mask;
    }

    // Push carried bits as a mask
    if (maskedWords && carry !== 0) {
      maskedWords.words[maskedWords.length++] = carry;
    }

    if (this.length === 0) {
      this.words[0] = 0;
      this.length = 1;
    }

    return this.strip();
  };

  BN.prototype.ishrn = function ishrn (bits, hint, extended) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushrn(bits, hint, extended);
  };

  // Shift-left
  BN.prototype.shln = function shln (bits) {
    return this.clone().ishln(bits);
  };

  BN.prototype.ushln = function ushln (bits) {
    return this.clone().iushln(bits);
  };

  // Shift-right
  BN.prototype.shrn = function shrn (bits) {
    return this.clone().ishrn(bits);
  };

  BN.prototype.ushrn = function ushrn (bits) {
    return this.clone().iushrn(bits);
  };

  // Test if n bit is set
  BN.prototype.testn = function testn (bit) {
    assert(typeof bit === 'number' && bit >= 0);
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) return false;

    // Check bit and return
    var w = this.words[s];

    return !!(w & q);
  };

  // Return only lowers bits of number (in-place)
  BN.prototype.imaskn = function imaskn (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;

    assert(this.negative === 0, 'imaskn works only with positive numbers');

    if (this.length <= s) {
      return this;
    }

    if (r !== 0) {
      s++;
    }
    this.length = Math.min(s, this.length);

    if (r !== 0) {
      var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
      this.words[this.length - 1] &= mask;
    }

    return this.strip();
  };

  // Return only lowers bits of number
  BN.prototype.maskn = function maskn (bits) {
    return this.clone().imaskn(bits);
  };

  // Add plain number `num` to `this`
  BN.prototype.iaddn = function iaddn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.isubn(-num);

    // Possible sign change
    if (this.negative !== 0) {
      if (this.length === 1 && (this.words[0] | 0) < num) {
        this.words[0] = num - (this.words[0] | 0);
        this.negative = 0;
        return this;
      }

      this.negative = 0;
      this.isubn(num);
      this.negative = 1;
      return this;
    }

    // Add without checks
    return this._iaddn(num);
  };

  BN.prototype._iaddn = function _iaddn (num) {
    this.words[0] += num;

    // Carry
    for (var i = 0; i < this.length && this.words[i] >= 0x4000000; i++) {
      this.words[i] -= 0x4000000;
      if (i === this.length - 1) {
        this.words[i + 1] = 1;
      } else {
        this.words[i + 1]++;
      }
    }
    this.length = Math.max(this.length, i + 1);

    return this;
  };

  // Subtract plain number `num` from `this`
  BN.prototype.isubn = function isubn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.iaddn(-num);

    if (this.negative !== 0) {
      this.negative = 0;
      this.iaddn(num);
      this.negative = 1;
      return this;
    }

    this.words[0] -= num;

    if (this.length === 1 && this.words[0] < 0) {
      this.words[0] = -this.words[0];
      this.negative = 1;
    } else {
      // Carry
      for (var i = 0; i < this.length && this.words[i] < 0; i++) {
        this.words[i] += 0x4000000;
        this.words[i + 1] -= 1;
      }
    }

    return this.strip();
  };

  BN.prototype.addn = function addn (num) {
    return this.clone().iaddn(num);
  };

  BN.prototype.subn = function subn (num) {
    return this.clone().isubn(num);
  };

  BN.prototype.iabs = function iabs () {
    this.negative = 0;

    return this;
  };

  BN.prototype.abs = function abs () {
    return this.clone().iabs();
  };

  BN.prototype._ishlnsubmul = function _ishlnsubmul (num, mul, shift) {
    var len = num.length + shift;
    var i;

    this._expand(len);

    var w;
    var carry = 0;
    for (i = 0; i < num.length; i++) {
      w = (this.words[i + shift] | 0) + carry;
      var right = (num.words[i] | 0) * mul;
      w -= right & 0x3ffffff;
      carry = (w >> 26) - ((right / 0x4000000) | 0);
      this.words[i + shift] = w & 0x3ffffff;
    }
    for (; i < this.length - shift; i++) {
      w = (this.words[i + shift] | 0) + carry;
      carry = w >> 26;
      this.words[i + shift] = w & 0x3ffffff;
    }

    if (carry === 0) return this.strip();

    // Subtraction overflow
    assert(carry === -1);
    carry = 0;
    for (i = 0; i < this.length; i++) {
      w = -(this.words[i] | 0) + carry;
      carry = w >> 26;
      this.words[i] = w & 0x3ffffff;
    }
    this.negative = 1;

    return this.strip();
  };

  BN.prototype._wordDiv = function _wordDiv (num, mode) {
    var shift = this.length - num.length;

    var a = this.clone();
    var b = num;

    // Normalize
    var bhi = b.words[b.length - 1] | 0;
    var bhiBits = this._countBits(bhi);
    shift = 26 - bhiBits;
    if (shift !== 0) {
      b = b.ushln(shift);
      a.iushln(shift);
      bhi = b.words[b.length - 1] | 0;
    }

    // Initialize quotient
    var m = a.length - b.length;
    var q;

    if (mode !== 'mod') {
      q = new BN(null);
      q.length = m + 1;
      q.words = new Array(q.length);
      for (var i = 0; i < q.length; i++) {
        q.words[i] = 0;
      }
    }

    var diff = a.clone()._ishlnsubmul(b, 1, m);
    if (diff.negative === 0) {
      a = diff;
      if (q) {
        q.words[m] = 1;
      }
    }

    for (var j = m - 1; j >= 0; j--) {
      var qj = (a.words[b.length + j] | 0) * 0x4000000 +
        (a.words[b.length + j - 1] | 0);

      // NOTE: (qj / bhi) is (0x3ffffff * 0x4000000 + 0x3ffffff) / 0x2000000 max
      // (0x7ffffff)
      qj = Math.min((qj / bhi) | 0, 0x3ffffff);

      a._ishlnsubmul(b, qj, j);
      while (a.negative !== 0) {
        qj--;
        a.negative = 0;
        a._ishlnsubmul(b, 1, j);
        if (!a.isZero()) {
          a.negative ^= 1;
        }
      }
      if (q) {
        q.words[j] = qj;
      }
    }
    if (q) {
      q.strip();
    }
    a.strip();

    // Denormalize
    if (mode !== 'div' && shift !== 0) {
      a.iushrn(shift);
    }

    return {
      div: q || null,
      mod: a
    };
  };

  // NOTE: 1) `mode` can be set to `mod` to request mod only,
  //       to `div` to request div only, or be absent to
  //       request both div & mod
  //       2) `positive` is true if unsigned mod is requested
  BN.prototype.divmod = function divmod (num, mode, positive) {
    assert(!num.isZero());

    if (this.isZero()) {
      return {
        div: new BN(0),
        mod: new BN(0)
      };
    }

    var div, mod, res;
    if (this.negative !== 0 && num.negative === 0) {
      res = this.neg().divmod(num, mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.iadd(num);
        }
      }

      return {
        div: div,
        mod: mod
      };
    }

    if (this.negative === 0 && num.negative !== 0) {
      res = this.divmod(num.neg(), mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      return {
        div: div,
        mod: res.mod
      };
    }

    if ((this.negative & num.negative) !== 0) {
      res = this.neg().divmod(num.neg(), mode);

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.isub(num);
        }
      }

      return {
        div: res.div,
        mod: mod
      };
    }

    // Both numbers are positive at this point

    // Strip both numbers to approximate shift value
    if (num.length > this.length || this.cmp(num) < 0) {
      return {
        div: new BN(0),
        mod: this
      };
    }

    // Very short reduction
    if (num.length === 1) {
      if (mode === 'div') {
        return {
          div: this.divn(num.words[0]),
          mod: null
        };
      }

      if (mode === 'mod') {
        return {
          div: null,
          mod: new BN(this.modn(num.words[0]))
        };
      }

      return {
        div: this.divn(num.words[0]),
        mod: new BN(this.modn(num.words[0]))
      };
    }

    return this._wordDiv(num, mode);
  };

  // Find `this` / `num`
  BN.prototype.div = function div (num) {
    return this.divmod(num, 'div', false).div;
  };

  // Find `this` % `num`
  BN.prototype.mod = function mod (num) {
    return this.divmod(num, 'mod', false).mod;
  };

  BN.prototype.umod = function umod (num) {
    return this.divmod(num, 'mod', true).mod;
  };

  // Find Round(`this` / `num`)
  BN.prototype.divRound = function divRound (num) {
    var dm = this.divmod(num);

    // Fast case - exact division
    if (dm.mod.isZero()) return dm.div;

    var mod = dm.div.negative !== 0 ? dm.mod.isub(num) : dm.mod;

    var half = num.ushrn(1);
    var r2 = num.andln(1);
    var cmp = mod.cmp(half);

    // Round down
    if (cmp < 0 || r2 === 1 && cmp === 0) return dm.div;

    // Round up
    return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
  };

  BN.prototype.modn = function modn (num) {
    assert(num <= 0x3ffffff);
    var p = (1 << 26) % num;

    var acc = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      acc = (p * acc + (this.words[i] | 0)) % num;
    }

    return acc;
  };

  // In-place division by number
  BN.prototype.idivn = function idivn (num) {
    assert(num <= 0x3ffffff);

    var carry = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var w = (this.words[i] | 0) + carry * 0x4000000;
      this.words[i] = (w / num) | 0;
      carry = w % num;
    }

    return this.strip();
  };

  BN.prototype.divn = function divn (num) {
    return this.clone().idivn(num);
  };

  BN.prototype.egcd = function egcd (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var x = this;
    var y = p.clone();

    if (x.negative !== 0) {
      x = x.umod(p);
    } else {
      x = x.clone();
    }

    // A * x + B * y = x
    var A = new BN(1);
    var B = new BN(0);

    // C * x + D * y = y
    var C = new BN(0);
    var D = new BN(1);

    var g = 0;

    while (x.isEven() && y.isEven()) {
      x.iushrn(1);
      y.iushrn(1);
      ++g;
    }

    var yp = y.clone();
    var xp = x.clone();

    while (!x.isZero()) {
      for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        x.iushrn(i);
        while (i-- > 0) {
          if (A.isOdd() || B.isOdd()) {
            A.iadd(yp);
            B.isub(xp);
          }

          A.iushrn(1);
          B.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        y.iushrn(j);
        while (j-- > 0) {
          if (C.isOdd() || D.isOdd()) {
            C.iadd(yp);
            D.isub(xp);
          }

          C.iushrn(1);
          D.iushrn(1);
        }
      }

      if (x.cmp(y) >= 0) {
        x.isub(y);
        A.isub(C);
        B.isub(D);
      } else {
        y.isub(x);
        C.isub(A);
        D.isub(B);
      }
    }

    return {
      a: C,
      b: D,
      gcd: y.iushln(g)
    };
  };

  // This is reduced incarnation of the binary EEA
  // above, designated to invert members of the
  // _prime_ fields F(p) at a maximal speed
  BN.prototype._invmp = function _invmp (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var a = this;
    var b = p.clone();

    if (a.negative !== 0) {
      a = a.umod(p);
    } else {
      a = a.clone();
    }

    var x1 = new BN(1);
    var x2 = new BN(0);

    var delta = b.clone();

    while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
      for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        a.iushrn(i);
        while (i-- > 0) {
          if (x1.isOdd()) {
            x1.iadd(delta);
          }

          x1.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        b.iushrn(j);
        while (j-- > 0) {
          if (x2.isOdd()) {
            x2.iadd(delta);
          }

          x2.iushrn(1);
        }
      }

      if (a.cmp(b) >= 0) {
        a.isub(b);
        x1.isub(x2);
      } else {
        b.isub(a);
        x2.isub(x1);
      }
    }

    var res;
    if (a.cmpn(1) === 0) {
      res = x1;
    } else {
      res = x2;
    }

    if (res.cmpn(0) < 0) {
      res.iadd(p);
    }

    return res;
  };

  BN.prototype.gcd = function gcd (num) {
    if (this.isZero()) return num.abs();
    if (num.isZero()) return this.abs();

    var a = this.clone();
    var b = num.clone();
    a.negative = 0;
    b.negative = 0;

    // Remove common factor of two
    for (var shift = 0; a.isEven() && b.isEven(); shift++) {
      a.iushrn(1);
      b.iushrn(1);
    }

    do {
      while (a.isEven()) {
        a.iushrn(1);
      }
      while (b.isEven()) {
        b.iushrn(1);
      }

      var r = a.cmp(b);
      if (r < 0) {
        // Swap `a` and `b` to make `a` always bigger than `b`
        var t = a;
        a = b;
        b = t;
      } else if (r === 0 || b.cmpn(1) === 0) {
        break;
      }

      a.isub(b);
    } while (true);

    return b.iushln(shift);
  };

  // Invert number in the field F(num)
  BN.prototype.invm = function invm (num) {
    return this.egcd(num).a.umod(num);
  };

  BN.prototype.isEven = function isEven () {
    return (this.words[0] & 1) === 0;
  };

  BN.prototype.isOdd = function isOdd () {
    return (this.words[0] & 1) === 1;
  };

  // And first word and num
  BN.prototype.andln = function andln (num) {
    return this.words[0] & num;
  };

  // Increment at the bit position in-line
  BN.prototype.bincn = function bincn (bit) {
    assert(typeof bit === 'number');
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) {
      this._expand(s + 1);
      this.words[s] |= q;
      return this;
    }

    // Add bit and propagate, if needed
    var carry = q;
    for (var i = s; carry !== 0 && i < this.length; i++) {
      var w = this.words[i] | 0;
      w += carry;
      carry = w >>> 26;
      w &= 0x3ffffff;
      this.words[i] = w;
    }
    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }
    return this;
  };

  BN.prototype.isZero = function isZero () {
    return this.length === 1 && this.words[0] === 0;
  };

  BN.prototype.cmpn = function cmpn (num) {
    var negative = num < 0;

    if (this.negative !== 0 && !negative) return -1;
    if (this.negative === 0 && negative) return 1;

    this.strip();

    var res;
    if (this.length > 1) {
      res = 1;
    } else {
      if (negative) {
        num = -num;
      }

      assert(num <= 0x3ffffff, 'Number is too big');

      var w = this.words[0] | 0;
      res = w === num ? 0 : w < num ? -1 : 1;
    }
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Compare two numbers and return:
  // 1 - if `this` > `num`
  // 0 - if `this` == `num`
  // -1 - if `this` < `num`
  BN.prototype.cmp = function cmp (num) {
    if (this.negative !== 0 && num.negative === 0) return -1;
    if (this.negative === 0 && num.negative !== 0) return 1;

    var res = this.ucmp(num);
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Unsigned comparison
  BN.prototype.ucmp = function ucmp (num) {
    // At this point both numbers have the same sign
    if (this.length > num.length) return 1;
    if (this.length < num.length) return -1;

    var res = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var a = this.words[i] | 0;
      var b = num.words[i] | 0;

      if (a === b) continue;
      if (a < b) {
        res = -1;
      } else if (a > b) {
        res = 1;
      }
      break;
    }
    return res;
  };

  BN.prototype.gtn = function gtn (num) {
    return this.cmpn(num) === 1;
  };

  BN.prototype.gt = function gt (num) {
    return this.cmp(num) === 1;
  };

  BN.prototype.gten = function gten (num) {
    return this.cmpn(num) >= 0;
  };

  BN.prototype.gte = function gte (num) {
    return this.cmp(num) >= 0;
  };

  BN.prototype.ltn = function ltn (num) {
    return this.cmpn(num) === -1;
  };

  BN.prototype.lt = function lt (num) {
    return this.cmp(num) === -1;
  };

  BN.prototype.lten = function lten (num) {
    return this.cmpn(num) <= 0;
  };

  BN.prototype.lte = function lte (num) {
    return this.cmp(num) <= 0;
  };

  BN.prototype.eqn = function eqn (num) {
    return this.cmpn(num) === 0;
  };

  BN.prototype.eq = function eq (num) {
    return this.cmp(num) === 0;
  };

  //
  // A reduce context, could be using montgomery or something better, depending
  // on the `m` itself.
  //
  BN.red = function red (num) {
    return new Red(num);
  };

  BN.prototype.toRed = function toRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    assert(this.negative === 0, 'red works only with positives');
    return ctx.convertTo(this)._forceRed(ctx);
  };

  BN.prototype.fromRed = function fromRed () {
    assert(this.red, 'fromRed works only with numbers in reduction context');
    return this.red.convertFrom(this);
  };

  BN.prototype._forceRed = function _forceRed (ctx) {
    this.red = ctx;
    return this;
  };

  BN.prototype.forceRed = function forceRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    return this._forceRed(ctx);
  };

  BN.prototype.redAdd = function redAdd (num) {
    assert(this.red, 'redAdd works only with red numbers');
    return this.red.add(this, num);
  };

  BN.prototype.redIAdd = function redIAdd (num) {
    assert(this.red, 'redIAdd works only with red numbers');
    return this.red.iadd(this, num);
  };

  BN.prototype.redSub = function redSub (num) {
    assert(this.red, 'redSub works only with red numbers');
    return this.red.sub(this, num);
  };

  BN.prototype.redISub = function redISub (num) {
    assert(this.red, 'redISub works only with red numbers');
    return this.red.isub(this, num);
  };

  BN.prototype.redShl = function redShl (num) {
    assert(this.red, 'redShl works only with red numbers');
    return this.red.shl(this, num);
  };

  BN.prototype.redMul = function redMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.mul(this, num);
  };

  BN.prototype.redIMul = function redIMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.imul(this, num);
  };

  BN.prototype.redSqr = function redSqr () {
    assert(this.red, 'redSqr works only with red numbers');
    this.red._verify1(this);
    return this.red.sqr(this);
  };

  BN.prototype.redISqr = function redISqr () {
    assert(this.red, 'redISqr works only with red numbers');
    this.red._verify1(this);
    return this.red.isqr(this);
  };

  // Square root over p
  BN.prototype.redSqrt = function redSqrt () {
    assert(this.red, 'redSqrt works only with red numbers');
    this.red._verify1(this);
    return this.red.sqrt(this);
  };

  BN.prototype.redInvm = function redInvm () {
    assert(this.red, 'redInvm works only with red numbers');
    this.red._verify1(this);
    return this.red.invm(this);
  };

  // Return negative clone of `this` % `red modulo`
  BN.prototype.redNeg = function redNeg () {
    assert(this.red, 'redNeg works only with red numbers');
    this.red._verify1(this);
    return this.red.neg(this);
  };

  BN.prototype.redPow = function redPow (num) {
    assert(this.red && !num.red, 'redPow(normalNum)');
    this.red._verify1(this);
    return this.red.pow(this, num);
  };

  // Prime numbers with efficient reduction
  var primes = {
    k256: null,
    p224: null,
    p192: null,
    p25519: null
  };

  // Pseudo-Mersenne prime
  function MPrime (name, p) {
    // P = 2 ^ N - K
    this.name = name;
    this.p = new BN(p, 16);
    this.n = this.p.bitLength();
    this.k = new BN(1).iushln(this.n).isub(this.p);

    this.tmp = this._tmp();
  }

  MPrime.prototype._tmp = function _tmp () {
    var tmp = new BN(null);
    tmp.words = new Array(Math.ceil(this.n / 13));
    return tmp;
  };

  MPrime.prototype.ireduce = function ireduce (num) {
    // Assumes that `num` is less than `P^2`
    // num = HI * (2 ^ N - K) + HI * K + LO = HI * K + LO (mod P)
    var r = num;
    var rlen;

    do {
      this.split(r, this.tmp);
      r = this.imulK(r);
      r = r.iadd(this.tmp);
      rlen = r.bitLength();
    } while (rlen > this.n);

    var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
    if (cmp === 0) {
      r.words[0] = 0;
      r.length = 1;
    } else if (cmp > 0) {
      r.isub(this.p);
    } else {
      r.strip();
    }

    return r;
  };

  MPrime.prototype.split = function split (input, out) {
    input.iushrn(this.n, 0, out);
  };

  MPrime.prototype.imulK = function imulK (num) {
    return num.imul(this.k);
  };

  function K256 () {
    MPrime.call(
      this,
      'k256',
      'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f');
  }
  inherits(K256, MPrime);

  K256.prototype.split = function split (input, output) {
    // 256 = 9 * 26 + 22
    var mask = 0x3fffff;

    var outLen = Math.min(input.length, 9);
    for (var i = 0; i < outLen; i++) {
      output.words[i] = input.words[i];
    }
    output.length = outLen;

    if (input.length <= 9) {
      input.words[0] = 0;
      input.length = 1;
      return;
    }

    // Shift by 9 limbs
    var prev = input.words[9];
    output.words[output.length++] = prev & mask;

    for (i = 10; i < input.length; i++) {
      var next = input.words[i] | 0;
      input.words[i - 10] = ((next & mask) << 4) | (prev >>> 22);
      prev = next;
    }
    prev >>>= 22;
    input.words[i - 10] = prev;
    if (prev === 0 && input.length > 10) {
      input.length -= 10;
    } else {
      input.length -= 9;
    }
  };

  K256.prototype.imulK = function imulK (num) {
    // K = 0x1000003d1 = [ 0x40, 0x3d1 ]
    num.words[num.length] = 0;
    num.words[num.length + 1] = 0;
    num.length += 2;

    // bounded at: 0x40 * 0x3ffffff + 0x3d0 = 0x100000390
    var lo = 0;
    for (var i = 0; i < num.length; i++) {
      var w = num.words[i] | 0;
      lo += w * 0x3d1;
      num.words[i] = lo & 0x3ffffff;
      lo = w * 0x40 + ((lo / 0x4000000) | 0);
    }

    // Fast length reduction
    if (num.words[num.length - 1] === 0) {
      num.length--;
      if (num.words[num.length - 1] === 0) {
        num.length--;
      }
    }
    return num;
  };

  function P224 () {
    MPrime.call(
      this,
      'p224',
      'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001');
  }
  inherits(P224, MPrime);

  function P192 () {
    MPrime.call(
      this,
      'p192',
      'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff');
  }
  inherits(P192, MPrime);

  function P25519 () {
    // 2 ^ 255 - 19
    MPrime.call(
      this,
      '25519',
      '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed');
  }
  inherits(P25519, MPrime);

  P25519.prototype.imulK = function imulK (num) {
    // K = 0x13
    var carry = 0;
    for (var i = 0; i < num.length; i++) {
      var hi = (num.words[i] | 0) * 0x13 + carry;
      var lo = hi & 0x3ffffff;
      hi >>>= 26;

      num.words[i] = lo;
      carry = hi;
    }
    if (carry !== 0) {
      num.words[num.length++] = carry;
    }
    return num;
  };

  // Exported mostly for testing purposes, use plain name instead
  BN._prime = function prime (name) {
    // Cached version of prime
    if (primes[name]) return primes[name];

    var prime;
    if (name === 'k256') {
      prime = new K256();
    } else if (name === 'p224') {
      prime = new P224();
    } else if (name === 'p192') {
      prime = new P192();
    } else if (name === 'p25519') {
      prime = new P25519();
    } else {
      throw new Error('Unknown prime ' + name);
    }
    primes[name] = prime;

    return prime;
  };

  //
  // Base reduction engine
  //
  function Red (m) {
    if (typeof m === 'string') {
      var prime = BN._prime(m);
      this.m = prime.p;
      this.prime = prime;
    } else {
      assert(m.gtn(1), 'modulus must be greater than 1');
      this.m = m;
      this.prime = null;
    }
  }

  Red.prototype._verify1 = function _verify1 (a) {
    assert(a.negative === 0, 'red works only with positives');
    assert(a.red, 'red works only with red numbers');
  };

  Red.prototype._verify2 = function _verify2 (a, b) {
    assert((a.negative | b.negative) === 0, 'red works only with positives');
    assert(a.red && a.red === b.red,
      'red works only with red numbers');
  };

  Red.prototype.imod = function imod (a) {
    if (this.prime) return this.prime.ireduce(a)._forceRed(this);
    return a.umod(this.m)._forceRed(this);
  };

  Red.prototype.neg = function neg (a) {
    if (a.isZero()) {
      return a.clone();
    }

    return this.m.sub(a)._forceRed(this);
  };

  Red.prototype.add = function add (a, b) {
    this._verify2(a, b);

    var res = a.add(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.iadd = function iadd (a, b) {
    this._verify2(a, b);

    var res = a.iadd(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res;
  };

  Red.prototype.sub = function sub (a, b) {
    this._verify2(a, b);

    var res = a.sub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.isub = function isub (a, b) {
    this._verify2(a, b);

    var res = a.isub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res;
  };

  Red.prototype.shl = function shl (a, num) {
    this._verify1(a);
    return this.imod(a.ushln(num));
  };

  Red.prototype.imul = function imul (a, b) {
    this._verify2(a, b);
    return this.imod(a.imul(b));
  };

  Red.prototype.mul = function mul (a, b) {
    this._verify2(a, b);
    return this.imod(a.mul(b));
  };

  Red.prototype.isqr = function isqr (a) {
    return this.imul(a, a.clone());
  };

  Red.prototype.sqr = function sqr (a) {
    return this.mul(a, a);
  };

  Red.prototype.sqrt = function sqrt (a) {
    if (a.isZero()) return a.clone();

    var mod3 = this.m.andln(3);
    assert(mod3 % 2 === 1);

    // Fast case
    if (mod3 === 3) {
      var pow = this.m.add(new BN(1)).iushrn(2);
      return this.pow(a, pow);
    }

    // Tonelli-Shanks algorithm (Totally unoptimized and slow)
    //
    // Find Q and S, that Q * 2 ^ S = (P - 1)
    var q = this.m.subn(1);
    var s = 0;
    while (!q.isZero() && q.andln(1) === 0) {
      s++;
      q.iushrn(1);
    }
    assert(!q.isZero());

    var one = new BN(1).toRed(this);
    var nOne = one.redNeg();

    // Find quadratic non-residue
    // NOTE: Max is such because of generalized Riemann hypothesis.
    var lpow = this.m.subn(1).iushrn(1);
    var z = this.m.bitLength();
    z = new BN(2 * z * z).toRed(this);

    while (this.pow(z, lpow).cmp(nOne) !== 0) {
      z.redIAdd(nOne);
    }

    var c = this.pow(z, q);
    var r = this.pow(a, q.addn(1).iushrn(1));
    var t = this.pow(a, q);
    var m = s;
    while (t.cmp(one) !== 0) {
      var tmp = t;
      for (var i = 0; tmp.cmp(one) !== 0; i++) {
        tmp = tmp.redSqr();
      }
      assert(i < m);
      var b = this.pow(c, new BN(1).iushln(m - i - 1));

      r = r.redMul(b);
      c = b.redSqr();
      t = t.redMul(c);
      m = i;
    }

    return r;
  };

  Red.prototype.invm = function invm (a) {
    var inv = a._invmp(this.m);
    if (inv.negative !== 0) {
      inv.negative = 0;
      return this.imod(inv).redNeg();
    } else {
      return this.imod(inv);
    }
  };

  Red.prototype.pow = function pow (a, num) {
    if (num.isZero()) return new BN(1).toRed(this);
    if (num.cmpn(1) === 0) return a.clone();

    var windowSize = 4;
    var wnd = new Array(1 << windowSize);
    wnd[0] = new BN(1).toRed(this);
    wnd[1] = a;
    for (var i = 2; i < wnd.length; i++) {
      wnd[i] = this.mul(wnd[i - 1], a);
    }

    var res = wnd[0];
    var current = 0;
    var currentLen = 0;
    var start = num.bitLength() % 26;
    if (start === 0) {
      start = 26;
    }

    for (i = num.length - 1; i >= 0; i--) {
      var word = num.words[i];
      for (var j = start - 1; j >= 0; j--) {
        var bit = (word >> j) & 1;
        if (res !== wnd[0]) {
          res = this.sqr(res);
        }

        if (bit === 0 && current === 0) {
          currentLen = 0;
          continue;
        }

        current <<= 1;
        current |= bit;
        currentLen++;
        if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;

        res = this.mul(res, wnd[current]);
        currentLen = 0;
        current = 0;
      }
      start = 26;
    }

    return res;
  };

  Red.prototype.convertTo = function convertTo (num) {
    var r = num.umod(this.m);

    return r === num ? r.clone() : r;
  };

  Red.prototype.convertFrom = function convertFrom (num) {
    var res = num.clone();
    res.red = null;
    return res;
  };

  //
  // Montgomery method engine
  //

  BN.mont = function mont (num) {
    return new Mont(num);
  };

  function Mont (m) {
    Red.call(this, m);

    this.shift = this.m.bitLength();
    if (this.shift % 26 !== 0) {
      this.shift += 26 - (this.shift % 26);
    }

    this.r = new BN(1).iushln(this.shift);
    this.r2 = this.imod(this.r.sqr());
    this.rinv = this.r._invmp(this.m);

    this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
    this.minv = this.minv.umod(this.r);
    this.minv = this.r.sub(this.minv);
  }
  inherits(Mont, Red);

  Mont.prototype.convertTo = function convertTo (num) {
    return this.imod(num.ushln(this.shift));
  };

  Mont.prototype.convertFrom = function convertFrom (num) {
    var r = this.imod(num.mul(this.rinv));
    r.red = null;
    return r;
  };

  Mont.prototype.imul = function imul (a, b) {
    if (a.isZero() || b.isZero()) {
      a.words[0] = 0;
      a.length = 1;
      return a;
    }

    var t = a.imul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;

    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.mul = function mul (a, b) {
    if (a.isZero() || b.isZero()) return new BN(0)._forceRed(this);

    var t = a.mul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;
    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.invm = function invm (a) {
    // (AR)^-1 * R^2 = (A^-1 * R^-1) * R^2 = A^-1 * R
    var res = this.imod(a._invmp(this.m).mul(this.r2));
    return res._forceRed(this);
  };
})(typeof module === 'undefined' || module, this);

},{"buffer":3}],3:[function(require,module,exports){

},{}],4:[function(require,module,exports){
'use strict';

try {
    module.exports.XMLHttpRequest = XMLHttpRequest;
} catch(error) {
    console.log('Warning: XMLHttpRequest is not defined');
    module.exports.XMLHttpRequest = null;
}

},{}],5:[function(require,module,exports){
'use strict';

var Provider = require('./provider.js');

var utils = (function() {
    var convert = require('ethers-utils/convert.js');
    return {
        defineProperty: require('ethers-utils/properties.js').defineProperty,

        hexlify: convert.hexlify,
    };
})();

// @TODO: Add this to utils; lots of things need this now
function stripHexZeros(value) {
    while (value.length > 3 && value.substring(0, 3) === '0x0') {
        value = '0x' + value.substring(3);
    }
    return value;
}

function getTransactionString(transaction) {
    var result = [];
    for (var key in transaction) {
        if (transaction[key] == null) { continue; }
        var value = utils.hexlify(transaction[key]);
        if ({ gasLimit: true, gasPrice: true, nonce: true, value: true }[key]) {
            value = stripHexZeros(value);
        }
        result.push(key + '=' + value);
    }
    return result.join('&');
}

function EtherscanProvider(network, apiKey) {
    Provider.call(this, network);

    var baseUrl = null;
    switch(this.name) {
        case 'homestead':
            baseUrl = 'https://api.etherscan.io';
            break;
        case 'ropsten':
            baseUrl = 'https://ropsten.etherscan.io';
            break;
        case 'rinkeby':
            baseUrl = 'https://rinkeby.etherscan.io';
            break;
        case 'kovan':
            baseUrl = 'https://kovan.etherscan.io';
            break;
        default:
            throw new Error('unsupported network');
    }
    utils.defineProperty(this, 'baseUrl', baseUrl);

    utils.defineProperty(this, 'apiKey', apiKey || null);
}
Provider.inherits(EtherscanProvider);

utils.defineProperty(EtherscanProvider.prototype, '_call', function() {
});

utils.defineProperty(EtherscanProvider.prototype, '_callProxy', function() {
});

function getResult(result) {
    // getLogs has weird success responses
    if (result.status == 0 && result.message === 'No records found') {
        return result.result;
    }

    if (result.status != 1 || result.message != 'OK') {
        var error = new Error('invalid response');
        error.result = JSON.stringify(result);
        throw error;
    }

    return result.result;
}

function getJsonResult(result) {
    if (result.jsonrpc != '2.0') {
        var error = new Error('invalid response');
        error.result = JSON.stringify(result);
        throw error;
    }

    if (result.error) {
        var error = new Error(result.error.message || 'unknown error');
        if (result.error.code) { error.code = result.error.code; }
        if (result.error.data) { error.data = result.error.data; }
        throw error;
    }

    return result.result;
}

function checkLogTag(blockTag) {
    if (blockTag === 'pending') { throw new Error('pending not supported'); }
    if (blockTag === 'latest') { return blockTag; }

    return parseInt(blockTag.substring(2), 16);
}


utils.defineProperty(EtherscanProvider.prototype, 'perform', function(method, params) {
    if (!params) { params = {}; }

    var url = this.baseUrl;

    var apiKey = '';
    if (this.apiKey) { apiKey += '&apikey=' + this.apiKey; }

    switch (method) {
        case 'getBlockNumber':
            url += '/api?module=proxy&action=eth_blockNumber' + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getGasPrice':
            url += '/api?module=proxy&action=eth_gasPrice' + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);


        case 'getBalance':
            // Returns base-10 result
            url += '/api?module=account&action=balance&address=' + params.address;
            url += '&tag=' + params.blockTag + apiKey;
            return Provider.fetchJSON(url, null, getResult);

        case 'getTransactionCount':
            url += '/api?module=proxy&action=eth_getTransactionCount&address=' + params.address;
            url += '&tag=' + params.blockTag + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getCode':
            url += '/api?module=proxy&action=eth_getCode&address=' + params.address;
            url += '&tag=' + params.blockTag + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getStorageAt':
            url += '/api?module=proxy&action=eth_getStorageAt&address=' + params.address;
            url += '&position=' + stripHexZeros(params.position);
            url += '&tag=' + stripHexZeros(params.blockTag) + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'sendTransaction':
            url += '/api?module=proxy&action=eth_sendRawTransaction&hex=' + params.signedTransaction;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);


        case 'getBlock':
            if (params.blockTag) {
                url += '/api?module=proxy&action=eth_getBlockByNumber&tag=' + stripHexZeros(params.blockTag);
                url += '&boolean=false';
                url += apiKey;
                return Provider.fetchJSON(url, null, getJsonResult);
            }
            throw new Error('getBlock by blockHash not implmeneted');

        case 'getTransaction':
            url += '/api?module=proxy&action=eth_getTransactionByHash&txhash=' + params.transactionHash;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getTransactionReceipt':
            url += '/api?module=proxy&action=eth_getTransactionReceipt&txhash=' + params.transactionHash;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);


        case 'call':
            var transaction = getTransactionString(params.transaction);
            if (transaction) { transaction = '&' + transaction; }
            url += '/api?module=proxy&action=eth_call' + transaction;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'estimateGas':
            var transaction = getTransactionString(params.transaction);
            if (transaction) { transaction = '&' + transaction; }
            url += '/api?module=proxy&action=eth_estimateGas&' + transaction;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getLogs':
            url += '/api?module=logs&action=getLogs';
            try {
                if (params.filter.fromBlock) {
                    url += '&fromBlock=' + checkLogTag(params.filter.fromBlock);
                }

                if (params.filter.toBlock) {
                    url += '&toBlock=' + checkLogTag(params.filter.toBlock);
                }

                if (params.filter.address) {
                    url += '&address=' + params.filter.address;
                }

                // @TODO: We can handle slightly more complicated logs using the logs API
                if (params.filter.topics && params.filter.topics.length > 0) {
                    if (params.filter.topics.length > 1) {
                        throw new Error('unsupported topic format');
                    }
                    var topic0 = params.filter.topics[0];
                    if (typeof(topic0) !== 'string' || topic0.length !== 66) {
                        throw new Error('unsupported topic0 format');
                    }
                    url += '&topic0=' + topic0;
                }
            } catch (error) {
                return Promise.reject(error);
            }


            url += apiKey;
            return Provider.fetchJSON(url, null, getResult);

        case 'getEtherPrice':
            if (this.name !== 'homestead') { return Promise.resolve(0.0); }
            url += '/api?module=stats&action=ethprice';
            url += apiKey;
            return Provider.fetchJSON(url, null, getResult).then(function(result) {
                return parseFloat(result.ethusd);
            });

        default:
            break;
    }

    return Promise.reject(new Error('not implemented - ' + method));
});

utils.defineProperty(EtherscanProvider.prototype, 'getHistory', function(addressOrName, startBlock, endBlock) {

    var url = this.baseUrl;

    var apiKey = '';
    if (this.apiKey) { apiKey += '&apikey=' + this.apiKey; }

    if (startBlock == null) { startBlock = 0; }
    if (endBlock == null) { endBlock = 99999999; }

    return this.resolveName(addressOrName).then(function(address) {
        url += '/api?module=account&action=txlist&address=' + address;
        url += '&fromBlock=' + startBlock;
        url += '&endBlock=' + endBlock;
        url += '&sort=asc';

        return Provider.fetchJSON(url, null, getResult).then(function(result) {
            var output = [];
            result.forEach(function(tx) {
                ['contractAddress', 'to'].forEach(function(key) {
                    if (tx[key] == '') { delete tx[key]; }
                });
                if (tx.creates == null && tx.contractAddress != null) {
                    tx.creates = tx.contractAddress;
                }
                output.push(Provider._formatters.checkTransactionResponse(tx));
            });
            return output;
        });
    });
});

module.exports = EtherscanProvider;;

},{"./provider.js":11,"ethers-utils/convert.js":17,"ethers-utils/properties.js":22}],6:[function(require,module,exports){
'use strict';

var inherits = require('inherits');

var Provider = require('./provider.js');

var utils = (function() {
    return {
        defineProperty: require('ethers-utils/properties.js').defineProperty,
    };
})();


function FallbackProvider(providers) {
    if (providers.length === 0) { throw new Error('no providers'); }

    var network = {};
    ['chainId', 'ensAddress', 'name', 'testnet'].forEach(function(key) {
        for (var i = 1; i < providers.length; i++) {
            if (providers[0][key] !== providers[i][key]) {
                throw new Error('incompatible providers - ' + key + ' mismatch');
            }
        }
        network[key] = providers[0][key];
    });

    if (!(this instanceof FallbackProvider)) { throw new Error('missing new'); }
    Provider.call(this, network);

    providers = providers.slice(0);
    Object.defineProperty(this, 'providers', {
        get: function() {
            return providers.slice(0);
        }
    });
}
inherits(FallbackProvider, Provider);


utils.defineProperty(FallbackProvider.prototype, 'perform', function(method, params) {
    var providers = this.providers;
    return new Promise(function(resolve, reject) {
        var firstError = null;
        function next() {
            if (!providers.length) {
                reject(firstError);
                return;
            }

            var provider = providers.shift();
            provider.perform(method, params).then(function(result) {
                resolve(result);
            }, function (error) {
                if (!firstError) { firstError = error; }
                next();
            });
        }
        next();
    });
});

module.exports = FallbackProvider;

},{"./provider.js":11,"ethers-utils/properties.js":22,"inherits":73}],7:[function(require,module,exports){
'use strict';

var Provider = require('./provider.js');

var EtherscanProvider = require('./etherscan-provider.js');
var FallbackProvider = require('./fallback-provider.js');
var InfuraProvider = require('./infura-provider.js');
var JsonRpcProvider = require('./json-rpc-provider.js');
var Web3Provider = require('./web3-provider.js');

function getDefaultProvider(network) {
    return new FallbackProvider([
        new InfuraProvider(network),
        new EtherscanProvider(network),
    ]);
}

module.exports = {
    EtherscanProvider: EtherscanProvider,
    FallbackProvider: FallbackProvider,
    InfuraProvider: InfuraProvider,
    JsonRpcProvider: JsonRpcProvider,
    Web3Provider: Web3Provider,

    isProvider: Provider.isProvider,

    networks: Provider.networks,

    getDefaultProvider:getDefaultProvider,

    Provider: Provider,
}

require('ethers-utils/standalone.js')({
    providers: module.exports
});


},{"./etherscan-provider.js":5,"./fallback-provider.js":6,"./infura-provider.js":8,"./json-rpc-provider.js":9,"./provider.js":11,"./web3-provider.js":12,"ethers-utils/standalone.js":26}],8:[function(require,module,exports){
'use strict';

var Provider = require('./provider');
var JsonRpcProvider = require('./json-rpc-provider');

var utils = (function() {
    return {
        defineProperty: require('ethers-utils/properties.js').defineProperty
    }
})();

function InfuraProvider(network, apiAccessToken) {
    if (!(this instanceof InfuraProvider)) { throw new Error('missing new'); }

    // Legacy constructor (testnet, apiAccessToken)
    // @TODO: Remove this in the next major release
    network = Provider._legacyConstructor(network, 1, arguments[0]);

    var host = null;
    switch(network.name) {
        case 'homestead':
            host = 'mainnet.infura.io';
            break;
        case 'ropsten':
            host = 'ropsten.infura.io';
            break;
        case 'rinkeby':
            host = 'rinkeby.infura.io';
            break;
        case 'kovan':
            host = 'kovan.infura.io';
            break;
        default:
            throw new Error('unsupported network');
    }

    var url = 'https://' + host + '/' + (apiAccessToken || '');

    JsonRpcProvider.call(this, url, network);

    utils.defineProperty(this, 'apiAccessToken', apiAccessToken || null);
}
JsonRpcProvider.inherits(InfuraProvider);

utils.defineProperty(InfuraProvider.prototype, '_startPending', function() {
    console.log('WARNING: INFURA does not support pending filters');
});

utils.defineProperty(InfuraProvider.prototype, '_stopPending', function() {
});

module.exports = InfuraProvider;

},{"./json-rpc-provider":9,"./provider":11,"ethers-utils/properties.js":22}],9:[function(require,module,exports){
'use strict';

// See: https://github.com/ethereum/wiki/wiki/JSON-RPC

var Provider = require('./provider.js');

var utils = (function() {
    var convert = require('ethers-utils/convert');
    return {
        defineProperty: require('ethers-utils/properties').defineProperty,

        hexlify: convert.hexlify,
        isHexString: convert.isHexString,
    }
})();

// @TODO: Move this to utils
function timer(timeout) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve();
        }, timeout);
    });
}

function getResult(payload) {
    if (payload.error) {
        var error = new Error(payload.error.message);
        error.code = payload.error.code;
        error.data = payload.error.data;
        throw error;
    }

    return payload.result;
}

function stripHexZeros(value) {
    while (value.length > 3 && value.substring(0, 3) === '0x0') {
        value = '0x' + value.substring(3);
    }
    return value;
}

function getTransaction(transaction) {
    var result = {};

    for (var key in transaction) {
        result[key] = utils.hexlify(transaction[key]);
    }

    // Some nodes (INFURA ropsten; INFURA mainnet is fine) don't like extra zeros.
    ['gasLimit', 'gasPrice', 'nonce', 'value'].forEach(function(key) {
        if (!result[key]) { return; }
        result[key] = stripHexZeros(result[key]);
    });

    // Transform "gasLimit" to "gas"
    if (result.gasLimit != null && result.gas == null) {
        result.gas = result.gasLimit;
        delete result.gasLimit;
    }

    return result;
}

function JsonRpcProvider(url, network) {
    if (!(this instanceof JsonRpcProvider)) { throw new Error('missing new'); }

    // Legacy Contructor (url, [ testnet, [ chainId ] ])
    // @TODO: Remove this in the next major version

    var args = [];

    // Legacy without a url
    if (typeof(url) !== 'string' || Provider.networks[url] != null) {
        // url => network
        args.push(url);

        // network => chainId
        if (network != null) { args.push(network); }

        url = null;

    } else if (arguments.length === 2) {
        args.push(arguments[1]);

    } else if (arguments.length === 3) {
        args.push(arguments[1]);
        args.push(arguments[2]);
    }

    Provider.apply(this, args);

    if (!url) { url = 'http://localhost:8545'; }

    utils.defineProperty(this, 'url', url);
}
Provider.inherits(JsonRpcProvider);

utils.defineProperty(JsonRpcProvider.prototype, 'send', function(method, params) {
    var request = {
        method: method,
        params: params,
        id: 42,
        jsonrpc: "2.0"
    };
    return Provider.fetchJSON(this.url, JSON.stringify(request), getResult);
});

utils.defineProperty(JsonRpcProvider.prototype, 'perform', function(method, params) {
    switch (method) {
        case 'getBlockNumber':
            return this.send('eth_blockNumber', []);

        case 'getGasPrice':
            return this.send('eth_gasPrice', []);

        case 'getBalance':
            var blockTag = params.blockTag;
            if (utils.isHexString(blockTag)) { blockTag = stripHexZeros(blockTag); }
            return this.send('eth_getBalance', [params.address, blockTag]);

        case 'getTransactionCount':
            var blockTag = params.blockTag;
            if (utils.isHexString(blockTag)) { blockTag = stripHexZeros(blockTag); }
            return this.send('eth_getTransactionCount', [params.address, blockTag]);

        case 'getCode':
            var blockTag = params.blockTag;
            if (utils.isHexString(blockTag)) { blockTag = stripHexZeros(blockTag); }
            return this.send('eth_getCode', [params.address, blockTag]);

        case 'getStorageAt':
            var position = params.position;
            if (utils.isHexString(position)) { position = stripHexZeros(position); }
            var blockTag = params.blockTag;
            if (utils.isHexString(blockTag)) { blockTag = stripHexZeros(blockTag); }
            return this.send('eth_getStorageAt', [params.address, position, blockTag]);

        case 'sendTransaction':
            return this.send('eth_sendRawTransaction', [params.signedTransaction]);

        case 'getBlock':
            if (params.blockTag) {
                var blockTag = params.blockTag;
                if (utils.isHexString(blockTag)) { blockTag = stripHexZeros(blockTag); }
                return this.send('eth_getBlockByNumber', [blockTag, false]);
            } else if (params.blockHash) {
                return this.send('eth_getBlockByHash', [params.blockHash, false]);
            }
            return Promise.reject(new Error('invalid block tag or block hash'));

        case 'getTransaction':
            return this.send('eth_getTransactionByHash', [params.transactionHash]);

        case 'getTransactionReceipt':
            return this.send('eth_getTransactionReceipt', [params.transactionHash]);

        case 'call':
            return this.send('eth_call', [getTransaction(params.transaction), 'latest']);

        case 'estimateGas':
            return this.send('eth_estimateGas', [getTransaction(params.transaction)]);

        case 'getLogs':
            return this.send('eth_getLogs', [params.filter]);

        default:
            break;
    }

    return Promise.reject(new Error('not implemented - ' + method));
});

utils.defineProperty(JsonRpcProvider.prototype, '_startPending', function() {
    if (this._pendingFilter != null) { return; }
    var self = this;

    var pendingFilter = this.send('eth_newPendingTransactionFilter', []);
    this._pendingFilter = pendingFilter;

    pendingFilter.then(function(filterId) {
        function poll() {
            self.send('eth_getFilterChanges', [ filterId ]).then(function(hashes) {
                if (self._pendingFilter != pendingFilter) { return; }

                var seq = Promise.resolve();
                hashes.forEach(function(hash) {
                    seq = seq.then(function() {
                        return self.getTransaction(hash).then(function(tx) {
                            self.emit('pending', tx);
                        });
                    });
                });

                return seq.then(function() {
                    return timer(1000);
                });
            }).then(function() {
                if (self._pendingFilter != pendingFilter) {
                    self.send('eth_uninstallFilter', [ filterIf ]);
                    return;
                }
                setTimeout(function() { poll(); }, 0);
            });
        }
        poll();

        return filterId;
    });
});

utils.defineProperty(JsonRpcProvider.prototype, '_stopPending', function() {
    this._pendingFilter = null;
});

utils.defineProperty(JsonRpcProvider, '_hexlifyTransaction', function(transaction) {
    return getTransaction(transaction);
});

module.exports = JsonRpcProvider;

},{"./provider.js":11,"ethers-utils/convert":17,"ethers-utils/properties":22}],10:[function(require,module,exports){
module.exports={
    "unspecified": {
        "chainId": 0,
        "name": "unspecified"
    },

    "homestead": {
        "chainId": 1,
        "ensAddress": "0x314159265dd8dbb310642f98f50c066173c1259b",
        "name": "homestead"
    },
    "mainnet": {
        "chainId": 1,
        "ensAddress": "0x314159265dd8dbb310642f98f50c066173c1259b",
        "name": "homestead"
    },

    "morden": {
        "chainId": 2,
        "name": "morden"
    },

    "ropsten": {
        "chainId": 3,
        "ensAddress": "0x112234455c3a32fd11230c42e7bccd4a84e02010",
        "name": "ropsten"
    },
    "testnet": {
        "chainId": 3,
        "ensAddress": "0x112234455c3a32fd11230c42e7bccd4a84e02010",
        "name": "ropsten"
    },

    "rinkeby": {
        "chainId": 4,
        "name": "rinkeby"
    },
    "kovan": {
        "chainId": 42,
        "name": "kovan"
    }
}

},{}],11:[function(require,module,exports){
'use strict';

var inherits = require('inherits');

var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

var networks = require('./networks.json');

var utils = (function() {
    var convert = require('ethers-utils/convert');
    return {
        defineProperty: require('ethers-utils/properties').defineProperty,

        getAddress: require('ethers-utils/address').getAddress,
        getContractAddress: require('ethers-utils/contract-address').getContractAddress,

        bigNumberify: require('ethers-utils/bignumber').bigNumberify,
        arrayify: convert.arrayify,

        hexlify: convert.hexlify,
        isHexString: convert.isHexString,

        concat: convert.concat,
        stripZeros: convert.stripZeros,

        namehash: require('ethers-utils/namehash'),

        toUtf8String: require('ethers-utils/utf8').toUtf8String,

        RLP: require('ethers-utils/rlp'),
    }
})();

function copyObject(obj) {
    var result = {};
    for (var key in obj) { result[key] = obj[key]; }
    return result;
}

function check(format, object) {
    var result = {};
    for (var key in format) {
        try {
            var value = format[key](object[key]);
            if (value !== undefined) { result[key] = value; }
        } catch (error) {
            error.checkKey = key;
            error.checkValue = object[key];
            throw error;
        }
    }
    return result;
}

function allowNull(check, nullValue) {
    return (function(value) {
        if (value == null) { return nullValue; }
        return check(value);
    });
}

function allowFalsish(check, replaceValue) {
    return (function(value) {
        if (!value) { return replaceValue; }
        return check(value);
    });
}

function arrayOf(check) {
    return (function(array) {
        if (!Array.isArray(array)) { throw new Error('not an array'); }

        var result = [];

        array.forEach(function(value) {
            result.push(check(value));
        });

        return result;
    });
}

function checkHash(hash) {
    if (!utils.isHexString(hash) || hash.length !== 66) {
        throw new Error('invalid hash - ' + hash);
    }
    return hash;
}

function checkNumber(number) {
    return utils.bigNumberify(number).toNumber();
}

function checkBoolean(value) {
    if (typeof(value) === 'boolean') { return value; }
    if (typeof(value) === 'string') {
        if (value === 'true') { return true; }
        if (value === 'false') { return false; }
    }
    throw new Error('invaid boolean - ' + value);
}

function checkUint256(uint256) {
    if (!utils.isHexString(uint256)) {
        throw new Error('invalid uint256');
    }
    while (uint256.length < 66) {
        uint256 = '0x0' + uint256.substring(2);
    }
    return uint256;
}

function checkString(string) {
    if (typeof(string) !== 'string') { throw new Error('invalid string'); }
    return string;
}

function checkBlockTag(blockTag) {
    if (blockTag == null) { return 'latest'; }

    if (blockTag === 'earliest') { return '0x0'; }

    if (blockTag === 'latest' || blockTag === 'pending') {
        return blockTag;
    }

    if (typeof(blockTag) === 'number') {
        return utils.hexlify(blockTag);
    }

    if (utils.isHexString(blockTag)) { return blockTag; }

    throw new Error('invalid blockTag');
}

var formatBlock = {
    hash: checkHash,
    parentHash: checkHash,
    number: checkNumber,

    timestamp: checkNumber,
    nonce: allowNull(utils.hexlify),
    difficulty: allowNull(checkNumber),

    gasLimit: utils.bigNumberify,
    gasUsed: utils.bigNumberify,

    miner: utils.getAddress,
    extraData: utils.hexlify,

    //transactions: allowNull(arrayOf(checkTransaction)),
    transactions: allowNull(arrayOf(checkHash)),

    //transactionRoot: checkHash,
    //stateRoot: checkHash,
    //sha3Uncles: checkHash,

    //logsBloom: utils.hexlify,
};

function checkBlock(block) {
    if (block.author != null && block.miner == null) {
        block.miner = block.author;
    }
    return check(formatBlock, block);
}


var formatTransaction = {
   hash: checkHash,

   blockHash: allowNull(checkHash, null),
   blockNumber: allowNull(checkNumber, null),
   transactionIndex: allowNull(checkNumber, null),

   from: utils.getAddress,

   gasPrice: utils.bigNumberify,
   gasLimit: utils.bigNumberify,
   to: allowNull(utils.getAddress, null),
   value: utils.bigNumberify,
   nonce: checkNumber,
   data: utils.hexlify,

   r: allowNull(checkUint256),
   s: allowNull(checkUint256),
   v: allowNull(checkNumber),

   creates: allowNull(utils.getAddress, null),

   raw: allowNull(utils.hexlify),
};

function checkTransaction(transaction) {

    // Rename gas to gasLimit
    if (transaction.gas != null && transaction.gasLimit == null) {
        transaction.gasLimit = transaction.gas;
    }

    // Some clients (TestRPC) do strange things like return 0x0 for the
    // 0 address; correct this to be a real address
    if (transaction.to && utils.bigNumberify(transaction.to).isZero()) {
        transaction.to = '0x0000000000000000000000000000000000000000';
    }

    // Rename input to data
    if (transaction.input != null && transaction.data == null) {
        transaction.data = transaction.input;
    }

    // If to and creates are empty, populate the creates from the transaction
    if (transaction.to == null && transaction.creates == null) {
        transaction.creates = utils.getContractAddress(transaction);
    }

    if (!transaction.raw) {
        // Very loose providers (e.g. TestRPC) don't provide a signature or raw
        if (transaction.v && transaction.r && transaction.s) {
            var raw = [
                utils.stripZeros(utils.hexlify(transaction.nonce)),
                utils.stripZeros(utils.hexlify(transaction.gasPrice)),
                utils.stripZeros(utils.hexlify(transaction.gasLimit)),
                (transaction.to || "0x"),
                utils.stripZeros(utils.hexlify(transaction.value || '0x')),
                utils.hexlify(transaction.data || '0x'),
                utils.stripZeros(utils.hexlify(transaction.v || '0x')),
                utils.stripZeros(utils.hexlify(transaction.r)),
                utils.stripZeros(utils.hexlify(transaction.s)),
            ];

            transaction.raw = utils.RLP.encode(raw);
        }
    }


    var result = check(formatTransaction, transaction);

    var networkId = transaction.networkId;

    if (utils.isHexString(networkId)) {
        networkId = utils.bigNumberify(networkId).toNumber();
    }

    if (typeof(networkId) !== 'number' && result.v != null) {
        networkId = (result.v - 35) / 2;
        if (networkId < 0) { networkId = 0; }
        networkId = parseInt(networkId);
    }

    if (typeof(networkId) !== 'number') { networkId = 0; }

    result.networkId = networkId;

    // 0x0000... should actually be null
    if (result.blockHash && result.blockHash.replace(/0/g, '') === 'x') {
        result.blockHash = null;
    }

    return result;
}

var formatTransactionRequest = {
    from: allowNull(utils.getAddress),
    nonce: allowNull(checkNumber),
    gasLimit: allowNull(utils.bigNumberify),
    gasPrice: allowNull(utils.bigNumberify),
    to: allowNull(utils.getAddress),
    value: allowNull(utils.bigNumberify),
    data: allowNull(utils.hexlify),
};

function checkTransactionRequest(transaction) {
    return check(formatTransactionRequest, transaction);
}

var formatTransactionReceiptLog = {
    transactionLogIndex: allowNull(checkNumber),
    transactionIndex: checkNumber,
    blockNumber: checkNumber,
    transactionHash: checkHash,
    address: utils.getAddress,
    // @TODO: Next major release remove this
    type: allowNull(checkString),
    topics: arrayOf(checkHash),
    data: utils.hexlify,
    logIndex: checkNumber,
    blockHash: checkHash,
};

function checkTransactionReceiptLog(log) {
    return check(formatTransactionReceiptLog, log);
}

var formatTransactionReceipt = {
    contractAddress: allowNull(utils.getAddress, null),
    transactionIndex: checkNumber,
    root: allowNull(checkHash),
    gasUsed: utils.bigNumberify,
    logsBloom: utils.hexlify,
    blockHash: checkHash,
    transactionHash: checkHash,
    logs: arrayOf(checkTransactionReceiptLog),
    blockNumber: checkNumber,
    cumulativeGasUsed: utils.bigNumberify,
    status: allowNull(checkNumber)
};

function checkTransactionReceipt(transactionReceipt) {
    var status = transactionReceipt.status;
    var root = transactionReceipt.root;

    var result = check(formatTransactionReceipt, transactionReceipt);
    result.logs.forEach(function(entry, index) {
        if (entry.transactionLogIndex == null) {
            entry.transactionLogIndex = index;
        }
        // @TODO: Remove this is next major version
        if (entry.type == null) {
            entry.type = 'mined';
        }
    });
    if (transactionReceipt.status != null) {
        result.byzantium = true;
    }
    return result;
}

function checkTopics(topics) {
    if (Array.isArray(topics)) {
        topics.forEach(function(topic) {
            checkTopics(topic);
        });

    } else if (topics != null) {
        checkHash(topics);
    }

    return topics;
}

var formatFilter = {
    fromBlock: allowNull(checkBlockTag, undefined),
    toBlock: allowNull(checkBlockTag, undefined),
    address: allowNull(utils.getAddress, undefined),
    topics: allowNull(checkTopics, undefined),
};

function checkFilter(filter) {
    return check(formatFilter, filter);
}

var formatLog = {
    blockNumber: allowNull(checkNumber),
    blockHash: allowNull(checkHash),
    transactionIndex: checkNumber,

    removed: allowNull(checkBoolean),

    address: utils.getAddress,
    data: allowFalsish(utils.hexlify, '0x'),

    topics: arrayOf(checkHash),

    transactionHash: checkHash,
    logIndex: checkNumber,
}

function checkLog(log) {
    return check(formatLog, log);
}

function Provider(network) {
    if (!(this instanceof Provider)) { throw new Error('missing new'); }

    network = Provider._legacyConstructor(network, arguments.length, arguments[0], arguments[1]);

    // Check the ensAddress (if any)
    var ensAddress = null;
    if (network.ensAddress) {
        ensAddress = utils.getAddress(network.ensAddress);
    }

    // Setup our network properties
    utils.defineProperty(this, 'chainId', network.chainId);
    utils.defineProperty(this, 'ensAddress', ensAddress);
    utils.defineProperty(this, 'name', network.name);

    // @TODO: Remove in the next major release
    utils.defineProperty(this, 'testnet', (network.name !== 'homestead'));

    var events = {};
    utils.defineProperty(this, '_events', events);

    var self = this;

    var lastBlockNumber = null;

    var balances = {};

    function doPoll() {
        self.getBlockNumber().then(function(blockNumber) {

            // If the block hasn't changed, meh.
            if (blockNumber === lastBlockNumber) { return; }

            if (lastBlockNumber === null) { lastBlockNumber = blockNumber - 1; }

            // Notify all listener for each block that has passed
            for (var i = lastBlockNumber + 1; i <= blockNumber; i++) {
                self.emit('block', i);
            }

            // Sweep balances and remove addresses we no longer have events for
            var newBalances = {};

            // Find all transaction hashes we are waiting on
            Object.keys(events).forEach(function(eventName) {
                var event = parseEventString(eventName);

                if (event.type === 'transaction') {
                    self.getTransaction(event.hash).then(function(transaction) {
                        if (!transaction || !transaction.blockNumber) { return; }
                        self.emit(event.hash, transaction);
                    });

                } else if (event.type === 'address') {
                    if (balances[event.address]) {
                        newBalances[event.address] = balances[event.address];
                    }
                    self.getBalance(event.address, 'latest').then(function(balance) {
                        var lastBalance = balances[event.address];
                        if (lastBalance && balance.eq(lastBalance)) { return; }
                        balances[event.address] = balance;
                        self.emit(event.address, balance);
                    });

                } else if (event.type === 'topic') {
                    self.getLogs({
                        fromBlock: lastBlockNumber + 1,
                        toBlock: blockNumber,
                        topics: event.topic
                    }).then(function(logs) {
                        if (logs.length === 0) { return; }
                        logs.forEach(function(log) {
                            self.emit(event.topic, log);
                        });
                    });
                }
            });

            lastBlockNumber = blockNumber;

            balances = newBalances;
        });

        self.doPoll();
    }

    utils.defineProperty(this, 'resetEventsBlock', function(blockNumber) {
        lastBlockNumber = blockNumber;
        self.doPoll();
    });

    var poller = null;
    Object.defineProperty(this, 'polling', {
        get: function() { return (poller != null); },
        set: function(value) {
            setTimeout(function() {
                if (value && !poller) {
                    poller = setInterval(doPoll, 4000);

                } else if (!value && poller) {
                    clearInterval(poller);
                    poller = null;
                }
            }, 0);
        }
    });
}

function inheritable(parent) {
    return function(child) {
        inherits(child, parent);
        utils.defineProperty(child, 'inherits', inheritable(child));
    }
}

utils.defineProperty(Provider, 'inherits', inheritable(Provider));
/*
function(child) {
    inherits(child, Provider);
    child.inherits = function(grandchild) {
        inherits(grandchild, child)
    }
});
*/

utils.defineProperty(Provider, '_legacyConstructor', function(network, length, arg0, arg1) {

    // Legacy parameters Provider(testnet:boolean, chainId:Number)
    if (typeof(arg0) === 'boolean' || length === 2) {
        var testnet = !!arg0;
        var chainId = arg1;

        // true => testnet, false => mainnet
        network = networks[testnet ? 'ropsten': 'homestead'];

        // Overriding chain ID
        if (length === 2 && chainId != null) {
            network = {
                chainId: chainId,
                ensAddress: network.ensAddress,
                name: network.name
            };
        }

    } else if (typeof(network) === 'string') {
        network = networks[network];
        if (!network) { throw new Error('unknown network'); }

    } else if (network == null) {
        network = networks['homestead'];
    }

    if (typeof(network.chainId) !== 'number') { throw new Error('invalid chainId'); }

    return network;
});
// @TODO: Remove in next major version (use networks instead)
utils.defineProperty(Provider, 'chainId', {
    homestead: 1,
    morden: 2,
    ropsten: 3,
    rinkeby: 4,
    kovan: 42
});

//utils.defineProperty(Provider, 'isProvider', function(object) {
//    return (object instanceof Provider);
//});

utils.defineProperty(Provider, 'networks', networks);

utils.defineProperty(Provider, 'fetchJSON', function(url, json, processFunc) {

    return new Promise(function(resolve, reject) {
        var request = new XMLHttpRequest();

        if (json) {
            request.open('POST', url, true);
            request.setRequestHeader('Content-Type','application/json');
        } else {
            request.open('GET', url, true);
        }

        request.onreadystatechange = function() {
            if (request.readyState !== 4) { return; }

            try {
                var result = JSON.parse(request.responseText);
            } catch (error) {
                var jsonError = new Error('invalid json response');
                jsonError.orginialError = error;
                jsonError.responseText = request.responseText;
                reject(jsonError);
                return;
            }

            if (processFunc) {
                try {
                    result = processFunc(result);
                } catch (error) {
                    error.url = url;
                    error.body = json;
                    error.responseText = request.responseText;
                    reject(error);
                    return;
                }
            }

            if (request.status != 200) {
                var error = new Error('invalid response - ' + request.status);
                error.statusCode = request.statusCode;
                reject(error);
                return;
            }

            resolve(result);
        };

        request.onerror = function(error) {
            reject(error);
        }

        try {
            if (json) {
                request.send(json);
            } else {
                request.send();
            }

        } catch (error) {
            var connectionError = new Error('connection error');
            connectionError.error = error;
            reject(connectionError);
        }
    });
});


utils.defineProperty(Provider.prototype, 'waitForTransaction', function(transactionHash, timeout) {
    var self = this;
    return new Promise(function(resolve, reject) {
        var timer = null;

        function complete(transaction) {
            if (timer) { clearTimeout(timer); }
            resolve(transaction);
        }

        self.once(transactionHash, complete);

        if (typeof(timeout) === 'number' && timeout > 0) {
            timer = setTimeout(function() {
                self.removeListener(transactionHash, complete);
                reject(new Error('timeout'));
            }, timeout);
        }

    });
});


utils.defineProperty(Provider.prototype, 'getBlockNumber', function() {
    try {
        return this.perform('getBlockNumber').then(function(result) {
            var value = parseInt(result);
            if (value != result) { throw new Error('invalid response - getBlockNumber'); }
            return value;
        });
    } catch (error) {
        return Promise.reject(error);
    }
});

utils.defineProperty(Provider.prototype, 'getGasPrice', function() {
    try {
        return this.perform('getGasPrice').then(function(result) {
            return utils.bigNumberify(result);
        });
    } catch (error) {
        return Promise.reject(error);
    }
});


utils.defineProperty(Provider.prototype, 'getBalance', function(addressOrName, blockTag) {
    var self = this;
    return this.resolveName(addressOrName).then(function(address) {
        var params = { address: address, blockTag: checkBlockTag(blockTag) };
        return self.perform('getBalance', params).then(function(result) {
            return utils.bigNumberify(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'getTransactionCount', function(addressOrName, blockTag) {
    var self = this;
    return this.resolveName(addressOrName).then(function(address) {
        var params = { address: address, blockTag: checkBlockTag(blockTag) };
        return self.perform('getTransactionCount', params).then(function(result) {
            var value = parseInt(result);
            if (value != result) { throw new Error('invalid response - getTransactionCount'); }
            return value;
        });
    });
});

utils.defineProperty(Provider.prototype, 'getCode', function(addressOrName, blockTag) {
    var self = this;
    return this.resolveName(addressOrName).then(function(address) {
        var params = {address: address, blockTag: checkBlockTag(blockTag)};
        return self.perform('getCode', params).then(function(result) {
            return utils.hexlify(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'getStorageAt', function(addressOrName, position, blockTag) {
    var self = this;
    return this.resolveName(addressOrName).then(function(address) {
        var params = {
            address: address,
            blockTag: checkBlockTag(blockTag),
            position: utils.hexlify(position),
        };
        return self.perform('getStorageAt', params).then(function(result) {
            return utils.hexlify(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'sendTransaction', function(signedTransaction) {
    try {
        var params = {signedTransaction: utils.hexlify(signedTransaction)};
        return this.perform('sendTransaction', params).then(function(result) {
            result = utils.hexlify(result);
            if (result.length !== 66) { throw new Error('invalid response - sendTransaction'); }
            return result;
        });
    } catch (error) {
        return Promise.reject(error);
    }
});


utils.defineProperty(Provider.prototype, 'call', function(transaction) {
    var self = this;
    return this._resolveNames(transaction, [ 'to', 'from' ]).then(function(transaction) {
        var params = { transaction: checkTransactionRequest(transaction) };
        return self.perform('call', params).then(function(result) {
            return utils.hexlify(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'estimateGas', function(transaction) {
    var self = this;
    return this._resolveNames(transaction, [ 'to', 'from' ]).then(function(transaction) {
        var params = {transaction: checkTransactionRequest(transaction)};
        return self.perform('estimateGas', params).then(function(result) {
             return utils.bigNumberify(result);
        });
    });
});


utils.defineProperty(Provider.prototype, 'getBlock', function(blockHashOrBlockTag) {
    try {
        var blockHash = utils.hexlify(blockHashOrBlockTag);
        if (blockHash.length === 66) {
            return this.perform('getBlock', {blockHash: blockHash}).then(function(block) {
                if (block == null) { return null; }
                return checkBlock(block);
            });
        }
    } catch (error) {
        console.log('DEBUG', error);
    }

    try {
        var blockTag = checkBlockTag(blockHashOrBlockTag);
        return this.perform('getBlock', {blockTag: blockTag}).then(function(block) {
            if (block == null) { return null; }
            return checkBlock(block);
        });
    } catch (error) {
        console.log('DEBUG', error);
    }

    return Promise.reject(new Error('invalid block hash or block tag'));
});

utils.defineProperty(Provider.prototype, 'getTransaction', function(transactionHash) {
    try {
        var params = { transactionHash: checkHash(transactionHash) };
        return this.perform('getTransaction', params).then(function(result) {
            if (result != null) { result = checkTransaction(result); }
            return result;
        });
    } catch (error) {
        return Promise.reject(error);
    }
});

utils.defineProperty(Provider.prototype, 'getTransactionReceipt', function(transactionHash) {
    try {
        var params = { transactionHash: checkHash(transactionHash) };
        return this.perform('getTransactionReceipt', params).then(function(result) {
            if (result != null) { result = checkTransactionReceipt(result); }
            return result;
        });
    } catch (error) {
        return Promise.reject(error);
    }
});

utils.defineProperty(Provider.prototype, 'getLogs', function(filter) {
    var self = this;
    return this._resolveNames(filter, ['address']).then(function(filter) {
        var params = { filter: checkFilter(filter) };
        return self.perform('getLogs', params).then(function(result) {
            return arrayOf(checkLog)(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'getEtherPrice', function() {
    try {
        return this.perform('getEtherPrice', {}).then(function(result) {
            // @TODO: Check valid float
            return result;
        });
    } catch (error) {
        return Promise.reject(error);
    }
});


utils.defineProperty(Provider.prototype, '_resolveNames', function(object, keys) {
    var promises = [];

    var result = copyObject(object);

    keys.forEach(function(key) {
        if (result[key] === undefined) { return; }
        promises.push(this.resolveName(result[key]).then(function(address) {
            result[key] = address;
        }));
    }, this);

    return Promise.all(promises).then(function() { return result; });
});

utils.defineProperty(Provider.prototype, '_getResolver', function(name) {
    var nodeHash = utils.namehash(name);

    // keccak256('resolver(bytes32)')
    var data = '0x0178b8bf' + nodeHash.substring(2);
    var transaction = { to: this.ensAddress, data: data };

    // Get the resolver from the blockchain
    return this.call(transaction).then(function(data) {

        // extract the address from the data
        if (data.length != 66) { return null; }
        return utils.getAddress('0x' + data.substring(26));
    });
});

utils.defineProperty(Provider.prototype, 'resolveName', function(name) {
    // If it is already an address, nothing to resolve
    try {
        return Promise.resolve(utils.getAddress(name));
    } catch (error) { }

    if (!this.ensAddress) { throw new Error('network does not have ENS deployed'); }

    var self = this;

    var nodeHash = utils.namehash(name);

    // Get the addr from the resovler
    return this._getResolver(name).then(function(resolverAddress) {

        // keccak256('addr(bytes32)')
        var data = '0x3b3b57de' + nodeHash.substring(2);
        var transaction = { to: resolverAddress, data: data };
        return self.call(transaction);

    // extract the address from the data
    }).then(function(data) {
        if (data.length != 66) { return null; }
        var address = utils.getAddress('0x' + data.substring(26));
        if (address === '0x0000000000000000000000000000000000000000') { return null; }
        return address;
    });
});

utils.defineProperty(Provider.prototype, 'lookupAddress', function(address) {
    if (!this.ensAddress) { throw new Error('network does not have ENS deployed'); }

    address = utils.getAddress(address);

    var name = address.substring(2) + '.addr.reverse'
    var nodehash = utils.namehash(name);

    var self = this;

    return this._getResolver(name).then(function(resolverAddress) {
        if (!resolverAddress) { return null; }

        // keccak('name(bytes32)')
        var data = '0x691f3431' + nodehash.substring(2);
        var transaction = { to: resolverAddress, data: data };
        return self.call(transaction);

    }).then(function(data) {
        // Strip off the "0x"
        data = data.substring(2);

        // Strip off the dynamic string pointer (0x20)
        if (data.length < 64) { return null; }
        data = data.substring(64);

        if (data.length < 64) { return null; }
        var length = utils.bigNumberify('0x' + data.substring(0, 64)).toNumber();
        data = data.substring(64);

        if (2 * length > data.length) { return null; }

        var name = utils.toUtf8String('0x' + data.substring(0, 2 * length));

        // Make sure the reverse record matches the foward record
        return self.resolveName(name).then(function(addr) {
            if (addr != address) { return null; }
            return name;
        });

    });
});

utils.defineProperty(Provider.prototype, 'doPoll', function() {
});

utils.defineProperty(Provider.prototype, 'perform', function(method, params) {
    return Promise.reject(new Error('not implemented - ' + method));
});

function recurse(object, convertFunc) {
    if (Array.isArray(object)) {
        var result = [];
        object.forEach(function(object) {
            result.push(recurse(object, convertFunc));
        });
        return result;
    }
    return convertFunc(object);
}

function getEventString(object) {
    try {
        return 'address:' + utils.getAddress(object);
    } catch (error) { }

    if (object === 'block') {
        return 'block';

    } else if (object === 'pending') {
        return 'pending';

    } else if (utils.isHexString(object)) {
        if (object.length === 66) {
            return 'tx:' + object;
        }
    } else if (Array.isArray(object)) {
        object = recurse(object, function(object) {
            if (object == null) { object = '0x'; }
            return object;
        });

        try {
            return 'topic:' + utils.RLP.encode(object);
        } catch (error) {
            console.log(error);
        }
    }

    throw new Error('invalid event - ' + object);
}

function parseEventString(string) {
    if (string.substring(0, 3) === 'tx:') {
        return {type: 'transaction', hash: string.substring(3)};

    } else if (string === 'block') {
        return {type: 'block'};

    } else if (string === 'pending') {
        return {type: 'pending'};

    } else if (string.substring(0, 8) === 'address:') {
        return {type: 'address', address: string.substring(8)};

    } else if (string.substring(0, 6) === 'topic:') {
        try {
            var object = utils.RLP.decode(string.substring(6));
            object = recurse(object, function(object) {
                if (object === '0x') { object = null; }
                return object;
            });
            return {type: 'topic', topic: object};
        } catch (error) {
            console.log(error);
        }
    }

    throw new Error('invalid event string');
}

utils.defineProperty(Provider.prototype, '_startPending', function() {
    console.log('WARNING: this provider does not support pending events');
});

utils.defineProperty(Provider.prototype, '_stopPending', function() {
});

utils.defineProperty(Provider.prototype, 'on', function(eventName, listener) {
    var key = getEventString(eventName);
    if (!this._events[key]) { this._events[key] = []; }
    this._events[key].push({eventName: eventName, listener: listener, type: 'on'});
    if (key === 'pending') { this._startPending(); }
    this.polling = true;
});

utils.defineProperty(Provider.prototype, 'once', function(eventName, listener) {
    var key = getEventString(eventName);
    if (!this._events[key]) { this._events[key] = []; }
    this._events[key].push({eventName: eventName, listener: listener, type: 'once'});
    if (key === 'pending') { this._startPending(); }
    this.polling = true;
});

utils.defineProperty(Provider.prototype, 'emit', function(eventName) {
    var key = getEventString(eventName);

    var args = Array.prototype.slice.call(arguments, 1);
    var listeners = this._events[key];
    if (!listeners) { return; }

    for (var i = 0; i < listeners.length; i++) {
        var listener = listeners[i];
        if (listener.type === 'once') {
            listeners.splice(i, 1);
            i--;
        }

        try {
            listener.listener.apply(this, args);
        } catch (error) {
            console.log('Event Listener Error: ' + error.message);
        }
    }

    if (listeners.length === 0) {
        delete this._events[key];
        if (key === 'pending') { this._stopPending(); }
    }

    if (this.listenerCount() === 0) { this.polling = false; }
});

utils.defineProperty(Provider.prototype, 'listenerCount', function(eventName) {
    if (!eventName) {
        var result = 0;
        for (var key in this._events) {
            result += this._events[key].length;
        }
        return result;
    }

    var listeners = this._events[getEventString(eventName)];
    if (!listeners) { return 0; }
    return listeners.length;
});

utils.defineProperty(Provider.prototype, 'listeners', function(eventName) {
    var listeners = this._events[getEventString(eventName)];
    if (!listeners) { return 0; }
    var result = [];
    for (var i = 0; i < listeners.length; i++) {
        result.push(listeners[i].listener);
    }
    return result;
});

utils.defineProperty(Provider.prototype, 'removeAllListeners', function(eventName) {
    delete this._events[getEventString(eventName)];
    if (this.listenerCount() === 0) { this.polling = false; }
});

utils.defineProperty(Provider.prototype, 'removeListener', function(eventName, listener) {
    var listeners = this._events[getEventString(eventName)];
    if (!listeners) { return 0; }
    for (var i = 0; i < listeners.length; i++) {
        if (listeners[i].listener === listener) {
            listeners.splice(i, 1);
            return;
        }
    }
    if (this.listenerCount() === 0) { this.polling = false; }
});

utils.defineProperty(Provider, '_formatters', {
    checkTransactionResponse: checkTransaction
});

module.exports = Provider;

},{"./networks.json":10,"ethers-utils/address":13,"ethers-utils/bignumber":14,"ethers-utils/contract-address":16,"ethers-utils/convert":17,"ethers-utils/namehash":21,"ethers-utils/properties":22,"ethers-utils/rlp":23,"ethers-utils/utf8":29,"inherits":73,"xmlhttprequest":4}],12:[function(require,module,exports){
'use strict';

var utils = require('ethers-utils');

var Provider = require('./provider');
var JsonRpcProvider = require('./json-rpc-provider');


function Web3Signer(provider, address) {
    if (!(this instanceof Web3Signer)) { throw new Error('missing new'); }
    utils.defineProperty(this, 'provider', provider);

    // Statically attach to a given address
    if (address) {
        utils.defineProperty(this, 'address', address);
        utils.defineProperty(this, '_syncAddress', true);

    } else {
        Object.defineProperty(this, 'address', {
            enumerable: true,
            get: function() {
                throw new Error('unsupported sync operation; use getAddress');
            }
        });
        utils.defineProperty(this, '_syncAddress', false);
    }
}

utils.defineProperty(Web3Signer.prototype, 'getAddress', function() {
    if (this._syncAddress) { return Promise.resolve(this.address); }

    return this.provider.send('eth_accounts', []).then(function(accounts) {
        if (accounts.length === 0) {
            throw new Error('no account');
        }
        return utils.getAddress(accounts[0]);
    });
});

utils.defineProperty(Web3Signer.prototype, 'getBalance', function(blockTag) {
    var provider = this.provider;
    return this.getAddress().then(function(address) {
        return provider.getBalance(address, blockTag);
    });
});

utils.defineProperty(Web3Signer.prototype, 'getTransactionCount', function(blockTag) {
    var provider = this.provider;
    return this.getAddress().then(function(address) {
        return provider.getTransactionCount(address, blockTag);
    });
});

utils.defineProperty(Web3Signer.prototype, 'sendTransaction', function(transaction) {
    var provider = this.provider;
    transaction = JsonRpcProvider._hexlifyTransaction(transaction);
    return this.getAddress().then(function(address) {
        transaction.from = address.toLowerCase();
        return provider.send('eth_sendTransaction', [ transaction ]).then(function(hash) {
            return new Promise(function(resolve, reject) {
                function check() {
                    provider.getTransaction(hash).then(function(transaction) {
                        if (!transaction) {
                            setTimeout(check, 1000);
                            return;
                        }
                        resolve(transaction);
                    });
                }
                check();
            });
        });
    });
});

utils.defineProperty(Web3Signer.prototype, 'signMessage', function(message) {
    var provider = this.provider;

    var data = ((typeof(message) === 'string') ? utils.toUtf8Bytes(message): message);
    return this.getAddress().then(function(address) {

        // https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_sign
        var method = 'eth_sign';
        var params = [ address.toLowerCase(), utils.hexlify(data) ];

        // Metamask complains about eth_sign (and on some versions hangs)
        if (provider._web3Provider.isMetaMask) {
            // https://github.com/ethereum/go-ethereum/wiki/Management-APIs#personal_sign
            method = 'personal_sign';
            params = [ utils.hexlify(data), address.toLowerCase() ];
        }

        return provider.send(method, params);
    });
});

utils.defineProperty(Web3Signer.prototype, 'unlock', function(password) {
    var provider = this.provider;

    return this.getAddress().then(function(address) {
        return provider.send('personal_unlockAccount', [ address.toLowerCase(), password, null ]);
    });
});

/*
@TODO
utils.defineProperty(Web3Signer, 'onchange', {

});
*/

function Web3Provider(web3Provider, network) {
    if (!(this instanceof Web3Provider)) { throw new Error('missing new'); }

    // HTTP has a host; IPC has a path.
    var url = web3Provider.host || web3Provider.path || 'unknown';

    // No need to support legacy parameters since this is post-legacy network
    if (network == null) {
        network = Provider.networks.homestead;
    } else if (typeof(network) === 'string') {
        network = Provider.networks[network];
        if (!network) { throw new Error('invalid network'); }
    }

    JsonRpcProvider.call(this, url, network);
    utils.defineProperty(this, '_web3Provider', web3Provider);
}
JsonRpcProvider.inherits(Web3Provider);

utils.defineProperty(Web3Provider.prototype, 'getSigner', function(address) {
    return new Web3Signer(this, address);
});

utils.defineProperty(Web3Provider.prototype, 'listAccounts', function() {
    return this.send('eth_accounts', []).then(function(accounts) {
        accounts.forEach(function(address, index) {
            accounts[index] = utils.getAddress(address);
        });
        return accounts;
    });
});

utils.defineProperty(Web3Provider.prototype, 'send', function(method, params) {
    var provider = this._web3Provider;
    return new Promise(function(resolve, reject) {
        var request = {
            method: method,
            params: params,
            id: 42,
            jsonrpc: "2.0"
        };
        provider.sendAsync(request, function(error, result) {
            if (error) {
                reject(error);
                return;
            }
            if (result.error) {
                var error = new Error(result.error.message);
                error.code = result.error.code;
                error.data = result.error.data;
                reject(error);
                return;
            }
            resolve(result.result);
        });
    });
});

module.exports = Web3Provider;

},{"./json-rpc-provider":9,"./provider":11,"ethers-utils":19}],13:[function(require,module,exports){

var BN = require('bn.js');

var convert = require('./convert');
var throwError = require('./throw-error');
var keccak256 = require('./keccak256');

function getChecksumAddress(address) {
    if (typeof(address) !== 'string' || !address.match(/^0x[0-9A-Fa-f]{40}$/)) {
        throwError('invalid address', {input: address});
    }

    address = address.toLowerCase();

    var hashed = address.substring(2).split('');
    for (var i = 0; i < hashed.length; i++) {
        hashed[i] = hashed[i].charCodeAt(0);
    }
    hashed = convert.arrayify(keccak256(hashed));

    address = address.substring(2).split('');
    for (var i = 0; i < 40; i += 2) {
        if ((hashed[i >> 1] >> 4) >= 8) {
            address[i] = address[i].toUpperCase();
        }
        if ((hashed[i >> 1] & 0x0f) >= 8) {
            address[i + 1] = address[i + 1].toUpperCase();
        }
    }

    return '0x' + address.join('');
}

// Shims for environments that are missing some required constants and functions
var MAX_SAFE_INTEGER = 0x1fffffffffffff;

function log10(x) {
    if (Math.log10) { return Math.log10(x); }
    return Math.log(x) / Math.LN10;
}


// See: https://en.wikipedia.org/wiki/International_Bank_Account_Number
var ibanChecksum = (function() {

    // Create lookup table
    var ibanLookup = {};
    for (var i = 0; i < 10; i++) { ibanLookup[String(i)] = String(i); }
    for (var i = 0; i < 26; i++) { ibanLookup[String.fromCharCode(65 + i)] = String(10 + i); }

    // How many decimal digits can we process? (for 64-bit float, this is 15)
    var safeDigits = Math.floor(log10(MAX_SAFE_INTEGER));

    return function(address) {
        address = address.toUpperCase();
        address = address.substring(4) + address.substring(0, 2) + '00';

        var expanded = address.split('');
        for (var i = 0; i < expanded.length; i++) {
            expanded[i] = ibanLookup[expanded[i]];
        }
        expanded = expanded.join('');

        // Javascript can handle integers safely up to 15 (decimal) digits
        while (expanded.length >= safeDigits){
            var block = expanded.substring(0, safeDigits);
            expanded = parseInt(block, 10) % 97 + expanded.substring(block.length);
        }

        var checksum = String(98 - (parseInt(expanded, 10) % 97));
        while (checksum.length < 2) { checksum = '0' + checksum; }

        return checksum;
    };
})();

function getAddress(address, icapFormat) {
    var result = null;

    if (typeof(address) !== 'string') {
        throwError('invalid address', {input: address});
    }

    if (address.match(/^(0x)?[0-9a-fA-F]{40}$/)) {

        // Missing the 0x prefix
        if (address.substring(0, 2) !== '0x') { address = '0x' + address; }

        result = getChecksumAddress(address);

        // It is a checksummed address with a bad checksum
        if (address.match(/([A-F].*[a-f])|([a-f].*[A-F])/) && result !== address) {
            throwError('invalid address checksum', { input: address, expected: result });
        }

    // Maybe ICAP? (we only support direct mode)
    } else if (address.match(/^XE[0-9]{2}[0-9A-Za-z]{30,31}$/)) {

        // It is an ICAP address with a bad checksum
        if (address.substring(2, 4) !== ibanChecksum(address)) {
            throwError('invalid address icap checksum', { input: address });
        }

        result = (new BN(address.substring(4), 36)).toString(16);
        while (result.length < 40) { result = '0' + result; }
        result = getChecksumAddress('0x' + result);

    } else {
        throwError('invalid address', { input: address });
    }

    if (icapFormat) {
        var base36 = (new BN(result.substring(2), 16)).toString(36).toUpperCase();
        while (base36.length < 30) { base36 = '0' + base36; }
        return 'XE' + ibanChecksum('XE00' + base36) + base36;
    }

    return result;
}


module.exports = {
    getAddress: getAddress,
}

},{"./convert":17,"./keccak256":20,"./throw-error":27,"bn.js":2}],14:[function(require,module,exports){
/**
 *  BigNumber
 *
 *  A wrapper around the BN.js object. In the future we can swap out
 *  the underlying BN.js library for something smaller.
 */

var BN = require('bn.js');

var defineProperty = require('./properties').defineProperty;
var convert = require('./convert');
var throwError = require('./throw-error');

function BigNumber(value) {
    if (!(this instanceof BigNumber)) { throw new Error('missing new'); }

    if (convert.isHexString(value)) {
        if (value == '0x') { value = '0x0'; }
        value = new BN(value.substring(2), 16);
    } else if (typeof(value) === 'string' && value[0] === '-' && convert.isHexString(value.substring(1))) {
        value = (new BN(value.substring(3), 16)).mul(BigNumber.constantNegativeOne._bn);

    } else if (typeof(value) === 'string' && value.match(/^-?[0-9]*$/)) {
        if (value == '') { value = '0'; }
        value = new BN(value);

    } else if (typeof(value) === 'number' && parseInt(value) == value) {
        value = new BN(value);

    } else if (BN.isBN(value)) {
        //value = value

    } else if (isBigNumber(value)) {
        value = value._bn;

    } else if (convert.isArrayish(value)) {
        value = new BN(convert.hexlify(value).substring(2), 16);

    } else {
        throwError('invalid BigNumber value', { input: value });
    }

    defineProperty(this, '_bn', value);
}

defineProperty(BigNumber, 'constantNegativeOne', bigNumberify(-1));
defineProperty(BigNumber, 'constantZero', bigNumberify(0));
defineProperty(BigNumber, 'constantOne', bigNumberify(1));
defineProperty(BigNumber, 'constantTwo', bigNumberify(2));
defineProperty(BigNumber, 'constantWeiPerEther', bigNumberify(new BN('1000000000000000000')));


defineProperty(BigNumber.prototype, 'fromTwos', function(value) {
    return new BigNumber(this._bn.fromTwos(value));
});

defineProperty(BigNumber.prototype, 'toTwos', function(value) {
    return new BigNumber(this._bn.toTwos(value));
});


defineProperty(BigNumber.prototype, 'add', function(other) {
    return new BigNumber(this._bn.add(bigNumberify(other)._bn));
});

defineProperty(BigNumber.prototype, 'sub', function(other) {
    return new BigNumber(this._bn.sub(bigNumberify(other)._bn));
});


defineProperty(BigNumber.prototype, 'div', function(other) {
    return new BigNumber(this._bn.div(bigNumberify(other)._bn));
});

defineProperty(BigNumber.prototype, 'mul', function(other) {
    return new BigNumber(this._bn.mul(bigNumberify(other)._bn));
});

defineProperty(BigNumber.prototype, 'mod', function(other) {
    return new BigNumber(this._bn.mod(bigNumberify(other)._bn));
});

defineProperty(BigNumber.prototype, 'pow', function(other) {
    return new BigNumber(this._bn.pow(bigNumberify(other)._bn));
});


defineProperty(BigNumber.prototype, 'maskn', function(value) {
    return new BigNumber(this._bn.maskn(value));
});



defineProperty(BigNumber.prototype, 'eq', function(other) {
    return this._bn.eq(bigNumberify(other)._bn);
});

defineProperty(BigNumber.prototype, 'lt', function(other) {
    return this._bn.lt(bigNumberify(other)._bn);
});

defineProperty(BigNumber.prototype, 'lte', function(other) {
    return this._bn.lte(bigNumberify(other)._bn);
});

defineProperty(BigNumber.prototype, 'gt', function(other) {
    return this._bn.gt(bigNumberify(other)._bn);
});

defineProperty(BigNumber.prototype, 'gte', function(other) {
    return this._bn.gte(bigNumberify(other)._bn);
});


defineProperty(BigNumber.prototype, 'isZero', function() {
    return this._bn.isZero();
});


defineProperty(BigNumber.prototype, 'toNumber', function(base) {
    return this._bn.toNumber();
});

defineProperty(BigNumber.prototype, 'toString', function() {
    //return this._bn.toString(base || 10);
    return this._bn.toString(10);
});

defineProperty(BigNumber.prototype, 'toHexString', function() {
    var hex = this._bn.toString(16);
    if (hex.length % 2) { hex = '0' + hex; }
    return '0x' + hex;
});


function isBigNumber(value) {
    return (value._bn && value._bn.mod);
}

function bigNumberify(value) {
    if (isBigNumber(value)) { return value; }
    return new BigNumber(value);
}

module.exports = {
    isBigNumber: isBigNumber,
    bigNumberify: bigNumberify,
    BigNumber: BigNumber
};

},{"./convert":17,"./properties":22,"./throw-error":27,"bn.js":2}],15:[function(require,module,exports){
(function (global){
'use strict';

var convert = require('./convert');
var defineProperty = require('./properties').defineProperty;

var crypto = global.crypto || global.msCrypto;
if (!crypto || !crypto.getRandomValues) {

    console.log('WARNING: Missing strong random number source; using weak randomBytes');

    crypto = {
        getRandomValues: function(buffer) {
            for (var round = 0; round < 20; round++) {
                for (var i = 0; i < buffer.length; i++) {
                    if (round) {
                        buffer[i] ^= parseInt(256 * Math.random());
                    } else {
                        buffer[i] = parseInt(256 * Math.random());
                    }
                }
            }

            return buffer;
        },
        _weakCrypto: true
    };
}

function randomBytes(length) {
    if (length <= 0 || length > 1024 || parseInt(length) != length) {
        throw new Error('invalid length');
    }

    var result = new Uint8Array(length);
    crypto.getRandomValues(result);
    return convert.arrayify(result);
};

if (crypto._weakCrypto === true) {
    defineProperty(randomBytes, '_weakCrypto', true);
}

module.exports = randomBytes;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./convert":17,"./properties":22}],16:[function(require,module,exports){

var getAddress = require('./address').getAddress;
var convert = require('./convert');
var keccak256 = require('./keccak256');
var RLP = require('./rlp');

// http://ethereum.stackexchange.com/questions/760/how-is-the-address-of-an-ethereum-contract-computed
function getContractAddress(transaction) {
    if (!transaction.from) { throw new Error('missing from address'); }
    var nonce = transaction.nonce;

    return getAddress('0x' + keccak256(RLP.encode([
        getAddress(transaction.from),
        convert.stripZeros(convert.hexlify(nonce, 'nonce'))
    ])).substring(26));
}

module.exports = {
    getContractAddress: getContractAddress,
}

},{"./address":13,"./convert":17,"./keccak256":20,"./rlp":23}],17:[function(require,module,exports){
/**
 *  Conversion Utilities
 *
 */

var defineProperty = require('./properties.js').defineProperty;
var throwError = require('./throw-error');

function addSlice(array) {
    if (array.slice) { return array; }

    array.slice = function() {
        var args = Array.prototype.slice.call(arguments);
        return new Uint8Array(Array.prototype.slice.apply(array, args));
    }

    return array;
}

function isArrayish(value) {
    if (!value || parseInt(value.length) != value.length || typeof(value) === 'string') {
        return false;
    }

    for (var i = 0; i < value.length; i++) {
        var v = value[i];
        if (v < 0 || v >= 256 || parseInt(v) != v) {
            return false;
        }
    }

    return true;
}

function arrayify(value, name) {

    if (value && value.toHexString) {
        value = value.toHexString();
    }

    if (isHexString(value)) {
        value = value.substring(2);
        if (value.length % 2) { value = '0' + value; }

        var result = [];
        for (var i = 0; i < value.length; i += 2) {
            result.push(parseInt(value.substr(i, 2), 16));
        }

        return addSlice(new Uint8Array(result));
    }

    if (isArrayish(value)) {
        return addSlice(new Uint8Array(value));
    }

    throwError('invalid arrayify value', { name: name, input: value });
}

function concat(objects) {
    var arrays = [];
    var length = 0;
    for (var i = 0; i < objects.length; i++) {
        var object = arrayify(objects[i])
        arrays.push(object);
        length += object.length;
    }

    var result = new Uint8Array(length);
    var offset = 0;
    for (var i = 0; i < arrays.length; i++) {
        result.set(arrays[i], offset);
        offset += arrays[i].length;
    }

    return addSlice(result);
}
function stripZeros(value) {
    value = arrayify(value);

    if (value.length === 0) { return value; }

    // Find the first non-zero entry
    var start = 0;
    while (value[start] === 0) { start++ }

    // If we started with zeros, strip them
    if (start) {
        value = value.slice(start);
    }

    return value;
}

function padZeros(value, length) {
    value = arrayify(value);

    if (length < value.length) { throw new Error('cannot pad'); }

    var result = new Uint8Array(length);
    result.set(value, length - value.length);
    return addSlice(result);
}


function isHexString(value, length) {
    if (typeof(value) !== 'string' || !value.match(/^0x[0-9A-Fa-f]*$/)) {
        return false
    }
    if (length && value.length !== 2 + 2 * length) { return false; }
    return true;
}

var HexCharacters = '0123456789abcdef';

function hexlify(value, name) {

    if (value && value.toHexString) {
        return value.toHexString();
    }

    if (typeof(value) === 'number') {
        if (value < 0) {
            throwError('cannot hexlify negative value', { name: name, input: value });
        }

        var hex = '';
        while (value) {
            hex = HexCharacters[value & 0x0f] + hex;
            value = parseInt(value / 16);
        }

        if (hex.length) {
            if (hex.length % 2) { hex = '0' + hex; }
            return '0x' + hex;
        }

        return '0x00';
    }

    if (isHexString(value)) {
        if (value.length % 2) {
            value = '0x0' + value.substring(2);
        }
        return value;
    }

    if (isArrayish(value)) {
        var result = [];
        for (var i = 0; i < value.length; i++) {
             var v = value[i];
             result.push(HexCharacters[(v & 0xf0) >> 4] + HexCharacters[v & 0x0f]);
        }
        return '0x' + result.join('');
    }

    throwError('invalid hexlify value', { name: name, input: value });
}


module.exports = {
    arrayify: arrayify,
    isArrayish: isArrayish,

    concat: concat,

    padZeros: padZeros,
    stripZeros: stripZeros,

    hexlify: hexlify,
    isHexString: isHexString,
};

},{"./properties.js":22,"./throw-error":27}],18:[function(require,module,exports){
'use strict';

var keccak256 = require('./keccak256');
var utf8 = require('./utf8');

function id(text) {
    return keccak256(utf8.toUtf8Bytes(text));
}

module.exports = id;

},{"./keccak256":20,"./utf8":29}],19:[function(require,module,exports){
'use strict';

// This is SUPER useful, but adds 140kb (even zipped, adds 40kb)
//var unorm = require('unorm');

var address = require('./address');
var bigNumber = require('./bignumber');
var contractAddress = require('./contract-address');
var convert = require('./convert');
var id = require('./id');
var keccak256 = require('./keccak256');
var namehash = require('./namehash');
var sha256 = require('./sha2').sha256;
var solidity = require('./solidity');
var randomBytes = require('./random-bytes');
var properties = require('./properties');
var RLP = require('./rlp');
var utf8 = require('./utf8');
var units = require('./units');


module.exports = {
    RLP: RLP,

    defineProperty: properties.defineProperty,

    // NFKD (decomposed)
    //etherSymbol: '\uD835\uDF63',

    // NFKC (composed)
    etherSymbol: '\u039e',

    arrayify: convert.arrayify,

    concat: convert.concat,
    padZeros: convert.padZeros,
    stripZeros: convert.stripZeros,

    bigNumberify: bigNumber.bigNumberify,
    BigNumber: bigNumber.BigNumber,

    hexlify: convert.hexlify,

    toUtf8Bytes: utf8.toUtf8Bytes,
    toUtf8String: utf8.toUtf8String,

    namehash: namehash,
    id: id,

    getAddress: address.getAddress,
    getContractAddress: contractAddress.getContractAddress,

    formatEther: units.formatEther,
    parseEther: units.parseEther,

    formatUnits: units.formatUnits,
    parseUnits: units.parseUnits,

    keccak256: keccak256,
    sha256: sha256,

    randomBytes: randomBytes,

    solidityPack: solidity.pack,
    solidityKeccak256: solidity.keccak256,
    soliditySha256: solidity.sha256,
}

require('./standalone')({
    utils: module.exports
});


},{"./address":13,"./bignumber":14,"./contract-address":16,"./convert":17,"./id":18,"./keccak256":20,"./namehash":21,"./properties":22,"./random-bytes":15,"./rlp":23,"./sha2":24,"./solidity":25,"./standalone":26,"./units":28,"./utf8":29}],20:[function(require,module,exports){
'use strict';

var sha3 = require('js-sha3');

var convert = require('./convert.js');

function keccak256(data) {
    data = convert.arrayify(data);
    return '0x' + sha3.keccak_256(data);
}

module.exports = keccak256;

},{"./convert.js":17,"js-sha3":74}],21:[function(require,module,exports){
'use strict';

var convert = require('./convert');
var utf8 = require('./utf8');
var keccak256 = require('./keccak256');

var Zeros = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var Partition = new RegExp("^((.*)\\.)?([^.]+)$");
var UseSTD3ASCIIRules = new RegExp("^[a-z0-9.-]*$");

function namehash(name, depth) {
    name = name.toLowerCase();

    // Supporting the full UTF-8 space requires additional (and large)
    // libraries, so for now we simply do not support them.
    // It should be fairly easy in the future to support systems with
    // String.normalize, but that is future work.
    if (!name.match(UseSTD3ASCIIRules)) {
        throw new Error('contains invalid UseSTD3ASCIIRules characters');
    }

    var result = Zeros;
    var processed = 0;
    while (name.length && (!depth || processed < depth)) {
        var partition = name.match(Partition);
        var label = utf8.toUtf8Bytes(partition[3]);
        result = keccak256(convert.concat([result, keccak256(label)]));

        name = partition[2] || '';

        processed++;
    }

    return convert.hexlify(result);
}

module.exports = namehash;


},{"./convert":17,"./keccak256":20,"./utf8":29}],22:[function(require,module,exports){
'use strict';

function defineProperty(object, name, value) {
    Object.defineProperty(object, name, {
        enumerable: true,
        value: value,
        writable: false,
    });
}

module.exports = {
    defineProperty: defineProperty,
};

},{}],23:[function(require,module,exports){
//See: https://github.com/ethereum/wiki/wiki/RLP

var convert = require('./convert.js');

function arrayifyInteger(value) {
    var result = [];
    while (value) {
        result.unshift(value & 0xff);
        value >>= 8;
    }
    return result;
}

function unarrayifyInteger(data, offset, length) {
    var result = 0;
    for (var i = 0; i < length; i++) {
        result = (result * 256) + data[offset + i];
    }
    return result;
}

function _encode(object) {
    if (Array.isArray(object)) {
        var payload = [];
        object.forEach(function(child) {
            payload = payload.concat(_encode(child));
        });

        if (payload.length <= 55) {
            payload.unshift(0xc0 + payload.length)
            return payload;
        }

        var length = arrayifyInteger(payload.length);
        length.unshift(0xf7 + length.length);

        return length.concat(payload);

    } else {
        object = [].slice.call(convert.arrayify(object));

        if (object.length === 1 && object[0] <= 0x7f) {
            return object;

        } else if (object.length <= 55) {
            object.unshift(0x80 + object.length);
            return object
        }

        var length = arrayifyInteger(object.length);
        length.unshift(0xb7 + length.length);

        return length.concat(object);
    }
}

function encode(object) {
    return convert.hexlify(_encode(object));
}

function _decodeChildren(data, offset, childOffset, length) {
    var result = [];

    while (childOffset < offset + 1 + length) {
        var decoded = _decode(data, childOffset);

        result.push(decoded.result);

        childOffset += decoded.consumed;
        if (childOffset > offset + 1 + length) {
            throw new Error('invalid rlp');
        }
    }

    return {consumed: (1 + length), result: result};
}

// returns { consumed: number, result: Object }
function _decode(data, offset) {
    if (data.length === 0) { throw new Error('invalid rlp data'); }

    // Array with extra length prefix
    if (data[offset] >= 0xf8) {
        var lengthLength = data[offset] - 0xf7;
        if (offset + 1 + lengthLength > data.length) {
            throw new Error('too short');
        }

        var length = unarrayifyInteger(data, offset + 1, lengthLength);
        if (offset + 1 + lengthLength + length > data.length) {
            throw new Error('to short');
        }

        return _decodeChildren(data, offset, offset + 1 + lengthLength, lengthLength + length);

    } else if (data[offset] >= 0xc0) {
        var length = data[offset] - 0xc0;
        if (offset + 1 + length > data.length) {
            throw new Error('invalid rlp data');
        }

        return _decodeChildren(data, offset, offset + 1, length);

    } else if (data[offset] >= 0xb8) {
        var lengthLength = data[offset] - 0xb7;
        if (offset + 1 + lengthLength > data.length) {
            throw new Error('invalid rlp data');
        }

        var length = unarrayifyInteger(data, offset + 1, lengthLength);
        if (offset + 1 + lengthLength + length > data.length) {
            throw new Error('invalid rlp data');
        }

        var result = convert.hexlify(data.slice(offset + 1 + lengthLength, offset + 1 + lengthLength + length));
        return { consumed: (1 + lengthLength + length), result: result }

    } else if (data[offset] >= 0x80) {
        var length = data[offset] - 0x80;
        if (offset + 1 + length > data.offset) {
            throw new Error('invlaid rlp data');
        }

        var result = convert.hexlify(data.slice(offset + 1, offset + 1 + length));
        return { consumed: (1 + length), result: result }
    }
    return { consumed: 1, result: convert.hexlify(data[offset]) };
}

function decode(data) {
    data = convert.arrayify(data);
    var decoded = _decode(data, 0);
    if (decoded.consumed !== data.length) {
        throw new Error('invalid rlp data');
    }
    return decoded.result;
}

module.exports = {
    encode: encode,
    decode: decode,
}

},{"./convert.js":17}],24:[function(require,module,exports){
'use strict';

var hash = require('hash.js');

var convert = require('./convert.js');

function sha256(data) {
    data = convert.arrayify(data);
    return '0x' + (hash.sha256().update(data).digest('hex'));
}

function sha512(data) {
    data = convert.arrayify(data);
    return '0x' + (hash.sha512().update(data).digest('hex'));
}

module.exports = {
    sha256: sha256,
    sha512: sha512,

    createSha256: hash.sha256,
    createSha512: hash.sha512,
}

},{"./convert.js":17,"hash.js":60}],25:[function(require,module,exports){
'use strict';

var bigNumberify = require('./bignumber').bigNumberify;
var convert = require('./convert');
var getAddress = require('./address').getAddress;
var utf8 = require('./utf8');

var hashKeccak256 = require('./keccak256');
var hashSha256 = require('./sha2').sha256;

var regexBytes = new RegExp("^bytes([0-9]+)$");
var regexNumber = new RegExp("^(u?int)([0-9]*)$");
var regexArray = new RegExp("^(.*)\\[([0-9]*)\\]$");

var Zeros = '0000000000000000000000000000000000000000000000000000000000000000';

function _pack(type, value, isArray) {
    switch(type) {
        case 'address':
            if (isArray) { return convert.padZeros(value, 32); }
            return convert.arrayify(value);
        case 'string':
            return utf8.toUtf8Bytes(value);
        case 'bytes':
            return convert.arrayify(value);
        case 'bool':
            value = (value ? '0x01': '0x00');
            if (isArray) { return convert.padZeros(value, 32); }
            return convert.arrayify(value);
    }

    var match =  type.match(regexNumber);
    if (match) {
        var signed = (match[1] === 'int')
        var size = parseInt(match[2] || "256")
        if ((size % 8 != 0) || size === 0 || size > 256) {
            throw new Error('invalid number type - ' + type);
        }

        if (isArray) { size = 256; }

        value = bigNumberify(value).toTwos(size);

        return convert.padZeros(value, size / 8);
    }

    match = type.match(regexBytes);
    if (match) {
        var size = match[1];
        if (size != parseInt(size) || size === 0 || size > 32) {
            throw new Error('invalid number type - ' + type);
        }
        size = parseInt(size);
        if (convert.arrayify(value).byteLength !== size) { throw new Error('invalid value for ' + type); }
        if (isArray) { return (value + Zeros).substring(0, 66); }
        return value;
    }

    match = type.match(regexArray);
    if (match) {
        var baseType = match[1];
        var count = parseInt(match[2] || value.length);
        if (count != value.length) { throw new Error('invalid value for ' + type); }
        var result = [];
        value.forEach(function(value) {
            value = _pack(baseType, value, true);
            result.push(value);
        });
        return convert.concat(result);
    }

    throw new Error('unknown type - ' + type);
}

function pack(types, values) {
    if (types.length != values.length) { throw new Error('type/value count mismatch'); }
    var tight = [];
    types.forEach(function(type, index) {
        tight.push(_pack(type, values[index]));
    });
    return convert.hexlify(convert.concat(tight));
}

function keccak256(types, values) {
    return hashKeccak256(pack(types, values));
}

function sha256(types, values) {
    return hashSha256(pack(types, values));
}

module.exports = {
    pack: pack,

    keccak256: keccak256,
    sha256: sha256,
}

},{"./address":13,"./bignumber":14,"./convert":17,"./keccak256":20,"./sha2":24,"./utf8":29}],26:[function(require,module,exports){
(function (global){
var defineProperty = require('./properties.js').defineProperty;

function Ethers() { }

function defineEthersValues(values) {

    // This is modified in the Gruntfile.js
    if ("__STAND_ALONE_FALSE__" !== ("__STAND_ALONE_" + "TRUE__")) {
        return;
    }

    if (global.ethers == null) {
        defineProperty(global, 'ethers', new Ethers());
    }

    for (var key in values) {
        if (global.ethers[key] == null) {
            defineProperty(global.ethers, key, values[key]);
        }
    }
}

module.exports = defineEthersValues;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./properties.js":22}],27:[function(require,module,exports){
'use strict';

function throwError(message, params) {
    var error = new Error(message);
    for (var key in params) {
        error[key] = params[key];
    }
    throw error;
}

module.exports = throwError;

},{}],28:[function(require,module,exports){
var bigNumberify = require('./bignumber.js').bigNumberify;
var throwError = require('./throw-error');

var zero = new bigNumberify(0);
var negative1 = new bigNumberify(-1);

var names = [
    'wei',
    'kwei',
    'Mwei',
    'Gwei',
    'szabo',
    'finny',
    'ether',
];

var getUnitInfo = (function() {
    var unitInfos = {};

    var value = '1';
    names.forEach(function(name) {
        var info = {
            decimals: value.length - 1,
            tenPower: bigNumberify(value),
            name: name
        };
        unitInfos[name.toLowerCase()] = info;
        unitInfos[String(info.decimals)] = info;
        value += '000';
    });

    return function(name) {
        return unitInfos[String(name).toLowerCase()];
    }
})();

function formatUnits(value, unitType, options) {
    if (typeof(unitType) === 'object' && !options) {
        options = unitType;
        unitType = undefined;
    }
    if (unitType == null) {  unitType = 18; }

    var unitInfo = getUnitInfo(unitType);

    // Make sure wei is a big number (convert as necessary)
    value = bigNumberify(value);

    if (!options) { options = {}; }

    var negative = value.lt(zero);
    if (negative) { value = value.mul(negative1); }

    var fraction = value.mod(unitInfo.tenPower).toString(10);
    while (fraction.length < unitInfo.decimals) { fraction = '0' + fraction; }

    // Strip off trailing zeros (but keep one if would otherwise be bare decimal point)
    if (!options.pad) {
        fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/)[1];
    }

    var whole = value.div(unitInfo.tenPower).toString(10);

    if (options.commify) {
        whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    }

    var value = whole + '.' + fraction;

    if (negative) { value = '-' + value; }

    return value;
}

function parseUnits(value, unitType) {
    var unitInfo = getUnitInfo(unitType || 18);
    if (!unitInfo) { throwError('invalid unitType', { unitType: unitType }); }

    if (typeof(value) !== 'string' || !value.match(/^-?[0-9.,]+$/)) {
        throwError('invalid value', { input: value });
    }

    // Remove commas
    var value = value.replace(/,/g,'');

    // Is it negative?
    var negative = (value.substring(0, 1) === '-');
    if (negative) { value = value.substring(1); }

    if (value === '.') { throwError('invalid value', { input: value }); }

    // Split it into a whole and fractional part
    var comps = value.split('.');
    if (comps.length > 2) { throwError('too many decimal points', { input: value }); }

    var whole = comps[0], fraction = comps[1];
    if (!whole) { whole = '0'; }
    if (!fraction) { fraction = '0'; }

    // Prevent underflow
    if (fraction.length > unitInfo.decimals) {
        throwError('too many decimal places', { input: value, decimals: fraction.length });
    }

    // Fully pad the string with zeros to get to wei
    while (fraction.length < unitInfo.decimals) { fraction += '0'; }

    whole = bigNumberify(whole);
    fraction = bigNumberify(fraction);

    var wei = (whole.mul(unitInfo.tenPower)).add(fraction);

    if (negative) { wei = wei.mul(negative1); }

    return wei;
}

function formatEther(wei, options) {
    return formatUnits(wei, 18, options);
}

function parseEther(ether) {
    return parseUnits(ether, 18);
}

/*
function convert(value, fromUnit, toUnit) {
    var fromUnitInfo = getUnitInfo(fromUnit);
    if (!fromUnitInfo) { throwError('invalid unit name', { unitType: fromUnit }); }
    var toUnitInfo = getUnitInfo(toUnit);
    if (!fromUnitInfo) { throwError('invalid unit name', { unitType: toUnit }); }
    // @TODO: Is 
}
*/

module.exports = {
    formatEther: formatEther,
    parseEther: parseEther,

    formatUnits: formatUnits,
    parseUnits: parseUnits,

//    convert: convert,
}

},{"./bignumber.js":14,"./throw-error":27}],29:[function(require,module,exports){

var convert = require('./convert.js');

// http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
function utf8ToBytes(str) {
    var result = [];
    var offset = 0;
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 128) {
            result[offset++] = c;
        } else if (c < 2048) {
            result[offset++] = (c >> 6) | 192;
            result[offset++] = (c & 63) | 128;
        } else if (((c & 0xFC00) == 0xD800) && (i + 1) < str.length && ((str.charCodeAt(i + 1) & 0xFC00) == 0xDC00)) {
            // Surrogate Pair
            c = 0x10000 + ((c & 0x03FF) << 10) + (str.charCodeAt(++i) & 0x03FF);
            result[offset++] = (c >> 18) | 240;
            result[offset++] = ((c >> 12) & 63) | 128;
            result[offset++] = ((c >> 6) & 63) | 128;
            result[offset++] = (c & 63) | 128;
        } else {
            result[offset++] = (c >> 12) | 224;
            result[offset++] = ((c >> 6) & 63) | 128;
            result[offset++] = (c & 63) | 128;
        }
    }

    return convert.arrayify(result);
};


// http://stackoverflow.com/questions/13356493/decode-utf-8-with-javascript#13691499
function bytesToUtf8(bytes) {
    bytes = convert.arrayify(bytes);

    var result = '';
    var i = 0;

    // Invalid bytes are ignored
    while(i < bytes.length) {
        var c = bytes[i++];
        if (c >> 7 == 0) {
            // 0xxx xxxx
            result += String.fromCharCode(c);
            continue;
        }

        // Invalid starting byte
        if (c >> 6 == 0x02) { continue; }

        // Multibyte; how many bytes left for thus character?
        var extraLength = null;
        if (c >> 5 == 0x06) {
            extraLength = 1;
        } else if (c >> 4 == 0x0e) {
            extraLength = 2;
        } else if (c >> 3 == 0x1e) {
            extraLength = 3;
        } else if (c >> 2 == 0x3e) {
            extraLength = 4;
        } else if (c >> 1 == 0x7e) {
            extraLength = 5;
        } else {
            continue;
        }

        // Do we have enough bytes in our data?
        if (i + extraLength > bytes.length) {

            // If there is an invalid unprocessed byte, try to continue
            for (; i < bytes.length; i++) {
                if (bytes[i] >> 6 != 0x02) { break; }
            }
            if (i != bytes.length) continue;

            // All leftover bytes are valid.
            return result;
        }

        // Remove the UTF-8 prefix from the char (res)
        var res = c & ((1 << (8 - extraLength - 1)) - 1);

        var count;
        for (count = 0; count < extraLength; count++) {
            var nextChar = bytes[i++];

            // Is the char valid multibyte part?
            if (nextChar >> 6 != 0x02) {break;};
            res = (res << 6) | (nextChar & 0x3f);
        }

        if (count != extraLength) {
            i--;
            continue;
        }

        if (res <= 0xffff) {
            result += String.fromCharCode(res);
            continue;
        }

        res -= 0x10000;
        result += String.fromCharCode(((res >> 10) & 0x3ff) + 0xd800, (res & 0x3ff) + 0xdc00);
    }

    return result;
}

module.exports = {
    toUtf8Bytes: utf8ToBytes,
    toUtf8String: bytesToUtf8,
};

},{"./convert.js":17}],30:[function(require,module,exports){
'use strict';

var providers = require('ethers-providers');
var utils = require('ethers-utils');

var Errors = {
    InternalError:    -32603,
    InvalidRequest:   -32600,
    ParseError:       -32700,
    MethodNotFound:   -32601,
    InvalidParams:    -32602,
};

// Some implementations of things do not play well with leading zeros
function smallHexlify(value) {
    value = utils.hexlify(value)
    while (value.length > 3 && value.substring(0, 3) === '0x0') {
        value = '0x' + value.substring(3);
    }
    return value;
}

// Convert a Web3 Transaction into an ethers.js Transaction
function makeTransaction(tx) {
    var result = {};
    ['data', 'from', 'gasPrice', 'to', 'value'].forEach(function(key) {
        if (tx[key] == null) { return; }
        result[key] = tx[key];
    });
    if (tx.gas != null) { result.gasLimit = tx.gas; }
    return result;
}

function fillCompact(values, result, keys, keepNull) {
    keys.forEach(function(key) {
        var value = values[key];
        if (value == null) {
            if (!keepNull) { return; }
            value = null;
        } else {
            value = smallHexlify(value);
        }
        result[key] = value;
    });
}

function fillCopy(values, result, keys, keepNull) {
    keys.forEach(function(key) {
        var value = values[key];
        if (value == null) {
            if (!keepNull) { return; }
            value = null;
        }
        result[key] = value;
    });
}

// Convert ethers.js Block into Web3 Block
function formatBlock(block) {
    var result = {};

    fillCompact(block, result, ['difficulty', 'gasLimit', 'gasUsed', 'number', 'timestamp']);

    fillCopy(block, result, ['extraData', 'miner', 'parentHash']);

    fillCompact(block, result, ['number'], true);

    fillCopy(block, result, ['hash', 'nonce'], true);

    return result;
}

// Convert ethers.js Transaction into Web3 Transaction
function formatTransaction(tx) {
    var result = {};

    if (tx.gasLimit) { result.gas = smallHexlify(tx.gasLimit); }
    result.input = (tx.data || '0x');

    fillCompact(tx, result, ['blockNumber', 'gasPrice', 'nonce', 'transactionIndex', 'value'], true);

    fillCopy(tx, result, ['blockHash', 'from', 'hash', 'to'], true);

    return result;
}


// Convert ethers.js Transaction Receiptinto Web3 Transaction
function formatReceipt(receipt) {
    var result = { logs: [] };

    fillCompact(receipt, result, ['blockNumber', 'cumulativeGasUsed', 'gasPrice', 'gasUsed', 'transactionIndex'], true);

    fillCopy(receipt, result, ['blockHash', 'contractAddress', 'from', 'logsBloom', 'transactionHash', 'root', 'to'], true);

    (receipt.logs || []).forEach(function(log) {
        var log = { };
        result.logs.push(log);

        if (receipt.removed != null) { log.removed = receipt.removed; }
        if (receipt.topics != null) { log.topics = receipt.topics; }

        fillCompact(receipt, log, ['blockNumber', 'logIndex', 'transactionIndex'], true);

        fillCopy(receipt, log, ['address', 'blockHash', 'data', 'transactionHash'], true);
    });

    return result;
}
// Convert ethers.js Log into Web3 Log
function formatLog(log) {
    var result = {};
    ['blockNumber', 'logIndex', 'transactionIndex'].forEach(function(key) {
        if (log[key] == null) { return; }
        result[key] = smallHexlify(log[key]);
    });
    ['address', 'blockHash', 'data', 'topics', 'transactionHash'].forEach(function(key) {
        if (log[key] == null) { return; }
        result[key] = log[key];
    });
    return log;
}


function FilterManager() {
    utils.defineProperty(this, 'filters', {});

    var nextFilterId = 1;
    utils.defineProperty(this, '_getFilterId', function() {
        return nextFilterId++;
    });
}

FilterManager.prototype.addFilter = function(onblock, getLogs) {
    if (!getLogs) { getLogs = function() { return Promise.resolve([]); } }

    var filterId = this._getFilterId();

    var seq = Promise.resolve([]);

    function emitBlock(blockNumber) {
        seq = seq.then(function(result) {
            return new Promise(function(resolve, reject) {
                function check() {
                    provider.getBlock(blockNumber).then(function(block) {
                        onblock(block, result).then(function(result) {
                            resolve(result);
                        });
                    }, function (error) {
                        // Does not exist yet; try again in a second
                        setTimeout(check, 1000);
                    });
                }
                check();
            });
        });
    }

    this.filters[smallHexlify(filterId)] = {
        getChanges: function() {
            var result = seq;

            // Reset the filter results
            seq = Promise.resolve([]);
            return result;
        },
        getLogs: getLogs,
        lastPoll: now(),
        uninstall: function() {
            provider.removeListener('block', emitBlock);
            seq = null;
        }
    };

    provider.on('block', emitBlock);

    return smallHexlify(filterId);
}

FilterManager.prototype.removeFilter = function(filterId) {
    var filter = this.filters[smallHexlify(filterId)];
    if (!filter) { return false; }
    filter.uninstall();
    return true;
}

FilterManager.prototype.getChanges = function(filterId) {
    var filter = this.filters[smallHexlify(filterId)];
    if (!filter) { Promise.resolve([]); }
    return filter.getChanges();
}

FilterManager.prototype.getLogs = function(filterId) {
    var filter = this.filters[smallHexlify(filterId)];
    if (!filter) { return Promise.resolve([]); }
    return filter.getLogs();
}

var version = require('./package.json').version;

function ProviderBridge(provider, signer) {
    if (!(this instanceof ProviderBridge)) { throw new Error('missing new'); }
    this._provider = provider || null;
    this._signer = signer || null;

    var self = this;
    setInterval(function() {
        if (!this._signer) {
            this._address = null;
            return;
        }

        this._signer.getAddress().then(function(address) {
            this._address = address;
        }, function(error) {
            this._address = null;
        });
    }, 1000);

    this._queue = [];

    utils.defineProperty(this, 'isMetaMask', true);
    utils.defineProperty(this, 'isEthers', true);
    utils.defineProperty(this, 'isConnected', true);
    utils.defineProperty(this, 'ethersVersion', version);
    utils.defineProperty(this, 'client', 'ethers/' + version);

    utils.defineProperty(this, 'filterManager', new FilterManager());
}

utils.defineProperty(ProviderBridge.prototype, '_drainQueue', function() {
    var self = this;
    this._queue.forEach(function(operation) {
        setTimeout(function() {
            self._sendAsync(JSON.parse(operation.payload), operation.callback);
        }, 0);
    });
});

utils.defineProperty(ProviderBridge.prototype, 'connectWeb3', function(web3) {
    this._web3 = web3;
    this._drainQueue();
});

utils.defineProperty(ProviderBridge.prototype, 'connectEthers', function(provider, signer) {
    if (!signer) {
        var missingSigner = function() {
            return Promise.reject('no signer connected');
        };

        signer = {
            getAddress: missingSigner,
            sendTransaction: missingSigner,
            signMessage: missingSigner,
        };
    }

    this._provider = provider;
    this._signer = signer;

    this._drainQueue();
});

utils.defineProperty(ProviderBridge.prototype, 'sendAsync', function(payload, callback) {
    if (!(this._provider || this._web3)) {
        this._queue.push({
            payload: JSON.stringify(payload),
            callback: callback
        });
        return;
    }
    this._sendAsync(payload, callback);
});

utils.defineProperty(ProviderBridge.prototype, '_sendAsync', function(payload, callback) {
    if (this._web3) {
        this._web3.sendAsync(payload, callback);
        return;
    }

    var self = this;

    if (Array.isArray(payload)) {

        var promises = [];
        payload.forEach(function(payload) {
            promises.push(new Promise(function(resolve, reject) {
                self.sendAsync(payload, function(error, result) {
                    resolve(error || result);
                });
            }));
        });

        Promise.all(promises).then(function(result) {
            callback(null, result);
        });

        return;
    }


    function respondError(message, code) {
        if (!code) { code = Errors.InternalError; }

        callback(null, {
            id: payload.id,
            jsonrpc: "2.0",
            error: {
                code: code,
                message: message
            }
        });
    }

    function respond(result) {
        callback(null, {
            id: payload.id,
            jsonrpc: "2.0",
            result: result
        });
    }

    if (payload == null || typeof(payload.method) !== 'string' || typeof(payload.id) !== 'number' || !Array.isArray(payload.params)) {
        respondError('invalid sendAsync parameters', Errors.InvalidRequest);
        return;
    }

    var signer = this._signer;
    var provider = this._provider;

    var params = payload.params;
    switch (payload.method) {

        // Account Actions

        case 'eth_accounts':
            signer.getAddress().then(function(address) {
                respond([ address.toLowerCase() ]);
            }, function (error) {
                respond([]);
            });
            break;

        case 'eth_sign':
            params = [ params[1], params[0] ];
            // Fall-through

        case 'personal_sign':
            signer.getAddress().then(function(address) {
                if (utils.getAddress(params[1]) !== address) {
                    respondError('invalid from address', Errors.InvalidParams);
                    return;
                }

                signer.signMessage(params[0]).then(function(signature) {
                    respond(signature);
                }, function(error) {
                    respondError('eth_sign error', Errors.InternalError);
                });
            }, function(error) {
                respondError('no account', Errors.InvalidParams);
            });

            break;

        case 'eth_sendTransaction':
            signer.getAddress().then(function(address) {
                if (utils.getAddress(params[0].from) !== address) {
                    respondError('invalid from address', Errors.InvalidParams);
                }
                return signer.sendTransaction(params[0])
            }, function(error) {
                respondError('eth_sendTransaction error', Errors.InternalError);
            });
            break;


        // Client State (mostly just default values we can pull from sync)

        case 'eth_coinbase':
        case 'eth_getCompilers':
        case 'eth_hashrate':
        case 'eth_mining':
        case 'eth_syncing':
        case 'net_listening':
        case 'net_peerCount':
        case 'net_version':
        case 'eth_protocolVersion':
            setTimeout(function() {
                respond(self.send(payload).result);
            }, 0);
            break;

        // Blockchain state

        case 'eth_blockNumber':
            provider.getBlockNumber().then(function(blockNumber) {
                respond(smallHexlify(blockNumber));
            });
            break;

        case 'eth_gasPrice':
            provider.getGasPrice().then(function(gasPrice) {
                respond(smallHexlify(gasPrice));
            });
            break;


        // Accounts Actions

        case 'eth_getBalance':
            provider.getBalance(params[0], params[1]).then(function(balance) {
                respond(smallHexlify(balance));
            });
            break;

        case 'eth_getCode':
            provider.getCode(params[0], params[1]).then(function(code) {
                respond(code);
            });
            break;

        case 'eth_getTransactionCount':
            provider.getTransactionCount(params[0], params[1]).then(function(nonce) {
                respond(smallHexlify(nonce));
            });
            break;


        // Execution (read-only)

        case 'eth_call':
            provider.call(makeTransaction(params[0]), params[1]).then(function(data) {
                respond(data);
            });
            break;

        case 'eth_estimateGas':
            provider.estimateGas(makeTransaction(params[0]), params[1]).then(function(data) {
                respond(data);
            });
            break;

        case 'eth_getStorageAt':
            provider.getStorageAt(params[0], params[1], params[2]).then(function(data) {
                respond(data);
            });
            break;


        // Blockchain Queries

        case 'eth_getBlockByHash':
        case 'eth_getBlockByNumber':
            provider.getBlock(params[0]).then(function(block) {
                var result = formatBlock(block);

                if (params[1]) {
                    result.transactions = [];

                    var seq = Promise.resolve();

                    if (block.transactions) {
                        block.transactions.forEach(function(hash) {
                            return provider.getTransaction(hash).then(function(tx) {
                                result.transactions.push(tx);
                            });
                        });
                    }

                    seq.then(function() {
                        respond(result);
                    });

                } else {
                    if (block.transactions) { result.transactions = block.transactions; }
                    respond(result);
                }
            });
            break;

        case 'eth_getBlockTransactionCountByHash':
        case 'eth_getBlockTransactionCountByNumber':
            provider.getBlock(params[0]).then(function(block) {
                respond(smallHexlify(block.transactions ? block.transactions.length: 0));
            });
            break;

        case 'eth_getTransactionByHash':
            provider.getTransaction(params[0]).then(function(tx) {
                if (tx != null) { tx = formatTransaction(tx); }
                respond(tx);
            });
            break;

        case 'eth_getTransactionByBlockHashAndIndex':
        case 'eth_getTransactionByBlockNumberAndIndex':
            provider.getBlock(params[0]).then(function(block) {
                if (block == null) { block = {}; }
                if (block.transactions == null) { block.transactions = []; }
                var hash = block.transactions[params[1]];
                if (hash) {
                    provider.getTransaction(hash).then(function(tx) {
                        if (tx != null) { tx = formatTransaction(tx); }
                        respond(tx);
                    });
                } else {
                    respond(null);
                }
            });
            break;

        case 'eth_getTransactionReceipt':
            provider.getTransactionReceipt(params[0]).then(function(receipt) {
                if (receipt != null) { receipt = formatReceipt(receipt); }
                respond(receipt);
            });
            break;


        // Blockchain Manipulation

        case 'eth_sendRawTransaction':
            provider.sendTransaction(params[0]).then(function(hash) {
                respond(hash);
            });
            break;


        // Unsupported methods
        case 'eth_getUncleByBlockHashAndIndex':
        case 'eth_getUncleByBlockNumberAndIndex':

        case 'eth_getUncleCountByBlockHash':
        case 'eth_getUncleCountByBlockNumber':
            respondError('unsupported method', { method: payload.method });
            break;

        // Filters

        case 'eth_newFilter':
            (function(filter) {
                function getLogs(filter) {
                    return provider.getLogs(filter).then(function(result) {
                        for (var i = 0; i < result.length; i++) {
                            result[i] = formatLog(result[i]);
                        }
                        return result;
                    });
                }

                respond(self.filterManager.addFilter(function(block, result) {
                    var blockFilter = {
                        fromBlock: block.number,
                        toBlock: block.number
                    }
                    if (filter.address) { blockFilter.address = filter.address; }
                    if (filter.topics) { blockFilter.topics = filter.topics; }
                    return provider.getLogs(blockFilter).then(function(logs) {
                        logs.forEach(function(log) {
                            log.blockHash = block.hash;
                            result.push(formatLog(log));
                        });
                        return result;
                    });

                }, function() {
                    return provider.getLogs(filter).then(function(logs) {
                        var seq = Promise.resolve(logs);
                        logs.forEach(function(log) {
                            seq = seq.then(function() {
                                return provider.getBlock(log.blockNumber).then(function(block) {
                                    log.blockHash = block.hash;
                                    return logs;
                                });
                            });
                        });
                        return seq;
                    });
                }));
            })(params[0]);
            break;

        case 'eth_newPendingTransactionFilter':
            respond(this.filterManager.addFilter(function(block, result) {
                (block.transactions || []).forEach(function(hash) {
                     result.push(hash);
                });
                result.push(block.hash);
                return Promise.resolve(result);
            }));
            break;

        case 'eth_newBlockFilter':
            respond(this.filterManager.addFilter(function(block, result) {
                result.push(block.hash);
                return Promise.resolve(result);
            }));
            break;

        case 'eth_uninstallFilter':
            respond(this.filterManager.removeFilter(params[0]));
            break;

        case 'eth_getFilterChanges':
            this.filterManager.getChanges(params[0]).then(function(result) {
                respond(result);
            });
            break;

        case 'eth_getFilterLogs':
            this.filterManager.getLogs(params[0]).then(function(result) {
                respond(result);
            });
            break;

        default:
            respondError('unknown method', Errors.MethodNotFound);
    }
});

utils.defineProperty(ProviderBridge.prototype, 'send', function(payload) {
    if (this._web3) {
        return this._web3.send(payload);
    }

    var provider = this._provider;

    var result = null;
    switch(payload.method) {
        case 'eth_accounts':
            if (this._address) {
                result = [ this._address.toLowerCase() ];
            } else {
                result = [ ];
            }
            break;

        case 'eth_coinbase':
            result = null;
            break;

        case 'eth_getCompilers':
            result = [];
            break;

        case 'eth_hashrate':
        case 'net_peerCount':
            result = "0x0";
            break;

        case 'eth_mining':
        case 'eth_syncing':
        case 'net_listening':
            result = false;
            break;

        case 'net_version':
            result = String(provider.chainId);
            break;

        // Using Parity/v1.8.0-beta-9882902-20171015/x86_64-macos/rustc1.20.0:
        // /Users/ethers>  curl -H 'Content-Type: application/json' -X POST --data '{"jsonrpc":"2.0","method":"eth_protocolVersion","params":[],"id":67}' http://localhost:8545
        // {"jsonrpc":"2.0","result":"63","id":67}
        case 'eth_protocolVersion':
            result = "63";
            break;

        default:
            throw new Error('sync unsupported');
    }

    return {
        id: payload.id,
        jsonrpc: "2.0",
        result: result
    };
});

module.exports = ProviderBridge;

},{"./package.json":31,"ethers-providers":7,"ethers-utils":19}],31:[function(require,module,exports){
module.exports={
  "_from": "ethers-web3-bridge@0.0.1",
  "_id": "ethers-web3-bridge@0.0.1",
  "_inBundle": false,
  "_integrity": "sha512-dnLJxFtO1BmgkmPM2v7JqiUuvcYapiKLXJKq2QcAREyKDnIUAsFeh/Hb80cn9ABJNFK9EYToqee/Ry0c1s7w/Q==",
  "_location": "/ethers-web3-bridge",
  "_phantomChildren": {},
  "_requested": {
    "type": "version",
    "registry": true,
    "raw": "ethers-web3-bridge@0.0.1",
    "name": "ethers-web3-bridge",
    "escapedName": "ethers-web3-bridge",
    "rawSpec": "0.0.1",
    "saveSpec": null,
    "fetchSpec": "0.0.1"
  },
  "_requiredBy": [
    "/"
  ],
  "_resolved": "https://registry.npmjs.org/ethers-web3-bridge/-/ethers-web3-bridge-0.0.1.tgz",
  "_shasum": "bdd5792ecad08609abecd8055acc085cdf388588",
  "_spec": "ethers-web3-bridge@0.0.1",
  "_where": "/Users/ricmoo/Development/ethers/ethers.io/ethers-app",
  "author": {
    "name": "Richard Moore",
    "email": "me@ricmoo.com"
  },
  "bundleDependencies": false,
  "dependencies": {
    "ethers-providers": "^2.1.19",
    "ethers-utils": "^2.1.11"
  },
  "deprecated": false,
  "description": "Enables Web3 instances to connect using an ethers.js Provider.",
  "keywords": [
    "ethereum",
    "web3",
    "ethers",
    "dapp"
  ],
  "license": "MIT",
  "main": "index.js",
  "name": "ethers-web3-bridge",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "version": "0.0.1"
}

},{}],32:[function(require,module,exports){
'use strict';

var Interface = require('./interface.js');

var utils = (function() {
    return {
        defineProperty: require('../utils/properties.js').defineProperty,

        getAddress: require('../utils/address.js').getAddress,

        bigNumberify: require('../utils/bignumber.js').bigNumberify,

        hexlify: require('../utils/convert.js').hexlify,
    };
})();

var allowedTransactionKeys = {
    data: true, from: true, gasLimit: true, gasPrice:true, nonce: true, to: true, value: true
}

function copyObject(object) {
    var result = {};
    for (var key in object) {
        result[key] = object[key];
    }
    return result;
}


function Contract(addressOrName, contractInterface, signerOrProvider) {
    if (!(this instanceof Contract)) { throw new Error('missing new'); }

    // @TODO: Maybe still check the addressOrName looks like a valid address or name?
    //address = utils.getAddress(address);

    if (!(contractInterface instanceof Interface)) {
        contractInterface = new Interface(contractInterface);
    }

    if (!signerOrProvider) { throw new Error('missing signer or provider'); }

    var signer = signerOrProvider;
    var provider = null;

    if (signerOrProvider.provider) {
        provider = signerOrProvider.provider;
    } else {
        provider = signerOrProvider;
        signer = null;
    }

    utils.defineProperty(this, 'address', addressOrName);
    utils.defineProperty(this, 'interface', contractInterface);
    utils.defineProperty(this, 'signer', signer);
    utils.defineProperty(this, 'provider', provider);

    var addressPromise = provider.resolveName(addressOrName);

    function runMethod(method, estimateOnly) {
        return function() {
            var transaction = {}

            var params = Array.prototype.slice.call(arguments);

            // If 1 extra parameter was passed in, it contains overrides
            if (params.length == method.inputs.types.length + 1) {
                transaction = params.pop();
                if (typeof(transaction) !== 'object') {
                    throw new Error('invalid transaction overrides');
                }
                transaction = copyObject(transaction);

                // Check for unexpected keys (e.g. using "gas" instead of "gasLimit")
                for (var key in transaction) {
                    if (!allowedTransactionKeys[key]) {
                        throw new Error('unknown transaction override ' + key);
                    }
                }
            }

            // Check overrides make sense
            ['data', 'to'].forEach(function(key) {
                if (transaction[key] != null) {
                    throw new Error('cannot override ' + key) ;
                }
            });

            var call = method.apply(contractInterface, params);

            // Send to the contract address
            transaction.to = addressOrName;

            // Set the transaction data
            transaction.data = call.data;

            switch (call.type) {
                case 'call':

                    // Call (constant functions) always cost 0 ether
                    if (estimateOnly) {
                        return Promise.resolve(new utils.bigNumberify(0));
                    }

                    // Check overrides make sense
                    ['gasLimit', 'gasPrice', 'value'].forEach(function(key) {
                        if (transaction[key] != null) {
                            throw new Error('call cannot override ' + key) ;
                        }
                    });

                    var fromPromise = null;
                    if (transaction.from == null && signer && signer.getAddress) {
                        fromPromise = signer.getAddress();
                        if (!(fromPromise instanceof Promise)) {
                            fromPromise = Promise.resolve(fromPromise);
                        }
                    } else {
                        fromPromise = Promise.resolve(null);
                    }

                    return fromPromise.then(function(address) {
                        if (address) {
                            transaction.from = utils.getAddress(address);
                        }
                        return provider.call(transaction);

                    }).then(function(value) {
                        var result = call.parse(value);
                        if (method.outputs.types.length === 1) {
                             result = result[0];
                        }
                        return result;
                    });

                case 'transaction':
                    if (!signer) { return Promise.reject(new Error('missing signer')); }

                    // Make sure they aren't overriding something they shouldn't
                    if (transaction.from != null) {
                        throw new Error('transaction cannot override from') ;
                    }

                    // Only computing the transaction estimate
                    if (estimateOnly) {
                        if (signer && signer.estimateGas) {
                            return signer.estimateGas(transaction);
                        }

                        return provider.estimateGas(transaction)
                    }

                    // If the signer supports sendTrasaction, use it
                    if (signer.sendTransaction) {
                        return signer.sendTransaction(transaction);
                    }

                    if (!signer.sign) {
                        return Promise.reject(new Error('custom signer does not support signing'));
                    }

                    if (transaction.gasLimit == null) {
                        transaction.gasLimit = signer.defaultGasLimit || 2000000;
                    }

                    var noncePromise = null;
                    if (transaction.nonce) {
                        noncePromise = Promise.resolve(transaction.nonce)
                    } else if (signer.getTransactionCount) {
                        noncePromise = signer.getTransactionCount();
                        if (!(noncePromise instanceof Promise)) {
                            noncePromise = Promise.resolve(noncePromise);
                        }
                    } else {
                        var addressPromise = signer.getAddress();
                        if (!(addressPromise instanceof Promise)) {
                            addressPromise = Promise.resolve(addressPromise);
                        }
                        noncePromise = addressPromise.then(function(address) {
                            return provider.getTransactionCount(address, 'pending');
                        });
                    }

                    var gasPricePromise = null;
                    if (transaction.gasPrice) {
                        gasPricePromise = Promise.resolve(transaction.gasPrice);
                    } else {
                        gasPricePromise = provider.getGasPrice();
                    }

                    return Promise.all([
                        noncePromise,
                        gasPricePromise

                    ]).then(function(results) {
                        transaction.nonce = results[0];
                        transaction.gasPrice = results[1];
                        return signer.sign(transaction);

                    }).then(function(signedTransaction) {
                        return provider.sendTransaction(signedTransaction);
                    });
            }
        };
    }

    var estimate = {};
    utils.defineProperty(this, 'estimate', estimate);

    var functions = {};
    utils.defineProperty(this, 'functions', functions);

    var events = {};
    utils.defineProperty(this, 'events', events);

    Object.keys(contractInterface.functions).forEach(function(methodName) {
        var method = contractInterface.functions[methodName];

        var run = runMethod(method, false);

        if (this[methodName] == null) {
            utils.defineProperty(this, methodName, run);
        } else {
            console.log('WARNING: Multiple definitions for ' + method);
        }

        if (functions[method] == null) {
            utils.defineProperty(functions, methodName, run);
            utils.defineProperty(estimate, methodName, runMethod(method, true));
        }
    }, this);

    Object.keys(contractInterface.events).forEach(function(eventName) {
        var eventInfo = contractInterface.events[eventName];

        var eventCallback = null;

        function handleEvent(log) {
            addressPromise.then(function(address) {

                // Not meant for us (the topics just has the same name)
                if (address != log.address) { return; }

                try {
                    var result = eventInfo.parse(log.topics, log.data);

                    // Some useful things to have with the log
                    log.args = result;
                    log.event = eventName;
                    log.parse = eventInfo.parse;
                    log.removeListener = function() {
                        provider.removeListener(eventInfo.topics, handleEvent);
                    }

                    log.getBlock = function() { return provider.getBlock(log.blockHash);; }
                    log.getTransaction = function() { return provider.getTransaction(log.transactionHash); }
                    log.getTransactionReceipt = function() { return provider.getTransactionReceipt(log.transactionHash); }
                    log.eventSignature = eventInfo.signature;

                    eventCallback.apply(log, Array.prototype.slice.call(result));
                } catch (error) {
                    console.log(error);
                }
            });
        }

        var property = {
            enumerable: true,
            get: function() {
                return eventCallback;
            },
            set: function(value) {
                if (!value) { value = null; }

                if (!value && eventCallback) {
                    provider.removeListener(eventInfo.topics, handleEvent);

                } else if (value && !eventCallback) {
                    provider.on(eventInfo.topics, handleEvent);
                }

                eventCallback = value;
            }
        };

        var propertyName = 'on' + eventName.toLowerCase();
        if (this[propertyName] == null) {
            Object.defineProperty(this, propertyName, property);
        }

        Object.defineProperty(events, eventName, property);

    }, this);
}

utils.defineProperty(Contract.prototype, 'connect', function(signerOrProvider) {
    return new Contract(this.address, this.interface, signerOrProvider);
});

utils.defineProperty(Contract, 'getDeployTransaction', function(bytecode, contractInterface) {

    if (!(contractInterface instanceof Interface)) {
        contractInterface = new Interface(contractInterface);
    }

    var args = Array.prototype.slice.call(arguments);
    args.splice(1, 1);

    return {
        data: contractInterface.deployFunction.apply(contractInterface, args).bytecode
    }
});

module.exports = Contract;

},{"../utils/address.js":44,"../utils/bignumber.js":45,"../utils/convert.js":48,"../utils/properties.js":53,"./interface.js":33}],33:[function(require,module,exports){
'use strict';

// See: https://github.com/ethereum/wiki/wiki/Ethereum-Contract-ABI

var throwError = require('../utils/throw-error');

var utils = (function() {
    var convert = require('../utils/convert');
    var properties = require('../utils/properties');
    var utf8 = require('../utils/utf8');

    return {
        defineFrozen: properties.defineFrozen,
        defineProperty: properties.defineProperty,

        coder: require('../utils/abi-coder').defaultCoder,

        arrayify: convert.arrayify,
        concat: convert.concat,
        isHexString: convert.isHexString,

        toUtf8Bytes: utf8.toUtf8Bytes,

        keccak256: require('../utils/keccak256'),
    };
})();

function parseParams(params) {
    var names = [];
    var types = [];

    params.forEach(function(param) {
        if (param.components != null) {
            if (param.type.substring(0, 5) !== 'tuple') {
                throw new Error('internal error; report on GitHub');
            }
            var suffix = '';
            var arrayBracket = param.type.indexOf('[');
            if (arrayBracket >= 0) { suffix = param.type.substring(arrayBracket); }

            var result = parseParams(param.components);
            names.push({ name: (param.name || null), names: result.names });
            types.push('tuple(' + result.types.join(',') + ')' + suffix)
        } else {
            names.push(param.name || null);
            types.push(param.type);
        }
    });

    return {
        names: names,
        types: types
    }
}

function populateDescription(object, items) {
    for (var key in items) {
        utils.defineProperty(object, key, items[key]);
    }
    return object;
}

/**
 *  - bytecode (optional; only for deploy)
 *  - type ("deploy")
 */
function DeployDescription() { }

/**
 *  - name
 *  - signature
 *  - sighash
 *  - 
 *  - 
 *  - 
 *  - 
 *  - type: ("call" | "transaction")
 */
function FunctionDescription() { }

/**
 *  - anonymous
 *  - name
 *  - signature
 *  - parse
 *  - topics
 *  - inputs
 *  - type ("event")
 */
function EventDescription() { }

function Indexed(value) {
    utils.defineProperty(this, 'indexed', true);
    utils.defineProperty(this, 'hash', value);
}

function Result() {}

function Interface(abi) {
    if (!(this instanceof Interface)) { throw new Error('missing new'); }

    if (typeof(abi) === 'string') {
        try {
            abi = JSON.parse(abi);
        } catch (error) {
            throwError('invalid abi', { input: abi });
        }
    }

    utils.defineFrozen(this, 'abi', abi);

    var methods = {}, events = {}, deploy = null;

    utils.defineProperty(this, 'functions', methods);
    utils.defineProperty(this, 'events', events);

    function addMethod(method) {

        switch (method.type) {
            case 'constructor':
                var func = (function() {
                    var inputParams = parseParams(method.inputs);

                    var func = function(bytecode) {
                        if (!utils.isHexString(bytecode)) {
                            throwError('invalid bytecode', { input: bytecode });
                        }

                        var params = Array.prototype.slice.call(arguments, 1);
                        if (params.length < inputParams.types.length) {
                            throwError('missing parameter');
                        } else if (params.length > inputParams.types.length) {
                            throwError('too many parameters');
                        }

                        var result = {
                            bytecode: bytecode + utils.coder.encode(inputParams.names, inputParams.types, params).substring(2),
                            type: 'deploy'
                        }

                        return populateDescription(new DeployDescription(), result);
                    }

                    utils.defineFrozen(func, 'inputs', inputParams);
                    utils.defineProperty(func, 'payable', (method.payable == null || !!method.payable))

                    return func;
                })();

                if (!deploy) { deploy = func; }

                break;

            case 'function':
                var func = (function() {
                    var inputParams = parseParams(method.inputs);
                    var outputParams = parseParams(method.outputs);

                    var signature = '(' + inputParams.types.join(',') + ')';
                    signature = signature.replace(/tuple/g, '');
                    signature = method.name + signature;

                    var sighash = utils.keccak256(utils.toUtf8Bytes(signature)).substring(0, 10);
                    var func = function() {
                        var result = {
                            name: method.name,
                            signature: signature,
                            sighash: sighash,
                            type: ((method.constant) ? 'call': 'transaction')
                        };

                        var params = Array.prototype.slice.call(arguments, 0);

                        if (params.length < inputParams.types.length) {
                            throwError('missing parameter');
                        } else if (params.length > inputParams.types.length) {
                            throwError('too many parameters');
                        }

                        result.data = sighash + utils.coder.encode(inputParams.names, inputParams.types, params).substring(2);
                        result.parse = function(data) {
                            return utils.coder.decode(
                                outputParams.names,
                                outputParams.types,
                                utils.arrayify(data)
                            );
                        };

                        return populateDescription(new FunctionDescription(), result);
                    }

                    utils.defineFrozen(func, 'inputs', inputParams);
                    utils.defineFrozen(func, 'outputs', outputParams);

                    utils.defineProperty(func, 'payable', (method.payable == null || !!method.payable))

                    utils.defineProperty(func, 'signature', signature);
                    utils.defineProperty(func, 'sighash', sighash);

                    return func;
                })();

                // Expose the first (and hopefully unique named function
                if (method.name && methods[method.name] == null) {
                    utils.defineProperty(methods, method.name, func);
                }

                // Expose all methods by their signature, for overloaded functions
                if (methods[func.signature] == null) {
                    utils.defineProperty(methods, func.signature, func);
                }

                break;

            case 'event':
                var func = (function() {
                    var inputParams = parseParams(method.inputs);

                    var signature = '(' + inputParams.types.join(',') + ')';
                    signature = signature.replace(/tuple/g, '');
                    signature = method.name + signature;

                    var result = {
                        anonymous: (!!method.anonymous),
                        name: method.name,
                        signature: signature,
                        type: 'event'
                    };

                    result.parse = function(topics, data) {
                        if (data == null) {
                            data = topics;
                            topics = null;
                        }

                        // Strip the signature off of non-anonymous topics
                        if (topics != null && !method.anonymous) { topics = topics.slice(1); }

                        var inputNamesIndexed = [], inputNamesNonIndexed = [];
                        var inputTypesIndexed = [], inputTypesNonIndexed = [];
                        var inputDynamic = [];
                        method.inputs.forEach(function(input, index) {
                            var type = inputParams.types[index];
                            var name = inputParams.names[index];

                            if (input.indexed) {
                                if (type === 'string' || type === 'bytes' || type.indexOf('[') >= 0 || type.substring(0, 5) === 'tuple') {
                                    inputTypesIndexed.push('bytes32');
                                    inputDynamic.push(true);
                                } else {
                                    inputTypesIndexed.push(type);
                                    inputDynamic.push(false);
                                }
                                inputNamesIndexed.push(name);
                            } else {
                                inputNamesNonIndexed.push(name);
                                inputTypesNonIndexed.push(type);
                                inputDynamic.push(false);
                            }
                        });

                        if (topics != null) {
                            var resultIndexed = utils.coder.decode(
                                inputNamesIndexed,
                                inputTypesIndexed,
                                utils.concat(topics)
                            );
                        }

                        var resultNonIndexed = utils.coder.decode(
                            inputNamesNonIndexed,
                            inputTypesNonIndexed,
                            utils.arrayify(data)
                        );

                        var result = new Result();
                        var nonIndexedIndex = 0, indexedIndex = 0;
                        method.inputs.forEach(function(input, index) {
                            if (input.indexed) {
                                if (topics == null) {
                                    result[index] = new Indexed(null);

                                } else if (inputDynamic[index]) {
                                    result[index] = new Indexed(resultIndexed[indexedIndex++]);
                                } else {
                                    result[index] = resultIndexed[indexedIndex++];
                                }
                            } else {
                                result[index] = resultNonIndexed[nonIndexedIndex++];
                            }
                            if (input.name) { result[input.name] = result[index]; }
                        });

                        result.length = method.inputs.length;

                        return result;
                    };

                    var func =  populateDescription(new EventDescription(), result)
                    utils.defineFrozen(func, 'topics', [ utils.keccak256(utils.toUtf8Bytes(signature)) ]);
                    utils.defineFrozen(func, 'inputs', inputParams);
                    return func;
                })();

                // Expose the first (and hopefully unique) event name
                if (method.name && events[method.name] == null) {
                    utils.defineProperty(events, method.name, func);
                }

                // Expose all events by their signature, for overloaded functions
                if (methods[func.signature] == null) {
                    utils.defineProperty(methods, func.signature, func);
                }

                break;

            case 'fallback':
                // Nothing to do for fallback
                break;

            default:
                console.log('WARNING: unsupported ABI type - ' + method.type);
                break;
        }
    };

    this.abi.forEach(addMethod, this);

    // If there wasn't a constructor, create the default constructor
    if (!deploy) {
        addMethod({type: 'constructor', inputs: []});
    }

    utils.defineProperty(this, 'deployFunction', deploy);
}

module.exports = Interface;

},{"../utils/abi-coder":43,"../utils/convert":48,"../utils/keccak256":51,"../utils/properties":53,"../utils/throw-error":57,"../utils/utf8":59}],34:[function(require,module,exports){
arguments[4][4][0].apply(exports,arguments)
},{"dup":4}],35:[function(require,module,exports){
'use strict';

var Provider = require('./provider.js');

var utils = (function() {
    var convert = require('../utils/convert.js');
    return {
        defineProperty: require('../utils/properties.js').defineProperty,

        hexlify: convert.hexlify,
        hexStripZeros: convert.hexStripZeros,
    };
})();


function getTransactionString(transaction) {
    var result = [];
    for (var key in transaction) {
        if (transaction[key] == null) { continue; }
        var value = utils.hexlify(transaction[key]);
        if ({ gasLimit: true, gasPrice: true, nonce: true, value: true }[key]) {
            value = utils.hexStripZeros(value);
        }
        result.push(key + '=' + value);
    }
    return result.join('&');
}

function EtherscanProvider(network, apiKey) {
    Provider.call(this, network);

    var baseUrl = null;
    switch(this.name) {
        case 'homestead':
            baseUrl = 'https://api.etherscan.io';
            break;
        case 'ropsten':
            baseUrl = 'https://ropsten.etherscan.io';
            break;
        case 'rinkeby':
            baseUrl = 'https://rinkeby.etherscan.io';
            break;
        case 'kovan':
            baseUrl = 'https://kovan.etherscan.io';
            break;
        default:
            throw new Error('unsupported network');
    }
    utils.defineProperty(this, 'baseUrl', baseUrl);

    utils.defineProperty(this, 'apiKey', apiKey || null);
}
Provider.inherits(EtherscanProvider);

utils.defineProperty(EtherscanProvider.prototype, '_call', function() {
});

utils.defineProperty(EtherscanProvider.prototype, '_callProxy', function() {
});

function getResult(result) {
    // getLogs has weird success responses
    if (result.status == 0 && result.message === 'No records found') {
        return result.result;
    }

    if (result.status != 1 || result.message != 'OK') {
        var error = new Error('invalid response');
        error.result = JSON.stringify(result);
        throw error;
    }

    return result.result;
}

function getJsonResult(result) {
    if (result.jsonrpc != '2.0') {
        var error = new Error('invalid response');
        error.result = JSON.stringify(result);
        throw error;
    }

    if (result.error) {
        var error = new Error(result.error.message || 'unknown error');
        if (result.error.code) { error.code = result.error.code; }
        if (result.error.data) { error.data = result.error.data; }
        throw error;
    }

    return result.result;
}

function checkLogTag(blockTag) {
    if (blockTag === 'pending') { throw new Error('pending not supported'); }
    if (blockTag === 'latest') { return blockTag; }

    return parseInt(blockTag.substring(2), 16);
}


utils.defineProperty(EtherscanProvider.prototype, 'perform', function(method, params) {
    if (!params) { params = {}; }

    var url = this.baseUrl;

    var apiKey = '';
    if (this.apiKey) { apiKey += '&apikey=' + this.apiKey; }

    switch (method) {
        case 'getBlockNumber':
            url += '/api?module=proxy&action=eth_blockNumber' + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getGasPrice':
            url += '/api?module=proxy&action=eth_gasPrice' + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);


        case 'getBalance':
            // Returns base-10 result
            url += '/api?module=account&action=balance&address=' + params.address;
            url += '&tag=' + params.blockTag + apiKey;
            return Provider.fetchJSON(url, null, getResult);

        case 'getTransactionCount':
            url += '/api?module=proxy&action=eth_getTransactionCount&address=' + params.address;
            url += '&tag=' + params.blockTag + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getCode':
            url += '/api?module=proxy&action=eth_getCode&address=' + params.address;
            url += '&tag=' + params.blockTag + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getStorageAt':
            url += '/api?module=proxy&action=eth_getStorageAt&address=' + params.address;
            url += '&position=' + params.position;
            url += '&tag=' + params.blockTag + apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'sendTransaction':
            url += '/api?module=proxy&action=eth_sendRawTransaction&hex=' + params.signedTransaction;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);


        case 'getBlock':
            if (params.blockTag) {
                url += '/api?module=proxy&action=eth_getBlockByNumber&tag=' + params.blockTag;
                url += '&boolean=false';
                url += apiKey;
                return Provider.fetchJSON(url, null, getJsonResult);
            }
            throw new Error('getBlock by blockHash not implmeneted');

        case 'getTransaction':
            url += '/api?module=proxy&action=eth_getTransactionByHash&txhash=' + params.transactionHash;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getTransactionReceipt':
            url += '/api?module=proxy&action=eth_getTransactionReceipt&txhash=' + params.transactionHash;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);


        case 'call':
            var transaction = getTransactionString(params.transaction);
            if (transaction) { transaction = '&' + transaction; }
            url += '/api?module=proxy&action=eth_call' + transaction;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'estimateGas':
            var transaction = getTransactionString(params.transaction);
            if (transaction) { transaction = '&' + transaction; }
            url += '/api?module=proxy&action=eth_estimateGas&' + transaction;
            url += apiKey;
            return Provider.fetchJSON(url, null, getJsonResult);

        case 'getLogs':
            url += '/api?module=logs&action=getLogs';
            try {
                if (params.filter.fromBlock) {
                    url += '&fromBlock=' + checkLogTag(params.filter.fromBlock);
                }

                if (params.filter.toBlock) {
                    url += '&toBlock=' + checkLogTag(params.filter.toBlock);
                }

                if (params.filter.address) {
                    url += '&address=' + params.filter.address;
                }

                // @TODO: We can handle slightly more complicated logs using the logs API
                if (params.filter.topics && params.filter.topics.length > 0) {
                    if (params.filter.topics.length > 1) {
                        throw new Error('unsupported topic format');
                    }
                    var topic0 = params.filter.topics[0];
                    if (typeof(topic0) !== 'string' || topic0.length !== 66) {
                        throw new Error('unsupported topic0 format');
                    }
                    url += '&topic0=' + topic0;
                }
            } catch (error) {
                return Promise.reject(error);
            }


            url += apiKey;
            return Provider.fetchJSON(url, null, getResult);

        case 'getEtherPrice':
            if (this.name !== 'homestead') { return Promise.resolve(0.0); }
            url += '/api?module=stats&action=ethprice';
            url += apiKey;
            return Provider.fetchJSON(url, null, getResult).then(function(result) {
                return parseFloat(result.ethusd);
            });

        default:
            break;
    }

    return Promise.reject(new Error('not implemented - ' + method));
});

utils.defineProperty(EtherscanProvider.prototype, 'getHistory', function(addressOrName, startBlock, endBlock) {

    var url = this.baseUrl;

    var apiKey = '';
    if (this.apiKey) { apiKey += '&apikey=' + this.apiKey; }

    if (startBlock == null) { startBlock = 0; }
    if (endBlock == null) { endBlock = 99999999; }

    return this.resolveName(addressOrName).then(function(address) {
        url += '/api?module=account&action=txlist&address=' + address;
        url += '&startblock=' + startBlock;
        url += '&endblock=' + endBlock;
        url += '&sort=asc';

        return Provider.fetchJSON(url, null, getResult).then(function(result) {
            var output = [];
            result.forEach(function(tx) {
                ['contractAddress', 'to'].forEach(function(key) {
                    if (tx[key] == '') { delete tx[key]; }
                });
                if (tx.creates == null && tx.contractAddress != null) {
                    tx.creates = tx.contractAddress;
                }
                output.push(Provider._formatters.checkTransactionResponse(tx));
            });
            return output;
        });
    });
});

module.exports = EtherscanProvider;;

},{"../utils/convert.js":48,"../utils/properties.js":53,"./provider.js":41}],36:[function(require,module,exports){
'use strict';

var inherits = require('inherits');

var Provider = require('./provider.js');

var utils = (function() {
    return {
        defineProperty: require('../utils/properties.js').defineProperty,
    };
})();


function FallbackProvider(providers) {
    if (providers.length === 0) { throw new Error('no providers'); }

    var network = {};
    ['chainId', 'ensAddress', 'name', 'testnet'].forEach(function(key) {
        for (var i = 1; i < providers.length; i++) {
            if (providers[0][key] !== providers[i][key]) {
                throw new Error('incompatible providers - ' + key + ' mismatch');
            }
        }
        network[key] = providers[0][key];
    });

    if (!(this instanceof FallbackProvider)) { throw new Error('missing new'); }
    Provider.call(this, network);

    providers = providers.slice(0);
    Object.defineProperty(this, 'providers', {
        get: function() {
            return providers.slice(0);
        }
    });
}
inherits(FallbackProvider, Provider);


utils.defineProperty(FallbackProvider.prototype, 'perform', function(method, params) {
    var providers = this.providers;
    return new Promise(function(resolve, reject) {
        var firstError = null;
        function next() {
            if (!providers.length) {
                reject(firstError);
                return;
            }

            var provider = providers.shift();
            provider.perform(method, params).then(function(result) {
                resolve(result);
            }, function (error) {
                if (!firstError) { firstError = error; }
                next();
            });
        }
        next();
    });
});

module.exports = FallbackProvider;

},{"../utils/properties.js":53,"./provider.js":41,"inherits":73}],37:[function(require,module,exports){
'use strict';

var Provider = require('./provider.js');

var EtherscanProvider = require('./etherscan-provider.js');
var FallbackProvider = require('./fallback-provider.js');
var InfuraProvider = require('./infura-provider.js');
var JsonRpcProvider = require('./json-rpc-provider.js');
var Web3Provider = require('./web3-provider.js');

function getDefaultProvider(network) {
    return new FallbackProvider([
        new InfuraProvider(network),
        new EtherscanProvider(network),
    ]);
}

module.exports = {
    EtherscanProvider: EtherscanProvider,
    FallbackProvider: FallbackProvider,
    InfuraProvider: InfuraProvider,
    JsonRpcProvider: JsonRpcProvider,
    Web3Provider: Web3Provider,

    isProvider: Provider.isProvider,

    networks: Provider.networks,

    getDefaultProvider:getDefaultProvider,

    Provider: Provider,
}

},{"./etherscan-provider.js":35,"./fallback-provider.js":36,"./infura-provider.js":38,"./json-rpc-provider.js":39,"./provider.js":41,"./web3-provider.js":42}],38:[function(require,module,exports){
'use strict';

var Provider = require('./provider');
var JsonRpcProvider = require('./json-rpc-provider');

var utils = (function() {
    return {
        defineProperty: require('../utils/properties.js').defineProperty
    }
})();

function InfuraProvider(network, apiAccessToken) {
    if (!(this instanceof InfuraProvider)) { throw new Error('missing new'); }

    network = Provider.getNetwork(network);

    var host = null;
    switch(network.name) {
        case 'homestead':
            host = 'mainnet.infura.io';
            break;
        case 'ropsten':
            host = 'ropsten.infura.io';
            break;
        case 'rinkeby':
            host = 'rinkeby.infura.io';
            break;
        case 'kovan':
            host = 'kovan.infura.io';
            break;
        default:
            throw new Error('unsupported network');
    }

    var url = 'https://' + host + '/' + (apiAccessToken || '');

    JsonRpcProvider.call(this, url, network);

    utils.defineProperty(this, 'apiAccessToken', apiAccessToken || null);
}
JsonRpcProvider.inherits(InfuraProvider);

utils.defineProperty(InfuraProvider.prototype, '_startPending', function() {
    console.log('WARNING: INFURA does not support pending filters');
});

utils.defineProperty(InfuraProvider.prototype, '_stopPending', function() {
});

module.exports = InfuraProvider;

},{"../utils/properties.js":53,"./json-rpc-provider":39,"./provider":41}],39:[function(require,module,exports){
'use strict';

// See: https://github.com/ethereum/wiki/wiki/JSON-RPC

var Provider = require('./provider.js');

var utils = (function() {
    var convert = require('../utils/convert');
    return {
        defineProperty: require('../utils/properties').defineProperty,

        hexlify: convert.hexlify,
        isHexString: convert.isHexString,
        hexStripZeros: convert.hexStripZeros,
    }
})();

function timer(timeout) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve();
        }, timeout);
    });
}

function getResult(payload) {
    if (payload.error) {
        var error = new Error(payload.error.message);
        error.code = payload.error.code;
        error.data = payload.error.data;
        throw error;
    }

    return payload.result;
}

function getTransaction(transaction) {
    var result = {};

    for (var key in transaction) {
        result[key] = utils.hexlify(transaction[key]);
    }

    // Some nodes (INFURA ropsten; INFURA mainnet is fine) don't like extra zeros.
    ['gasLimit', 'gasPrice', 'nonce', 'value'].forEach(function(key) {
        if (!result[key]) { return; }
        result[key] = utils.hexStripZeros(result[key]);
    });

    // Transform "gasLimit" to "gas"
    if (result.gasLimit != null && result.gas == null) {
        result.gas = result.gasLimit;
        delete result.gasLimit;
    }

    return result;
}

function JsonRpcProvider(url, network) {
    if (!(this instanceof JsonRpcProvider)) { throw new Error('missing new'); }

    if (arguments.length == 1) {
        if (typeof(url) === 'string') {
            try {
                network = Provider.getNetwork(url);
                url = null;
            } catch (error) { }
        } else {
            network = url;
            url = null;
        }
    }

    Provider.call(this, network);

    if (!url) { url = 'http://localhost:8545'; }

    utils.defineProperty(this, 'url', url);
}
Provider.inherits(JsonRpcProvider);

utils.defineProperty(JsonRpcProvider.prototype, 'send', function(method, params) {
    var request = {
        method: method,
        params: params,
        id: 42,
        jsonrpc: "2.0"
    };
    return Provider.fetchJSON(this.url, JSON.stringify(request), getResult);
});

utils.defineProperty(JsonRpcProvider.prototype, 'perform', function(method, params) {
    switch (method) {
        case 'getBlockNumber':
            return this.send('eth_blockNumber', []);

        case 'getGasPrice':
            return this.send('eth_gasPrice', []);

        case 'getBalance':
            return this.send('eth_getBalance', [params.address, params.blockTag]);

        case 'getTransactionCount':
            return this.send('eth_getTransactionCount', [params.address, params.blockTag]);

        case 'getCode':
            return this.send('eth_getCode', [params.address, params.blockTag]);

        case 'getStorageAt':
            return this.send('eth_getStorageAt', [params.address, params.position, params.blockTag]);

        case 'sendTransaction':
            return this.send('eth_sendRawTransaction', [params.signedTransaction]);

        case 'getBlock':
            if (params.blockTag) {
                return this.send('eth_getBlockByNumber', [params.blockTag, false]);
            } else if (params.blockHash) {
                return this.send('eth_getBlockByHash', [params.blockHash, false]);
            }
            return Promise.reject(new Error('invalid block tag or block hash'));

        case 'getTransaction':
            return this.send('eth_getTransactionByHash', [params.transactionHash]);

        case 'getTransactionReceipt':
            return this.send('eth_getTransactionReceipt', [params.transactionHash]);

        case 'call':
            return this.send('eth_call', [getTransaction(params.transaction), 'latest']);

        case 'estimateGas':
            return this.send('eth_estimateGas', [getTransaction(params.transaction)]);

        case 'getLogs':
            return this.send('eth_getLogs', [params.filter]);

        default:
            break;
    }

    return Promise.reject(new Error('not implemented - ' + method));
});

utils.defineProperty(JsonRpcProvider.prototype, '_startPending', function() {
    if (this._pendingFilter != null) { return; }
    var self = this;

    var pendingFilter = this.send('eth_newPendingTransactionFilter', []);
    this._pendingFilter = pendingFilter;

    pendingFilter.then(function(filterId) {
        function poll() {
            self.send('eth_getFilterChanges', [ filterId ]).then(function(hashes) {
                if (self._pendingFilter != pendingFilter) { return; }

                var seq = Promise.resolve();
                hashes.forEach(function(hash) {
                    seq = seq.then(function() {
                        return self.getTransaction(hash).then(function(tx) {
                            self.emit('pending', tx);
                        });
                    });
                });

                return seq.then(function() {
                    return timer(1000);
                });
            }).then(function() {
                if (self._pendingFilter != pendingFilter) {
                    self.send('eth_uninstallFilter', [ filterIf ]);
                    return;
                }
                setTimeout(function() { poll(); }, 0);
            });
        }
        poll();

        return filterId;
    });
});

utils.defineProperty(JsonRpcProvider.prototype, '_stopPending', function() {
    this._pendingFilter = null;
});

utils.defineProperty(JsonRpcProvider, '_hexlifyTransaction', function(transaction) {
    return getTransaction(transaction);
});

module.exports = JsonRpcProvider;

},{"../utils/convert":48,"../utils/properties":53,"./provider.js":41}],40:[function(require,module,exports){
module.exports={
    "unspecified": {
        "chainId": 0,
        "name": "unspecified"
    },

    "homestead": {
        "chainId": 1,
        "ensAddress": "0x314159265dd8dbb310642f98f50c066173c1259b",
        "name": "homestead"
    },
    "mainnet": {
        "chainId": 1,
        "ensAddress": "0x314159265dd8dbb310642f98f50c066173c1259b",
        "name": "homestead"
    },

    "morden": {
        "chainId": 2,
        "name": "morden"
    },

    "ropsten": {
        "chainId": 3,
        "ensAddress": "0x112234455c3a32fd11230c42e7bccd4a84e02010",
        "name": "ropsten"
    },
    "testnet": {
        "chainId": 3,
        "ensAddress": "0x112234455c3a32fd11230c42e7bccd4a84e02010",
        "name": "ropsten"
    },

    "rinkeby": {
        "chainId": 4,
        "name": "rinkeby"
    },

    "kovan": {
        "chainId": 42,
        "name": "kovan"
    },

    "classic": {
        "chainId": 61,
        "name": "classic"
    }
}

},{}],41:[function(require,module,exports){
'use strict';

var inherits = require('inherits');

var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

var networks = require('./networks.json');

var utils = (function() {
    var convert = require('../utils/convert');
    return {
        defineProperty: require('../utils/properties').defineProperty,

        getAddress: require('../utils/address').getAddress,
        getContractAddress: require('../utils/contract-address').getContractAddress,

        bigNumberify: require('../utils/bignumber').bigNumberify,
        arrayify: convert.arrayify,

        hexlify: convert.hexlify,
        isHexString: convert.isHexString,

        concat: convert.concat,
        hexStripZeros: convert.hexStripZeros,
        stripZeros: convert.stripZeros,

        namehash: require('../utils/namehash'),

        toUtf8String: require('../utils/utf8').toUtf8String,

        RLP: require('../utils/rlp'),
    }
})();

function copyObject(obj) {
    var result = {};
    for (var key in obj) { result[key] = obj[key]; }
    return result;
}

function check(format, object) {
    var result = {};
    for (var key in format) {
        try {
            var value = format[key](object[key]);
            if (value !== undefined) { result[key] = value; }
        } catch (error) {
            error.checkKey = key;
            error.checkValue = object[key];
            throw error;
        }
    }
    return result;
}

function allowNull(check, nullValue) {
    return (function(value) {
        if (value == null) { return nullValue; }
        return check(value);
    });
}

function allowFalsish(check, replaceValue) {
    return (function(value) {
        if (!value) { return replaceValue; }
        return check(value);
    });
}

function arrayOf(check) {
    return (function(array) {
        if (!Array.isArray(array)) { throw new Error('not an array'); }

        var result = [];

        array.forEach(function(value) {
            result.push(check(value));
        });

        return result;
    });
}

function checkHash(hash) {
    if (!utils.isHexString(hash) || hash.length !== 66) {
        throw new Error('invalid hash - ' + hash);
    }
    return hash;
}

function checkNumber(number) {
    return utils.bigNumberify(number).toNumber();
}

function checkBoolean(value) {
    if (typeof(value) === 'boolean') { return value; }
    if (typeof(value) === 'string') {
        if (value === 'true') { return true; }
        if (value === 'false') { return false; }
    }
    throw new Error('invaid boolean - ' + value);
}

function checkUint256(uint256) {
    if (!utils.isHexString(uint256)) {
        throw new Error('invalid uint256');
    }
    while (uint256.length < 66) {
        uint256 = '0x0' + uint256.substring(2);
    }
    return uint256;
}

function checkString(string) {
    if (typeof(string) !== 'string') { throw new Error('invalid string'); }
    return string;
}

function checkBlockTag(blockTag) {
    if (blockTag == null) { return 'latest'; }

    if (blockTag === 'earliest') { return '0x0'; }

    if (blockTag === 'latest' || blockTag === 'pending') {
        return blockTag;
    }

    if (typeof(blockTag) === 'number') {
        return utils.hexStripZeros(utils.hexlify(blockTag));
    }

    if (utils.isHexString(blockTag)) { return utils.hexStripZeros(blockTag); }

    throw new Error('invalid blockTag');
}

var formatBlock = {
    hash: checkHash,
    parentHash: checkHash,
    number: checkNumber,

    timestamp: checkNumber,
    nonce: allowNull(utils.hexlify),
    difficulty: allowNull(checkNumber),

    gasLimit: utils.bigNumberify,
    gasUsed: utils.bigNumberify,

    miner: utils.getAddress,
    extraData: utils.hexlify,

    //transactions: allowNull(arrayOf(checkTransaction)),
    transactions: allowNull(arrayOf(checkHash)),

    //transactionRoot: checkHash,
    //stateRoot: checkHash,
    //sha3Uncles: checkHash,

    //logsBloom: utils.hexlify,
};

function checkBlock(block) {
    if (block.author != null && block.miner == null) {
        block.miner = block.author;
    }
    return check(formatBlock, block);
}


var formatTransaction = {
   hash: checkHash,

   blockHash: allowNull(checkHash, null),
   blockNumber: allowNull(checkNumber, null),
   transactionIndex: allowNull(checkNumber, null),

   from: utils.getAddress,

   gasPrice: utils.bigNumberify,
   gasLimit: utils.bigNumberify,
   to: allowNull(utils.getAddress, null),
   value: utils.bigNumberify,
   nonce: checkNumber,
   data: utils.hexlify,

   r: allowNull(checkUint256),
   s: allowNull(checkUint256),
   v: allowNull(checkNumber),

   creates: allowNull(utils.getAddress, null),

   raw: allowNull(utils.hexlify),
};

function checkTransaction(transaction) {

    // Rename gas to gasLimit
    if (transaction.gas != null && transaction.gasLimit == null) {
        transaction.gasLimit = transaction.gas;
    }

    // Some clients (TestRPC) do strange things like return 0x0 for the
    // 0 address; correct this to be a real address
    if (transaction.to && utils.bigNumberify(transaction.to).isZero()) {
        transaction.to = '0x0000000000000000000000000000000000000000';
    }

    // Rename input to data
    if (transaction.input != null && transaction.data == null) {
        transaction.data = transaction.input;
    }

    // If to and creates are empty, populate the creates from the transaction
    if (transaction.to == null && transaction.creates == null) {
        transaction.creates = utils.getContractAddress(transaction);
    }

    if (!transaction.raw) {
        // Very loose providers (e.g. TestRPC) don't provide a signature or raw
        if (transaction.v && transaction.r && transaction.s) {
            var raw = [
                utils.stripZeros(utils.hexlify(transaction.nonce)),
                utils.stripZeros(utils.hexlify(transaction.gasPrice)),
                utils.stripZeros(utils.hexlify(transaction.gasLimit)),
                (transaction.to || "0x"),
                utils.stripZeros(utils.hexlify(transaction.value || '0x')),
                utils.hexlify(transaction.data || '0x'),
                utils.stripZeros(utils.hexlify(transaction.v || '0x')),
                utils.stripZeros(utils.hexlify(transaction.r)),
                utils.stripZeros(utils.hexlify(transaction.s)),
            ];

            transaction.raw = utils.RLP.encode(raw);
        }
    }


    var result = check(formatTransaction, transaction);

    var networkId = transaction.networkId;

    if (utils.isHexString(networkId)) {
        networkId = utils.bigNumberify(networkId).toNumber();
    }

    if (typeof(networkId) !== 'number' && result.v != null) {
        networkId = (result.v - 35) / 2;
        if (networkId < 0) { networkId = 0; }
        networkId = parseInt(networkId);
    }

    if (typeof(networkId) !== 'number') { networkId = 0; }

    result.networkId = networkId;

    // 0x0000... should actually be null
    if (result.blockHash && result.blockHash.replace(/0/g, '') === 'x') {
        result.blockHash = null;
    }

    return result;
}

var formatTransactionRequest = {
    from: allowNull(utils.getAddress),
    nonce: allowNull(checkNumber),
    gasLimit: allowNull(utils.bigNumberify),
    gasPrice: allowNull(utils.bigNumberify),
    to: allowNull(utils.getAddress),
    value: allowNull(utils.bigNumberify),
    data: allowNull(utils.hexlify),
};

function checkTransactionRequest(transaction) {
    return check(formatTransactionRequest, transaction);
}

var formatTransactionReceiptLog = {
    transactionLogIndex: allowNull(checkNumber),
    transactionIndex: checkNumber,
    blockNumber: checkNumber,
    transactionHash: checkHash,
    address: utils.getAddress,
    topics: arrayOf(checkHash),
    data: utils.hexlify,
    logIndex: checkNumber,
    blockHash: checkHash,
};

function checkTransactionReceiptLog(log) {
    return check(formatTransactionReceiptLog, log);
}

var formatTransactionReceipt = {
    contractAddress: allowNull(utils.getAddress, null),
    transactionIndex: checkNumber,
    root: allowNull(checkHash),
    gasUsed: utils.bigNumberify,
    logsBloom: allowNull(utils.hexlify),
    blockHash: checkHash,
    transactionHash: checkHash,
    logs: arrayOf(checkTransactionReceiptLog),
    blockNumber: checkNumber,
    cumulativeGasUsed: utils.bigNumberify,
    status: allowNull(checkNumber)
};

function checkTransactionReceipt(transactionReceipt) {
    var status = transactionReceipt.status;
    var root = transactionReceipt.root;

    var result = check(formatTransactionReceipt, transactionReceipt);
    result.logs.forEach(function(entry, index) {
        if (entry.transactionLogIndex == null) {
            entry.transactionLogIndex = index;
        }
    });
    if (transactionReceipt.status != null) {
        result.byzantium = true;
    }
    return result;
}

function checkTopics(topics) {
    if (Array.isArray(topics)) {
        topics.forEach(function(topic) {
            checkTopics(topic);
        });

    } else if (topics != null) {
        checkHash(topics);
    }

    return topics;
}

var formatFilter = {
    fromBlock: allowNull(checkBlockTag, undefined),
    toBlock: allowNull(checkBlockTag, undefined),
    address: allowNull(utils.getAddress, undefined),
    topics: allowNull(checkTopics, undefined),
};

function checkFilter(filter) {
    return check(formatFilter, filter);
}

var formatLog = {
    blockNumber: allowNull(checkNumber),
    blockHash: allowNull(checkHash),
    transactionIndex: checkNumber,

    removed: allowNull(checkBoolean),

    address: utils.getAddress,
    data: allowFalsish(utils.hexlify, '0x'),

    topics: arrayOf(checkHash),

    transactionHash: checkHash,
    logIndex: checkNumber,
}

function checkLog(log) {
    return check(formatLog, log);
}

function Provider(network) {
    if (!(this instanceof Provider)) { throw new Error('missing new'); }

    network = Provider.getNetwork(network);

    // Check the ensAddress (if any)
    var ensAddress = null;
    if (network.ensAddress) {
        ensAddress = utils.getAddress(network.ensAddress);
    }

    // Setup our network properties
    utils.defineProperty(this, 'chainId', network.chainId);
    utils.defineProperty(this, 'ensAddress', ensAddress);
    utils.defineProperty(this, 'name', network.name);

    var events = {};
    utils.defineProperty(this, '_events', events);

    // We use this to track recent emitted events; for example, if we emit a "block" of 100
    // and we get a `getBlock(100)` request which would result in null, we should retry
    // until we get a response. This provides devs with a consistent view. Similarly for
    // transaction hashes.
    utils.defineProperty(this, '_emitted', { block: -1 });

    var self = this;

    var lastBlockNumber = null;

    var balances = {};

    function doPoll() {
        self.getBlockNumber().then(function(blockNumber) {

            // If the block hasn't changed, meh.
            if (blockNumber === lastBlockNumber) { return; }

            if (lastBlockNumber === null) { lastBlockNumber = blockNumber - 1; }

            // Notify all listener for each block that has passed
            for (var i = lastBlockNumber + 1; i <= blockNumber; i++) {
                if (self._emitted.block < i) {
                    self._emitted.block = i;

                    // Evict any transaction hashes or block hashes over 12 blocks
                    // old, since they should not return null anyways
                    Object.keys(self._emitted).forEach(function(key) {
                        if (key === 'block') { return; }

                        if (self._emitted[key] > i + 12) {
                            delete self._emitted[key];
                        }
                    });
                }
                self.emit('block', i);
            }

            // Sweep balances and remove addresses we no longer have events for
            var newBalances = {};

            // Find all transaction hashes we are waiting on
            Object.keys(events).forEach(function(eventName) {
                var event = parseEventString(eventName);

                if (event.type === 'transaction') {
                    self.getTransaction(event.hash).then(function(transaction) {
                        if (!transaction || transaction.blockNumber == null) { return; }
                        self._emitted['t:' + transaction.hash.toLowerCase()] = transaction.blockNumber;
                        self.emit(event.hash, transaction);
                    });

                } else if (event.type === 'address') {
                    if (balances[event.address]) {
                        newBalances[event.address] = balances[event.address];
                    }
                    self.getBalance(event.address, 'latest').then(function(balance) {
                        var lastBalance = balances[event.address];
                        if (lastBalance && balance.eq(lastBalance)) { return; }
                        balances[event.address] = balance;
                        self.emit(event.address, balance);
                    });

                } else if (event.type === 'topic') {
                    self.getLogs({
                        fromBlock: lastBlockNumber + 1,
                        toBlock: blockNumber,
                        topics: event.topic
                    }).then(function(logs) {
                        if (logs.length === 0) { return; }
                        logs.forEach(function(log) {
                            self._emitted['b:' + log.blockHash.toLowerCase()] = log.blockNumber;
                            self._emitted['t:' + log.transactionHash.toLowerCase()] = log.blockNumber;
                            self.emit(event.topic, log);
                        });
                    });
                }
            });

            lastBlockNumber = blockNumber;

            balances = newBalances;
        });

        self.doPoll();
    }

    utils.defineProperty(this, 'resetEventsBlock', function(blockNumber) {
        lastBlockNumber = blockNumber;
        self.doPoll();
    });

    var pollingInterval = 4000;

    var poller = null;
    Object.defineProperty(this, 'polling', {
        get: function() { return (poller != null); },
        set: function(value) {
            setTimeout(function() {
                if (value && !poller) {
                    poller = setInterval(doPoll, pollingInterval);

                } else if (!value && poller) {
                    clearInterval(poller);
                    poller = null;
                }
            }, 0);
        }
    });

    Object.defineProperty(this, 'pollingInterval', {
        get: function() { return pollingInterval; },
        set: function(value) {
            if (typeof(value) !== 'number' || value <= 0 || parseInt(value) != value) {
                throw new Error('invalid polling interval');
            }

            pollingInterval = value;

            if (poller) {
                clearInterval(poller);
                poller = setInterval(doPoll, pollingInterval);
            }
        }
    });

    // @TODO: Add .poller which must be an event emitter with a 'start', 'stop' and 'block' event;
    //        this will be used once we move to the WebSocket or other alternatives to polling
}

function inheritable(parent) {
    return function(child) {
        inherits(child, parent);
        utils.defineProperty(child, 'inherits', inheritable(child));
    }
}

utils.defineProperty(Provider, 'inherits', inheritable(Provider));
/*
function(child) {
    inherits(child, Provider);
    child.inherits = function(grandchild) {
        inherits(grandchild, child)
    }
});
*/

utils.defineProperty(Provider, 'getNetwork', function(network) {

    if (typeof(network) === 'string') {
        network = networks[network];
        if (!network) { throw new Error('unknown network'); }

    } else if (network == null) {
        network = networks['homestead'];
    }

    if (typeof(network.chainId) !== 'number') { throw new Error('invalid chainId'); }

    return network;
});

utils.defineProperty(Provider, 'networks', networks);

utils.defineProperty(Provider, 'fetchJSON', function(url, json, processFunc) {

    return new Promise(function(resolve, reject) {
        var request = new XMLHttpRequest();

        if (json) {
            request.open('POST', url, true);
            request.setRequestHeader('Content-Type','application/json');
        } else {
            request.open('GET', url, true);
        }

        request.onreadystatechange = function() {
            if (request.readyState !== 4) { return; }

            try {
                var result = JSON.parse(request.responseText);
            } catch (error) {
                var jsonError = new Error('invalid json response');
                jsonError.orginialError = error;
                jsonError.responseText = request.responseText;
                reject(jsonError);
                return;
            }

            if (processFunc) {
                try {
                    result = processFunc(result);
                } catch (error) {
                    error.url = url;
                    error.body = json;
                    error.responseText = request.responseText;
                    reject(error);
                    return;
                }
            }

            if (request.status != 200) {
                var error = new Error('invalid response - ' + request.status);
                error.statusCode = request.statusCode;
                reject(error);
                return;
            }

            resolve(result);
        };

        request.onerror = function(error) {
            reject(error);
        }

        try {
            if (json) {
                request.send(json);
            } else {
                request.send();
            }

        } catch (error) {
            var connectionError = new Error('connection error');
            connectionError.error = error;
            reject(connectionError);
        }
    });
});


utils.defineProperty(Provider.prototype, 'waitForTransaction', function(transactionHash, timeout) {
    var self = this;
    return new Promise(function(resolve, reject) {
        var timer = null;

        function complete(transaction) {
            if (timer) { clearTimeout(timer); }
            resolve(transaction);
        }

        self.once(transactionHash, complete);

        if (typeof(timeout) === 'number' && timeout > 0) {
            timer = setTimeout(function() {
                self.removeListener(transactionHash, complete);
                reject(new Error('timeout'));
            }, timeout);
        }

    });
});


utils.defineProperty(Provider.prototype, 'getBlockNumber', function() {
    try {
        return this.perform('getBlockNumber').then(function(result) {
            var value = parseInt(result);
            if (value != result) { throw new Error('invalid response - getBlockNumber'); }
            return value;
        });
    } catch (error) {
        return Promise.reject(error);
    }
});

utils.defineProperty(Provider.prototype, 'getGasPrice', function() {
    try {
        return this.perform('getGasPrice').then(function(result) {
            return utils.bigNumberify(result);
        });
    } catch (error) {
        return Promise.reject(error);
    }
});


utils.defineProperty(Provider.prototype, 'getBalance', function(addressOrName, blockTag) {
    var self = this;
    return this.resolveName(addressOrName).then(function(address) {
        var params = { address: address, blockTag: checkBlockTag(blockTag) };
        return self.perform('getBalance', params).then(function(result) {
            return utils.bigNumberify(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'getTransactionCount', function(addressOrName, blockTag) {
    var self = this;
    return this.resolveName(addressOrName).then(function(address) {
        var params = { address: address, blockTag: checkBlockTag(blockTag) };
        return self.perform('getTransactionCount', params).then(function(result) {
            var value = parseInt(result);
            if (value != result) { throw new Error('invalid response - getTransactionCount'); }
            return value;
        });
    });
});

utils.defineProperty(Provider.prototype, 'getCode', function(addressOrName, blockTag) {
    var self = this;
    return this.resolveName(addressOrName).then(function(address) {
        var params = {address: address, blockTag: checkBlockTag(blockTag)};
        return self.perform('getCode', params).then(function(result) {
            return utils.hexlify(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'getStorageAt', function(addressOrName, position, blockTag) {
    var self = this;
    return this.resolveName(addressOrName).then(function(address) {
        var params = {
            address: address,
            blockTag: checkBlockTag(blockTag),
            position: utils.hexStripZeros(utils.hexlify(position)),
        };
        return self.perform('getStorageAt', params).then(function(result) {
            return utils.hexlify(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'sendTransaction', function(signedTransaction) {
    try {
        var params = {signedTransaction: utils.hexlify(signedTransaction)};
        return this.perform('sendTransaction', params).then(function(result) {
            result = utils.hexlify(result);
            if (result.length !== 66) { throw new Error('invalid response - sendTransaction'); }
            return result;
        });
    } catch (error) {
        return Promise.reject(error);
    }
});


utils.defineProperty(Provider.prototype, 'call', function(transaction) {
    var self = this;
    return this._resolveNames(transaction, [ 'to', 'from' ]).then(function(transaction) {
        var params = { transaction: checkTransactionRequest(transaction) };
        return self.perform('call', params).then(function(result) {
            return utils.hexlify(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'estimateGas', function(transaction) {
    var self = this;
    return this._resolveNames(transaction, [ 'to', 'from' ]).then(function(transaction) {
        var params = {transaction: checkTransactionRequest(transaction)};
        return self.perform('estimateGas', params).then(function(result) {
             return utils.bigNumberify(result);
        });
    });
});

function stallPromise(allowNullFunc, executeFunc) {
    return new Promise(function(resolve, reject) {
        var attempt = 0;
        function check() {
            executeFunc().then(function(result) {
                // If we have a result, or are allowed null then we're done
                if (result || allowNullFunc()) {
                    resolve(result);

                // Otherwise, exponential back-off (up to 10s) our next request
                } else {
                    attempt++;
                    var timeout = 500 + 250 * parseInt(Math.random() * (1 << attempt));
                    if (timeout > 10000) { timeout = 10000; }
                    setTimeout(check, timeout);
                }
            }, function(error) {
                reject(error);
            });
        }
        check();
    });
}

utils.defineProperty(Provider.prototype, 'getBlock', function(blockHashOrBlockTag) {
    var self = this;
    try {
        var blockHash = utils.hexlify(blockHashOrBlockTag);
        if (blockHash.length === 66) {
            return stallPromise(function() {
                return (self._emitted['b:' + blockHash.toLowerCase()] == null);
            }, function() {
                return self.perform('getBlock', {blockHash: blockHash}).then(function(block) {
                    if (block == null) { return null; }
                    return checkBlock(block);
                });
            });
        }
    } catch (error) { }

    try {
        var blockTag = checkBlockTag(blockHashOrBlockTag);
        return stallPromise(function() {
            if (utils.isHexString(blockTag)) {
                var blockNumber = parseInt(blockTag.substring(2), 16);
                return blockNumber > self._emitted.block;
            }
            return true;
        }, function() {
            return self.perform('getBlock', { blockTag: blockTag }).then(function(block) {
                if (block == null) { return null; }
                return checkBlock(block);
            });
        });
    } catch (error) { }

    return Promise.reject(new Error('invalid block hash or block tag'));
});

utils.defineProperty(Provider.prototype, 'getTransaction', function(transactionHash) {
    var self = this;
    try {
        var params = { transactionHash: checkHash(transactionHash) };
        return stallPromise(function() {
            return (self._emitted['t:' + transactionHash.toLowerCase()] == null);
        }, function() {
            return self.perform('getTransaction', params).then(function(result) {
                if (result != null) { result = checkTransaction(result); }
                return result;
            });
        });
    } catch (error) {
        return Promise.reject(error);
    }
});

utils.defineProperty(Provider.prototype, 'getTransactionReceipt', function(transactionHash) {
    var self = this;

    try {
        var params = { transactionHash: checkHash(transactionHash) };
        return stallPromise(function() {
            return (self._emitted['t:' + transactionHash.toLowerCase()] == null);
        }, function() {
            return self.perform('getTransactionReceipt', params).then(function(result) {
                if (result != null) { result = checkTransactionReceipt(result); }
                return result;
            });
        });
    } catch (error) {
        return Promise.reject(error);
    }
});

utils.defineProperty(Provider.prototype, 'getLogs', function(filter) {
    var self = this;
    return this._resolveNames(filter, ['address']).then(function(filter) {
        var params = { filter: checkFilter(filter) };
        return self.perform('getLogs', params).then(function(result) {
            return arrayOf(checkLog)(result);
        });
    });
});

utils.defineProperty(Provider.prototype, 'getEtherPrice', function() {
    try {
        return this.perform('getEtherPrice', {}).then(function(result) {
            // @TODO: Check valid float
            return result;
        });
    } catch (error) {
        return Promise.reject(error);
    }
});


utils.defineProperty(Provider.prototype, '_resolveNames', function(object, keys) {
    var promises = [];

    var result = copyObject(object);

    keys.forEach(function(key) {
        if (result[key] === undefined) { return; }
        promises.push(this.resolveName(result[key]).then(function(address) {
            result[key] = address;
        }));
    }, this);

    return Promise.all(promises).then(function() { return result; });
});

utils.defineProperty(Provider.prototype, '_getResolver', function(name) {
    var nodeHash = utils.namehash(name);

    // keccak256('resolver(bytes32)')
    var data = '0x0178b8bf' + nodeHash.substring(2);
    var transaction = { to: this.ensAddress, data: data };

    // Get the resolver from the blockchain
    return this.call(transaction).then(function(data) {

        // extract the address from the data
        if (data.length != 66) { return null; }
        return utils.getAddress('0x' + data.substring(26));
    });
});

utils.defineProperty(Provider.prototype, 'resolveName', function(name) {
    // If it is already an address, nothing to resolve
    try {
        return Promise.resolve(utils.getAddress(name));
    } catch (error) { }

    if (!this.ensAddress) { throw new Error('network does not have ENS deployed'); }

    var self = this;

    var nodeHash = utils.namehash(name);

    // Get the addr from the resovler
    return this._getResolver(name).then(function(resolverAddress) {

        // keccak256('addr(bytes32)')
        var data = '0x3b3b57de' + nodeHash.substring(2);
        var transaction = { to: resolverAddress, data: data };
        return self.call(transaction);

    // extract the address from the data
    }).then(function(data) {
        if (data.length != 66) { return null; }
        var address = utils.getAddress('0x' + data.substring(26));
        if (address === '0x0000000000000000000000000000000000000000') { return null; }
        return address;
    });
});

utils.defineProperty(Provider.prototype, 'lookupAddress', function(address) {
    if (!this.ensAddress) { throw new Error('network does not have ENS deployed'); }

    address = utils.getAddress(address);

    var name = address.substring(2) + '.addr.reverse'
    var nodehash = utils.namehash(name);

    var self = this;

    return this._getResolver(name).then(function(resolverAddress) {
        if (!resolverAddress) { return null; }

        // keccak('name(bytes32)')
        var data = '0x691f3431' + nodehash.substring(2);
        var transaction = { to: resolverAddress, data: data };
        return self.call(transaction);

    }).then(function(data) {
        // Strip off the "0x"
        data = data.substring(2);

        // Strip off the dynamic string pointer (0x20)
        if (data.length < 64) { return null; }
        data = data.substring(64);

        if (data.length < 64) { return null; }
        var length = utils.bigNumberify('0x' + data.substring(0, 64)).toNumber();
        data = data.substring(64);

        if (2 * length > data.length) { return null; }

        var name = utils.toUtf8String('0x' + data.substring(0, 2 * length));

        // Make sure the reverse record matches the foward record
        return self.resolveName(name).then(function(addr) {
            if (addr != address) { return null; }
            return name;
        });

    });
});

utils.defineProperty(Provider.prototype, 'doPoll', function() {
});

utils.defineProperty(Provider.prototype, 'perform', function(method, params) {
    return Promise.reject(new Error('not implemented - ' + method));
});

function recurse(object, convertFunc) {
    if (Array.isArray(object)) {
        var result = [];
        object.forEach(function(object) {
            result.push(recurse(object, convertFunc));
        });
        return result;
    }
    return convertFunc(object);
}

function getEventString(object) {
    try {
        return 'address:' + utils.getAddress(object);
    } catch (error) { }

    if (object === 'block') {
        return 'block';

    } else if (object === 'pending') {
        return 'pending';

    } else if (utils.isHexString(object)) {
        if (object.length === 66) {
            return 'tx:' + object;
        }
    } else if (Array.isArray(object)) {
        object = recurse(object, function(object) {
            if (object == null) { object = '0x'; }
            return object;
        });

        try {
            return 'topic:' + utils.RLP.encode(object);
        } catch (error) {
            console.log(error);
        }
    }

    throw new Error('invalid event - ' + object);
}

function parseEventString(string) {
    if (string.substring(0, 3) === 'tx:') {
        return {type: 'transaction', hash: string.substring(3)};

    } else if (string === 'block') {
        return {type: 'block'};

    } else if (string === 'pending') {
        return {type: 'pending'};

    } else if (string.substring(0, 8) === 'address:') {
        return {type: 'address', address: string.substring(8)};

    } else if (string.substring(0, 6) === 'topic:') {
        try {
            var object = utils.RLP.decode(string.substring(6));
            object = recurse(object, function(object) {
                if (object === '0x') { object = null; }
                return object;
            });
            return {type: 'topic', topic: object};
        } catch (error) {
            console.log(error);
        }
    }

    throw new Error('invalid event string');
}

utils.defineProperty(Provider.prototype, '_startPending', function() {
    console.log('WARNING: this provider does not support pending events');
});

utils.defineProperty(Provider.prototype, '_stopPending', function() {
});

utils.defineProperty(Provider.prototype, 'on', function(eventName, listener) {
    var key = getEventString(eventName);
    if (!this._events[key]) { this._events[key] = []; }
    this._events[key].push({eventName: eventName, listener: listener, type: 'on'});
    if (key === 'pending') { this._startPending(); }
    this.polling = true;
});

utils.defineProperty(Provider.prototype, 'once', function(eventName, listener) {
    var key = getEventString(eventName);
    if (!this._events[key]) { this._events[key] = []; }
    this._events[key].push({eventName: eventName, listener: listener, type: 'once'});
    if (key === 'pending') { this._startPending(); }
    this.polling = true;
});

utils.defineProperty(Provider.prototype, 'emit', function(eventName) {
    var key = getEventString(eventName);

    var args = Array.prototype.slice.call(arguments, 1);
    var listeners = this._events[key];
    if (!listeners) { return; }

    for (var i = 0; i < listeners.length; i++) {
        var listener = listeners[i];
        if (listener.type === 'once') {
            listeners.splice(i, 1);
            i--;
        }

        try {
            listener.listener.apply(this, args);
        } catch (error) {
            console.log('Event Listener Error: ' + error.message);
        }
    }

    if (listeners.length === 0) {
        delete this._events[key];
        if (key === 'pending') { this._stopPending(); }
    }

    if (this.listenerCount() === 0) { this.polling = false; }
});

utils.defineProperty(Provider.prototype, 'listenerCount', function(eventName) {
    if (!eventName) {
        var result = 0;
        for (var key in this._events) {
            result += this._events[key].length;
        }
        return result;
    }

    var listeners = this._events[getEventString(eventName)];
    if (!listeners) { return 0; }
    return listeners.length;
});

utils.defineProperty(Provider.prototype, 'listeners', function(eventName) {
    var listeners = this._events[getEventString(eventName)];
    if (!listeners) { return 0; }
    var result = [];
    for (var i = 0; i < listeners.length; i++) {
        result.push(listeners[i].listener);
    }
    return result;
});

utils.defineProperty(Provider.prototype, 'removeAllListeners', function(eventName) {
    delete this._events[getEventString(eventName)];
    if (this.listenerCount() === 0) { this.polling = false; }
});

utils.defineProperty(Provider.prototype, 'removeListener', function(eventName, listener) {
    var eventNameString = getEventString(eventName);
    var listeners = this._events[eventNameString];
    if (!listeners) { return 0; }
    for (var i = 0; i < listeners.length; i++) {
        if (listeners[i].listener === listener) {
            listeners.splice(i, 1);
            break;
        }
    }

    if (listeners.length === 0) {
        this.removeAllListeners(eventName);
    }
});

utils.defineProperty(Provider, '_formatters', {
    checkTransactionResponse: checkTransaction
});

module.exports = Provider;

},{"../utils/address":44,"../utils/bignumber":45,"../utils/contract-address":47,"../utils/convert":48,"../utils/namehash":52,"../utils/properties":53,"../utils/rlp":54,"../utils/utf8":59,"./networks.json":40,"inherits":73,"xmlhttprequest":34}],42:[function(require,module,exports){
'use strict';

var Provider = require('./provider');
var JsonRpcProvider = require('./json-rpc-provider');

var utils = (function() {
    return {
        defineProperty: require('../utils/properties').defineProperty,

        getAddress: require('../utils/address').getAddress,

        toUtf8Bytes: require('../utils/utf8').toUtf8Bytes,

        hexlify: require('../utils/convert').hexlify
    }
})();

function Web3Signer(provider, address) {
    if (!(this instanceof Web3Signer)) { throw new Error('missing new'); }
    utils.defineProperty(this, 'provider', provider);

    // Statically attach to a given address
    if (address) {
        utils.defineProperty(this, 'address', address);
        utils.defineProperty(this, '_syncAddress', true);

    } else {
        Object.defineProperty(this, 'address', {
            enumerable: true,
            get: function() {
                throw new Error('unsupported sync operation; use getAddress');
            }
        });
        utils.defineProperty(this, '_syncAddress', false);
    }
}

utils.defineProperty(Web3Signer.prototype, 'getAddress', function() {
    if (this._syncAddress) { return Promise.resolve(this.address); }

    return this.provider.send('eth_accounts', []).then(function(accounts) {
        if (accounts.length === 0) {
            throw new Error('no account');
        }
        return utils.getAddress(accounts[0]);
    });
});

utils.defineProperty(Web3Signer.prototype, 'getBalance', function(blockTag) {
    var provider = this.provider;
    return this.getAddress().then(function(address) {
        return provider.getBalance(address, blockTag);
    });
});

utils.defineProperty(Web3Signer.prototype, 'getTransactionCount', function(blockTag) {
    var provider = this.provider;
    return this.getAddress().then(function(address) {
        return provider.getTransactionCount(address, blockTag);
    });
});

utils.defineProperty(Web3Signer.prototype, 'sendTransaction', function(transaction) {
    var provider = this.provider;
    transaction = JsonRpcProvider._hexlifyTransaction(transaction);
    return this.getAddress().then(function(address) {
        transaction.from = address.toLowerCase();
        return provider.send('eth_sendTransaction', [ transaction ]).then(function(hash) {
            return new Promise(function(resolve, reject) {
                function check() {
                    provider.getTransaction(hash).then(function(transaction) {
                        if (!transaction) {
                            setTimeout(check, 1000);
                            return;
                        }
                        resolve(transaction);
                    });
                }
                check();
            });
        });
    });
});

utils.defineProperty(Web3Signer.prototype, 'signMessage', function(message) {
    var provider = this.provider;

    var data = ((typeof(message) === 'string') ? utils.toUtf8Bytes(message): message);
    return this.getAddress().then(function(address) {

        // https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_sign
        var method = 'eth_sign';
        var params = [ address.toLowerCase(), utils.hexlify(data) ];

        // Metamask complains about eth_sign (and on some versions hangs)
        if (provider._web3Provider.isMetaMask) {
            // https://github.com/ethereum/go-ethereum/wiki/Management-APIs#personal_sign
            method = 'personal_sign';
            params = [ utils.hexlify(data), address.toLowerCase() ];
        }

        return provider.send(method, params);
    });
});

utils.defineProperty(Web3Signer.prototype, 'unlock', function(password) {
    var provider = this.provider;

    return this.getAddress().then(function(address) {
        return provider.send('personal_unlockAccount', [ address.toLowerCase(), password, null ]);
    });
});

/*
@TODO
utils.defineProperty(Web3Signer, 'onchange', {

});
*/

function Web3Provider(web3Provider, network) {
    if (!(this instanceof Web3Provider)) { throw new Error('missing new'); }

    // HTTP has a host; IPC has a path.
    var url = web3Provider.host || web3Provider.path || 'unknown';

    JsonRpcProvider.call(this, url, network);
    utils.defineProperty(this, '_web3Provider', web3Provider);
}
JsonRpcProvider.inherits(Web3Provider);

utils.defineProperty(Web3Provider.prototype, 'getSigner', function(address) {
    return new Web3Signer(this, address);
});

utils.defineProperty(Web3Provider.prototype, 'listAccounts', function() {
    return this.send('eth_accounts', []).then(function(accounts) {
        accounts.forEach(function(address, index) {
            accounts[index] = utils.getAddress(address);
        });
        return accounts;
    });
});

utils.defineProperty(Web3Provider.prototype, 'send', function(method, params) {
    var provider = this._web3Provider;
    return new Promise(function(resolve, reject) {
        var request = {
            method: method,
            params: params,
            id: 42,
            jsonrpc: "2.0"
        };
        provider.sendAsync(request, function(error, result) {
            if (error) {
                reject(error);
                return;
            }
            if (result.error) {
                var error = new Error(result.error.message);
                error.code = result.error.code;
                error.data = result.error.data;
                reject(error);
                return;
            }
            resolve(result.result);
        });
    });
});

module.exports = Web3Provider;

},{"../utils/address":44,"../utils/convert":48,"../utils/properties":53,"../utils/utf8":59,"./json-rpc-provider":39,"./provider":41}],43:[function(require,module,exports){
'use strict';

// See: https://github.com/ethereum/wiki/wiki/Ethereum-Contract-ABI

var throwError = require('../utils/throw-error');

var utils = (function() {
    var convert = require('../utils/convert.js');
    var utf8 = require('../utils/utf8.js');

    return {
        defineProperty: require('../utils/properties.js').defineProperty,

        arrayify: convert.arrayify,
        padZeros: convert.padZeros,

        bigNumberify: require('../utils/bignumber.js').bigNumberify,

        getAddress: require('../utils/address').getAddress,

        concat: convert.concat,

        toUtf8Bytes: utf8.toUtf8Bytes,
        toUtf8String: utf8.toUtf8String,

        hexlify: convert.hexlify,
    };
})();

var paramTypeBytes = new RegExp(/^bytes([0-9]*)$/);
var paramTypeNumber = new RegExp(/^(u?int)([0-9]*)$/);
var paramTypeArray = new RegExp(/^(.*)\[([0-9]*)\]$/);

var defaultCoerceFunc = function(type, value) {
    var match = type.match(paramTypeNumber)
    if (match && parseInt(match[2]) <= 48) { return value.toNumber(); }
    return value;
}

var coderNull = function(coerceFunc) {
    return {
        name: 'null',
        type: '',
        encode: function(value) {
            return utils.arrayify([]);
        },
        decode: function(data, offset) {
            if (offset > data.length) { throw new Error('invalid null'); }
            return {
                consumed: 0,
                value: coerceFunc('null', undefined)
            }
        },
        dynamic: false
    };
}

var coderNumber = function(coerceFunc, size, signed, localName) {
    var name = ((signed ? 'int': 'uint') + (size * 8));
    return {
        localName: localName,
        name: name,
        type: name,
        encode: function(value) {
            value = utils.bigNumberify(value).toTwos(size * 8).maskn(size * 8);
            //value = value.toTwos(size * 8).maskn(size * 8);
            if (signed) {
                value = value.fromTwos(size * 8).toTwos(256);
            }
            return utils.padZeros(utils.arrayify(value), 32);
        },
        decode: function(data, offset) {
            if (data.length < offset + 32) { throwError('invalid ' + name); }
            var junkLength = 32 - size;
            var value = utils.bigNumberify(data.slice(offset + junkLength, offset + 32));
            if (signed) {
                value = value.fromTwos(size * 8);
            } else {
                value = value.maskn(size * 8);
            }

            //if (size <= 6) { value = value.toNumber(); }

            return {
                consumed: 32,
                value: coerceFunc(name, value),
            }
        }
    };
}
var uint256Coder = coderNumber(function(type, value) { return value; }, 32, false);

var coderBoolean = function(coerceFunc, localName) {
    return {
        localName: localName,
        name: 'boolean',
        type: 'boolean',
        encode: function(value) {
           return uint256Coder.encode(value ? 1: 0);
        },
       decode: function(data, offset) {
            try {
                var result = uint256Coder.decode(data, offset);
            } catch (error) {
                if (error.message === 'invalid uint256') {
                    throwError('invalid bool');
                }
                throw error;
            }
            return {
                consumed: result.consumed,
                value: coerceFunc('boolean', !result.value.isZero())
            }
        }
    }
}

var coderFixedBytes = function(coerceFunc, length, localName) {
    var name = ('bytes' + length);
    return {
        localName: localName,
        name: name,
        type: name,
        encode: function(value) {
            value = utils.arrayify(value);
            if (length === 32) { return value; }

            var result = new Uint8Array(32);
            result.set(value);
            return result;
        },
        decode: function(data, offset) {
            if (data.length < offset + 32) { throwError('invalid bytes' + length); }

            return {
                consumed: 32,
                value: coerceFunc(name, utils.hexlify(data.slice(offset, offset + length)))
            }
        }
    };
}

var coderAddress = function(coerceFunc, localName) {
    return {
        localName: localName,
        name: 'address',
        type: 'address',
        encode: function(value) {
            value = utils.arrayify(utils.getAddress(value));
            var result = new Uint8Array(32);
            result.set(value, 12);
            return result;
        },
        decode: function(data, offset) {
            if (data.length < offset + 32) { throwError('invalid address'); }
            return {
                consumed: 32,
                value: coerceFunc('address', utils.getAddress(utils.hexlify(data.slice(offset + 12, offset + 32))))
           }
        }
    }
}

function _encodeDynamicBytes(value) {
    var dataLength = parseInt(32 * Math.ceil(value.length / 32));
    var padding = new Uint8Array(dataLength - value.length);

    return utils.concat([
        uint256Coder.encode(value.length),
        value,
        padding
    ]);
}

function _decodeDynamicBytes(data, offset) {
    if (data.length < offset + 32) { throwError('invalid bytes'); }

    var length = uint256Coder.decode(data, offset).value;
    length = length.toNumber();
    if (data.length < offset + 32 + length) { throwError('invalid bytes'); }

    return {
        consumed: parseInt(32 + 32 * Math.ceil(length / 32)),
        value: data.slice(offset + 32, offset + 32 + length),
    }
}

var coderDynamicBytes = function(coerceFunc, localName) {
    return {
        localName: localName,
        name: 'bytes',
        type: 'bytes',
        encode: function(value) {
            return _encodeDynamicBytes(utils.arrayify(value));
        },
        decode: function(data, offset) {
            var result = _decodeDynamicBytes(data, offset);
            result.value = coerceFunc('bytes', utils.hexlify(result.value));
            return result;
        },
        dynamic: true
    };
}

var coderString = function(coerceFunc, localName) {
    return {
        localName: localName,
        name: 'string',
        type: 'string',
        encode: function(value) {
            return _encodeDynamicBytes(utils.toUtf8Bytes(value));
        },
        decode: function(data, offset) {
            var result = _decodeDynamicBytes(data, offset);
            result.value = coerceFunc('string', utils.toUtf8String(result.value));
            return result;
        },
        dynamic: true
    };
}

function alignSize(size) {
    return parseInt(32 * Math.ceil(size / 32));
}

function pack(coders, values) {
    if (Array.isArray(values)) {
        if (coders.length !== values.length) {
            throwError('types/values mismatch', { type: type, values: values });
        }

    } else if (values && typeof(values) === 'object') {
        var arrayValues = [];
        coders.forEach(function(coder) {
            arrayValues.push(values[coder.localName]);
        });
        values = arrayValues;

    } else {
        throwError('invalid value', { type: 'tuple', values: values });
    }

    var parts = [];

    coders.forEach(function(coder, index) {
        parts.push({ dynamic: coder.dynamic, value: coder.encode(values[index]) });
    });

    var staticSize = 0, dynamicSize = 0;
    parts.forEach(function(part, index) {
        if (part.dynamic) {
            staticSize += 32;
            dynamicSize += alignSize(part.value.length);
        } else {
            staticSize += alignSize(part.value.length);
        }
    });

    var offset = 0, dynamicOffset = staticSize;
    var data = new Uint8Array(staticSize + dynamicSize);

    parts.forEach(function(part, index) {
        if (part.dynamic) {
            //uint256Coder.encode(dynamicOffset).copy(data, offset);
            data.set(uint256Coder.encode(dynamicOffset), offset);
            offset += 32;

            //part.value.copy(data, dynamicOffset);  @TODO
            data.set(part.value, dynamicOffset);
            dynamicOffset += alignSize(part.value.length);
        } else {
            //part.value.copy(data, offset);  @TODO
            data.set(part.value, offset);
            offset += alignSize(part.value.length);
        }
    });

    return data;
}

function unpack(coders, data, offset) {
    var baseOffset = offset;
    var consumed = 0;
    var value = [];
    coders.forEach(function(coder) {
        if (coder.dynamic) {
            var dynamicOffset = uint256Coder.decode(data, offset);
            var result = coder.decode(data, baseOffset + dynamicOffset.value.toNumber());
            // The dynamic part is leap-frogged somewhere else; doesn't count towards size
            result.consumed = dynamicOffset.consumed;
        } else {
            var result = coder.decode(data, offset);
        }

        if (result.value != undefined) {
            value.push(result.value);
        }

        offset += result.consumed;
        consumed += result.consumed;
    });

    coders.forEach(function(coder, index) {
        var name = coder.localName;
        if (!name) { return; }

        if (typeof(name) === 'object') { name = name.name; }
        if (!name) { return; }

        if (name === 'length') { name = '_length'; }

        if (value[name] != null) { return; }

        value[name] = value[index];
    });

    return {
        value: value,
        consumed: consumed
    }

    return result;
}

function coderArray(coerceFunc, coder, length, localName) {
    var type = (coder.type + '[' + (length >= 0 ? length: '') + ']');

    return {
        coder: coder,
        localName: localName,
        length: length,
        name: 'array',
        type: type,
        encode: function(value) {
            if (!Array.isArray(value)) { throwError('invalid array'); }

            var count = length;

            var result = new Uint8Array(0);
            if (count === -1) {
                count = value.length;
                result = uint256Coder.encode(count);
            }

            if (count !== value.length) { throwError('size mismatch'); }

            var coders = [];
            value.forEach(function(value) { coders.push(coder); });

            return utils.concat([result, pack(coders, value)]);
        },
        decode: function(data, offset) {
            // @TODO:
            //if (data.length < offset + length * 32) { throw new Error('invalid array'); }

            var consumed = 0;

            var count = length;

            if (count === -1) {
                 var decodedLength = uint256Coder.decode(data, offset);
                 count = decodedLength.value.toNumber();
                 consumed += decodedLength.consumed;
                 offset += decodedLength.consumed;
            }

            var coders = [];
            for (var i = 0; i < count; i++) { coders.push(coder); }

            var result = unpack(coders, data, offset);
            result.consumed += consumed;
            result.value = coerceFunc(type, result.value);
            return result;
        },
        dynamic: (length === -1 || coder.dynamic)
    }
}


function coderTuple(coerceFunc, coders, localName) {
    var dynamic = false;
    var types = [];
    coders.forEach(function(coder) {
        if (coder.dynamic) { dynamic = true; }
        types.push(coder.type);
    });

    var type = ('tuple(' + types.join(',') + ')');

    return {
        coders: coders,
        localName: localName,
        name: 'tuple',
        type: type,
        encode: function(value) {
            return pack(coders, value);
        },
        decode: function(data, offset) {
            var result = unpack(coders, data, offset);
            result.value = coerceFunc(type, result.value);
            return result;
        },
        dynamic: dynamic
    };
}
/*
function getTypes(coders) {
    var type = coderTuple(coders).type;
    return type.substring(6, type.length - 1);
}
*/
function splitNesting(value) {
    var result = [];
    var accum = '';
    var depth = 0;
    for (var offset = 0; offset < value.length; offset++) {
        var c = value[offset];
        if (c === ',' && depth === 0) {
            result.push(accum);
            accum = '';
        } else {
            accum += c;
            if (c === '(') {
                depth++;
            } else if (c === ')') {
                depth--;
                if (depth === -1) {
                    throw new Error('unbalanced parenthsis');
                }
            }
        }
    }
    result.push(accum);

    return result;
}

var paramTypeSimple = {
    address: coderAddress,
    bool: coderBoolean,
    string: coderString,
    bytes: coderDynamicBytes,
};

function getParamCoder(coerceFunc, type, localName) {
    var coder = paramTypeSimple[type];
    if (coder) { return coder(coerceFunc, localName); }

    var match = type.match(paramTypeNumber);
    if (match) {
        var size = parseInt(match[2] || 256);
        if (size === 0 || size > 256 || (size % 8) !== 0) {
            throwError('invalid type', { type: type });
        }
        return coderNumber(coerceFunc, size / 8, (match[1] === 'int'), localName);
    }

    var match = type.match(paramTypeBytes);
    if (match) {
        var size = parseInt(match[1]);
        if (size === 0 || size > 32) {
            throwError('invalid type ' + type);
        }
        return coderFixedBytes(coerceFunc, size, localName);
    }

    var match = type.match(paramTypeArray);
    if (match) {
        var size = parseInt(match[2] || -1);
        return coderArray(coerceFunc, getParamCoder(coerceFunc, match[1], localName), size, localName);
    }

    if (type.substring(0, 6) === 'tuple(' && type.substring(type.length - 1) === ')') {
        var coders = [];
        var names = [];
        if (localName && typeof(localName) === 'object') {
            if (Array.isArray(localName.names)) { names = localName.names; }
            if (typeof(localName.name) === 'string') { localName = localName.name; }
        }
        splitNesting(type.substring(6, type.length - 1)).forEach(function(type, index) {
            coders.push(getParamCoder(coerceFunc, type, names[index]));
        });
        return coderTuple(coerceFunc, coders, localName);
    }

    if (type === '') {
        return coderNull(coerceFunc);
    }

    throwError('invalid type', { type: type });
}

function Coder(coerceFunc) {
    if (!(this instanceof Coder)) { throw new Error('missing new'); }
    if (!coerceFunc) { coerceFunc = defaultCoerceFunc; }
    utils.defineProperty(this, 'coerceFunc', coerceFunc);
}

utils.defineProperty(Coder.prototype, 'encode', function(names, types, values) {

    // Names is optional, so shift over all the parameters if not provided
    if (arguments.length < 3) {
        values = types;
        types = names;
        names = null;
    }

    if (types.length !== values.length) { throwError('types/values mismatch', {types: types, values: values}); }

    var coders = [];
    types.forEach(function(type, index) {
        coders.push(getParamCoder(this.coerceFunc, type, (names ? names[index]: undefined)));
    }, this);

    return utils.hexlify(coderTuple(this.coerceFunc, coders).encode(values));
});

utils.defineProperty(Coder.prototype, 'decode', function(names, types, data) {

    // Names is optional, so shift over all the parameters if not provided
    if (arguments.length < 3) {
        data = types;
        types = names;
        names = null;
    }

    data = utils.arrayify(data);

    var coders = [];
    types.forEach(function(type, index) {
        coders.push(getParamCoder(this.coerceFunc, type, (names ? names[index]: undefined)));
    }, this);

    return coderTuple(this.coerceFunc, coders).decode(data, 0).value;

});

utils.defineProperty(Coder, 'defaultCoder', new Coder());

module.exports = Coder

},{"../utils/address":44,"../utils/bignumber.js":45,"../utils/convert.js":48,"../utils/properties.js":53,"../utils/throw-error":57,"../utils/utf8.js":59}],44:[function(require,module,exports){
arguments[4][13][0].apply(exports,arguments)
},{"./convert":48,"./keccak256":51,"./throw-error":57,"bn.js":2,"dup":13}],45:[function(require,module,exports){
arguments[4][14][0].apply(exports,arguments)
},{"./convert":48,"./properties":53,"./throw-error":57,"bn.js":2,"dup":14}],46:[function(require,module,exports){
arguments[4][15][0].apply(exports,arguments)
},{"./convert":48,"./properties":53,"dup":15}],47:[function(require,module,exports){
arguments[4][16][0].apply(exports,arguments)
},{"./address":44,"./convert":48,"./keccak256":51,"./rlp":54,"dup":16}],48:[function(require,module,exports){
/**
 *  Conversion Utilities
 *
 */

var defineProperty = require('./properties.js').defineProperty;
var throwError = require('./throw-error');

function addSlice(array) {
    if (array.slice) { return array; }

    array.slice = function() {
        var args = Array.prototype.slice.call(arguments);
        return new Uint8Array(Array.prototype.slice.apply(array, args));
    }

    return array;
}

function isArrayish(value) {
    if (!value || parseInt(value.length) != value.length || typeof(value) === 'string') {
        return false;
    }

    for (var i = 0; i < value.length; i++) {
        var v = value[i];
        if (v < 0 || v >= 256 || parseInt(v) != v) {
            return false;
        }
    }

    return true;
}

function arrayify(value, name) {

    if (value && value.toHexString) {
        value = value.toHexString();
    }

    if (isHexString(value)) {
        value = value.substring(2);
        if (value.length % 2) { value = '0' + value; }

        var result = [];
        for (var i = 0; i < value.length; i += 2) {
            result.push(parseInt(value.substr(i, 2), 16));
        }

        return addSlice(new Uint8Array(result));
    }

    if (isArrayish(value)) {
        return addSlice(new Uint8Array(value));
    }

    throwError('invalid arrayify value', { name: name, input: value });
}

function concat(objects) {
    var arrays = [];
    var length = 0;
    for (var i = 0; i < objects.length; i++) {
        var object = arrayify(objects[i])
        arrays.push(object);
        length += object.length;
    }

    var result = new Uint8Array(length);
    var offset = 0;
    for (var i = 0; i < arrays.length; i++) {
        result.set(arrays[i], offset);
        offset += arrays[i].length;
    }

    return addSlice(result);
}
function stripZeros(value) {
    value = arrayify(value);

    if (value.length === 0) { return value; }

    // Find the first non-zero entry
    var start = 0;
    while (value[start] === 0) { start++ }

    // If we started with zeros, strip them
    if (start) {
        value = value.slice(start);
    }

    return value;
}

function padZeros(value, length) {
    value = arrayify(value);

    if (length < value.length) { throw new Error('cannot pad'); }

    var result = new Uint8Array(length);
    result.set(value, length - value.length);
    return addSlice(result);
}


function isHexString(value, length) {
    if (typeof(value) !== 'string' || !value.match(/^0x[0-9A-Fa-f]*$/)) {
        return false
    }
    if (length && value.length !== 2 + 2 * length) { return false; }
    return true;
}

var HexCharacters = '0123456789abcdef';

function hexlify(value, name) {

    if (value && value.toHexString) {
        return value.toHexString();
    }

    if (typeof(value) === 'number') {
        if (value < 0) {
            throwError('cannot hexlify negative value', { name: name, input: value });
        }

        var hex = '';
        while (value) {
            hex = HexCharacters[value & 0x0f] + hex;
            value = parseInt(value / 16);
        }

        if (hex.length) {
            if (hex.length % 2) { hex = '0' + hex; }
            return '0x' + hex;
        }

        return '0x00';
    }

    if (isHexString(value)) {
        if (value.length % 2) {
            value = '0x0' + value.substring(2);
        }
        return value;
    }

    if (isArrayish(value)) {
        var result = [];
        for (var i = 0; i < value.length; i++) {
             var v = value[i];
             result.push(HexCharacters[(v & 0xf0) >> 4] + HexCharacters[v & 0x0f]);
        }
        return '0x' + result.join('');
    }

    throwError('invalid hexlify value', { name: name, input: value });
}

function hexStripZeros(value) {
    while (value.length > 3 && value.substring(0, 3) === '0x0') {
        value = '0x' + value.substring(3);
    }
    return value;
}

function hexZeroPad(value, length) {
    while (value.length < 2 * length + 2) {
        value = '0x0' + value.substring(2);
    }
    return value;
}

module.exports = {
    arrayify: arrayify,
    isArrayish: isArrayish,

    concat: concat,

    padZeros: padZeros,
    stripZeros: stripZeros,

    hexlify: hexlify,
    isHexString: isHexString,
    hexStripZeros: hexStripZeros,
    hexZeroPad: hexZeroPad,
};

},{"./properties.js":53,"./throw-error":57}],49:[function(require,module,exports){
arguments[4][18][0].apply(exports,arguments)
},{"./keccak256":51,"./utf8":59,"dup":18}],50:[function(require,module,exports){
'use strict';

// This is SUPER useful, but adds 140kb (even zipped, adds 40kb)
//var unorm = require('unorm');

var address = require('./address');
var AbiCoder = require('./abi-coder');
var bigNumber = require('./bignumber');
var contractAddress = require('./contract-address');
var convert = require('./convert');
var id = require('./id');
var keccak256 = require('./keccak256');
var namehash = require('./namehash');
var sha256 = require('./sha2').sha256;
var solidity = require('./solidity');
var randomBytes = require('./random-bytes');
var properties = require('./properties');
var RLP = require('./rlp');
var utf8 = require('./utf8');
var units = require('./units');


module.exports = {
    AbiCoder: AbiCoder,

    RLP: RLP,

    defineProperty: properties.defineProperty,

    // NFKD (decomposed)
    //etherSymbol: '\uD835\uDF63',

    // NFKC (composed)
    etherSymbol: '\u039e',

    arrayify: convert.arrayify,

    concat: convert.concat,
    padZeros: convert.padZeros,
    stripZeros: convert.stripZeros,

    bigNumberify: bigNumber.bigNumberify,
    BigNumber: bigNumber.BigNumber,

    hexlify: convert.hexlify,

    toUtf8Bytes: utf8.toUtf8Bytes,
    toUtf8String: utf8.toUtf8String,

    namehash: namehash,
    id: id,

    getAddress: address.getAddress,
    getContractAddress: contractAddress.getContractAddress,

    formatEther: units.formatEther,
    parseEther: units.parseEther,

    formatUnits: units.formatUnits,
    parseUnits: units.parseUnits,

    keccak256: keccak256,
    sha256: sha256,

    randomBytes: randomBytes,

    solidityPack: solidity.pack,
    solidityKeccak256: solidity.keccak256,
    soliditySha256: solidity.sha256,
}

},{"./abi-coder":43,"./address":44,"./bignumber":45,"./contract-address":47,"./convert":48,"./id":49,"./keccak256":51,"./namehash":52,"./properties":53,"./random-bytes":46,"./rlp":54,"./sha2":55,"./solidity":56,"./units":58,"./utf8":59}],51:[function(require,module,exports){
arguments[4][20][0].apply(exports,arguments)
},{"./convert.js":48,"dup":20,"js-sha3":74}],52:[function(require,module,exports){
arguments[4][21][0].apply(exports,arguments)
},{"./convert":48,"./keccak256":51,"./utf8":59,"dup":21}],53:[function(require,module,exports){
'use strict';

function defineProperty(object, name, value) {
    Object.defineProperty(object, name, {
        enumerable: true,
        value: value,
        writable: false,
    });
}

function defineFrozen(object, name, value) {
    var frozen = JSON.stringify(value);
    Object.defineProperty(object, name, {
        enumerable: true,
        get: function() { return JSON.parse(frozen); }
    });
}

module.exports = {
    defineFrozen: defineFrozen,
    defineProperty: defineProperty,
};

},{}],54:[function(require,module,exports){
arguments[4][23][0].apply(exports,arguments)
},{"./convert.js":48,"dup":23}],55:[function(require,module,exports){
arguments[4][24][0].apply(exports,arguments)
},{"./convert.js":48,"dup":24,"hash.js":60}],56:[function(require,module,exports){
arguments[4][25][0].apply(exports,arguments)
},{"./address":44,"./bignumber":45,"./convert":48,"./keccak256":51,"./sha2":55,"./utf8":59,"dup":25}],57:[function(require,module,exports){
arguments[4][27][0].apply(exports,arguments)
},{"dup":27}],58:[function(require,module,exports){
var bigNumberify = require('./bignumber.js').bigNumberify;
var throwError = require('./throw-error');

var zero = new bigNumberify(0);
var negative1 = new bigNumberify(-1);

var names = [
    'wei',
    'kwei',
    'Mwei',
    'Gwei',
    'szabo',
    'finny',
    'ether',
];

var getUnitInfo = (function() {
    var unitInfos = {};

    var value = '1';
    names.forEach(function(name) {
        var info = {
            decimals: value.length - 1,
            tenPower: bigNumberify(value),
            name: name
        };
        unitInfos[name.toLowerCase()] = info;
        unitInfos[String(info.decimals)] = info;
        value += '000';
    });

    return function(name) {
        return unitInfos[String(name).toLowerCase()];
    }
})();

function formatUnits(value, unitType, options) {
    if (typeof(unitType) === 'object' && !options) {
        options = unitType;
        unitType = undefined;
    }
    if (unitType == null) {  unitType = 18; }

    var unitInfo = getUnitInfo(unitType);

    // Make sure wei is a big number (convert as necessary)
    value = bigNumberify(value);

    if (!options) { options = {}; }

    var negative = value.lt(zero);
    if (negative) { value = value.mul(negative1); }

    var fraction = value.mod(unitInfo.tenPower).toString(10);
    while (fraction.length < unitInfo.decimals) { fraction = '0' + fraction; }

    // Strip off trailing zeros (but keep one if would otherwise be bare decimal point)
    if (!options.pad) {
        fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/)[1];
    }

    var whole = value.div(unitInfo.tenPower).toString(10);

    if (options.commify) {
        whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    }

    var value = whole + '.' + fraction;

    if (negative) { value = '-' + value; }

    return value;
}

function parseUnits(value, unitType) {
    var unitInfo = getUnitInfo(unitType || 18);
    if (!unitInfo) { throwError('invalid unitType', { unitType: unitType }); }

    if (typeof(value) !== 'string' || !value.match(/^-?[0-9.,]+$/)) {
        throwError('invalid value', { input: value });
    }

    // Remove commas
    var value = value.replace(/,/g,'');

    // Is it negative?
    var negative = (value.substring(0, 1) === '-');
    if (negative) { value = value.substring(1); }

    if (value === '.') { throwError('invalid value', { input: value }); }

    // Split it into a whole and fractional part
    var comps = value.split('.');
    if (comps.length > 2) { throwError('too many decimal points', { input: value }); }

    var whole = comps[0], fraction = comps[1];
    if (!whole) { whole = '0'; }
    if (!fraction) { fraction = '0'; }

    // Prevent underflow
    if (fraction.length > unitInfo.decimals) {
        throwError('too many decimal places', { input: value, decimals: fraction.length });
    }

    // Fully pad the string with zeros to get to wei
    while (fraction.length < unitInfo.decimals) { fraction += '0'; }

    whole = bigNumberify(whole);
    fraction = bigNumberify(fraction);

    var wei = (whole.mul(unitInfo.tenPower)).add(fraction);

    if (negative) { wei = wei.mul(negative1); }

    return wei;
}

function formatEther(wei, options) {
    return formatUnits(wei, 18, options);
}

function parseEther(ether) {
    return parseUnits(ether, 18);
}

module.exports = {
    formatEther: formatEther,
    parseEther: parseEther,

    formatUnits: formatUnits,
    parseUnits: parseUnits,
}

},{"./bignumber.js":45,"./throw-error":57}],59:[function(require,module,exports){
arguments[4][29][0].apply(exports,arguments)
},{"./convert.js":48,"dup":29}],60:[function(require,module,exports){
var hash = exports;

hash.utils = require('./hash/utils');
hash.common = require('./hash/common');
hash.sha = require('./hash/sha');
hash.ripemd = require('./hash/ripemd');
hash.hmac = require('./hash/hmac');

// Proxy hash functions to the main object
hash.sha1 = hash.sha.sha1;
hash.sha256 = hash.sha.sha256;
hash.sha224 = hash.sha.sha224;
hash.sha384 = hash.sha.sha384;
hash.sha512 = hash.sha.sha512;
hash.ripemd160 = hash.ripemd.ripemd160;

},{"./hash/common":61,"./hash/hmac":62,"./hash/ripemd":63,"./hash/sha":64,"./hash/utils":71}],61:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var assert = require('minimalistic-assert');

function BlockHash() {
  this.pending = null;
  this.pendingTotal = 0;
  this.blockSize = this.constructor.blockSize;
  this.outSize = this.constructor.outSize;
  this.hmacStrength = this.constructor.hmacStrength;
  this.padLength = this.constructor.padLength / 8;
  this.endian = 'big';

  this._delta8 = this.blockSize / 8;
  this._delta32 = this.blockSize / 32;
}
exports.BlockHash = BlockHash;

BlockHash.prototype.update = function update(msg, enc) {
  // Convert message to array, pad it, and join into 32bit blocks
  msg = utils.toArray(msg, enc);
  if (!this.pending)
    this.pending = msg;
  else
    this.pending = this.pending.concat(msg);
  this.pendingTotal += msg.length;

  // Enough data, try updating
  if (this.pending.length >= this._delta8) {
    msg = this.pending;

    // Process pending data in blocks
    var r = msg.length % this._delta8;
    this.pending = msg.slice(msg.length - r, msg.length);
    if (this.pending.length === 0)
      this.pending = null;

    msg = utils.join32(msg, 0, msg.length - r, this.endian);
    for (var i = 0; i < msg.length; i += this._delta32)
      this._update(msg, i, i + this._delta32);
  }

  return this;
};

BlockHash.prototype.digest = function digest(enc) {
  this.update(this._pad());
  assert(this.pending === null);

  return this._digest(enc);
};

BlockHash.prototype._pad = function pad() {
  var len = this.pendingTotal;
  var bytes = this._delta8;
  var k = bytes - ((len + this.padLength) % bytes);
  var res = new Array(k + this.padLength);
  res[0] = 0x80;
  for (var i = 1; i < k; i++)
    res[i] = 0;

  // Append length
  len <<= 3;
  if (this.endian === 'big') {
    for (var t = 8; t < this.padLength; t++)
      res[i++] = 0;

    res[i++] = 0;
    res[i++] = 0;
    res[i++] = 0;
    res[i++] = 0;
    res[i++] = (len >>> 24) & 0xff;
    res[i++] = (len >>> 16) & 0xff;
    res[i++] = (len >>> 8) & 0xff;
    res[i++] = len & 0xff;
  } else {
    res[i++] = len & 0xff;
    res[i++] = (len >>> 8) & 0xff;
    res[i++] = (len >>> 16) & 0xff;
    res[i++] = (len >>> 24) & 0xff;
    res[i++] = 0;
    res[i++] = 0;
    res[i++] = 0;
    res[i++] = 0;

    for (t = 8; t < this.padLength; t++)
      res[i++] = 0;
  }

  return res;
};

},{"./utils":71,"minimalistic-assert":75}],62:[function(require,module,exports){
module.exports = {};
},{}],63:[function(require,module,exports){
module.exports = { ripemd160: null }
},{}],64:[function(require,module,exports){
'use strict';

exports.sha1 = require('./sha/1');
exports.sha224 = require('./sha/224');
exports.sha256 = require('./sha/256');
exports.sha384 = require('./sha/384');
exports.sha512 = require('./sha/512');

},{"./sha/1":65,"./sha/224":66,"./sha/256":67,"./sha/384":68,"./sha/512":69}],65:[function(require,module,exports){
arguments[4][62][0].apply(exports,arguments)
},{"dup":62}],66:[function(require,module,exports){
arguments[4][62][0].apply(exports,arguments)
},{"dup":62}],67:[function(require,module,exports){
'use strict';

var utils = require('../utils');
var common = require('../common');
var shaCommon = require('./common');
var assert = require('minimalistic-assert');

var sum32 = utils.sum32;
var sum32_4 = utils.sum32_4;
var sum32_5 = utils.sum32_5;
var ch32 = shaCommon.ch32;
var maj32 = shaCommon.maj32;
var s0_256 = shaCommon.s0_256;
var s1_256 = shaCommon.s1_256;
var g0_256 = shaCommon.g0_256;
var g1_256 = shaCommon.g1_256;

var BlockHash = common.BlockHash;

var sha256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function SHA256() {
  if (!(this instanceof SHA256))
    return new SHA256();

  BlockHash.call(this);
  this.h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  this.k = sha256_K;
  this.W = new Array(64);
}
utils.inherits(SHA256, BlockHash);
module.exports = SHA256;

SHA256.blockSize = 512;
SHA256.outSize = 256;
SHA256.hmacStrength = 192;
SHA256.padLength = 64;

SHA256.prototype._update = function _update(msg, start) {
  var W = this.W;

  for (var i = 0; i < 16; i++)
    W[i] = msg[start + i];
  for (; i < W.length; i++)
    W[i] = sum32_4(g1_256(W[i - 2]), W[i - 7], g0_256(W[i - 15]), W[i - 16]);

  var a = this.h[0];
  var b = this.h[1];
  var c = this.h[2];
  var d = this.h[3];
  var e = this.h[4];
  var f = this.h[5];
  var g = this.h[6];
  var h = this.h[7];

  assert(this.k.length === W.length);
  for (i = 0; i < W.length; i++) {
    var T1 = sum32_5(h, s1_256(e), ch32(e, f, g), this.k[i], W[i]);
    var T2 = sum32(s0_256(a), maj32(a, b, c));
    h = g;
    g = f;
    f = e;
    e = sum32(d, T1);
    d = c;
    c = b;
    b = a;
    a = sum32(T1, T2);
  }

  this.h[0] = sum32(this.h[0], a);
  this.h[1] = sum32(this.h[1], b);
  this.h[2] = sum32(this.h[2], c);
  this.h[3] = sum32(this.h[3], d);
  this.h[4] = sum32(this.h[4], e);
  this.h[5] = sum32(this.h[5], f);
  this.h[6] = sum32(this.h[6], g);
  this.h[7] = sum32(this.h[7], h);
};

SHA256.prototype._digest = function digest(enc) {
  if (enc === 'hex')
    return utils.toHex32(this.h, 'big');
  else
    return utils.split32(this.h, 'big');
};

},{"../common":61,"../utils":71,"./common":70,"minimalistic-assert":75}],68:[function(require,module,exports){
arguments[4][62][0].apply(exports,arguments)
},{"dup":62}],69:[function(require,module,exports){
arguments[4][62][0].apply(exports,arguments)
},{"dup":62}],70:[function(require,module,exports){
'use strict';

var utils = require('../utils');
var rotr32 = utils.rotr32;

function ft_1(s, x, y, z) {
  if (s === 0)
    return ch32(x, y, z);
  if (s === 1 || s === 3)
    return p32(x, y, z);
  if (s === 2)
    return maj32(x, y, z);
}
exports.ft_1 = ft_1;

function ch32(x, y, z) {
  return (x & y) ^ ((~x) & z);
}
exports.ch32 = ch32;

function maj32(x, y, z) {
  return (x & y) ^ (x & z) ^ (y & z);
}
exports.maj32 = maj32;

function p32(x, y, z) {
  return x ^ y ^ z;
}
exports.p32 = p32;

function s0_256(x) {
  return rotr32(x, 2) ^ rotr32(x, 13) ^ rotr32(x, 22);
}
exports.s0_256 = s0_256;

function s1_256(x) {
  return rotr32(x, 6) ^ rotr32(x, 11) ^ rotr32(x, 25);
}
exports.s1_256 = s1_256;

function g0_256(x) {
  return rotr32(x, 7) ^ rotr32(x, 18) ^ (x >>> 3);
}
exports.g0_256 = g0_256;

function g1_256(x) {
  return rotr32(x, 17) ^ rotr32(x, 19) ^ (x >>> 10);
}
exports.g1_256 = g1_256;

},{"../utils":71}],71:[function(require,module,exports){
'use strict';

var assert = require('minimalistic-assert');
var inherits = require('inherits');

exports.inherits = inherits;

function toArray(msg, enc) {
  if (Array.isArray(msg))
    return msg.slice();
  if (!msg)
    return [];
  var res = [];
  if (typeof msg === 'string') {
    if (!enc) {
      for (var i = 0; i < msg.length; i++) {
        var c = msg.charCodeAt(i);
        var hi = c >> 8;
        var lo = c & 0xff;
        if (hi)
          res.push(hi, lo);
        else
          res.push(lo);
      }
    } else if (enc === 'hex') {
      msg = msg.replace(/[^a-z0-9]+/ig, '');
      if (msg.length % 2 !== 0)
        msg = '0' + msg;
      for (i = 0; i < msg.length; i += 2)
        res.push(parseInt(msg[i] + msg[i + 1], 16));
    }
  } else {
    for (i = 0; i < msg.length; i++)
      res[i] = msg[i] | 0;
  }
  return res;
}
exports.toArray = toArray;

function toHex(msg) {
  var res = '';
  for (var i = 0; i < msg.length; i++)
    res += zero2(msg[i].toString(16));
  return res;
}
exports.toHex = toHex;

function htonl(w) {
  var res = (w >>> 24) |
            ((w >>> 8) & 0xff00) |
            ((w << 8) & 0xff0000) |
            ((w & 0xff) << 24);
  return res >>> 0;
}
exports.htonl = htonl;

function toHex32(msg, endian) {
  var res = '';
  for (var i = 0; i < msg.length; i++) {
    var w = msg[i];
    if (endian === 'little')
      w = htonl(w);
    res += zero8(w.toString(16));
  }
  return res;
}
exports.toHex32 = toHex32;

function zero2(word) {
  if (word.length === 1)
    return '0' + word;
  else
    return word;
}
exports.zero2 = zero2;

function zero8(word) {
  if (word.length === 7)
    return '0' + word;
  else if (word.length === 6)
    return '00' + word;
  else if (word.length === 5)
    return '000' + word;
  else if (word.length === 4)
    return '0000' + word;
  else if (word.length === 3)
    return '00000' + word;
  else if (word.length === 2)
    return '000000' + word;
  else if (word.length === 1)
    return '0000000' + word;
  else
    return word;
}
exports.zero8 = zero8;

function join32(msg, start, end, endian) {
  var len = end - start;
  assert(len % 4 === 0);
  var res = new Array(len / 4);
  for (var i = 0, k = start; i < res.length; i++, k += 4) {
    var w;
    if (endian === 'big')
      w = (msg[k] << 24) | (msg[k + 1] << 16) | (msg[k + 2] << 8) | msg[k + 3];
    else
      w = (msg[k + 3] << 24) | (msg[k + 2] << 16) | (msg[k + 1] << 8) | msg[k];
    res[i] = w >>> 0;
  }
  return res;
}
exports.join32 = join32;

function split32(msg, endian) {
  var res = new Array(msg.length * 4);
  for (var i = 0, k = 0; i < msg.length; i++, k += 4) {
    var m = msg[i];
    if (endian === 'big') {
      res[k] = m >>> 24;
      res[k + 1] = (m >>> 16) & 0xff;
      res[k + 2] = (m >>> 8) & 0xff;
      res[k + 3] = m & 0xff;
    } else {
      res[k + 3] = m >>> 24;
      res[k + 2] = (m >>> 16) & 0xff;
      res[k + 1] = (m >>> 8) & 0xff;
      res[k] = m & 0xff;
    }
  }
  return res;
}
exports.split32 = split32;

function rotr32(w, b) {
  return (w >>> b) | (w << (32 - b));
}
exports.rotr32 = rotr32;

function rotl32(w, b) {
  return (w << b) | (w >>> (32 - b));
}
exports.rotl32 = rotl32;

function sum32(a, b) {
  return (a + b) >>> 0;
}
exports.sum32 = sum32;

function sum32_3(a, b, c) {
  return (a + b + c) >>> 0;
}
exports.sum32_3 = sum32_3;

function sum32_4(a, b, c, d) {
  return (a + b + c + d) >>> 0;
}
exports.sum32_4 = sum32_4;

function sum32_5(a, b, c, d, e) {
  return (a + b + c + d + e) >>> 0;
}
exports.sum32_5 = sum32_5;

function sum64(buf, pos, ah, al) {
  var bh = buf[pos];
  var bl = buf[pos + 1];

  var lo = (al + bl) >>> 0;
  var hi = (lo < al ? 1 : 0) + ah + bh;
  buf[pos] = hi >>> 0;
  buf[pos + 1] = lo;
}
exports.sum64 = sum64;

function sum64_hi(ah, al, bh, bl) {
  var lo = (al + bl) >>> 0;
  var hi = (lo < al ? 1 : 0) + ah + bh;
  return hi >>> 0;
}
exports.sum64_hi = sum64_hi;

function sum64_lo(ah, al, bh, bl) {
  var lo = al + bl;
  return lo >>> 0;
}
exports.sum64_lo = sum64_lo;

function sum64_4_hi(ah, al, bh, bl, ch, cl, dh, dl) {
  var carry = 0;
  var lo = al;
  lo = (lo + bl) >>> 0;
  carry += lo < al ? 1 : 0;
  lo = (lo + cl) >>> 0;
  carry += lo < cl ? 1 : 0;
  lo = (lo + dl) >>> 0;
  carry += lo < dl ? 1 : 0;

  var hi = ah + bh + ch + dh + carry;
  return hi >>> 0;
}
exports.sum64_4_hi = sum64_4_hi;

function sum64_4_lo(ah, al, bh, bl, ch, cl, dh, dl) {
  var lo = al + bl + cl + dl;
  return lo >>> 0;
}
exports.sum64_4_lo = sum64_4_lo;

function sum64_5_hi(ah, al, bh, bl, ch, cl, dh, dl, eh, el) {
  var carry = 0;
  var lo = al;
  lo = (lo + bl) >>> 0;
  carry += lo < al ? 1 : 0;
  lo = (lo + cl) >>> 0;
  carry += lo < cl ? 1 : 0;
  lo = (lo + dl) >>> 0;
  carry += lo < dl ? 1 : 0;
  lo = (lo + el) >>> 0;
  carry += lo < el ? 1 : 0;

  var hi = ah + bh + ch + dh + eh + carry;
  return hi >>> 0;
}
exports.sum64_5_hi = sum64_5_hi;

function sum64_5_lo(ah, al, bh, bl, ch, cl, dh, dl, eh, el) {
  var lo = al + bl + cl + dl + el;

  return lo >>> 0;
}
exports.sum64_5_lo = sum64_5_lo;

function rotr64_hi(ah, al, num) {
  var r = (al << (32 - num)) | (ah >>> num);
  return r >>> 0;
}
exports.rotr64_hi = rotr64_hi;

function rotr64_lo(ah, al, num) {
  var r = (ah << (32 - num)) | (al >>> num);
  return r >>> 0;
}
exports.rotr64_lo = rotr64_lo;

function shr64_hi(ah, al, num) {
  return ah >>> num;
}
exports.shr64_hi = shr64_hi;

function shr64_lo(ah, al, num) {
  var r = (ah << (32 - num)) | (al >>> num);
  return r >>> 0;
}
exports.shr64_lo = shr64_lo;

},{"inherits":72,"minimalistic-assert":75}],72:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],73:[function(require,module,exports){
arguments[4][72][0].apply(exports,arguments)
},{"dup":72}],74:[function(require,module,exports){
(function (process,global){
/**
 * [js-sha3]{@link https://github.com/emn178/js-sha3}
 *
 * @version 0.5.7
 * @author Chen, Yi-Cyuan [emn178@gmail.com]
 * @copyright Chen, Yi-Cyuan 2015-2016
 * @license MIT
 */
/*jslint bitwise: true */
(function () {
  'use strict';

  var root = typeof window === 'object' ? window : {};
  var NODE_JS = !root.JS_SHA3_NO_NODE_JS && typeof process === 'object' && process.versions && process.versions.node;
  if (NODE_JS) {
    root = global;
  }
  var COMMON_JS = !root.JS_SHA3_NO_COMMON_JS && typeof module === 'object' && module.exports;
  var HEX_CHARS = '0123456789abcdef'.split('');
  var SHAKE_PADDING = [31, 7936, 2031616, 520093696];
  var KECCAK_PADDING = [1, 256, 65536, 16777216];
  var PADDING = [6, 1536, 393216, 100663296];
  var SHIFT = [0, 8, 16, 24];
  var RC = [1, 0, 32898, 0, 32906, 2147483648, 2147516416, 2147483648, 32907, 0, 2147483649,
            0, 2147516545, 2147483648, 32777, 2147483648, 138, 0, 136, 0, 2147516425, 0,
            2147483658, 0, 2147516555, 0, 139, 2147483648, 32905, 2147483648, 32771,
            2147483648, 32770, 2147483648, 128, 2147483648, 32778, 0, 2147483658, 2147483648,
            2147516545, 2147483648, 32896, 2147483648, 2147483649, 0, 2147516424, 2147483648];
  var BITS = [224, 256, 384, 512];
  var SHAKE_BITS = [128, 256];
  var OUTPUT_TYPES = ['hex', 'buffer', 'arrayBuffer', 'array'];

  var createOutputMethod = function (bits, padding, outputType) {
    return function (message) {
      return new Keccak(bits, padding, bits).update(message)[outputType]();
    };
  };

  var createShakeOutputMethod = function (bits, padding, outputType) {
    return function (message, outputBits) {
      return new Keccak(bits, padding, outputBits).update(message)[outputType]();
    };
  };

  var createMethod = function (bits, padding) {
    var method = createOutputMethod(bits, padding, 'hex');
    method.create = function () {
      return new Keccak(bits, padding, bits);
    };
    method.update = function (message) {
      return method.create().update(message);
    };
    for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
      var type = OUTPUT_TYPES[i];
      method[type] = createOutputMethod(bits, padding, type);
    }
    return method;
  };

  var createShakeMethod = function (bits, padding) {
    var method = createShakeOutputMethod(bits, padding, 'hex');
    method.create = function (outputBits) {
      return new Keccak(bits, padding, outputBits);
    };
    method.update = function (message, outputBits) {
      return method.create(outputBits).update(message);
    };
    for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
      var type = OUTPUT_TYPES[i];
      method[type] = createShakeOutputMethod(bits, padding, type);
    }
    return method;
  };

  var algorithms = [
    {name: 'keccak', padding: KECCAK_PADDING, bits: BITS, createMethod: createMethod},
    {name: 'sha3', padding: PADDING, bits: BITS, createMethod: createMethod},
    {name: 'shake', padding: SHAKE_PADDING, bits: SHAKE_BITS, createMethod: createShakeMethod}
  ];

  var methods = {}, methodNames = [];

  for (var i = 0; i < algorithms.length; ++i) {
    var algorithm = algorithms[i];
    var bits  = algorithm.bits;
    for (var j = 0; j < bits.length; ++j) {
      var methodName = algorithm.name +'_' + bits[j];
      methodNames.push(methodName);
      methods[methodName] = algorithm.createMethod(bits[j], algorithm.padding);
    }
  }

  function Keccak(bits, padding, outputBits) {
    this.blocks = [];
    this.s = [];
    this.padding = padding;
    this.outputBits = outputBits;
    this.reset = true;
    this.block = 0;
    this.start = 0;
    this.blockCount = (1600 - (bits << 1)) >> 5;
    this.byteCount = this.blockCount << 2;
    this.outputBlocks = outputBits >> 5;
    this.extraBytes = (outputBits & 31) >> 3;

    for (var i = 0; i < 50; ++i) {
      this.s[i] = 0;
    }
  }

  Keccak.prototype.update = function (message) {
    var notString = typeof message !== 'string';
    if (notString && message.constructor === ArrayBuffer) {
      message = new Uint8Array(message);
    }
    var length = message.length, blocks = this.blocks, byteCount = this.byteCount,
      blockCount = this.blockCount, index = 0, s = this.s, i, code;

    while (index < length) {
      if (this.reset) {
        this.reset = false;
        blocks[0] = this.block;
        for (i = 1; i < blockCount + 1; ++i) {
          blocks[i] = 0;
        }
      }
      if (notString) {
        for (i = this.start; index < length && i < byteCount; ++index) {
          blocks[i >> 2] |= message[index] << SHIFT[i++ & 3];
        }
      } else {
        for (i = this.start; index < length && i < byteCount; ++index) {
          code = message.charCodeAt(index);
          if (code < 0x80) {
            blocks[i >> 2] |= code << SHIFT[i++ & 3];
          } else if (code < 0x800) {
            blocks[i >> 2] |= (0xc0 | (code >> 6)) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
          } else if (code < 0xd800 || code >= 0xe000) {
            blocks[i >> 2] |= (0xe0 | (code >> 12)) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | ((code >> 6) & 0x3f)) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
          } else {
            code = 0x10000 + (((code & 0x3ff) << 10) | (message.charCodeAt(++index) & 0x3ff));
            blocks[i >> 2] |= (0xf0 | (code >> 18)) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | ((code >> 12) & 0x3f)) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | ((code >> 6) & 0x3f)) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
          }
        }
      }
      this.lastByteIndex = i;
      if (i >= byteCount) {
        this.start = i - byteCount;
        this.block = blocks[blockCount];
        for (i = 0; i < blockCount; ++i) {
          s[i] ^= blocks[i];
        }
        f(s);
        this.reset = true;
      } else {
        this.start = i;
      }
    }
    return this;
  };

  Keccak.prototype.finalize = function () {
    var blocks = this.blocks, i = this.lastByteIndex, blockCount = this.blockCount, s = this.s;
    blocks[i >> 2] |= this.padding[i & 3];
    if (this.lastByteIndex === this.byteCount) {
      blocks[0] = blocks[blockCount];
      for (i = 1; i < blockCount + 1; ++i) {
        blocks[i] = 0;
      }
    }
    blocks[blockCount - 1] |= 0x80000000;
    for (i = 0; i < blockCount; ++i) {
      s[i] ^= blocks[i];
    }
    f(s);
  };

  Keccak.prototype.toString = Keccak.prototype.hex = function () {
    this.finalize();

    var blockCount = this.blockCount, s = this.s, outputBlocks = this.outputBlocks,
        extraBytes = this.extraBytes, i = 0, j = 0;
    var hex = '', block;
    while (j < outputBlocks) {
      for (i = 0; i < blockCount && j < outputBlocks; ++i, ++j) {
        block = s[i];
        hex += HEX_CHARS[(block >> 4) & 0x0F] + HEX_CHARS[block & 0x0F] +
               HEX_CHARS[(block >> 12) & 0x0F] + HEX_CHARS[(block >> 8) & 0x0F] +
               HEX_CHARS[(block >> 20) & 0x0F] + HEX_CHARS[(block >> 16) & 0x0F] +
               HEX_CHARS[(block >> 28) & 0x0F] + HEX_CHARS[(block >> 24) & 0x0F];
      }
      if (j % blockCount === 0) {
        f(s);
        i = 0;
      }
    }
    if (extraBytes) {
      block = s[i];
      if (extraBytes > 0) {
        hex += HEX_CHARS[(block >> 4) & 0x0F] + HEX_CHARS[block & 0x0F];
      }
      if (extraBytes > 1) {
        hex += HEX_CHARS[(block >> 12) & 0x0F] + HEX_CHARS[(block >> 8) & 0x0F];
      }
      if (extraBytes > 2) {
        hex += HEX_CHARS[(block >> 20) & 0x0F] + HEX_CHARS[(block >> 16) & 0x0F];
      }
    }
    return hex;
  };

  Keccak.prototype.arrayBuffer = function () {
    this.finalize();

    var blockCount = this.blockCount, s = this.s, outputBlocks = this.outputBlocks,
        extraBytes = this.extraBytes, i = 0, j = 0;
    var bytes = this.outputBits >> 3;
    var buffer;
    if (extraBytes) {
      buffer = new ArrayBuffer((outputBlocks + 1) << 2);
    } else {
      buffer = new ArrayBuffer(bytes);
    }
    var array = new Uint32Array(buffer);
    while (j < outputBlocks) {
      for (i = 0; i < blockCount && j < outputBlocks; ++i, ++j) {
        array[j] = s[i];
      }
      if (j % blockCount === 0) {
        f(s);
      }
    }
    if (extraBytes) {
      array[i] = s[i];
      buffer = buffer.slice(0, bytes);
    }
    return buffer;
  };

  Keccak.prototype.buffer = Keccak.prototype.arrayBuffer;

  Keccak.prototype.digest = Keccak.prototype.array = function () {
    this.finalize();

    var blockCount = this.blockCount, s = this.s, outputBlocks = this.outputBlocks,
        extraBytes = this.extraBytes, i = 0, j = 0;
    var array = [], offset, block;
    while (j < outputBlocks) {
      for (i = 0; i < blockCount && j < outputBlocks; ++i, ++j) {
        offset = j << 2;
        block = s[i];
        array[offset] = block & 0xFF;
        array[offset + 1] = (block >> 8) & 0xFF;
        array[offset + 2] = (block >> 16) & 0xFF;
        array[offset + 3] = (block >> 24) & 0xFF;
      }
      if (j % blockCount === 0) {
        f(s);
      }
    }
    if (extraBytes) {
      offset = j << 2;
      block = s[i];
      if (extraBytes > 0) {
        array[offset] = block & 0xFF;
      }
      if (extraBytes > 1) {
        array[offset + 1] = (block >> 8) & 0xFF;
      }
      if (extraBytes > 2) {
        array[offset + 2] = (block >> 16) & 0xFF;
      }
    }
    return array;
  };

  var f = function (s) {
    var h, l, n, c0, c1, c2, c3, c4, c5, c6, c7, c8, c9,
        b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15, b16, b17,
        b18, b19, b20, b21, b22, b23, b24, b25, b26, b27, b28, b29, b30, b31, b32, b33,
        b34, b35, b36, b37, b38, b39, b40, b41, b42, b43, b44, b45, b46, b47, b48, b49;
    for (n = 0; n < 48; n += 2) {
      c0 = s[0] ^ s[10] ^ s[20] ^ s[30] ^ s[40];
      c1 = s[1] ^ s[11] ^ s[21] ^ s[31] ^ s[41];
      c2 = s[2] ^ s[12] ^ s[22] ^ s[32] ^ s[42];
      c3 = s[3] ^ s[13] ^ s[23] ^ s[33] ^ s[43];
      c4 = s[4] ^ s[14] ^ s[24] ^ s[34] ^ s[44];
      c5 = s[5] ^ s[15] ^ s[25] ^ s[35] ^ s[45];
      c6 = s[6] ^ s[16] ^ s[26] ^ s[36] ^ s[46];
      c7 = s[7] ^ s[17] ^ s[27] ^ s[37] ^ s[47];
      c8 = s[8] ^ s[18] ^ s[28] ^ s[38] ^ s[48];
      c9 = s[9] ^ s[19] ^ s[29] ^ s[39] ^ s[49];

      h = c8 ^ ((c2 << 1) | (c3 >>> 31));
      l = c9 ^ ((c3 << 1) | (c2 >>> 31));
      s[0] ^= h;
      s[1] ^= l;
      s[10] ^= h;
      s[11] ^= l;
      s[20] ^= h;
      s[21] ^= l;
      s[30] ^= h;
      s[31] ^= l;
      s[40] ^= h;
      s[41] ^= l;
      h = c0 ^ ((c4 << 1) | (c5 >>> 31));
      l = c1 ^ ((c5 << 1) | (c4 >>> 31));
      s[2] ^= h;
      s[3] ^= l;
      s[12] ^= h;
      s[13] ^= l;
      s[22] ^= h;
      s[23] ^= l;
      s[32] ^= h;
      s[33] ^= l;
      s[42] ^= h;
      s[43] ^= l;
      h = c2 ^ ((c6 << 1) | (c7 >>> 31));
      l = c3 ^ ((c7 << 1) | (c6 >>> 31));
      s[4] ^= h;
      s[5] ^= l;
      s[14] ^= h;
      s[15] ^= l;
      s[24] ^= h;
      s[25] ^= l;
      s[34] ^= h;
      s[35] ^= l;
      s[44] ^= h;
      s[45] ^= l;
      h = c4 ^ ((c8 << 1) | (c9 >>> 31));
      l = c5 ^ ((c9 << 1) | (c8 >>> 31));
      s[6] ^= h;
      s[7] ^= l;
      s[16] ^= h;
      s[17] ^= l;
      s[26] ^= h;
      s[27] ^= l;
      s[36] ^= h;
      s[37] ^= l;
      s[46] ^= h;
      s[47] ^= l;
      h = c6 ^ ((c0 << 1) | (c1 >>> 31));
      l = c7 ^ ((c1 << 1) | (c0 >>> 31));
      s[8] ^= h;
      s[9] ^= l;
      s[18] ^= h;
      s[19] ^= l;
      s[28] ^= h;
      s[29] ^= l;
      s[38] ^= h;
      s[39] ^= l;
      s[48] ^= h;
      s[49] ^= l;

      b0 = s[0];
      b1 = s[1];
      b32 = (s[11] << 4) | (s[10] >>> 28);
      b33 = (s[10] << 4) | (s[11] >>> 28);
      b14 = (s[20] << 3) | (s[21] >>> 29);
      b15 = (s[21] << 3) | (s[20] >>> 29);
      b46 = (s[31] << 9) | (s[30] >>> 23);
      b47 = (s[30] << 9) | (s[31] >>> 23);
      b28 = (s[40] << 18) | (s[41] >>> 14);
      b29 = (s[41] << 18) | (s[40] >>> 14);
      b20 = (s[2] << 1) | (s[3] >>> 31);
      b21 = (s[3] << 1) | (s[2] >>> 31);
      b2 = (s[13] << 12) | (s[12] >>> 20);
      b3 = (s[12] << 12) | (s[13] >>> 20);
      b34 = (s[22] << 10) | (s[23] >>> 22);
      b35 = (s[23] << 10) | (s[22] >>> 22);
      b16 = (s[33] << 13) | (s[32] >>> 19);
      b17 = (s[32] << 13) | (s[33] >>> 19);
      b48 = (s[42] << 2) | (s[43] >>> 30);
      b49 = (s[43] << 2) | (s[42] >>> 30);
      b40 = (s[5] << 30) | (s[4] >>> 2);
      b41 = (s[4] << 30) | (s[5] >>> 2);
      b22 = (s[14] << 6) | (s[15] >>> 26);
      b23 = (s[15] << 6) | (s[14] >>> 26);
      b4 = (s[25] << 11) | (s[24] >>> 21);
      b5 = (s[24] << 11) | (s[25] >>> 21);
      b36 = (s[34] << 15) | (s[35] >>> 17);
      b37 = (s[35] << 15) | (s[34] >>> 17);
      b18 = (s[45] << 29) | (s[44] >>> 3);
      b19 = (s[44] << 29) | (s[45] >>> 3);
      b10 = (s[6] << 28) | (s[7] >>> 4);
      b11 = (s[7] << 28) | (s[6] >>> 4);
      b42 = (s[17] << 23) | (s[16] >>> 9);
      b43 = (s[16] << 23) | (s[17] >>> 9);
      b24 = (s[26] << 25) | (s[27] >>> 7);
      b25 = (s[27] << 25) | (s[26] >>> 7);
      b6 = (s[36] << 21) | (s[37] >>> 11);
      b7 = (s[37] << 21) | (s[36] >>> 11);
      b38 = (s[47] << 24) | (s[46] >>> 8);
      b39 = (s[46] << 24) | (s[47] >>> 8);
      b30 = (s[8] << 27) | (s[9] >>> 5);
      b31 = (s[9] << 27) | (s[8] >>> 5);
      b12 = (s[18] << 20) | (s[19] >>> 12);
      b13 = (s[19] << 20) | (s[18] >>> 12);
      b44 = (s[29] << 7) | (s[28] >>> 25);
      b45 = (s[28] << 7) | (s[29] >>> 25);
      b26 = (s[38] << 8) | (s[39] >>> 24);
      b27 = (s[39] << 8) | (s[38] >>> 24);
      b8 = (s[48] << 14) | (s[49] >>> 18);
      b9 = (s[49] << 14) | (s[48] >>> 18);

      s[0] = b0 ^ (~b2 & b4);
      s[1] = b1 ^ (~b3 & b5);
      s[10] = b10 ^ (~b12 & b14);
      s[11] = b11 ^ (~b13 & b15);
      s[20] = b20 ^ (~b22 & b24);
      s[21] = b21 ^ (~b23 & b25);
      s[30] = b30 ^ (~b32 & b34);
      s[31] = b31 ^ (~b33 & b35);
      s[40] = b40 ^ (~b42 & b44);
      s[41] = b41 ^ (~b43 & b45);
      s[2] = b2 ^ (~b4 & b6);
      s[3] = b3 ^ (~b5 & b7);
      s[12] = b12 ^ (~b14 & b16);
      s[13] = b13 ^ (~b15 & b17);
      s[22] = b22 ^ (~b24 & b26);
      s[23] = b23 ^ (~b25 & b27);
      s[32] = b32 ^ (~b34 & b36);
      s[33] = b33 ^ (~b35 & b37);
      s[42] = b42 ^ (~b44 & b46);
      s[43] = b43 ^ (~b45 & b47);
      s[4] = b4 ^ (~b6 & b8);
      s[5] = b5 ^ (~b7 & b9);
      s[14] = b14 ^ (~b16 & b18);
      s[15] = b15 ^ (~b17 & b19);
      s[24] = b24 ^ (~b26 & b28);
      s[25] = b25 ^ (~b27 & b29);
      s[34] = b34 ^ (~b36 & b38);
      s[35] = b35 ^ (~b37 & b39);
      s[44] = b44 ^ (~b46 & b48);
      s[45] = b45 ^ (~b47 & b49);
      s[6] = b6 ^ (~b8 & b0);
      s[7] = b7 ^ (~b9 & b1);
      s[16] = b16 ^ (~b18 & b10);
      s[17] = b17 ^ (~b19 & b11);
      s[26] = b26 ^ (~b28 & b20);
      s[27] = b27 ^ (~b29 & b21);
      s[36] = b36 ^ (~b38 & b30);
      s[37] = b37 ^ (~b39 & b31);
      s[46] = b46 ^ (~b48 & b40);
      s[47] = b47 ^ (~b49 & b41);
      s[8] = b8 ^ (~b0 & b2);
      s[9] = b9 ^ (~b1 & b3);
      s[18] = b18 ^ (~b10 & b12);
      s[19] = b19 ^ (~b11 & b13);
      s[28] = b28 ^ (~b20 & b22);
      s[29] = b29 ^ (~b21 & b23);
      s[38] = b38 ^ (~b30 & b32);
      s[39] = b39 ^ (~b31 & b33);
      s[48] = b48 ^ (~b40 & b42);
      s[49] = b49 ^ (~b41 & b43);

      s[0] ^= RC[n];
      s[1] ^= RC[n + 1];
    }
  };

  if (COMMON_JS) {
    module.exports = methods;
  } else {
    for (var i = 0; i < methodNames.length; ++i) {
      root[methodNames[i]] = methods[methodNames[i]];
    }
  }
})();

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":76}],75:[function(require,module,exports){
module.exports = assert;

function assert(val, msg) {
  if (!val)
    throw new Error(msg || 'Assertion failed');
}

assert.equal = function assertEqual(l, r, msg) {
  if (l != r)
    throw new Error(msg || ('Assertion failed: ' + l + ' != ' + r));
};

},{}],76:[function(require,module,exports){
module.exports = undefined;
},{}]},{},[1]);
